// Runs the working day: job offers, auto-scheduling, and the crew carrying jobs
// out (drive, work, get paid, drive home). It owns no drawing and no DOM, so it
// can be tested on its own. See docs/DESIGN.md, sections 8.1, 8.4 and 8.5.
import { CONFIG } from '../config.js';
import { JOB_TYPES } from '../data/jobs.js';
import { findPath } from '../world/pathfind.js';
import { FUEL_GAL_PER_TILE, FUEL_PRICE } from './economy.js';
import { dayOf, shiftStart, shiftEnd, nextBusinessDay, isBusinessDay, timeOfDay, SHIFT_END_MIN } from './clock.js';

const BUFFER = 1.2; // extra time added to every scheduled block
const MOST_FITS = 0.6; // start today if at least this much of the job fits
const OFFERS_PER_DAY = 6;

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
    const type = JOB_TYPES.mow;
    const candidates = this.world.lots.filter((l) => type.lotKinds.includes(l.kind) && !taken.has(l.id));
    const offers = [];
    while (offers.length < OFFERS_PER_DAY && candidates.length) {
      const lot = candidates.splice(Math.floor(rng() * candidates.length), 1)[0];
      const steps = Math.round((type.payRange[1] - type.payRange[0]) / type.payStep);
      const pay = type.payRange[0] + Math.floor(rng() * (steps + 1)) * type.payStep;
      const offer = { id: `d${day}-${lot.id}`, type, lot, pay };
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

  accept(offerId) {
    const i = this.offers.findIndex((o) => o.id === offerId);
    if (i < 0) return null;
    const offer = this.offers.splice(i, 1)[0];
    const start = this.findSlot(offer.est.blockMin);
    const job = {
      id: this.nextId++,
      offer,
      lot: offer.lot,
      type: offer.type,
      pay: offer.pay,
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

    this.fadeLawns();
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
    job.lot.mow = 0;
    job.lot.mowDoneAt = null;
    this.onEvent('started', job);
  }

  tickWork(dt) {
    const job = this.active;
    job.workDone += dt;
    const progress = Math.min(1, job.workDone / job.est.workMin);
    job.lot.mow = progress;
    if (progress >= 1) this.finishJob(job);
  }

  finishJob(job) {
    this.economy.money += job.pay;
    job.status = 'done';
    job.finishedAt = this.clock.minutes;
    job.lot.mow = 1;
    job.lot.mowDoneAt = this.clock.minutes;
    this.schedule = this.schedule.filter((j) => j !== job);
    this.history.unshift(job);
    this.history.length = Math.min(this.history.length, 10);
    this.active = null;
    this.state = 'idle';
    this.onEvent('done', job);
  }

  // Mown stripes stay for a while, then fade back to a plain lawn.
  fadeLawns() {
    for (const lot of this.world.lots) {
      if (lot.mowDoneAt == null) continue;
      const age = this.clock.minutes - lot.mowDoneAt;
      if (age >= CONFIG.mowHoldMinutes + CONFIG.mowFadeMinutes) {
        lot.mow = 0;
        lot.mowDoneAt = null;
      }
    }
  }

  // 0..1 strength of the mown stripes on a lot (for drawing).
  lawnAlpha(lot) {
    if (!lot.mow) return 0;
    if (lot.mowDoneAt == null) return 1;
    const age = this.clock.minutes - lot.mowDoneAt;
    if (age <= CONFIG.mowHoldMinutes) return 1;
    return Math.max(0, 1 - (age - CONFIG.mowHoldMinutes) / CONFIG.mowFadeMinutes);
  }

  // The manual end-of-day skip: next shift, fresh offers.
  endDay() {
    this.clock.endDay();
    this.generateOffers();
    this.onEvent('newDay', this.clock.day);
  }
}
