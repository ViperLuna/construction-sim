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
  const cases = [
    [7 * 60, 'Mon', '2:00 PM'], // 2 PM, plenty of time
    [8.83 * 60, 'Mon', '3:49 PM'], // 3:49 PM, at least 60% fits
    [9.5 * 60, 'Tue', '7:00 AM'], // 4:30 PM, too late
  ];
  for (const [minutes, day, time] of cases) {
    const ctx = setup(minutes);
    const job = ctx.dispatcher.accept(ctx.dispatcher.offers[0].id);
    const p = partsAt(job.start);
    assert.equal(`${p.day} ${p.time}`, `${day} ${time}`);
  }
});

test('scheduler: Friday evening work rolls to Monday, skipping the weekend', () => {
  const ctx = setup(4 * 1440 + 580); // Friday 4:40 PM
  const job = ctx.dispatcher.accept(ctx.dispatcher.offers[0].id);
  const p = partsAt(job.start);
  assert.equal(`${p.day} ${p.time}`, 'Mon 7:00 AM');
});

test('a full working day: jobs run, pay lands, crew clocks out at home, End Day skips ahead', () => {
  const ctx = setup();
  const { dispatcher, economy, clock, world } = ctx;
  for (let i = 0; i < 4; i++) dispatcher.accept(dispatcher.offers[0].id);
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
  assert.equal(world.lots.filter((l) => l.mow).length, 0, 'old stripes have faded away');
});

test('End Day on a Friday goes to Monday', () => {
  const ctx = setup(4 * 1440 + 605);
  ctx.clock.shiftOver = true;
  ctx.dispatcher.endDay();
  assert.equal(partsAt(ctx.clock.minutes).day, 'Mon');
});

test('mown stripes hold, then fade to nothing', () => {
  const ctx = setup();
  const { dispatcher, clock } = ctx;
  dispatcher.accept(dispatcher.offers[0].id);
  run(ctx, () => dispatcher.history.length === 1);
  const lot = dispatcher.history[0].lot;
  const t0 = lot.mowDoneAt;
  const alphaAt = (age) => {
    clock.minutes = t0 + age;
    dispatcher.fadeLawns();
    return dispatcher.lawnAlpha(lot);
  };
  assert.equal(alphaAt(0), 1);
  assert.equal(alphaAt(40), 1);
  const mid = alphaAt(67);
  assert.ok(mid > 0.3 && mid < 0.7, `half faded at ${mid}`);
  assert.equal(alphaAt(100), 0);
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
