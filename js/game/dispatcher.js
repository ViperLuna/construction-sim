// Runs the working day: job offers, auto-scheduling, and the crew carrying jobs
// out (drive, work, get paid, drive home). It owns no drawing and no DOM, so it
// can be tested on its own. See docs/DESIGN.md, sections 8.1, 8.4 and 8.5.
import { CONFIG } from '../config.js';
import { JOB_TYPES } from '../data/jobs.js';
import { findPath } from '../world/pathfind.js';
import { mulberry32 } from '../util/rng.js';
import { FUEL_GAL_PER_TILE, FUEL_PRICE } from './economy.js';
import { dayOf, shiftStart, shiftEnd, nextBusinessDay, addBusinessDays, isBusinessDay, timeOfDay, SHIFT_END_MIN } from './clock.js';

const BUFFER = 1.2; // extra time added to every scheduled block
const MOST_FITS = 0.6; // start today if at least this much of the job fits
const OFFERS_PER_DAY = 6;

// How many business days a customer gives you (today counts as day 1), and the
// bonus for short windows. Rush jobs pay more but leave less room to schedule.
const WINDOWS = [
  { days: 1, weight: 1, bonus: 0.25 },
  { days: 2, weight: 3, bonus: 0.1 },
  { days: 3, weight: 3, bonus: 0 },
  { days: 4, weight: 2, bonus: 0 },
  { days: 5, weight: 1, bonus: 0 },
];

export class Dispatcher {
  constructor({ world, truck, clock, economy, crew }) {
    this.world = world;
    this.truck = truck;
    this.clock = clock;
    this.economy = economy;
    this.crew = crew; // { name, stats: { speed, quality, ... } }
    this.offers = [];
    this.schedule = []; // jobs not yet finished, in start order
    this.history = []; // finished jobs, newest first
    this.state = 'idle'; // 'idle' | 'travelling' | 'working'
    this.purpose = null; // 'toJob' | 'home' while travelling
    this.active = null;
    this.nextId = 1;
    this.onEvent = () => {};
    this.generateOffers();
  }

  get homeNode() {
    return this.world.property.homeNode;
  }

  // Average worker (speed 5) = 1.0. Better workers finish faster.
  get efficiency() {
    return 0.5 + 0.1 * this.crew.stats.speed;
  }

  // ----- offers -----
  generateOffers() {
    const day = this.clock.day;
    const rng = mulberry32(day * 7919 + 13);
    const taken = new Set(this.schedule.map((j) => j.lot.id));
    const types = Object.values(JOB_TYPES);
    const totalWeight = types.reduce((sum, t) => sum + t.weight, 0);
    const pickType = () => {
      let roll = rng() * totalWeight;
      for (const t of types) {
        roll -= t.weight;
        if (roll < 0) return t;
      }
      return types[0];
    };
    const candidates = this.world.lots.filter((l) => l.kind === 'house' && !taken.has(l.id));
    const offers = [];
    while (offers.length < OFFERS_PER_DAY && candidates.length) {
      const type = pickType();
      const lot = candidates.splice(Math.floor(rng() * candidates.length), 1)[0];
      const steps = Math.round((type.payRange[1] - type.payRange[0]) / type.payStep);
      const basePay = type.payRange[0] + Math.floor(rng() * (steps + 1)) * type.payStep;
      // The completion window: a deadline at the end of the shift on the due day.
      let roll = rng() * WINDOWS.reduce((sum, w) => sum + w.weight, 0);
      const window = WINDOWS.find((w) => (roll -= w.weight) < 0) || WINDOWS[2];
      const dueDay = addBusinessDays(day, window.days - 1);
      const pay = Math.round((basePay * (1 + window.bonus)) / type.payStep) * type.payStep;
      const offer = { id: `d${day}-${lot.id}`, type, lot, basePay, pay, dueDay, dueAt: shiftEnd(dueDay), rush: window.days === 1 };
      offer.est = this.estimate(offer);
      offers.push(offer);
    }
    this.offers = offers;
    this.onEvent('offers', offers);
  }

  // Time and fuel for a job, worked out from the actual road distance.
  estimate(offer) {
    const route = findPath(this.world, this.homeNode, offer.lot.accessNode);
    const tiles = route ? route.distance : 0;
    const driveMin = tiles / CONFIG.truckTilesPerGameMinute;
    const workMin = Math.ceil(offer.type.baseMinutes / this.efficiency);
    const blockMin = Math.ceil((2 * driveMin + workMin) * BUFFER);
    const fuelGal = 2 * tiles * FUEL_GAL_PER_TILE;
    const fuelCost = Math.round(fuelGal * FUEL_PRICE);
    return { driveMin, workMin, blockMin, fuelGal, fuelCost, profit: offer.pay - fuelCost };
  }

  // ----- scheduling -----
  lastEnd() {
    return this.schedule.reduce((m, j) => Math.max(m, j.end), 0);
  }

  // First moment the crew is free and the block fits (or mostly fits) the shift.
  findSlot(blockMin) {
    let cand = Math.max(this.clock.minutes, this.lastEnd());
    for (let guard = 0; guard < 60; guard++) {
      const day = dayOf(cand);
      if (!isBusinessDay(day)) {
        cand = shiftStart(nextBusinessDay(day));
        continue;
      }
      if (cand < shiftStart(day)) cand = shiftStart(day);
      const left = shiftEnd(day) - cand;
      if (left > 0 && (blockMin <= left || left >= MOST_FITS * blockMin)) return cand;
      cand = shiftStart(nextBusinessDay(day + 1));
    }
    return cand;
  }

  // Where this job would go, and whether it can finish before it's due.
  // This is what keeps the queue honest: you can't pile up more work than the
  // crew can actually get done in time.
  checkSlot(offer) {
    const start = this.findSlot(offer.est.blockMin);
    const end = start + offer.est.blockMin;
    return { ok: end <= offer.dueAt, start, end };
  }

  accept(offerId) {
    const i = this.offers.findIndex((o) => o.id === offerId);
    if (i < 0) return null;
    const offer = this.offers[i];
    const slot = this.checkSlot(offer);
    if (!slot.ok) return null;
    this.offers.splice(i, 1);
    const start = slot.start;
    const job = {
      id: this.nextId++,
      offer,
      lot: offer.lot,
      type: offer.type,
      pay: offer.pay,
      dueAt: offer.dueAt,
      est: offer.est,
      start,
      end: start + offer.est.blockMin,
      status: 'scheduled', // scheduled | driving | working | done
      workDone: 0,
    };
    this.schedule.push(job);
    this.schedule.sort((a, b) => a.start - b.start);
    this.onEvent('scheduled', job);
    this.onEvent('offers', this.offers);
    return job;
  }

  // ----- the working day -----
  isIdleAtHome() {
    if (this.state !== 'idle' || this.truck.state !== 'parked' || this.truck.nodeId !== this.homeNode) return false;
    const next = this.schedule[0];
    return !(next && next.start <= this.clock.minutes);
  }

  // True once it's past quitting time and nobody is out on a job.
  shiftIsOver() {
    return timeOfDay(this.clock.minutes) >= SHIFT_END_MIN && this.isIdleAtHome();
  }

  update(dt) {
    if (dt <= 0) return;
    const moved = this.truck.update(dt);
    if (moved > 0) this.economy.fuelGal = Math.max(0, this.economy.fuelGal - moved * FUEL_GAL_PER_TILE);

    if (this.state === 'idle') this.tickIdle();
    else if (this.state === 'travelling') this.tickTravel();
    else if (this.state === 'working') this.tickWork(dt);

    this.fadeWork();
  }

  tickIdle() {
    const next = this.schedule[0];
    if (next && next.start <= this.clock.minutes) {
      this.active = next;
      next.status = 'driving';
      if (this.truck.nodeId === next.lot.accessNode) return this.beginWork();
      if (this.truck.driveTo(next.lot.accessNode)) {
        this.state = 'travelling';
        this.purpose = 'toJob';
      }
    } else if (this.truck.nodeId !== this.homeNode && this.truck.state === 'parked') {
      if (this.truck.driveTo(this.homeNode)) {
        this.state = 'travelling';
        this.purpose = 'home';
      }
    }
  }

  tickTravel() {
    if (this.truck.state !== 'parked') return;
    if (this.purpose === 'toJob') this.beginWork();
    else {
      this.state = 'idle';
      this.purpose = null;
    }
  }

  beginWork() {
    const job = this.active;
    this.state = 'working';
    this.purpose = null;
    job.status = 'working';
    job.workDone = 0;
    // Each lot remembers the work shown on it: what kind, how far along, and
    // when it finished (so it can fade out afterwards).
    job.lot.work = { type: job.type, progress: 0, doneAt: null };
    this.onEvent('started', job);
  }

  tickWork(dt) {
    const job = this.active;
    job.workDone += dt;
    const progress = Math.min(1, job.workDone / job.est.workMin);
    job.lot.work.progress = progress;
    if (progress >= 1) this.finishJob(job);
  }

  finishJob(job) {
    this.economy.money += job.pay;
    job.status = 'done';
    job.finishedAt = this.clock.minutes;
    job.lot.work.progress = 1;
    job.lot.work.doneAt = this.clock.minutes;
    this.schedule = this.schedule.filter((j) => j !== job);
    this.history.unshift(job);
    this.history.length = Math.min(this.history.length, 10);
    this.active = null;
    this.state = 'idle';
    this.onEvent('done', job);
  }

  // Finished work stays visible for a while, then fades back to a plain lot.
  fadeWork() {
    for (const lot of this.world.lots) {
      const w = lot.work;
      if (!w || w.doneAt == null) continue;
      if (this.clock.minutes - w.doneAt >= CONFIG.workHoldMinutes + CONFIG.workFadeMinutes) lot.work = null;
    }
  }

  // 0..1 strength of the work drawn on a lot (for fading it out).
  workAlpha(lot) {
    const w = lot.work;
    if (!w) return 0;
    if (w.doneAt == null) return 1;
    const age = this.clock.minutes - w.doneAt;
    if (age <= CONFIG.workHoldMinutes) return 1;
    return Math.max(0, 1 - (age - CONFIG.workHoldMinutes) / CONFIG.workFadeMinutes);
  }

  // ----- skipping idle time -----
  // When the crew is home with nothing due, the player can fast-forward to the
  // next job (or to quitting time if nothing else is scheduled today).
  skipTarget() {
    if (this.clock.shiftOver || !this.isIdleAtHome()) return null;
    const now = this.clock.minutes;
    const end = shiftEnd(this.clock.day);
    const next = this.schedule[0];
    if (next) {
      const at = Math.min(next.start, end);
      return at > now + 1 ? { minutes: at, job: next } : null;
    }
    return end > now + 1 ? { minutes: end, job: null } : null;
  }

  skipAhead() {
    const target = this.skipTarget();
    if (!target) return false;
    this.clock.minutes = target.minutes;
    return true;
  }

  // The manual end-of-day skip: next shift, fresh offers.
  endDay() {
    this.clock.endDay();
    this.generateOffers();
    this.onEvent('newDay', this.clock.day);
  }
}
