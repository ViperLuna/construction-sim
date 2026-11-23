// The game clock. Time is measured in in-game minutes since the start.
// Pace comes from CONFIG.secondsPerGameHour (default and minimum 60, meaning
// one real minute is one game hour).
import { CONFIG } from '../config.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The game starts on a Monday morning at 7:00 AM (April 7).
const START = new Date(2025, 3, 7, 7, 0, 0);

export class Clock {
  constructor() {
    this.minutes = 0; // game minutes elapsed
    this.speedIndex = 1; // index into CONFIG.speeds
  }

  get speed() {
    return CONFIG.speeds[this.speedIndex];
  }

  setSpeedIndex(i) {
    this.speedIndex = Math.max(0, Math.min(CONFIG.speeds.length - 1, i));
  }

  // Real seconds -> game minutes at the current speed.
  advance(realSeconds) {
    const perSecond = (60 / CONFIG.secondsPerGameHour) * this.speed;
    const delta = realSeconds * perSecond;
    this.minutes += delta;
    return delta;
  }

  get date() {
    return new Date(START.getTime() + this.minutes * 60000);
  }

  // { date: 'Mon, Apr 7', time: '7:00 AM' }
  parts() {
    const d = this.date;
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return { date: `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`, time: `${h}:${m} ${ap}` };
  }
}

export function formatMinutes(min) {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}
