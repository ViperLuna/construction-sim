// People: the owner, employees, the daily pool of applicants, hiring, levels and
// payroll. No drawing and no DOM. See docs/DESIGN.md, section 6.
import { CONFIG } from '../config.js';
import { mulberry32, hashSeed } from '../util/rng.js';
import { FIRST_NAMES, LAST_NAMES } from '../data/names.js';
import { shiftStart, isBusinessDay } from './clock.js';

export const STAT_KEYS = ['speed', 'quality', 'stamina', 'driving', 'equipment', 'teamwork'];
export const STAT_LABELS = {
  speed: 'Speed',
  quality: 'Quality',
  stamina: 'Stamina',
  driving: 'Driving',
  equipment: 'Equipment',
  teamwork: 'Teamwork',
};
export const STAT_SHORT = { speed: 'SPD', quality: 'QUA', stamina: 'STA', driving: 'DRV', equipment: 'EQP', teamwork: 'TMW' };
export const MAX_STAT = 10;
export const MAX_PAID_HOURS = 12; // nobody works more than 12 hours a day

export const RARITIES = [
  { id: 'common', label: 'Common', weight: 55, range: [1, 4] },
  { id: 'uncommon', label: 'Uncommon', weight: 28, range: [3, 6] },
  { id: 'rare', label: 'Rare', weight: 14, range: [5, 8] },
  { id: 'legendary', label: 'Legendary', weight: 3, range: [7, 10] },
];

// Average stat -> asking wage ($/hour). $12 is the starting low end; the very
// best ask $50-60 (docs/DESIGN.md, 6.4).
const WAGE_CURVE = [[1, 11], [2.5, 12], [4.5, 19], [6.5, 32], [8.5, 50], [10, 60]];

export function wageForAverage(avg) {
  const c = WAGE_CURVE;
  if (avg <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    if (avg <= c[i][0]) {
      const [x0, y0] = c[i - 1];
      const [x1, y1] = c[i];
      return y0 + ((avg - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return c[c.length - 1][1];
}

export const averageStat = (m) => STAT_KEYS.reduce((sum, k) => sum + m.stats[k], 0) / STAT_KEYS.length;

// Work rate of one person: an average worker (Speed 5) is 1.0.
export const efficiencyOf = (m) => 0.5 + 0.1 * m.stats.speed;

// ----- levels -----
export const xpToNext = (level) => 120 * level; // working minutes

// XP comes from working. Each level gives 2 points to spend, +1 at levels 5, 10, 15...
export function addXp(member, minutes) {
  member.xp += minutes;
  let gained = 0;
  while (member.xp >= xpToNext(member.level)) {
    member.xp -= xpToNext(member.level);
    member.level++;
    member.points += 2 + (member.level % 5 === 0 ? 1 : 0);
    gained++;
  }
  return gained;
}

export function spendPoint(member, stat) {
  if (!STAT_KEYS.includes(stat) || member.points <= 0 || member.stats[stat] >= MAX_STAT) return false;
  member.stats[stat]++;
  member.points--;
  return true;
}

// ----- people -----
export function createOwner() {
  return {
    id: 'owner',
    name: 'You',
    isOwner: true,
    stats: { speed: 7, quality: 8, stamina: 6, driving: 7, equipment: 6, teamwork: 7 },
    level: 1,
    xp: 0,
    points: 0,
    wage: 0, // the owner is never paid, and has no living costs
  };
}

function pickRarity(rng) {
  let roll = rng() * RARITIES.reduce((sum, r) => sum + r.weight, 0);
  for (const r of RARITIES) if ((roll -= r.weight) < 0) return r;
  return RARITIES[0];
}

function makeApplicant(rng, id, rarity, usedNames) {
  const [lo, hi] = rarity.range;
  const stats = {};
  for (const k of STAT_KEYS) stats[k] = lo + Math.floor(rng() * (hi - lo + 1));
  let name;
  do {
    name = `${FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)]}`;
  } while (usedNames.has(name));
  usedNames.add(name);
  const a = { id, name, rarity: rarity.id, stats, level: 1, xp: 0, points: 0 };
  a.ask = Math.max(12, Math.round(wageForAverage(averageStat(a)) * (0.94 + rng() * 0.12)));
  return a;
}

// A fresh pool each day: always something common and something uncommon you can
// work with, plus two more that can be better, sometimes much better.
export function generateApplicants(day) {
  const rng = mulberry32(day * 104729 + 7);
  const used = new Set();
  const byId = (id) => RARITIES.find((r) => r.id === id);
  return [
    makeApplicant(rng, `a${day}-0`, byId('common'), used),
    makeApplicant(rng, `a${day}-1`, byId('uncommon'), used),
    makeApplicant(rng, `a${day}-2`, pickRarity(rng), used),
    makeApplicant(rng, `a${day}-3`, pickRarity(rng), used),
  ];
}

// How likely someone is to take an offer: at or above their ask is a sure yes;
// a little under is a maybe; well under is a no.
export function acceptChance(applicant, offer) {
  const ratio = offer / applicant.ask;
  if (ratio >= 1) return 1;
  if (ratio < 0.8) return 0;
  return (ratio - 0.8) / 0.2;
}

// The same offer to the same person always gets the same answer, so you can't
// just keep clicking until they say yes. A better offer is a new roll.
export function decideHire(applicant, offer) {
  const chance = acceptChance(applicant, offer);
  if (chance >= 1) return true;
  if (chance <= 0) return false;
  return mulberry32(hashSeed(`${applicant.id}:${offer}`))() < chance;
}

// Cash you need on hand to take someone on: a few days of their wages.
export const cashNeededFor = (wage) => wage * 10 * CONFIG.hireCashDays;

export class Roster {
  constructor() {
    this.members = [createOwner()];
  }

  get owner() {
    return this.members[0];
  }

  get employees() {
    return this.members.slice(1);
  }

  get isFull() {
    return this.members.length >= CONFIG.maxCrewSize;
  }

  // Who rides in the truck (the first people in the list, up to its seats).
  get seated() {
    return this.members.slice(0, CONFIG.truckSeats);
  }

  isSeated(member) {
    return this.seated.includes(member);
  }

  hire(applicant, wage, minutes) {
    const { id, name, stats, level, xp, points } = applicant;
    const member = { id, name, isOwner: false, stats: { ...stats }, level, xp, points, wage, hiredAt: minutes };
    this.members.push(member);
    return member;
  }

  fire(id) {
    const i = this.members.findIndex((m) => m.id === id && !m.isOwner);
    if (i < 0) return false;
    this.members.splice(i, 1);
    return true;
  }

  // Everyone is paid at the end of the day for the hours they were on the
  // clock, never more than 12. The owner isn't paid.
  payDay(day, clockOutMinutes) {
    const lines = [];
    let total = 0;
    if (isBusinessDay(day)) {
      for (const m of this.employees) {
        const clockIn = Math.max(shiftStart(day), m.hiredAt ?? 0);
        const hours = Math.max(0, Math.min(MAX_PAID_HOURS, (clockOutMinutes - clockIn) / 60));
        const pay = Math.round(hours * m.wage);
        if (hours > 0) {
          lines.push({ name: m.name, hours, pay });
          total += pay;
        }
      }
    }
    return { lines, total };
  }

  // What a full 10-hour day costs right now.
  get dailyCost() {
    return this.employees.reduce((sum, m) => sum + m.wage * 10, 0);
  }
}
