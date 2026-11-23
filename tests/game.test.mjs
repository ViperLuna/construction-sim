// Run with:  node --test tests/
// Covers the game logic that doesn't need a screen: money formatting, the
// scheduler, a full working day, the end-of-day skip, and truck driving.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld } from '../js/world/map.js';
import { findPath } from '../js/world/pathfind.js';
import { Truck } from '../js/game/truck.js';
import { Clock, partsAt } from '../js/game/clock.js';
import { createEconomy, formatMoneyShort, formatMoneyFull } from '../js/game/economy.js';
import { Dispatcher } from '../js/game/dispatcher.js';

function setup(startMinutes = 0) {
  const world = buildWorld();
  const clock = new Clock();
  clock.minutes = startMinutes;
  const truck = new Truck(world, world.property.homeNode);
  const economy = createEconomy();
  const dispatcher = new Dispatcher({ world, truck, clock, economy, crew: { name: 'You', stats: { speed: 7, quality: 8 } } });
  return { world, clock, truck, economy, dispatcher };
}

// An offer with a long window, so tests of scheduling don't trip over deadlines.
function easy(dispatcher) {
  return dispatcher.offers.find((o) => o.dueAt - dispatcher.clock.minutes > 3 * 1440) || dispatcher.offers[dispatcher.offers.length - 1];
}

// Accept the first offer, ignoring its deadline (for tests about other things).
function take(dispatcher) {
  const offer = dispatcher.offers[0];
  offer.dueAt = Infinity;
  return dispatcher.accept(offer.id);
}

// Advance the simulated day the same way the game loop does.
function run(ctx, until, stepMin = 0.05) {
  for (let i = 0; i < 400000 && !until(); i++) {
    ctx.clock.minutes += stepMin;
    ctx.dispatcher.update(stepMin);
    if (!ctx.clock.shiftOver && ctx.dispatcher.shiftIsOver()) ctx.clock.shiftOver = true;
  }
}

test('money formats: short for the HUD, full for the money screen', () => {
  assert.equal(formatMoneyFull(1540391), '$1,540,391');
  assert.equal(formatMoneyShort(1540391), '$1.54M');
  assert.equal(formatMoneyShort(12340), '$12.3K');
  assert.equal(formatMoneyShort(9540), '$9,540');
  assert.equal(formatMoneyShort(2500000000), '$2.5B');
  assert.equal(formatMoneyFull(-45), '-$45');
});

test('every addressed lot is reachable from the property, within a sensible trip time', () => {
  const { world } = setup();
  for (const lot of world.lots) {
    const route = findPath(world, world.property.homeNode, lot.accessNode);
    assert.ok(route, `${lot.address} unreachable`);
    const minutes = route.distance / 3;
    assert.ok(minutes >= 1 && minutes <= 35, `${lot.address} trip is ${minutes.toFixed(1)} min`);
  }
});

test('scheduler: starts today if most of the job fits, otherwise next morning', () => {
  const shiftEndMin = 600; // 5 PM, in game minutes (day 0 starts at 7 AM)
  const block = setup().dispatcher.offers[0].est.blockMin;
  const cases = [
    ['plenty of time', shiftEndMin - block - 30, true],
    ['just over 60% fits', shiftEndMin - Math.ceil(block * 0.62), true],
    ['under 60% fits', shiftEndMin - Math.floor(block * 0.55), false],
    ['almost quitting time', shiftEndMin - 5, false],
  ];
  for (const [label, startMinute, today] of cases) {
    const ctx = setup(startMinute);
    const offer = ctx.dispatcher.offers[0];
    offer.dueAt = Infinity; // this test is about finding slots, not deadlines
    const job = ctx.dispatcher.accept(offer.id);
    const p = partsAt(job.start);
    if (today) assert.equal(p.day, 'Mon', label + ' -> same day');
    else assert.equal(`${p.day} ${p.time}`, 'Tue 7:00 AM', label + ' -> next morning');
  }
});

test('scheduler: Friday evening work rolls to Monday, skipping the weekend', () => {
  const ctx = setup(4 * 1440 + 580); // Friday 4:40 PM
  const job = take(ctx.dispatcher);
  const p = partsAt(job.start);
  assert.equal(`${p.day} ${p.time}`, 'Mon 7:00 AM');
});

test('a full working day: jobs run, pay lands, crew clocks out at home, End Day skips ahead', () => {
  const ctx = setup();
  const { dispatcher, economy, clock, world } = ctx;
  for (let i = 0; i < 4; i++) take(dispatcher);
  const expected = dispatcher.schedule.reduce((sum, j) => sum + j.pay, 0);

  run(ctx, () => clock.shiftOver);
  assert.equal(dispatcher.history.length, 4);
  assert.equal(economy.money, 500 + expected);
  assert.ok(economy.fuelGal < 500 && economy.fuelGal > 480, 'fuel was burned, but not absurdly');
  assert.ok(dispatcher.isIdleAtHome(), 'crew is back home');
  assert.equal(partsAt(clock.minutes).time, '5:00 PM');

  // time stands still after hours
  const frozen = clock.minutes;
  assert.equal(clock.advance(5), 0);
  assert.equal(clock.minutes, frozen);

  dispatcher.endDay();
  assert.equal(partsAt(clock.minutes).day + ' ' + partsAt(clock.minutes).time, 'Tue 7:00 AM');
  assert.equal(clock.shiftOver, false);
  assert.equal(dispatcher.offers.length, 6, 'fresh offers each morning');
  assert.equal(world.lots.filter((l) => l.work).length, 0, 'old work has faded away');
});

test('End Day on a Friday goes to Monday', () => {
  const ctx = setup(4 * 1440 + 605);
  ctx.clock.shiftOver = true;
  ctx.dispatcher.endDay();
  assert.equal(partsAt(ctx.clock.minutes).day, 'Mon');
});

test('finished work holds, then fades to nothing (for every job type)', () => {
  const ctx = setup();
  const { dispatcher, clock } = ctx;
  take(dispatcher);
  run(ctx, () => dispatcher.history.length === 1);
  const lot = dispatcher.history[0].lot;
  const t0 = lot.work.doneAt;
  const alphaAt = (age) => {
    clock.minutes = t0 + age;
    dispatcher.fadeWork();
    return dispatcher.workAlpha(lot);
  };
  assert.equal(alphaAt(0), 1);
  assert.equal(alphaAt(40), 1);
  const mid = alphaAt(67);
  assert.ok(mid > 0.3 && mid < 0.7, `half faded at ${mid}`);
  assert.equal(alphaAt(100), 0);
  assert.equal(lot.work, null);
});

test('offers mix job types, and longer jobs take longer', () => {
  const seen = new Map();
  for (let day = 0; day < 12; day++) {
    const ctx = setup(day * 1440);
    for (const o of ctx.dispatcher.offers) {
      if (!seen.has(o.type.id)) seen.set(o.type.id, o.est.workMin);
      assert.equal(o.lot.kind, 'house');
      assert.ok(o.basePay >= o.type.payRange[0] && o.basePay <= o.type.payRange[1]);
      assert.ok(o.pay >= o.basePay && o.pay <= o.basePay * 1.3, 'rush bonus is modest');
      assert.equal(o.pay % o.type.payStep, 0);
    }
  }
  assert.deepEqual([...seen.keys()].sort(), ['hedges', 'mow', 'weeds']);
  assert.ok(seen.get('weeds') > seen.get('mow'), 'weeding takes longer than mowing');
});

test('every job type runs start to finish and pays', () => {
  const done = new Set();
  for (let day = 0; day < 12 && done.size < 3; day++) {
    const ctx = setup(day * 1440);
    const offer = ctx.dispatcher.offers.find((o) => !done.has(o.type.id));
    if (!offer) continue;
    const before = ctx.economy.money;
    ctx.dispatcher.accept(offer.id);
    run(ctx, () => ctx.dispatcher.history.length === 1);
    assert.equal(ctx.economy.money, before + offer.pay, offer.type.id);
    assert.equal(offer.lot.work.type.id, offer.type.id);
    done.add(offer.type.id);
  }
  assert.deepEqual([...done].sort(), ['hedges', 'mow', 'weeds']);
});

test('skip: to quitting time when idle with nothing scheduled', () => {
  const ctx = setup(60); // 8:00 AM
  const target = ctx.dispatcher.skipTarget();
  assert.equal(partsAt(target.minutes).time, '5:00 PM');
  assert.equal(target.job, null);
  assert.ok(ctx.dispatcher.skipAhead());
  assert.equal(partsAt(ctx.clock.minutes).time, '5:00 PM');
});

test('skip: jumps to the next job when one is scheduled later today', () => {
  const ctx = setup(60);
  const first = take(ctx.dispatcher);
  take(ctx.dispatcher); // queued behind it
  run(ctx, () => ctx.dispatcher.history.length === 1 && ctx.dispatcher.isIdleAtHome());
  const second = ctx.dispatcher.schedule[0];
  assert.ok(second.start > ctx.clock.minutes + 1, 'crew is home with a wait ahead of them');
  const target = ctx.dispatcher.skipTarget();
  assert.equal(target.minutes, second.start);
  assert.equal(target.job, second);
  assert.equal(first.status, 'done');
});

test('skip: not offered while out on a job, or after hours', () => {
  const busy = setup();
  take(busy.dispatcher);
  run(busy, () => busy.dispatcher.state !== 'idle');
  assert.equal(busy.dispatcher.skipTarget(), null);
  const late = setup(600);
  late.clock.shiftOver = true;
  assert.equal(late.dispatcher.skipTarget(), null);
});

test('truck turns smoothly: no spinning, the same at any speed or frame rate', () => {
  const { world } = setup();
  const norm = (d) => Math.abs((((d + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
  for (const [fps, speed] of [[60, 1], [20, 4]]) {
    const truck = new Truck(world, world.property.homeNode);
    let worst = 0;
    for (let i = 0; i < 80; i++) {
      const lot = world.lots[(i * 11 + fps) % world.lots.length];
      if (lot.accessNode === truck.nodeId) continue;
      truck.driveTo(lot.accessNode);
      let prevH = truck.heading, px = truck.x, py = truck.y;
      while (truck.state === 'driving') {
        truck.update(speed / fps);
        const moved = Math.hypot(truck.x - px, truck.y - py);
        if (moved > 1e-4) worst = Math.max(worst, norm(truck.heading - prevH) / moved);
        prevH = truck.heading; px = truck.x; py = truck.y;
      }
      assert.equal(truck.nodeId, lot.accessNode, 'arrived at the right place');
    }
    // 180 deg/tile is a tight U-turn; a snapping spin measured over 200.
    assert.ok((worst * 180) / Math.PI < 200, `worst turn ${((worst * 180) / Math.PI).toFixed(0)} deg/tile at ${fps}fps x${speed}`);
  }
});

test('offers have due dates: short windows pay more, long ones let you plan ahead', () => {
  let rush = 0;
  let normal = 0;
  let longTerm = 0;
  for (let day = 0; day < 20; day++) {
    const d = setup(day * 1440).dispatcher;
    for (const o of d.offers) {
      assert.ok(o.dueAt > day * 1440, 'due in the future');
      assert.ok(o.dueAt <= day * 1440 + 25 * 1440, 'due within about three weeks');
      if (o.rush) {
        assert.ok(o.pay > o.basePay, 'rush pays a bonus');
        rush++;
      } else normal++;
      if (o.dueAt - day * 1440 > 8 * 1440) longTerm++;
    }
  }
  assert.ok(rush > 0 && normal > rush, 'some rush jobs, mostly normal ones');
  assert.ok(longTerm > 0, 'some long-window planned work');
});

test("can't take a job that doesn't fit its allotted completion time", () => {
  const ctx = setup(600 - 20); // 4:40 PM
  const offer = ctx.dispatcher.offers[0];
  offer.dueAt = 600; // due at 5 PM today, with no hope of finishing
  assert.equal(ctx.dispatcher.checkSlot(offer).ok, false);
  assert.equal(ctx.dispatcher.accept(offer.id), null);
  assert.ok(ctx.dispatcher.offers.includes(offer), 'the offer stays on the board');
  assert.equal(ctx.dispatcher.schedule.length, 0, 'nothing was queued');
  // the same job with a later due date is fine
  offer.dueAt = 3 * 1440;
  assert.ok(ctx.dispatcher.accept(offer.id));
});

test('an overrun that finishes after the due date pays less', () => {
  const ctx = setup();
  const offer = ctx.dispatcher.offers[0];
  offer.dueAt = Infinity;
  const job = ctx.dispatcher.accept(offer.id);
  job.dueAt = job.start + 5; // pretend the job ran long and blew past its due time
  run(ctx, () => ctx.dispatcher.history.length === 1);
  assert.ok(job.daysLate >= 1);
  assert.ok(job.paid < job.pay, `paid ${job.paid} of ${job.pay}`);
  assert.equal(ctx.economy.money, 500 + job.paid);
});

test('on-time work is paid in full, and the late penalty is capped', () => {
  const ctx = setup();
  const offer = ctx.dispatcher.offers[0];
  offer.dueAt = Infinity;
  const job = ctx.dispatcher.accept(offer.id);
  run(ctx, () => ctx.dispatcher.history.length === 1);
  assert.equal(job.daysLate, 0);
  assert.equal(job.paid, job.pay);
  assert.equal(ctx.dispatcher.latePenalty(1), 0.1);
  assert.equal(ctx.dispatcher.latePenalty(30), 0.5, 'never worse than half pay');
});

test('queues can run long: no cap on jobs, only on whether each one fits its window', () => {
  const ctx = setup();
  const { dispatcher, clock } = ctx;
  let maxQueue = 0;
  let accepted = 0;
  let refused = 0;
  for (let day = 0; day < 20; day++) {
    for (const offer of [...dispatcher.offers]) {
      if (dispatcher.accept(offer.id)) accepted++;
      else refused++;
    }
    maxQueue = Math.max(maxQueue, dispatcher.schedule.length);
    // everything queued is booked to finish inside its window
    for (const job of dispatcher.schedule) assert.ok(job.end <= job.dueAt, `${job.lot.address} booked past its due time`);
    run(ctx, () => clock.shiftOver);
    dispatcher.endDay();
  }
  assert.ok(maxQueue > 7, `the queue was allowed to grow long (peaked at ${maxQueue})`);
  assert.ok(accepted > 0 && refused > 0, `accepted ${accepted}, refused ${refused}`);
  for (const job of dispatcher.history) {
    assert.ok(job.finishedAt <= job.dueAt, `${job.lot.address} finished late`);
    assert.equal(job.paid, job.pay);
  }
});
