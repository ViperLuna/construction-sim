// Player settings, persisted in localStorage (wrapped in try/catch because
// storage can be blocked or empty in private windows and previews).
import { CONFIG } from './config.js';

const KEY = 'construction-sim.settings.v1';

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function write(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clampSecondsPerHour(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return CONFIG.minSecondsPerGameHour;
  return Math.max(CONFIG.minSecondsPerGameHour, n);
}

export function loadSettings() {
  const saved = read();
  if (saved.secondsPerGameHour !== undefined) {
    CONFIG.secondsPerGameHour = clampSecondsPerHour(saved.secondsPerGameHour);
  }
}

export function saveSettings({ secondsPerGameHour }) {
  CONFIG.secondsPerGameHour = clampSecondsPerHour(secondsPerGameHour);
  return write({ secondsPerGameHour: CONFIG.secondsPerGameHour });
}
