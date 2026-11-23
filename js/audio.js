// Placeholder audio layer. Browsers block sound until the player interacts,
// so pressing Play on the title screen calls unlock(). No sounds yet.

let ctx = null;

export function unlock() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  } catch {
    return false;
  }
}

export function isUnlocked() {
  return !!ctx && ctx.state === 'running';
}
