// Runs the working day: job offers, auto-scheduling, and the crews carrying jobs
// out (drive, work, get paid, drive home). It owns no drawing and no DOM, so it
// can be tested on its own. See docs/DESIGN.md, sections 6.6, 7 and 8.
//
// The company has any number of crews. Each crew has its own people, its own
// vehicle (or none), its own queue of jobs, and works on its own.
import { CONFIG } from '../config.js';
import { JOB_TYPES } from '../data/jobs.js';
import { VEHICLE_TYPES, CAB_COLORS } from '../data/vehicles.js';
import { findPath } from '../world/pathfind.js';
import { mulberry32 } from '../util/rng.js';
import { FUEL_GAL_PER_TILE, FUEL_PRICE } from './economy.js';
import { Roster, generateApplicants, addXp, spendPoint, decideHire, cashNeededFor, efficiencyOf } from './crew.js';
import { Truck } from './truck.js';
import { dayOf, shiftStart, shiftEnd, nextBusinessDay, addBusinessDays, businessDaysBetween, isBusinessDay, timeOfDay, SHIFT_END_MIN } from './clock.js';

const BUFFER = 1.2; // extra time added to every scheduled block
const MOST_FITS = 0.6; // start today if at least this much of the job fits
const OFFERS_PER_DAY = 6;
const NO_VEHICLE_SEATS = 2; // a crew with no vehicle is capped at two people

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
    this.clock = clock;
    this.economy = economy;
    this.roster = roster || new Roster(); // the owner, plus anyone hired
    this.applicants = [];
    this.offers = [];
    this.history = []; // finished jobs, newest first
    this.vehicles = []; // vehicles on the property
    this.deliveries = []; // ordered, arriving the next business day
    this.crews = [];
    this.nextId = 1; // jobs
    this.nextCrewId = 1;
    this.nextVehicleId = 1;
    this.nextDeliveryId = 1;
    this.onEvent = () => {};

    // Day one: the owner, a slow half-ton truck, and Crew (1).
    const start = this.addVehicle('halfTon', { owned: true, truck });
    const crew = this.addCrew();
    crew.vehicleId = start.id;
    crew.memberIds.push(this.roster.owner.id);
    this.generateOffers();
  }

  // ------------------------------------------------------------ fleet & crews
  get homeNode() {
    return this.world.property.homeNode;
  }

  vehicle(id) {
    return this.vehicles.find((v) => v.id === id) || null;
  }

  crew(id) {
    return this.crews.find((c) => c.id === id) || null;
  }

  vehicleOf(crew) {
    return crew.vehicleId == null ? null : this.vehicle(crew.vehicleId);
  }

  truckOf(crew) {
    const v = this.vehicleOf(crew);
    return v ? v.truck : null;
  }

  crewOfVehicle(vehicleId) {
    return this.crews.find((c) => c.vehicleId === vehicleId) || null;
  }

  parkNodeOf(vehicle) {
    return this.world.property.parkNodes[vehicle.parkSlot];
  }

  addVehicle(typeId, { owned = false, truck = null } = {}) {
    const type = VEHICLE_TYPES[typeId];
    const used = new Set(this.vehicles.map((v) => v.parkSlot));
    let slot = 0;
    while (used.has(slot)) slot++;
    const vehicle = { id: this.nextVehicleId++, typeId, name: type.name, seats: type.seats, owned, rentPerDay: owned ? 0 : type.rentPerDay, parkSlot: slot, truck: null };
    const node = this.world.property.parkNodes[slot];
    vehicle.truck = truck || new Truck(this.world, node);
    if (!truck) vehicle.truck.placeAt(node);
    vehicle.truck.tint = CAB_COLORS[(vehicle.id - 1) % CAB_COLORS.length];
    this.vehicles.push(vehicle);
    return vehicle;
  }

  addCrew(name) {
    const crew = {
      id: this.nextCrewId,
      name: name || `Crew (${this.nextCrewId})`,
      memberIds: [],
      vehicleId: null,
      queue: [], // scheduled jobs, in start order
      state: 'idle', // 'idle' | 'travelling' | 'working'
      purpose: null, // 'toJob' | 'home' while travelling
      active: null,
    };
    this.nextCrewId++;
    this.crews.push(crew);
    return crew;
  }

  // How many people a crew can have: the seats in its vehicle (two with none).
  capacityOf(crew) {
    const v = this.vehicleOf(crew);
    return v ? v.seats : NO_VEHICLE_SEATS;
  }

  membersOf(crew) {
    return crew.memberIds.map((id) => this.roster.members.find((m) => m.id === id)).filter(Boolean);
  }

  // Who actually rides along: the first people in the crew, up to the seats.
  seatedOf(crew) {
    return this.membersOf(crew).slice(0, this.capacityOf(crew));
  }

  crewOf(memberId) {
    return this.crews.find((c) => c.memberIds.includes(memberId)) || null;
  }

  isSeated(member) {
    const crew = this.crewOf(member.id);
    return !!crew && !!this.vehicleOf(crew) && this.seatedOf(crew).includes(member);
  }

  // How fast a crew gets a job done, as a multiple of one average worker. The
  // best worker counts fully; each extra person helps by the job's crewScaling
  // (a second person helps a lot on weeding, less on mowing).
  rateFor(type, crew = this.crews[0]) {
    const scaling = type.crewScaling || [1];
    const rates = this.seatedOf(crew).map(efficiencyOf).sort((a, b) => b - a);
    return rates.reduce((sum, r, i) => sum + r * (scaling[i] ?? 0), 0);
  }

  // ---- compatibility views over all the crews ----
  get schedule() {
    return this.crews.flatMap((c) => c.queue).sort((a, b) => a.start - b.start);
  }

  get activeJobs() {
    return this.crews.filter((c) => c.active).map((c) => c.active);
  }

  get active() {
    return this.activeJobs[0] || null;
  }

  // 'idle' only when every crew is; otherwise what the first busy crew is doing.
  get state() {
    const busy = this.crews.find((c) => c.state !== 'idle');
    return busy ? busy.state : 'idle';
  }

  get purpose() {
    const busy = this.crews.find((c) => c.state !== 'idle');
    return busy ? busy.purpose : null;
  }

  get truck() {
    return this.truckOf(this.crews[0]) || this.vehicles[0].truck;
  }

  get trucks() {
    return this.vehicles.map((v) => v.truck);
  }

  // ----------------------------------------------------------------- offers
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

  // Stats or crews changed: today's offers should show the new times.
  refreshEstimates() {
    for (const o of this.offers) o.est = this.estimate(o);
  }

  // Time and fuel for a job done by a given crew, worked out from the road distance.
  estimate(offer, crew = this.crews[0]) {
    const route = findPath(this.world, this.homeNode, offer.lot.accessNode);
    const tiles = route ? route.distance : 0;
    const driveMin = tiles / CONFIG.truckTilesPerGameMinute;
    const workMin = Math.ceil(offer.type.baseMinutes / Math.max(0.1, this.rateFor(offer.type, crew)));
    const blockMin = Math.ceil((2 * driveMin + workMin) * BUFFER);
    const fuelGal = 2 * tiles * FUEL_GAL_PER_TILE;
    const fuelCost = Math.round(fuelGal * FUEL_PRICE);
    return { driveMin, workMin, blockMin, fuelGal, fuelCost, profit: offer.pay - fuelCost };
  }

  // ------------------------------------------------------------- scheduling
  lastEnd(crew) {
    return crew.queue.reduce((m, j) => Math.max(m, j.end), 0);
  }

  // First moment this crew is free and the block fits (or mostly fits) the shift.
  findSlot(crew, blockMin) {
    let cand = Math.max(this.clock.minutes, this.lastEnd(crew));
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

  // Crews that can take work: anyone with people in it, vehicles first. (A crew
  // with no vehicle only gets work if no crew has one: bad management, but doable.)
  eligibleCrews() {
    const staffed = this.crews.filter((c) => this.seatedOf(c).length > 0);
    const driving = staffed.filter((c) => this.vehicleOf(c));
    return driving.length ? driving : staffed;
  }

  // Where would this job go? The first available crew that can finish it before
  // it's due. There's no cap on how much work you can line up (that's job
  // security), but you can't take a job that can't be finished in time.
  checkSlot(offer) {
    let best = null;
    for (const crew of this.eligibleCrews()) {
      const est = this.estimate(offer, crew);
      const start = this.findSlot(crew, est.blockMin);
      const end = start + est.blockMin;
      const plan = { ok: end <= offer.dueAt, late: end > offer.dueAt, crew, est, start, end };
      // Prefer a plan that works, then the one that starts soonest.
      if (!best || (plan.ok && !best.ok) || (plan.ok === best.ok && (plan.ok ? plan.start < best.start : plan.end < best.end))) best = plan;
    }
    return best || { ok: false, late: true, crew: null, est: offer.est, start: Infinity, end: Infinity };
  }

  latePenalty(daysLate) {
    return Math.min(LATE_PENALTY_CAP, daysLate * LATE_PENALTY_PER_DAY);
  }

  accept(offerId) {
    const i = this.offers.findIndex((o) => o.id === offerId);
    if (i < 0) return null;
    const offer = this.offers[i];
    const plan = this.checkSlot(offer);
    if (!plan.ok) return null; // doesn't fall within the allotted completion time
    this.offers.splice(i, 1);
    const job = {
      id: this.nextId++,
      offer,
      crewId: plan.crew.id,
      lot: offer.lot,
      type: offer.type,
      pay: offer.pay,
      dueAt: offer.dueAt,
      est: plan.est,
      start: plan.start,
      end: plan.end,
      status: 'scheduled', // scheduled | driving | working | done
      workDone: 0,
    };
    plan.crew.queue.push(job);
    plan.crew.queue.sort((a, b) => a.start - b.start);
    this.onEvent('scheduled', job);
    this.onEvent('offers', this.offers);
    return job;
  }

  // -------------------------------------------------------- the working day
  // True when a crew is parked at its spot on the property, not mid-job.
  crewIsHome(crew) {
    const v = this.vehicleOf(crew);
    if (crew.state !== 'idle') return false;
    return !v || (v.truck.state === 'parked' && v.truck.nodeId === this.parkNodeOf(v));
  }

  // Has a job to start right now (and a vehicle to go in).
  crewIsDue(crew) {
    const next = crew.queue[0];
    return !!next && next.start <= this.clock.minutes && !!this.vehicleOf(crew);
  }

  // Everyone is home with nothing about to start.
  isIdleAtHome() {
    return this.crews.every((c) => this.crewIsHome(c) && !this.crewIsDue(c));
  }

  // Everyone is parked at the property (safe to save), whether or not work is due.
  allHome() {
    return this.crews.every((c) => this.crewIsHome(c));
  }

  // True once it's past quitting time and nobody is out on a job.
  shiftIsOver() {
    return timeOfDay(this.clock.minutes) >= SHIFT_END_MIN && this.isIdleAtHome();
  }

  update(dt) {
    if (dt <= 0) return;
    for (const crew of this.crews) this.updateCrew(crew, dt);
    this.processDeliveries();
    this.fadeWork();
  }

  updateCrew(crew, dt) {
    const truck = this.truckOf(crew);
    if (truck) {
      const moved = truck.update(dt);
      if (moved > 0) this.economy.fuelGal = Math.max(0, this.economy.fuelGal - moved * FUEL_GAL_PER_TILE);
    }
    if (crew.state === 'idle') this.tickIdle(crew);
    else if (crew.state === 'travelling') this.tickTravel(crew);
    else if (crew.state === 'working') this.tickWork(crew, dt);
  }

  tickIdle(crew) {
    const vehicle = this.vehicleOf(crew);
    if (!vehicle) return; // no vehicle: can't go anywhere
    const truck = vehicle.truck;
    const next = crew.queue[0];
    if (next && next.start <= this.clock.minutes) {
      crew.active = next;
      next.status = 'driving';
      if (truck.nodeId === next.lot.accessNode) return this.beginWork(crew);
      if (truck.driveTo(next.lot.accessNode)) {
        crew.state = 'travelling';
        crew.purpose = 'toJob';
      }
    } else if (truck.nodeId !== this.parkNodeOf(vehicle) && truck.state === 'parked') {
      if (truck.driveTo(this.parkNodeOf(vehicle))) {
        crew.state = 'travelling';
        crew.purpose = 'home';
      }
    }
  }

  tickTravel(crew) {
    const truck = this.truckOf(crew);
    if (!truck || truck.state !== 'parked') return;
    if (crew.purpose === 'toJob') this.beginWork(crew);
    else {
      crew.state = 'idle';
      crew.purpose = null;
    }
  }

  beginWork(crew) {
    const job = crew.active;
    crew.state = 'working';
    crew.purpose = null;
    job.status = 'working';
    job.workDone = 0;
    // Each lot remembers the work shown on it: what kind, how far along, and
    // when it finished (so it can fade out afterwards).
    job.lot.work = { type: job.type, progress: 0, doneAt: null };
    this.onEvent('started', job);
  }

  tickWork(crew, dt) {
    const job = crew.active;
    job.workDone += dt;
    for (const m of this.seatedOf(crew)) {
      if (addXp(m, dt)) this.onEvent('levelUp', m);
    }
    const progress = Math.min(1, job.workDone / job.est.workMin);
    job.lot.work.progress = progress;
    if (progress >= 1) this.finishJob(crew, job);
  }

  finishJob(crew, job) {
    job.status = 'done';
    job.finishedAt = this.clock.minutes;
    job.daysLate =
      job.finishedAt > job.dueAt ? Math.max(1, businessDaysBetween(dayOf(job.dueAt), dayOf(job.finishedAt))) : 0;
    job.paid = Math.round(job.pay * (1 - this.latePenalty(job.daysLate)));
    this.economy.money += job.paid;
    job.lot.work.progress = 1;
    job.lot.work.doneAt = this.clock.minutes;
    crew.queue = crew.queue.filter((j) => j !== job);
    this.history.unshift(job);
    this.history.length = Math.min(this.history.length, 10);
    crew.active = null;
    crew.state = 'idle';
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
  // When every crew is home with nothing due, the player can fast-forward to the
  // next job (or to quitting time if nothing else is scheduled today).
  skipTarget() {
    if (this.clock.shiftOver || !this.isIdleAtHome()) return null;
    const now = this.clock.minutes;
    const end = shiftEnd(this.clock.day);
    const upcoming = this.crews
      .filter((c) => this.vehicleOf(c) && c.queue[0])
      .map((c) => c.queue[0])
      .sort((a, b) => a.start - b.start)[0];
    if (upcoming) {
      const at = Math.min(upcoming.start, end);
      return at > now + 1 ? { minutes: at, job: upcoming } : null;
    }
    return end > now + 1 ? { minutes: end, job: null } : null;
  }

  skipAhead() {
    const target = this.skipTarget();
    if (!target) return false;
    this.clock.minutes = target.minutes;
    return true;
  }

  // ------------------------------------------------------------------ people
  // Try to hire an applicant at a wage. Returns { ok, reason }.
  hire(applicantId, wage) {
    const a = this.applicants.find((x) => x.id === applicantId);
    if (!a) return { ok: false, reason: 'gone' };
    if (this.roster.isFull) return { ok: false, reason: 'full' };
    if (this.economy.money < cashNeededFor(wage)) return { ok: false, reason: 'cash' };
    if (!decideHire(a, wage)) return { ok: false, reason: 'declined' };
    this.applicants = this.applicants.filter((x) => x !== a);
    const member = this.roster.hire(a, wage, this.clock.minutes);
    // A new hire joins the first crew with a free seat, or starts a new crew
    // (crews fill up in pairs, then in the seats of whatever vehicle they have).
    const crew = this.crews.find((c) => c.memberIds.length < this.capacityOf(c) && c.state === 'idle') || this.addCrew();
    crew.memberIds.push(member.id);
    this.refreshEstimates();
    this.onEvent('crew', member);
    return { ok: true, member };
  }

  fire(memberId) {
    const member = this.roster.members.find((m) => m.id === memberId);
    if (!member || member.isOwner) return { ok: false, reason: 'owner' };
    const crew = this.crewOf(memberId);
    if (crew && crew.state !== 'idle') return { ok: false, reason: 'busy' };
    if (crew && crew.queue.length && crew.memberIds.length === 1) return { ok: false, reason: 'jobs' };
    if (crew) crew.memberIds = crew.memberIds.filter((id) => id !== memberId);
    this.roster.fire(memberId);
    this.refreshEstimates();
    this.onEvent('crew', null);
    return { ok: true };
  }

  spend(memberId, stat) {
    const m = this.roster.members.find((x) => x.id === memberId);
    if (!m || !spendPoint(m, stat)) return false;
    this.refreshEstimates();
    this.onEvent('crew', m);
    return true;
  }

  // ---------------------------------------------------------- managing crews
  renameCrew(crewId, name) {
    const crew = this.crew(crewId);
    const clean = String(name ?? '').trim().slice(0, 24);
    if (!crew || !clean) return false;
    crew.name = clean;
    this.onEvent('crew', crew);
    return true;
  }

  createCrew() {
    if (this.crews.length >= this.roster.members.length + 1) return null; // no point in more empty crews than people
    const crew = this.addCrew();
    this.onEvent('crew', crew);
    return crew;
  }

  deleteCrew(crewId) {
    const crew = this.crew(crewId);
    if (!crew || crew.memberIds.length || crew.queue.length || this.crews.length < 2) return false;
    this.crews = this.crews.filter((c) => c !== crew);
    this.onEvent('crew', null);
    return true;
  }

  // Move someone to another crew: both crews must be home, and there must be a seat.
  moveMember(memberId, crewId) {
    const from = this.crewOf(memberId);
    const to = this.crew(crewId);
    if (!from || !to || from === to) return { ok: false, reason: 'same' };
    if (!this.crewIsHome(from) || !this.crewIsHome(to)) return { ok: false, reason: 'busy' };
    if (to.memberIds.length >= this.capacityOf(to)) return { ok: false, reason: 'seats' };
    if (from.queue.length && from.memberIds.length === 1) return { ok: false, reason: 'jobs' };
    from.memberIds = from.memberIds.filter((id) => id !== memberId);
    to.memberIds.push(memberId);
    this.refreshEstimates();
    this.onEvent('crew', null);
    return { ok: true };
  }

  // Give a crew a vehicle (or take it away with null). The vehicle must have
  // enough seats for the crew, and nobody involved can be out on a job.
  assignVehicle(crewId, vehicleId) {
    const crew = this.crew(crewId);
    if (!crew) return { ok: false, reason: 'missing' };
    const vehicle = vehicleId == null ? null : this.vehicle(vehicleId);
    if (vehicleId != null && !vehicle) return { ok: false, reason: 'missing' };
    if (!this.crewIsHome(crew)) return { ok: false, reason: 'busy' };
    const other = vehicle ? this.crewOfVehicle(vehicle.id) : null;
    if (other && other !== crew && !this.crewIsHome(other)) return { ok: false, reason: 'busy' };
    if (vehicle && crew.memberIds.length > vehicle.seats) return { ok: false, reason: 'seats' };
    if (other && other !== crew) other.vehicleId = null;
    crew.vehicleId = vehicle ? vehicle.id : null;
    this.refreshEstimates();
    this.onEvent('crew', crew);
    return { ok: true };
  }

  // -------------------------------------------------- renting & buying trucks
  // Ordered vehicles arrive on the next business day, at the start of the shift.
  orderVehicle(typeId, mode) {
    const type = VEHICLE_TYPES[typeId];
    if (!type || !['rent', 'buy'].includes(mode)) return { ok: false, reason: 'unknown' };
    if (this.vehicles.length + this.deliveries.length >= this.world.property.parkNodes.length) return { ok: false, reason: 'parking' };
    if (mode === 'buy' && this.economy.money < type.price) return { ok: false, reason: 'cash' };
    if (mode === 'buy') this.economy.money -= type.price;
    const arriveAt = shiftStart(nextBusinessDay(this.clock.day + 1));
    const delivery = { id: this.nextDeliveryId++, typeId, mode, arriveAt };
    this.deliveries.push(delivery);
    this.onEvent('fleet', delivery);
    return { ok: true, delivery };
  }

  processDeliveries() {
    if (!this.deliveries.length) return;
    const due = this.deliveries.filter((d) => d.arriveAt <= this.clock.minutes);
    if (!due.length) return;
    this.deliveries = this.deliveries.filter((d) => !due.includes(d));
    for (const d of due) {
      const vehicle = this.addVehicle(d.typeId, { owned: d.mode === 'buy' });
      this.onEvent('delivered', vehicle);
    }
    this.refreshEstimates();
  }

  // Send a rented vehicle back (the rental fee stops). It has to be parked.
  returnVehicle(vehicleId) {
    const vehicle = this.vehicle(vehicleId);
    if (!vehicle || vehicle.owned) return { ok: false, reason: 'owned' };
    const crew = this.crewOfVehicle(vehicleId);
    if (crew && !this.crewIsHome(crew)) return { ok: false, reason: 'busy' };
    if (crew) crew.vehicleId = null;
    this.vehicles = this.vehicles.filter((v) => v !== vehicle);
    this.refreshEstimates();
    this.onEvent('fleet', null);
    return { ok: true };
  }

  // Rented vehicles cost a flat fee for every calendar day you hold them,
  // weekends included, so sending one back on Friday saves money.
  rentFor(days) {
    const lines = this.vehicles.filter((v) => !v.owned).map((v) => ({ name: v.name, cost: v.rentPerDay * days }));
    return { lines, total: lines.reduce((sum, l) => sum + l.cost, 0) };
  }

  // Everyone is paid at the end of the day; the owner isn't. Money can go
  // negative (that's what the loans and the countdown are for, later).
  payDay() {
    const pay = this.roster.payDay(this.clock.day, this.clock.minutes);
    const days = nextBusinessDay(this.clock.day + 1) - this.clock.day;
    const rent = this.rentFor(days);
    this.economy.money -= pay.total + rent.total;
    return { ...pay, rent };
  }

  // The manual end-of-day skip: pay the crew and the rentals, then on to the
  // next shift with fresh offers and a fresh pool of applicants.
  endDay() {
    const payroll = this.payDay();
    this.clock.endDay();
    this.processDeliveries();
    this.generateOffers();
    this.onEvent('newDay', this.clock.day);
    return payroll;
  }
}
