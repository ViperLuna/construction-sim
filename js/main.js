import { TITLE, VERSION, CONFIG } from './config.js';
import { loadSettings, saveSettings, clampSecondsPerHour } from './settings.js';
import { unlock } from './audio.js';
import { buildWorld, lotAt } from './world/map.js';
import { Truck } from './game/truck.js';
import { Clock, partsAt } from './game/clock.js';
import { createEconomy, formatMoneyShort, formatMoneyFull } from './game/economy.js';
import { Dispatcher } from './game/dispatcher.js';
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
  if (!stored) console.warn('Settings could not be saved (storage unavailable).');
});

// ---------- the game ----------
const fmtRange = (a, b) => {
  const s = partsAt(a);
  const e = partsAt(b);
  return `${s.day} ${s.time} – ${s.day === e.day ? '' : e.day + ' '}${e.time}`;
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function createGame() {
  const world = buildWorld();
  const clock = new Clock();
  const truck = new Truck(world, world.property.homeNode);
  const economy = createEconomy();
  // The owner, working alone for now. Stats are 1-10 (see docs/DESIGN.md, 6.3).
  const crew = { name: 'You', stats: { speed: 7, quality: 8 } };
  const dispatcher = new Dispatcher({ world, truck, clock, economy, crew });

  const canvas = $('map');
  const ctx = canvas.getContext('2d');
  const statusEl = $('status');
  const panel = $('panel');
  const panelTitle = $('panel-title');
  const panelBody = $('panel-body');
  const endDayBtn = $('btn-endday');
  const skipBtn = $('btn-skip');
  const followBtn = $('btn-follow');

  const view = { cssW: 0, cssH: 0, dpr: 1, cam: null };
  const floaters = [];
  let selectedLot = null;
  let follow = true;
  let tab = 'map';
  let running = false;
  let lastFrame = 0;
  let lastPanelRefresh = 0;

  const setStatus = (text) => {
    statusEl.textContent = text;
  };

  // ----- layout and camera -----
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

  function recenter() {
    const cam = view.cam;
    cam.x = world.w / 2;
    cam.y = world.h / 2;
    cam.zoom = cam.fit;
    follow = false;
    refreshHud();
  }

  // ----- readouts -----
  function crewLabel() {
    const job = dispatcher.active;
    if (clock.shiftOver) return 'Clocked out for the day';
    if (dispatcher.state === 'working') return `${job.type.verb} ${job.lot.address} · ${Math.round(job.lot.work.progress * 100)}%`;
    if (dispatcher.state === 'travelling') {
      return dispatcher.purpose === 'toJob' ? `Driving to ${job.lot.address}` : 'Heading home';
    }
    const next = dispatcher.schedule[0];
    if (next) return `Waiting for ${partsAt(next.start).day} ${partsAt(next.start).time}`;
    return 'Waiting at home';
  }

  function refreshHud() {
    const p = clock.parts();
    $('hud-date').textContent = p.date;
    $('hud-time').textContent = p.time;
    document.querySelectorAll('[data-speed]').forEach((b) => {
      b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === clock.speedIndex));
    });
    followBtn.setAttribute('aria-pressed', String(follow));
    const money = $('hud-money');
    money.textContent = formatMoneyShort(economy.money);
    money.title = formatMoneyFull(economy.money);
    $('hud-fuel').textContent = `⛽ ${Math.round(economy.fuelGal)} gal`;
    $('hud-crew').textContent = crewLabel();
    $('jobs-badge').textContent = String(dispatcher.offers.length);
    endDayBtn.hidden = !clock.shiftOver;
    if (clock.shiftOver) {
      const next = partsAt(clock.nextShiftMinutes());
      endDayBtn.textContent = `End Day → ${next.day} ${next.time}`;
    }
    // Idle at home with nothing due: offer to fast-forward to what's next.
    const skip = dispatcher.skipTarget();
    skipBtn.hidden = !skip;
    if (skip) skipBtn.textContent = skip.job ? `Skip to ${partsAt(skip.minutes).time}` : 'Skip to end of day';
  }

  // ----- panels (Jobs / Schedule) -----
  function renderJobs() {
    panelTitle.textContent = `Job offers · ${clock.parts().date}`;
    panelBody.replaceChildren();
    if (!dispatcher.offers.length) {
      panelBody.append(el('p', 'empty', 'No more offers today. Press End Day when your shift is over for a fresh batch.'));
      return;
    }
    for (const offer of dispatcher.offers) {
      const e = offer.est;
      const card = el('article', 'card');
      const main = el('div', 'card-main');
      main.append(el('strong', '', `${offer.type.name} · ${offer.lot.address}`));
      main.append(el('div', 'muted', `About ${e.workMin} min of work · ${Math.round(e.driveMin)} min drive each way`));
      const money = el('div', '', '');
      money.append(document.createTextNode(`Pays ${formatMoneyFull(offer.pay)} · fuel ≈ ${formatMoneyFull(e.fuelCost)} · `));
      money.append(el('span', 'good', `profit ≈ ${formatMoneyFull(e.profit)}`));
      main.append(money);
      const btn = el('button', 'btn primary', 'Accept');
      btn.type = 'button';
      btn.addEventListener('click', () => {
        const job = dispatcher.accept(offer.id);
        if (job) setStatus(`Scheduled ${job.lot.address}: ${fmtRange(job.start, job.end)}`);
        renderPanel();
        refreshHud();
      });
      card.append(main, btn);
      panelBody.append(card);
    }
  }

  function renderSchedule() {
    panelTitle.textContent = 'Schedule · Crew (1)';
    panelBody.replaceChildren();
    const rows = [...dispatcher.schedule];
    if (!rows.length && !dispatcher.history.length) {
      panelBody.append(el('p', 'empty', 'Nothing scheduled. Open Jobs and accept some work.'));
      return;
    }
    const statusText = (job) => {
      if (job.status === 'working') return `${job.type.verb} ${Math.round(job.lot.work.progress * 100)}%`;
      if (job.status === 'driving') return 'Driving';
      if (job.status === 'done') return `Paid ${formatMoneyFull(job.pay)}`;
      return 'Scheduled';
    };
    const addRow = (job, done) => {
      const card = el('article', done ? 'card done' : 'card');
      const main = el('div', 'card-main');
      main.append(el('strong', '', `${job.type.name} · ${job.lot.address}`));
      main.append(el('div', 'muted', done ? `Finished ${partsAt(job.finishedAt).day} ${partsAt(job.finishedAt).time}` : fmtRange(job.start, job.end)));
      card.append(main, el('div', done ? 'row-status good' : 'row-status', statusText(job)));
      panelBody.append(card);
    };
    rows.forEach((j) => addRow(j, false));
    if (dispatcher.history.length) {
      panelBody.append(el('div', 'muted', 'Finished'));
      dispatcher.history.slice(0, 5).forEach((j) => addRow(j, true));
    }
  }

  function renderPanel() {
    if (tab === 'jobs') renderJobs();
    else if (tab === 'schedule') renderSchedule();
  }

  function setTab(next) {
    tab = next;
    document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
    panel.hidden = tab === 'map';
    $('map-actions').hidden = tab !== 'map';
    renderPanel();
  }
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

  // ----- game events -----
  dispatcher.onEvent = (type, payload) => {
    if (type === 'done') {
      floaters.push({ x: payload.lot.x + payload.lot.w / 2, y: payload.lot.y + 0.5, text: `+${formatMoneyFull(payload.pay)}`, age: 0, life: 2.2 });
      setStatus(`Finished ${payload.lot.address}: ${formatMoneyFull(payload.pay)} earned.`);
    } else if (type === 'started') {
      setStatus(`${payload.type.verb} ${payload.lot.address}…`);
    } else if (type === 'newDay') {
      setStatus('New day. Fresh job offers are in.');
    }
    if (type !== 'scheduled') renderPanel();
  };

  skipBtn.addEventListener('click', () => {
    if (dispatcher.skipAhead()) setStatus('Skipped ahead.');
    refreshHud();
  });

  endDayBtn.addEventListener('click', () => {
    dispatcher.endDay();
    follow = true;
    refreshHud();
    renderPanel();
  });

  // ----- buttons -----
  followBtn.addEventListener('click', () => {
    follow = !follow;
    refreshHud();
  });
  $('btn-recenter').addEventListener('click', recenter);
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

  // ----- camera input: drag to pan, wheel/pinch to zoom, tap a house for its address -----
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
      selectedLot = lot;
      if (lot) setStatus(lot.address);
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
    dispatcher.update(gameMinutes);

    // Everyone clocks out at quitting time once back home. The skip is manual.
    if (!clock.shiftOver && dispatcher.shiftIsOver()) {
      clock.shiftOver = true;
      setStatus("Shift's over. Press End Day when you're ready.");
    }

    // The camera stays on the truck while it's out working, if Follow is on.
    const out = dispatcher.state !== 'idle' || truck.state === 'driving';
    if (follow && out) {
      if (view.cam.zoom < 16) view.cam.zoom += (16 - view.cam.zoom) * 0.06;
      view.cam.x += (truck.x - view.cam.x) * 0.15;
      view.cam.y += (truck.y - view.cam.y) * 0.15;
    }

    for (const f of floaters) f.age += dt;
    while (floaters.length && floaters[0].age > floaters[0].life) floaters.shift();

    refreshHud();
    if (tab === 'schedule' && now - lastPanelRefresh > 500) {
      lastPanelRefresh = now;
      renderSchedule();
    }
    const activeLot = dispatcher.state === 'working' ? dispatcher.active.lot : null;
    render(ctx, {
      world,
      cam: view.cam,
      truck,
      selectedLot,
      workAlpha: (lot) => dispatcher.workAlpha(lot),
      activeLot,
      floaters,
      ...view,
    });
    requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    lastFrame = performance.now();
    setTab('map');
    refreshHud();
    requestAnimationFrame(frame);
  }

  setStatus('Open Jobs to pick some work.');

  // Test hook so automated checks can drive the game without pixel hunting.
  window.__game = { world, truck, clock, economy, dispatcher, view, setTab };

  return { resize, start };
}

// ---------- installable app ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
