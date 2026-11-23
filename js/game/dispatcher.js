// Runs the working day: job offers, auto-scheduling, and the crew carrying jobs
// out (drive, work, get paid, drive home). It owns no drawing and no DOM, so it
// can be tested on its own. See docs/DESIGN.md, sections 8.1, 8.4 and 8.5.
import { CONFIG } from '../config.js';
import { JOB_TYPES } from '../data/jobs.js';
import { findPath } from '../world/pathfind.js';
import { mulberry32 } from '../util/rng.js';
import { FUEL_GAL_PER_TILE, FUEL_PRICE } from './economy.js';
import { Roster, generateApplicants, addXp, spendPoint, decideHire, cashNeededFor, efficiencyOf } from './crew.js';
import { dayOf, shiftStart, shiftEnd, nextBusinessDay, addBusinessDays, businessDaysBetween, isBusinessDay, timeOfDay, SHIFT_END_MIN } from './clock.js';

const BUFFER = 1.2; // extra time added to every scheduled block
const MOST_FITS = 0.6; // start today if at least this much of the job fits
const OFFERS_PER_DAY = 6;

// How many business days a customer gives you (today counts as day 1), and the
// bonus for short windows. Rush jobs pay more but leave less room to schedule.
// The long windows are planned work: you can line jobs up well in advance.
const WINDOWS = [
  { days: 1, weight: 1, bonus: 0.25 },
  { days: 2, weight: 3, bonus: 0.1 },
  { days: 3, weight: 3, bonus: 0 },
  { days: 4, weight: 2, bonus: 0 },
  { days: 5, weight: 1, bonus: 0 },
  { days: 10, weight: 2, bonus: 0 },
  { days: 15, weight: 1, bonus: 0 },
];

// If a job still ends up finishing after its due date (an overrun), it costs
// this much of the pay per business day late, up to the cap.
const LATE_PENALTY_PER_DAY = 0.1;
const LATE_PENALTY_CAP = 0.5;

export class Dispatcher {
  constructor({ world, truck, clock, economy, roster }) {
    this.world = world;
    this.truck = truck;
    this.clock = clock;
    this.economy = economy;
    this.roster = roster || new Roster(); // the owner, plus anyone hired
    this.applicants = [];
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

  // How fast the crew in the truck gets a job done, as a multiple of one average
  // worker. The best worker counts fully; each extra person helps by the job's
  // crewScaling (a second person helps a lot on weeding, less on mowing).
  rateFor(type) {
    const scaling = type.crewScaling || [1];
    const rates = this.roster.seated.map(efficiencyOf).sort((a, b) => b - a);
    return rates.reduce((sum, r, i) => sum + r * (scaling[i] ?? 0), 0);
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
    this.applicants = generateApplicants(day);
    this.onEvent('offers', offers);
  }

  // Stats or crew changed: today's offers should show the new times.
  refreshEstimates() {
    for (const o of this.offers) o.est = this.estimate(o);
  }

  // Time and fuel for a job, worked out from the actual road distance.
  estimate(offer) {
    const route = findPath(this.world, this.homeNode, offer.lot.accessNode);
    const tiles = route ? route.distance : 0;
    const driveMin = tiles / CONFIG.truckTilesPerGameMinute;
    const workMin = Math.ceil(offer.type.baseMinutes / this.rateFor(offer.type));
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

  // Where this job would go, and whether it fits inside its allotted completion
  // time. There's no cap on how much work you can line up (that's job security),
  // but you can't take a job that can't be finished before it's due.
  checkSlot(offer) {
    const start = this.findSlot(offer.est.blockMin);
    const end = start + offer.est.blockMin;
    const late = end > offer.dueAt;
    return { ok: !late, late, start, end };
  }

  latePenalty(daysLate) {
    return Math.min(LATE_PENALTY_CAP, daysLate * LATE_PENALTY_PER_DAY);
  }

  accept(offerId) {
    const i = this.offers.findIndex((o) => o.id === offerId);
    if (i < 0) return null;
    const offer = this.offers[i];
    const slot = this.checkSlot(offer);
    if (!slot.ok) return null; // doesn't fall within the allotted completion time
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
    for (const m of this.roster.seated) {
      if (addXp(m, dt)) this.onEvent('levelUp', m);
    }
    const progress = Math.min(1, job.workDone / job.est.workMin);
    job.lot.work.progress = progress;
    if (progress >= 1) this.finishJob(job);
  }

  finishJob(job) {
    job.status = 'done';
    job.finishedAt = this.clock.minutes;
    job.daysLate =
      job.finishedAt > job.dueAt ? Math.max(1, businessDaysBetween(dayOf(job.dueAt), dayOf(job.finishedAt))) : 0;
    job.paid = Math.round(job.pay * (1 - this.latePenalty(job.daysLate)));
    this.economy.money += job.paid;
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

  // ----- people -----
  // Try to hire an applicant at a wage. Returns { ok, reason }.
  hire(applicantId, wage) {
    const a = this.applicants.find((x) => x.id === applicantId);
    if (!a) return { ok: false, reason: 'gone' };
    if (this.roster.isFull) return { ok: false, reason: 'full' };
    if (this.economy.money < cashNeededFor(wage)) return { ok: false, reason: 'cash' };
    if (!decideHire(a, wage)) return { ok: false, reason: 'declined' };
    this.applicants = this.applicants.filter((x) => x !== a);
    const member = this.roster.hire(a, wage, this.clock.minutes);
    this.refreshEstimates();
    this.onEvent('crew', member);
    return { ok: true, member };
  }

  fire(memberId) {
    const ok = this.roster.fire(memberId);
    if (ok) {
      this.refreshEstimates();
      this.onEvent('crew', null);
    }
    return ok;
  }

  spend(memberId, stat) {
    const m = this.roster.members.find((x) => x.id === memberId);
    if (!m || !spendPoint(m, stat)) return false;
    this.refreshEstimates();
    this.onEvent('crew', m);
    return true;
  }

  // Everyone is paid at the end of the day; the owner isn't. Money can go
  // negative (that's what the loans and the countdown are for, later).
  payDay() {
    const pay = this.roster.payDay(this.clock.day, this.clock.minutes);
    this.economy.money -= pay.total;
    return pay;
  }

  // The manual end-of-day skip: pay the crew, then on to the next shift with
  // fresh offers and a fresh pool of applicants.
  endDay() {
    const payroll = this.payDay();
    this.clock.endDay();
    this.generateOffers();
    this.onEvent('newDay', this.clock.day);
    return payroll;
  }
}
