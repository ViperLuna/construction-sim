import { TITLE, VERSION, CONFIG } from './config.js';
import { loadSettings, saveSettings, clampSecondsPerHour } from './settings.js';
import { unlock } from './audio.js';
import { buildWorld, lotAt } from './world/map.js';
import { Truck } from './game/truck.js';
import { Clock, formatMinutes } from './game/clock.js';
import { createCamera, render, screenToWorld } from './game/render.js';

const $ = (id) => document.getElementById(id);

loadSettings();

// ---------- title screen ----------
document.title = TITLE;
$('title-name').textContent = TITLE;
$('title-version').textContent = `v${VERSION}`;

const titleScreen = $('title-screen');
const gameScreen = $('game-screen');
const settingsDialog = $('settings-dialog');

let game = null;

$('btn-play').addEventListener('click', () => {
  unlock(); // browsers only allow sound after a tap
  titleScreen.hidden = true;
  gameScreen.hidden = false;
  if (!game) game = createGame();
  game.resize();
  game.start();
});

$('btn-fullscreen').addEventListener('click', async () => {
  const el = document.documentElement;
  const hint = $('fullscreen-hint');
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else if (el.requestFullscreen) {
      await el.requestFullscreen();
    } else {
      throw new Error('unsupported');
    }
    hint.textContent = '';
  } catch {
    hint.textContent = 'Full screen is not available here. On iPhone, use Share → Add to Home Screen.';
  }
});

// ---------- settings ----------
const sphInput = $('set-seconds-per-hour');
function openSettings() {
  sphInput.min = String(CONFIG.minSecondsPerGameHour);
  sphInput.value = String(CONFIG.secondsPerGameHour);
  $('settings-msg').textContent = '';
  settingsDialog.showModal();
}
$('btn-settings').addEventListener('click', openSettings);
$('btn-game-settings').addEventListener('click', openSettings);
$('btn-settings-cancel').addEventListener('click', () => settingsDialog.close());
$('btn-settings-reset').addEventListener('click', () => {
  sphInput.value = String(CONFIG.minSecondsPerGameHour);
});
$('settings-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const value = clampSecondsPerHour(sphInput.value);
  const stored = saveSettings({ secondsPerGameHour: value });
  settingsDialog.close();
  if (game) game.refreshHud();
  if (!stored) console.warn('Settings could not be saved (storage unavailable).');
});

// ---------- the game ----------
function createGame() {
  const world = buildWorld();
  const clock = new Clock();
  const truck = new Truck(world, world.property.homeNode);
  const canvas = $('map');
  const ctx = canvas.getContext('2d');
  const statusEl = $('status');
  const dateEl = $('hud-date');
  const timeEl = $('hud-time');
  const select = $('dest-select');
  const followBtn = $('btn-follow');

  const view = { cssW: 0, cssH: 0, dpr: 1, cam: null };
  let selectedLot = null;
  let follow = false;
  let running = false;
  let lastFrame = 0;
  let destLabel = 'Your Property';

  // Destination dropdown: home first, then every address grouped by street.
  const homeOpt = new Option('Your Property', 'home');
  select.add(homeOpt);
  const byStreet = new Map();
  for (const lot of world.lots) {
    if (!byStreet.has(lot.street)) byStreet.set(lot.street, []);
    byStreet.get(lot.street).push(lot);
  }
  for (const [street, lots] of byStreet) {
    const group = document.createElement('optgroup');
    group.label = street;
    for (const lot of lots.sort((a, b) => a.number - b.number)) {
      group.append(new Option(lot.address, lot.id));
    }
    select.append(group);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.cssW = Math.max(1, Math.floor(rect.width));
    view.cssH = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(view.cssW * view.dpr);
    canvas.height = Math.floor(view.cssH * view.dpr);
    const fit = Math.min(view.cssW / world.w, view.cssH / world.h);
    if (!view.cam) view.cam = createCamera(view.cssW, view.cssH, world);
    view.cam.fit = fit;
    view.cam.zoom = Math.max(fit * 0.9, Math.min(view.cam.zoom, 60));
  }

  function clampCamera() {
    const cam = view.cam;
    cam.zoom = Math.max(cam.fit * 0.9, Math.min(cam.zoom, 60));
    cam.x = Math.max(0, Math.min(world.w, cam.x));
    cam.y = Math.max(0, Math.min(world.h, cam.y));
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function refreshHud() {
    const p = clock.parts();
    dateEl.textContent = p.date;
    timeEl.textContent = p.time;
    document.querySelectorAll('[data-speed]').forEach((b) => {
      b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === clock.speedIndex));
    });
    followBtn.setAttribute('aria-pressed', String(follow));
  }

  function selectLotById(id) {
    selectedLot = id === 'home' ? null : world.lotById.get(id) || null;
    select.value = selectedLot ? selectedLot.id : 'home';
  }

  function go(id) {
    if (truck.state === 'driving') {
      setStatus('The truck is still on the road. Wait until it parks.');
      return;
    }
    const lot = id === 'home' ? null : world.lotById.get(id);
    const nodeId = lot ? lot.accessNode : world.property.homeNode;
    if (nodeId === truck.nodeId) {
      setStatus(`Already parked at ${lot ? lot.address : 'Your Property'}.`);
      return;
    }
    const trip = truck.driveTo(nodeId);
    if (!trip) {
      setStatus('No route found.');
      return;
    }
    destLabel = lot ? lot.address : 'Your Property';
    setStatus(`Driving to ${destLabel} · about ${formatMinutes(trip.minutes)}`);
    if (clock.speed === 0) clock.setSpeedIndex(1);
    refreshHud();
  }

  truck.onArrive = () => {
    setStatus(`Parked at ${destLabel}.`);
  };

  $('btn-go').addEventListener('click', () => go(select.value));
  $('btn-home').addEventListener('click', () => {
    select.value = 'home';
    go('home');
  });
  select.addEventListener('change', () => selectLotById(select.value));
  followBtn.addEventListener('click', () => {
    follow = !follow;
    refreshHud();
  });
  document.querySelectorAll('[data-speed]').forEach((b) =>
    b.addEventListener('click', () => {
      clock.setSpeedIndex(Number(b.dataset.speed));
      refreshHud();
    }),
  );
  $('btn-title').addEventListener('click', () => {
    running = false;
    gameScreen.hidden = true;
    titleScreen.hidden = false;
  });

  // ----- camera input: drag to pan, wheel/pinch to zoom, tap a lot to select -----
  const pointers = new Map();
  let tapStart = null;
  let pinchDist = 0;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    tapStart = pointers.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const cam = view.cam;
    if (pointers.size === 1) {
      cam.x -= (e.clientX - p.x) / cam.zoom;
      cam.y -= (e.clientY - p.y) / cam.zoom;
      if (tapStart && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) > 6) {
        tapStart = null;
        if (follow) {
          follow = false;
          refreshHud();
        }
      }
    }
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0) cam.zoom *= d / pinchDist;
      pinchDist = d;
    }
    clampCamera();
  });

  const endPointer = (e) => {
    const wasTap = tapStart && pointers.size === 1 && performance.now() - tapStart.t < 500;
    pointers.delete(e.pointerId);
    pinchDist = 0;
    if (wasTap) {
      const r = canvas.getBoundingClientRect();
      const w = screenToWorld(view.cam, view.cssW, view.cssH, e.clientX - r.left, e.clientY - r.top);
      const lot = lotAt(world, w.x, w.y);
      if (lot) {
        selectLotById(lot.id);
        setStatus(`${lot.address} selected. Press Go to send the truck.`);
      }
    }
    tapStart = null;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const cam = view.cam;
      const r = canvas.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const before = screenToWorld(cam, view.cssW, view.cssH, sx, sy);
      cam.zoom *= Math.exp(-e.deltaY * 0.0015);
      cam.zoom = Math.max(cam.fit * 0.9, Math.min(cam.zoom, 60));
      const after = screenToWorld(cam, view.cssW, view.cssH, sx, sy);
      cam.x += before.x - after.x;
      cam.y += before.y - after.y;
      clampCamera();
    },
    { passive: false },
  );

  window.addEventListener('resize', () => {
    if (!gameScreen.hidden) resize();
  });

  // ----- main loop -----
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;

    const gameMinutes = clock.advance(dt);
    truck.update(gameMinutes);
    if (follow && truck.state === 'driving') {
      // Ease in to a close-up of the truck (never zooms out on its own).
      if (view.cam.zoom < 16) view.cam.zoom += (16 - view.cam.zoom) * 0.06;
      view.cam.x += (truck.x - view.cam.x) * 0.15;
      view.cam.y += (truck.y - view.cam.y) * 0.15;
    }
    refreshHud();
    render(ctx, { world, cam: view.cam, truck, selectedLot, ...view });
    requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    lastFrame = performance.now();
    refreshHud();
    requestAnimationFrame(frame);
  }

  setStatus('Pick an address (or tap a house) and press Go.');

  // Test hook so automated checks can drive the game without pixel hunting.
  window.__game = { world, truck, clock, go, view, selectLotById };

  return { resize, start, refreshHud };
}

// ---------- installable app ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
