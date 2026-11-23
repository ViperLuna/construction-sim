// Saving and loading (see docs/DESIGN.md, section 11.1).
//
// The game saves whenever the crew is home and nothing is in motion: after each
// job's trip home, and at End Day. That keeps a save simple (no half-finished
// drives to restore) while losing at most one trip if the tab is closed.
// Saves are versioned so old ones can be migrated as the game changes.
import { JOB_TYPES } from '../data/jobs.js';

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'construction-sim.save.v1';

// Safe to save: the crew is parked at the property and not mid-job.
export function canSave({ dispatcher, truck }) {
  return dispatcher.state === 'idle' && truck.state === 'parked' && truck.nodeId === dispatcher.homeNode;
}

export function serialize({ clock, economy, dispatcher }) {
  const jobBase = (j) => ({ id: j.id, lotId: j.lot.id, typeId: j.type.id, pay: j.pay, dueAt: j.dueAt, start: j.start, end: j.end });
  return {
    v: SAVE_VERSION,
    savedAt: Date.now(),
    clock: { minutes: clock.minutes, shiftOver: clock.shiftOver },
    economy: { money: economy.money, fuelGal: economy.fuelGal },
    roster: dispatcher.roster.members.map((m) => ({ ...m, stats: { ...m.stats } })),
    nextId: dispatcher.nextId,
    offers: dispatcher.offers.map((o) => ({
      id: o.id, lotId: o.lot.id, typeId: o.type.id, basePay: o.basePay, pay: o.pay, dueDay: o.dueDay, dueAt: o.dueAt, rush: o.rush,
    })),
    applicants: dispatcher.applicants.map((a) => ({ ...a, stats: { ...a.stats } })),
    schedule: dispatcher.schedule.map((j) => ({ ...jobBase(j), est: { ...j.est } })),
    history: dispatcher.history.map((j) => ({
      ...jobBase(j), est: { ...j.est }, paid: j.paid, daysLate: j.daysLate, finishedAt: j.finishedAt,
    })),
  };
}

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

// Throws if the data isn't a save this version of the game understands.
export function validate(data) {
  if (!data || typeof data !== 'object') throw new Error('Not a save file.');
  if (data.v !== SAVE_VERSION) throw new Error(`Save version ${data.v} is not supported.`);
  if (!data.clock || !isNum(data.clock.minutes)) throw new Error('Save is missing the clock.');
  if (!data.economy || !isNum(data.economy.money) || !isNum(data.economy.fuelGal)) throw new Error('Save is missing money or fuel.');
  if (!Array.isArray(data.roster) || !data.roster.length || !data.roster[0].isOwner) throw new Error('Save is missing the crew.');
  for (const key of ['offers', 'applicants', 'schedule', 'history']) {
    if (!Array.isArray(data[key])) throw new Error(`Save is missing ${key}.`);
  }
  return data;
}

// Puts a save back into a freshly created game. Anything that can't be matched
// to the current map or job list is dropped rather than crashing the game.
export function restore({ world, clock, economy, dispatcher, truck }, data) {
  validate(data);
  clock.minutes = data.clock.minutes;
  clock.shiftOver = !!data.clock.shiftOver;
  economy.money = data.economy.money;
  economy.fuelGal = data.economy.fuelGal;

  dispatcher.roster.members = data.roster.map((m) => ({ ...m, stats: { ...m.stats } }));
  dispatcher.applicants = data.applicants.map((a) => ({ ...a, stats: { ...a.stats } }));
  dispatcher.nextId = data.nextId ?? 1;

  const lot = (id) => world.lotById.get(id);
  const type = (id) => JOB_TYPES[id];
  dispatcher.offers = [];
  for (const o of data.offers) {
    if (!lot(o.lotId) || !type(o.typeId)) continue;
    const offer = { id: o.id, lot: lot(o.lotId), type: type(o.typeId), basePay: o.basePay, pay: o.pay, dueDay: o.dueDay, dueAt: o.dueAt, rush: o.rush };
    offer.est = dispatcher.estimate(offer);
    dispatcher.offers.push(offer);
  }
  const job = (j, extra) => ({ id: j.id, lot: lot(j.lotId), type: type(j.typeId), pay: j.pay, dueAt: j.dueAt, start: j.start, end: j.end, est: { ...j.est }, workDone: 0, ...extra });
  dispatcher.schedule = data.schedule
    .filter((j) => lot(j.lotId) && type(j.typeId))
    .map((j) => job(j, { status: 'scheduled' }));
  dispatcher.history = data.history
    .filter((j) => lot(j.lotId) && type(j.typeId))
    .map((j) => job(j, { status: 'done', paid: j.paid, daysLate: j.daysLate, finishedAt: j.finishedAt }));

  // The crew always comes back home, parked and ready.
  dispatcher.state = 'idle';
  dispatcher.purpose = null;
  dispatcher.active = null;
  for (const l of world.lots) l.work = null;
  truck.placeAtHome();
}

// ----- storage (localStorage; wrapped because it can be blocked or full) -----
export function readSaveText(storage = globalThis.localStorage) {
  try {
    return storage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

export function readSave(storage) {
  const text = readSaveText(storage);
  if (!text) return null;
  try {
    return validate(JSON.parse(text));
  } catch {
    return null;
  }
}

export function writeSave(data, storage = globalThis.localStorage) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(storage = globalThis.localStorage) {
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    /* nothing to do */
  }
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
