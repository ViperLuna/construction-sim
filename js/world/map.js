// The town, built as data: streets, lots with real addresses, and a road graph.
// This is the slice-1 prototype map (see docs/DESIGN.md, section 4). It is
// generated from a few plain definitions so the real, hand-designed map can
// replace it later without touching the engine.
//
// All coordinates are in tiles. y grows downward (screen space).

import { mulberry32 } from '../util/rng.js';

export const WORLD = { w: 64, h: 60 };

const X_MIN = 4;
const X_MAX = 60;
const LOT_W = 4;
const LOT_D = 4;

// North-south avenues.
const AVENUES = [
  { name: '1st Ave', x: 14 },
  { name: '2nd Ave', x: 26 },
  { name: '3rd Ave', x: 38 },
  { name: '4th Ave', x: 50 },
];

// East-west streets. `kind` is the building style of lots along it.
const STREETS = [
  { name: 'Prospect St', y: 10, sides: ['north', 'south'], kind: 'house' },
  { name: 'Main St', y: 22, sides: ['north', 'south'], kind: 'shop' },
  { name: 'Market St', y: 34, sides: ['north', 'south'], kind: 'house' },
  { name: 'State St', y: 46, sides: ['north'], kind: 'house' },
];

// The player's property sits south of State St, in the southwest.
const PROPERTY = { x: 2, y: 49, w: 22, h: 9, gateX: 8, homeY: 51, developedMaxX: 13 };

export function buildWorld() {
  const rng = mulberry32(20250407);

  // ---- road graph ----
  const nodes = [];
  const adj = [];
  const index = new Map();
  const node = (x, y) => {
    const key = `${x},${y}`;
    if (index.has(key)) return index.get(key);
    const id = nodes.length;
    nodes.push({ id, x, y });
    adj.push([]);
    index.set(key, id);
    return id;
  };
  const link = (a, b, street) => {
    if (a === b) return;
    const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
    adj[a].push({ to: b, d, street });
    adj[b].push({ to: a, d, street });
  };

  // ---- lots ----
  const lots = [];
  const bounds = [X_MIN, ...AVENUES.map((a) => a.x), X_MAX];
  const lastBlock = bounds.length - 2;
  const streetAccessXs = new Map(STREETS.map((s) => [s.name, new Set()]));

  for (const street of STREETS) {
    for (const side of street.sides) {
      for (let bi = 0; bi <= lastBlock; bi++) {
        const x0 = bounds[bi] + (bi === 0 ? 0 : 2);
        const x1 = bounds[bi + 1] - (bi === lastBlock ? 0 : 2);
        const count = Math.floor((x1 - x0) / LOT_W);
        const start = x0 + ((x1 - x0) - count * LOT_W) / 2;
        for (let k = 0; k < count; k++) {
          const lx = start + k * LOT_W;
          const ly = side === 'south' ? street.y + 2 : street.y - 2 - LOT_D;
          const number = (bi + 1) * 100 + 2 * k + (side === 'south' ? 1 : 2);
          const accessX = lx + LOT_W / 2;
          streetAccessXs.get(street.name).add(accessX);
          lots.push({
            id: `${number}-${street.name}`,
            number,
            street: street.name,
            address: `${number} ${street.name}`,
            kind: street.kind,
            side,
            x: lx,
            y: ly,
            w: LOT_W,
            h: LOT_D,
            accessX,
            accessY: street.y,
            palette: Math.floor(rng() * 6),
          });
        }
      }
    }
  }

  // ---- graph lines ----
  // Streets: nodes at the ends, every avenue crossing, every lot access point.
  for (const street of STREETS) {
    const xs = new Set([X_MIN, X_MAX, ...AVENUES.map((a) => a.x), ...streetAccessXs.get(street.name)]);
    if (street.name === 'State St') xs.add(PROPERTY.gateX);
    const sorted = [...xs].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length - 1; i++) {
      link(node(sorted[i], street.y), node(sorted[i + 1], street.y), street.name);
    }
  }
  // Avenues: nodes where they cross each street.
  const ys = STREETS.map((s) => s.y).sort((a, b) => a - b);
  for (const av of AVENUES) {
    for (let i = 0; i < ys.length - 1; i++) {
      link(node(av.x, ys[i]), node(av.x, ys[i + 1]), av.name);
    }
  }
  // Property driveway.
  const stateY = STREETS.find((s) => s.name === 'State St').y;
  const gateNode = node(PROPERTY.gateX, stateY);
  const homeNode = node(PROPERTY.gateX, PROPERTY.homeY);
  link(gateNode, homeNode, 'Your Driveway');
  // A row of parking spots beside the first one, for more trucks.
  const parkNodes = [homeNode];
  for (let i = 1; i < 4; i++) {
    const spot = node(Number((PROPERTY.gateX + i * 1.6).toFixed(2)), PROPERTY.homeY);
    link(parkNodes[i - 1], spot, 'Your Driveway');
    parkNodes.push(spot);
  }

  for (const lot of lots) lot.accessNode = node(lot.accessX, lot.accessY);

  // ---- drawable road segments ----
  const roads = [
    ...STREETS.map((s) => ({ name: s.name, x1: X_MIN, y1: s.y, x2: X_MAX, y2: s.y })),
    ...AVENUES.map((a) => ({ name: a.name, x1: a.x, y1: ys[0], x2: a.x, y2: ys[ys.length - 1] })),
  ];
  const driveway = { x1: PROPERTY.gateX, y1: stateY, x2: PROPERTY.gateX, y2: PROPERTY.homeY };

  // ---- scenery: trees around the town edge and in the undeveloped property ----
  const trees = [];
  const insideTown = (x, y) => x > 2.5 && x < 61.5 && y > 2.5 && y < 48;
  const insideProperty = (x, y) =>
    x > PROPERTY.x && x < PROPERTY.x + PROPERTY.w && y > PROPERTY.y && y < PROPERTY.y + PROPERTY.h;
  for (let attempt = 0; attempt < 900 && trees.length < 150; attempt++) {
    const x = 0.5 + rng() * (WORLD.w - 1);
    const y = 0.5 + rng() * (WORLD.h - 1);
    if (insideTown(x, y)) continue;
    if (insideProperty(x, y)) {
      if (x < PROPERTY.developedMaxX + 0.5) continue;
      if (y < PROPERTY.y + 1) continue;
    } else if (y > PROPERTY.y - 1.5 && y < PROPERTY.y + PROPERTY.h + 1 && x < PROPERTY.x + PROPERTY.w + 1.5) {
      continue; // keep the fence line clear
    }
    trees.push({ x, y, r: 0.55 + rng() * 0.45 });
  }

  const lotById = new Map(lots.map((l) => [l.id, l]));
  const property = {
    ...PROPERTY,
    gateNode,
    homeNode,
    parkNodes,
    address: 'Your Property',
  };

  return {
    w: WORLD.w,
    h: WORLD.h,
    nodes,
    adj,
    lots,
    lotById,
    roads,
    driveway,
    property,
    trees,
    streetNames: [...STREETS.map((s) => s.name), ...AVENUES.map((a) => a.name)],
  };
}

export function lotAt(world, x, y) {
  return world.lots.find((l) => x >= l.x && x <= l.x + l.w && y >= l.y && y <= l.y + l.h) || null;
}

export function inProperty(world, x, y) {
  const p = world.property;
  return x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h;
}
