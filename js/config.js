// Tunable values live here (see docs/DESIGN.md, section 2 and 3.1).
// Player overrides from the Settings screen are layered on top by settings.js.

export const TITLE = 'Construction Sim';
export const VERSION = '0.1.0';

export const CONFIG = {
  // Real seconds per in-game hour. 60 is both the default and the minimum.
  secondsPerGameHour: 60,
  minSecondsPerGameHour: 60,

  // Truck speed in map tiles per in-game minute. The map is abstract, not
  // real-world scale: this is tuned for how it looks. At the default pace,
  // 1 real second = 1 game minute, so this is also tiles per real second.
  truckTilesPerGameMinute: 3,

  // Distance sideways from the road centerline that vehicles drive on (tiles).
  laneOffset: 0.45,

  // A finished job's work stays visible this long, then fades back to a plain
  // lot over the second number (game minutes).
  workHoldMinutes: 45,
  workFadeMinutes: 45,

  // Speed multipliers offered by the HUD (0 = paused).
  speeds: [0, 1, 2, 4],
};
