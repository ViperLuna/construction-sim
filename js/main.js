import { TITLE, VERSION, CONFIG } from './config.js';
import { loadSettings, saveSettings, clampSecondsPerHour } from './settings.js';
import { unlock } from './audio.js';
import { buildWorld, lotAt } from './world/map.js';
import { Truck } from './game/truck.js';
import { Clock, partsAt, dayOf } from './game/clock.js';
import { createEconomy, formatMoneyShort, formatMoneyFull } from './game/economy.js';
import { Dispatcher } from './game/dispatcher.js';
import { STAT_KEYS, STAT_SHORT, STAT_LABELS, MAX_STAT, RARITIES, xpToNext, cashNeededFor, acceptChance } from './game/crew.js';
import { createCamera, render, screenToWorld } from './game/render.js';
import { canSave, serialize, restore, readSave, readSaveText, writeSave, clearSave, parseSaveText } from './game/save.js';

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
let saveBlocked = false; // set while the page is about to reload with different save data
let existingSave = readSave(); // null if there isn't one (or it can't be read)

function refreshTitle() {
  $('btn-play').textContent = existingSave ? 'Continue' : 'Play';
  $('btn-newgame').hidden = !existingSave;
}
refreshTitle();

$('btn-play').addEventListener('click', () => {
  unlock(); // browsers only allow sound after a tap
  try {
    navigator.storage?.persist?.(); // ask the browser to keep our save data
  } catch {
    /* not available */
  }
  titleScreen.hidden = true;
  gameScreen.hidden = false;
  if (!game) game = createGame(existingSave);
  game.resize();
  game.start();
});

$('btn-newgame').addEventListener('click', () => {
  if (!confirm('Start a new game? Your saved game will be deleted.')) return;
  saveBlocked = true; // otherwise closing the page would just save the old game again
  clearSave();
  location.reload();
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

// ---------- save data (in settings) ----------
function refreshSaveBox() {
  const text = readSaveText();
  const stored = readSave();
  const when = stored ? new Date(stored.savedAt).toLocaleString() : null;
  $('save-info').textContent = stored ? `Last saved ${when}.` : 'No saved game yet.';
  $('btn-save-now').disabled = !game || !game.canSaveNow();
  $('btn-save-export').disabled = !text;
}

$('btn-save-now').addEventListener('click', () => {
  $('settings-msg').textContent = game && game.saveNow() ? 'Saved.' : "Can't save right now. It works when the crew is home.";
  refreshSaveBox();
});

$('btn-save-export').addEventListener('click', () => {
  if (game) game.saveNow(); // make sure the file has the latest
  const text = readSaveText();
  if (!text) return;
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'construction-sim-save.json';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$('btn-save-import').addEventListener('click', () => $('file-import').click());
$('file-import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = parseSaveText(await file.text());
    if (!confirm('Replace your current saved game with this file?')) return;
    saveBlocked = true; // keep the running game from saving over the import
    if (!writeSave(data)) {
      saveBlocked = false;
      throw new Error('Could not store the save (is browser storage blocked?).');
    }
    location.reload();
  } catch (err) {
    $('settings-msg').textContent = err.message;
  }
});

// ---------- settings ----------
const sphInput = $('set-seconds-per-hour');
function openSettings() {
  sphInput.min = String(CONFIG.minSecondsPerGameHour);
  sphInput.value = String(CONFIG.secondsPerGameHour);
  $('settings-msg').textContent = '';
  refreshSaveBox();
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

function createGame(savedData) {
  const world = buildWorld();
  const clock = new Clock();
  const truck = new Truck(world, world.property.homeNode);
  const economy = createEconomy();
  const dispatcher = new Dispatcher({ world, truck, clock, economy });
  const roster = dispatcher.roster; // the owner, plus anyone hired
  const ctxForSave = { world, clock, economy, dispatcher, truck };
  if (savedData) {
    try {
      restore(ctxForSave, savedData);
    } catch (err) {
      console.warn('Could not load the saved game, starting fresh.', err);
    }
  }

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
  let crewView = 'roster'; // 'roster' | 'hiring'
  let confirmFireId = null;
  const offerWage = new Map(); // applicant id -> the wage typed in so far
  let hireMessage = '';
  let dirty = false; // something changed since the last save
  let lastSaveAt = 0;

  function saveNow() {
    if (saveBlocked || !canSave(ctxForSave)) return false;
    const ok = writeSave(serialize(ctxForSave));
    if (ok) dirty = false;
    return ok;
  }

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
    const points = roster.members.reduce((sum, m) => sum + m.points, 0);
    const crewBadge = $('crew-badge');
    crewBadge.hidden = points === 0;
    crewBadge.textContent = String(points);
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
      const slot = dispatcher.checkSlot(offer);
      const card = el('article', slot.ok ? 'card' : 'card blocked');
      const main = el('div', 'card-main');
      const title = el('strong', '', `${offer.type.name} · ${offer.lot.address}`);
      if (offer.rush) title.append(el('span', 'rush', 'RUSH'));
      main.append(title);
      main.append(el('div', 'muted', `About ${e.workMin} min of work · ${Math.round(e.driveMin)} min drive each way`));
      const money = el('div', '', '');
      money.append(document.createTextNode(`Pays ${formatMoneyFull(offer.pay)} · fuel ≈ ${formatMoneyFull(e.fuelCost)} · `));
      money.append(el('span', 'good', `profit ≈ ${formatMoneyFull(e.profit)}`));
      main.append(money);
      const dueDay = dayOf(offer.dueAt);
      const due = `${dueDay === clock.day ? 'today' : partsAt(offer.dueAt).day} ${partsAt(offer.dueAt).time}`;
      if (slot.ok) {
        main.append(el('div', 'muted', `Due ${due}`));
      } else {
        main.append(el('div', 'muted warn', `Can't take this job: it doesn't fall within the allotted completion time (due ${due})`));
      }
      const btn = el('button', slot.ok ? 'btn primary' : 'btn', slot.ok ? 'Accept' : 'Too late');
      btn.disabled = !slot.ok;
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
      if (job.status === 'done') return `Paid ${formatMoneyFull(job.paid)}${job.daysLate ? ' (late)' : ''}`;
      return 'Scheduled';
    };
    const addRow = (job, done) => {
      const card = el('article', done ? 'card done' : 'card');
      const main = el('div', 'card-main');
      main.append(el('strong', '', `${job.type.name} · ${job.lot.address}`));
      main.append(el('div', 'muted', done ? `Finished ${partsAt(job.finishedAt).day} ${partsAt(job.finishedAt).time}` : `${fmtRange(job.start, job.end)} · due ${partsAt(job.dueAt).day}`));
      card.append(main, el('div', done ? 'row-status good' : 'row-status', statusText(job)));
      panelBody.append(card);
    };
    rows.forEach((j) => addRow(j, false));
    if (dispatcher.history.length) {
      panelBody.append(el('div', 'muted', 'Finished'));
      dispatcher.history.slice(0, 5).forEach((j) => addRow(j, true));
    }
  }

  // ----- Crew screen -----
  function statRow(member, canSpend) {
    const row = el('div', 'stats');
    for (const key of STAT_KEYS) {
      const cell = el('span', 'stat');
      cell.title = STAT_LABELS[key];
      cell.append(el('span', 'stat-name', STAT_SHORT[key]), el('b', '', String(member.stats[key])));
      if (canSpend && member.points > 0 && member.stats[key] < MAX_STAT) {
        const plus = el('button', 'stat-plus', '+');
        plus.type = 'button';
        plus.setAttribute('aria-label', `Add a point to ${STAT_LABELS[key]}`);
        plus.addEventListener('click', () => {
          dispatcher.spend(member.id, key);
          renderPanel();
        });
        cell.append(plus);
      }
      row.append(cell);
    }
    return row;
  }

  function renderRoster() {
    panelBody.append(
      el('p', 'muted', roster.employees.length
        ? `Payroll: about ${formatMoneyFull(roster.dailyCost)} for a full 10-hour day, paid when you End Day. You're never paid, and you have no living costs.`
        : "It's just you. You work for free, and your income is whatever the jobs leave over."),
    );
    for (const m of roster.members) {
      const card = el('article', 'card person');
      const main = el('div', 'card-main');
      const head = el('div', 'person-head');
      head.append(el('strong', '', m.isOwner ? 'You (Owner)' : m.name), el('span', 'chip level', `Lv ${m.level}`));
      main.append(head);
      const seat = roster.isSeated(m) ? 'Rides in the truck' : 'No seat in the truck yet (waits at the property)';
      main.append(el('div', 'muted', `${m.isOwner ? 'No pay' : `${formatMoneyFull(m.wage)}/hour`} · ${seat}`));
      main.append(el('div', 'muted', `XP ${Math.floor(m.xp)}/${xpToNext(m.level)}${m.points ? ` · ${m.points} point${m.points > 1 ? 's' : ''} to spend` : ''}`));
      main.append(statRow(m, true));
      card.append(main);
      if (!m.isOwner) {
        const armed = confirmFireId === m.id;
        const fire = el('button', armed ? 'btn danger' : 'btn', armed ? 'Sure?' : 'Fire');
        fire.type = 'button';
        fire.addEventListener('click', () => {
          if (!armed) confirmFireId = m.id;
          else {
            dispatcher.fire(m.id);
            confirmFireId = null;
            setStatus(`${m.name} is gone.`);
          }
          renderPanel();
          refreshHud();
        });
        card.append(fire);
      }
      panelBody.append(card);
    }
    if (!roster.isFull) panelBody.append(el('p', 'muted', 'Open the Hiring tab to find people.'));
  }

  function renderHiring() {
    panelBody.append(
      el('p', 'muted', `New faces every morning. Pay is at or above the asking wage, or they might say no. You need ${CONFIG.hireCashDays} days of their wages on hand. ${roster.members.length}/${CONFIG.maxCrewSize} people on the property.`),
    );
    if (hireMessage) panelBody.append(el('p', 'warn', hireMessage));
    if (!dispatcher.applicants.length) panelBody.append(el('p', 'empty', 'Nobody else is looking today.'));
    for (const a of dispatcher.applicants) {
      const wage = offerWage.get(a.id) ?? a.ask;
      const rarity = RARITIES.find((r) => r.id === a.rarity);
      const card = el('article', `card person rarity-${a.rarity}`);
      const main = el('div', 'card-main');
      const head = el('div', 'person-head');
      head.append(el('strong', '', a.name), el('span', `chip rarity ${a.rarity}`, rarity.label));
      main.append(head);
      main.append(el('div', 'muted', `Asking ${formatMoneyFull(a.ask)}/hour`));
      main.append(statRow(a, false));

      const need = cashNeededFor(wage);
      const cashOk = economy.money >= need;
      const full = roster.isFull;
      const chance = acceptChance(a, wage);
      const controls = el('div', 'offer');
      const minus = el('button', 'btn small', '−');
      const plus = el('button', 'btn small', '+');
      minus.type = plus.type = 'button';
      minus.setAttribute('aria-label', 'Offer less');
      plus.setAttribute('aria-label', 'Offer more');
      minus.addEventListener('click', () => { offerWage.set(a.id, Math.max(1, wage - 1)); hireMessage = ''; renderPanel(); });
      plus.addEventListener('click', () => { offerWage.set(a.id, wage + 1); hireMessage = ''; renderPanel(); });
      controls.append(minus, el('span', 'offer-wage', `${formatMoneyFull(wage)}/h`), plus);
      main.append(controls);
      if (!cashOk) main.append(el('div', 'muted warn', `Locked: you need ${formatMoneyFull(need)} on hand (you have ${formatMoneyFull(economy.money)}).`));
      else if (full) main.append(el('div', 'muted warn', 'The property is full.'));
      else if (chance < 1) main.append(el('div', 'muted warn', chance === 0 ? 'Too low. They will turn this down.' : 'Below their ask: they might say no.'));

      const hire = el('button', cashOk && !full ? 'btn primary' : 'btn', 'Hire');
      hire.type = 'button';
      hire.disabled = !cashOk || full;
      hire.addEventListener('click', () => {
        const result = dispatcher.hire(a.id, wage);
        if (result.ok) {
          hireMessage = '';
          setStatus(`Hired ${a.name} at ${formatMoneyFull(wage)}/hour.`);
        } else if (result.reason === 'declined') {
          hireMessage = `${a.name} turned down ${formatMoneyFull(wage)}/hour. Try a little more.`;
        }
        renderPanel();
        refreshHud();
      });
      card.append(main, hire);
      panelBody.append(card);
    }
  }

  function renderCrew() {
    panelTitle.textContent = 'Crew';
    panelBody.replaceChildren();
    const seg = el('div', 'seg');
    for (const [id, label] of [['roster', `Roster (${roster.members.length})`], ['hiring', 'Hiring']]) {
      const b = el('button', 'seg-btn', label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(crewView === id));
      b.addEventListener('click', () => { crewView = id; confirmFireId = null; renderPanel(); });
      seg.append(b);
    }
    panelBody.append(seg);
    if (crewView === 'roster') renderRoster();
    else renderHiring();
  }

  function renderPanel() {
    if (tab === 'jobs') renderJobs();
    else if (tab === 'schedule') renderSchedule();
    else if (tab === 'crew') renderCrew();
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
      floaters.push({ x: payload.lot.x + payload.lot.w / 2, y: payload.lot.y + 0.5, text: `+${formatMoneyFull(payload.paid)}`, age: 0, life: 2.2 });
      setStatus(`Finished ${payload.lot.address}: ${formatMoneyFull(payload.paid)} earned${payload.daysLate ? ` (${payload.daysLate} day${payload.daysLate > 1 ? 's' : ''} late)` : ''}.`);
    } else if (type === 'started') {
      setStatus(`${payload.type.verb} ${payload.lot.address}…`);
    } else if (type === 'newDay') {
      hireMessage = '';
    } else if (type === 'levelUp') {
      setStatus(`${payload.isOwner ? 'You' : payload.name} reached level ${payload.level}. Open Crew to spend points.`);
    }
    if (['scheduled', 'crew', 'done', 'newDay', 'offers'].includes(type)) dirty = true;
    if (type !== 'scheduled') renderPanel();
  };

  skipBtn.addEventListener('click', () => {
    if (dispatcher.skipAhead()) setStatus('Skipped ahead.');
    refreshHud();
  });

  endDayBtn.addEventListener('click', () => {
    const payroll = dispatcher.endDay();
    follow = true;
    setStatus(
      payroll.total
        ? `Payday: ${payroll.lines.length} employee${payroll.lines.length > 1 ? 's' : ''}, ${formatMoneyFull(payroll.total)}. New day, fresh offers.`
        : 'New day. Fresh job offers are in.',
    );
    dirty = true;
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
    saveNow();
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

    // Autosave once the crew is home and nothing is in motion.
    if (dirty && now - lastSaveAt > 700 && saveNow()) lastSaveAt = now;

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

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow();
  });
  window.addEventListener('pagehide', saveNow);

  setStatus(savedData ? 'Welcome back. Your game was loaded.' : 'Open Jobs to pick some work.');

  // Test hook so automated checks can drive the game without pixel hunting.
  window.__game = { world, truck, clock, economy, dispatcher, view, setTab };

  return { resize, start, saveNow, canSaveNow: () => canSave(ctxForSave) };
}

// ---------- installable app ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
