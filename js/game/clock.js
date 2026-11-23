// The game clock. Time is measured in in-game minutes since the start.
// Pace comes from CONFIG.secondsPerGameHour (default and minimum 60, meaning
// one real minute is one game hour).
import { CONFIG } from '../config.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The game starts on a Monday morning at 7:00 AM (April 7).
const START = new Date(2025, 3, 7, 7, 0, 0);

// Business hours (default 7 AM - 5 PM, Monday to Friday). Game minute 0 is
// Monday 7:00 AM, so the start of day N's shift is simply N * 1440.
// (These become player-configurable later; see docs/DESIGN.md, section 3.1.)
export const SHIFT_START_MIN = 7 * 60;
export const SHIFT_END_MIN = 17 * 60;
const SHIFT_LENGTH = SHIFT_END_MIN - SHIFT_START_MIN;

export const dayOf = (min) => Math.floor((min + SHIFT_START_MIN) / 1440);
export const timeOfDay = (min) => (((min + SHIFT_START_MIN) % 1440) + 1440) % 1440;
export const isBusinessDay = (day) => day % 7 < 5; // day 0 is a Monday
export const shiftStart = (day) => day * 1440;
export const shiftEnd = (day) => day * 1440 + SHIFT_LENGTH;
export function nextBusinessDay(day) {
  while (!isBusinessDay(day)) day++;
  return day;
}
// How many business days come after `from` up to and including `to`.
export function businessDaysBetween(from, to) {
  let n = 0;
  for (let d = from + 1; d <= to; d++) if (isBusinessDay(d)) n++;
  return n;
}
// The day that is `n` business days after `day` (n = 0 is the same day).
export function addBusinessDays(day, n) {
  let d = nextBusinessDay(day);
  for (let i = 0; i < n; i++) d = nextBusinessDay(d + 1);
  return d;
}

function partsOf(date) {
  let h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return {
    date: `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`,
    day: DAYS[date.getDay()],
    time: `${h}:${m} ${ap}`,
  };
}

// Formats any game minute, e.g. { day: 'Mon', time: '8:15 AM' }.
export function partsAt(min) {
  return partsOf(new Date(START.getTime() + min * 60000));
}

export class Clock {
  constructor() {
    this.minutes = 0; // game minutes elapsed
    this.speedIndex = 1; // index into CONFIG.speeds
    this.shiftOver = false; // true once everyone has clocked out for the day
  }

  get speed() {
    return CONFIG.speeds[this.speedIndex];
  }

  setSpeedIndex(i) {
    this.speedIndex = Math.max(0, Math.min(CONFIG.speeds.length - 1, i));
  }

  // Real seconds -> game minutes at the current speed. Time stands still once
  // the shift is over, until the player presses End Day.
  advance(realSeconds) {
    if (this.shiftOver) return 0;
    const perSecond = (60 / CONFIG.secondsPerGameHour) * this.speed;
    const delta = realSeconds * perSecond;
    this.minutes += delta;
    return delta;
  }

  get day() {
    return dayOf(this.minutes);
  }

  get timeOfDay() {
    return timeOfDay(this.minutes);
  }

  // The start of the next working day's shift (after today).
  nextShiftMinutes() {
    return shiftStart(nextBusinessDay(this.day + 1));
  }

  // The manual after-hours skip: jump to the next shift's start.
  endDay() {
    this.minutes = this.nextShiftMinutes();
    this.shiftOver = false;
  }

  get date() {
    return new Date(START.getTime() + this.minutes * 60000);
  }

  // { date: 'Mon, Apr 7', time: '7:00 AM' }
  parts() {
    return partsOf(this.date);
  }
}

export function formatMinutes(min) {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}
