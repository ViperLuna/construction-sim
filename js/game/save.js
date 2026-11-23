// Saving and loading (see docs/DESIGN.md, section 11.1). This file turns a game
// into plain data and back; where the data is kept lives in storage.js.
//
// The game saves whenever every crew is home and nothing is in motion: after a
// trip home, and at End Day. That keeps a save simple (no half-finished drives
// to restore) while losing at most one trip if the tab is closed.
//
// Saves are versioned. Older versions are migrated when they're read, so a game
// saved before an update still loads.
import { JOB_TYPES } from '../data/jobs.js';
import { VEHICLE_TYPES, CAB_COLORS } from '../data/vehicles.js';
import { Truck } from './truck.js';

export const SAVE_VERSION = 2;
export const SAVE_KEY = 'construction-sim.save.v1'; // the storage slot (kept so old saves are found)

// Safe to save: every crew is parked at the property and not mid-job.
export function canSave({ dispatcher }) {
  return dispatcher.allHome();
}

const jobBase = (j) => ({ id: j.id, crewId: j.crewId, lotId: j.lot.id, typeId: j.type.id, pay: j.pay, dueAt: j.dueAt, start: j.start, end: j.end });

export function serialize({ clock, economy, dispatcher }) {
  return {
    v: SAVE_VERSION,
    savedAt: Date.now(),
    clock: { minutes: clock.minutes, shiftOver: clock.shiftOver },
    economy: { money: economy.money, fuelGal: economy.fuelGal },
    roster: dispatcher.roster.members.map((m) => ({ ...m, stats: { ...m.stats } })),
    counters: {
      job: dispatcher.nextId,
      crew: dispatcher.nextCrewId,
      vehicle: dispatcher.nextVehicleId,
      delivery: dispatcher.nextDeliveryId,
    },
    crews: dispatcher.crews.map((c) => ({
      id: c.id,
      name: c.name,
      memberIds: [...c.memberIds],
      vehicleId: c.vehicleId,
      queue: c.queue.map((j) => ({ ...jobBase(j), est: { ...j.est } })),
    })),
    vehicles: dispatcher.vehicles.map((v) => ({ id: v.id, typeId: v.typeId, owned: v.owned, parkSlot: v.parkSlot })),
    deliveries: dispatcher.deliveries.map((d) => ({ ...d })),
    offers: dispatcher.offers.map((o) => ({
      id: o.id, lotId: o.lot.id, typeId: o.type.id, basePay: o.basePay, pay: o.pay, dueDay: o.dueDay, dueAt: o.dueAt, rush: o.rush,
    })),
    applicants: dispatcher.applicants.map((a) => ({ ...a, stats: { ...a.stats } })),
    history: dispatcher.history.map((j) => ({
      ...jobBase(j), est: { ...j.est }, paid: j.paid, daysLate: j.daysLate, finishedAt: j.finishedAt,
    })),
  };
}

// ----- older versions -----
// Version 1 had a single crew and a single truck. Everyone is put in crews of
// two (the first crew gets the truck), and the job queue goes to the first crew.
function migrateV1(data) {
  const members = data.roster || [];
  const crews = [];
  for (let i = 0; i < members.length; i += 2) {
    crews.push({
      id: crews.length + 1,
      name: `Crew (${crews.length + 1})`,
      memberIds: members.slice(i, i + 2).map((m) => m.id),
      vehicleId: crews.length === 0 ? 1 : null,
      queue: crews.length === 0 ? (data.schedule || []).map((j) => ({ ...j, crewId: 1 })) : [],
    });
  }
  return {
    ...data,
    v: 2,
    crews,
    vehicles: [{ id: 1, typeId: 'halfTon', owned: true, parkSlot: 0 }],
    deliveries: [],
    counters: { job: data.nextId ?? 1, crew: crews.length + 1, vehicle: 2, delivery: 1 },
    history: (data.history || []).map((j) => ({ ...j, crewId: 1 })),
  };
}

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

// Throws if the data isn't a save this version of the game understands.
// Returns the data, migrated to the current version.
export function validate(input) {
  if (!input || typeof input !== 'object') throw new Error('Not a save file.');
  let data = input;
  if (data.v === 1) data = migrateV1(data);
  if (data.v !== SAVE_VERSION) throw new Error(`Save version ${input.v} is not supported.`);
  if (!data.clock || !isNum(data.clock.minutes)) throw new Error('Save is missing the clock.');
  if (!data.economy || !isNum(data.economy.money) || !isNum(data.economy.fuelGal)) throw new Error('Save is missing money or fuel.');
  if (!Array.isArray(data.roster) || !data.roster.length || !data.roster[0].isOwner) throw new Error('Save is missing the crew.');
  for (const key of ['crews', 'vehicles', 'deliveries', 'offers', 'applicants', 'history']) {
    if (!Array.isArray(data[key])) throw new Error(`Save is missing ${key}.`);
  }
  if (!data.crews.length) throw new Error('Save has no crews.');
  return data;
}

// Puts a save back into a freshly created game. Anything that can't be matched
// to the current map or job list is dropped rather than crashing the game.
export function restore({ world, clock, economy, dispatcher }, input) {
  const data = validate(input);
  clock.minutes = data.clock.minutes;
  clock.shiftOver = !!data.clock.shiftOver;
  economy.money = data.economy.money;
  economy.fuelGal = data.economy.fuelGal;

  const d = dispatcher;
  d.roster.members = data.roster.map((m) => ({ ...m, stats: { ...m.stats } }));
  d.applicants = data.applicants.map((a) => ({ ...a, stats: { ...a.stats } }));
  d.nextId = data.counters?.job ?? 1;
  d.nextCrewId = data.counters?.crew ?? data.crews.length + 1;
  d.nextVehicleId = data.counters?.vehicle ?? data.vehicles.length + 1;
  d.nextDeliveryId = data.counters?.delivery ?? 1;

  // Vehicles: new trucks, parked in their spots at the property.
  d.vehicles = [];
  const maxSlot = world.property.parkNodes.length - 1;
  const usedSlots = new Set();
  for (const v of data.vehicles) {
    const type = VEHICLE_TYPES[v.typeId];
    if (!type) continue;
    let slot = Math.min(Math.max(0, v.parkSlot | 0), maxSlot);
    while (usedSlots.has(slot) && slot < maxSlot) slot++;
    usedSlots.add(slot);
    const node = world.property.parkNodes[slot];
    const truck = new Truck(world, node);
    truck.placeAt(node);
    d.vehicles.push({
      id: v.id, typeId: v.typeId, name: type.name, seats: type.seats, owned: !!v.owned,
      rentPerDay: v.owned ? 0 : type.rentPerDay, parkSlot: slot, truck,
    });
    truck.tint = CAB_COLORS[(v.id - 1) % CAB_COLORS.length];
  }
  d.deliveries = data.deliveries.filter((x) => VEHICLE_TYPES[x.typeId]).map((x) => ({ ...x }));

  const lot = (id) => world.lotById.get(id);
  const type = (id) => JOB_TYPES[id];
  const job = (j, extra) => ({ id: j.id, crewId: j.crewId, lot: lot(j.lotId), type: type(j.typeId), pay: j.pay, dueAt: j.dueAt, start: j.start, end: j.end, est: { ...j.est }, workDone: 0, ...extra });
  const memberIds = new Set(d.roster.members.map((m) => m.id));

  d.crews = data.crews.map((c) => ({
    id: c.id,
    name: c.name,
    memberIds: (c.memberIds || []).filter((id) => memberIds.has(id)),
    vehicleId: d.vehicles.some((v) => v.id === c.vehicleId) ? c.vehicleId : null,
    queue: (c.queue || []).filter((j) => lot(j.lotId) && type(j.typeId)).map((j) => job(j, { status: 'scheduled', crewId: c.id })),
    state: 'idle',
    purpose: null,
    active: null,
  }));
  // Anyone not in a crew (a damaged save) goes into the first crew with room, or a new one.
  for (const m of d.roster.members) {
    if (d.crewOf(m.id)) continue;
    const crew = d.crews.find((c) => c.memberIds.length < d.capacityOf(c)) || d.addCrew();
    crew.memberIds.push(m.id);
  }

  d.offers = [];
  for (const o of data.offers) {
    if (!lot(o.lotId) || !type(o.typeId)) continue;
    const offer = { id: o.id, lot: lot(o.lotId), type: type(o.typeId), basePay: o.basePay, pay: o.pay, dueDay: o.dueDay, dueAt: o.dueAt, rush: o.rush };
    offer.est = d.estimate(offer);
    d.offers.push(offer);
  }
  d.history = data.history
    .filter((j) => lot(j.lotId) && type(j.typeId))
    .map((j) => job(j, { status: 'done', paid: j.paid, daysLate: j.daysLate, finishedAt: j.finishedAt }));

  for (const l of world.lots) l.work = null;
}

export function parseSaveText(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not a save.');
  }
  return validate(data);
}
