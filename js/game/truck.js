// A truck that follows a route over the road graph, driving on the right-hand
// side of the road. Speed is defined per in-game minute, so it stays in step
// with the game clock and the pause/fast-forward controls.
import { CONFIG } from '../config.js';
import { findPath } from '../world/pathfind.js';

function angleDelta(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const CORNER_RADIUS = 1.1; // tiles; tighter on short road pieces
const CORNER_STEPS = 8;

// Turns a list of road nodes into a smooth driving line: each straight run is
// shifted into the right-hand lane, and every corner is rounded with a small
// curve so the truck turns instead of snapping.
export function buildLanePath(world, nodeIds, start) {
  const L = CONFIG.laneOffset;

  // One lane-offset segment per road edge...
  let segs = [];
  for (let i = 0; i < nodeIds.length - 1; i++) {
    const a = world.nodes[nodeIds[i]];
    const b = world.nodes[nodeIds[i + 1]];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const dx = (b.x - a.x) / len;
    const dy = (b.y - a.y) / len;
    segs.push({ ax: a.x - dy * L, ay: a.y + dx * L, bx: b.x - dy * L, by: b.y + dx * L, dx, dy });
  }
  // ...merged when they continue in a straight line.
  const merged = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.dx - s.dx) < 1e-6 && Math.abs(last.dy - s.dy) < 1e-6) {
      last.bx = s.bx;
      last.by = s.by;
    } else {
      merged.push({ ...s });
    }
  }
  segs = merged;

  const len = (s) => Math.hypot(s.bx - s.ax, s.by - s.ay);
  const pts = [{ x: start.x, y: start.y }];
  const push = (x, y) => {
    const p = pts[pts.length - 1];
    if (Math.hypot(p.x - x, p.y - y) > 1e-4) pts.push({ x, y });
  };

  // If the first leg heads back the way the truck came from, make a U-turn:
  // a half-circle that swings across to the other lane, bulging forward.
  if (segs.length) {
    const hx = Math.cos(start.heading);
    const hy = Math.sin(start.heading);
    const first = segs[0];
    if (hx * first.dx + hy * first.dy < -0.5) {
      const ex = first.ax;
      const ey = first.ay;
      const cx = (start.x + ex) / 2;
      const cy = (start.y + ey) / 2;
      const rx = start.x - cx;
      const ry = start.y - cy;
      if (Math.hypot(rx, ry) > 0.05) {
        // Pick the rotation direction whose midpoint is ahead of the truck.
        let dir = 1;
        const midAhead = (sign) => {
          const mx = cx + (-ry * sign);
          const my = cy + rx * sign;
          return (mx - start.x) * hx + (my - start.y) * hy;
        };
        if (midAhead(1) < midAhead(-1)) dir = -1;
        for (let i = 1; i <= 12; i++) {
          const a = (i / 12) * Math.PI * dir;
          push(cx + rx * Math.cos(a) - ry * Math.sin(a), cy + rx * Math.sin(a) + ry * Math.cos(a));
        }
      }
    }
  }

  // Where lane lines k and k+1 meet, and how much to cut back from each side.
  const corners = [];
  for (let k = 0; k < segs.length - 1; k++) {
    const s = segs[k];
    const n = segs[k + 1];
    const cross = s.dx * n.dy - s.dy * n.dx;
    if (Math.abs(cross) < 1e-6) {
      corners.push(null); // straight-through reversal: no curve possible
      continue;
    }
    const t = ((n.ax - s.ax) * n.dy - (n.ay - s.ay) * n.dx) / cross;
    const c = { x: s.ax + s.dx * t, y: s.ay + s.dy * t };
    corners.push({ c, r: Math.min(CORNER_RADIUS, len(s) / 2.2, len(n) / 2.2) });
  }

  for (let k = 0; k < segs.length; k++) {
    const s = segs[k];
    const inC = k > 0 ? corners[k - 1] : null;
    const outC = k < segs.length - 1 ? corners[k] : null;
    push(inC ? inC.c.x + s.dx * inC.r : s.ax, inC ? inC.c.y + s.dy * inC.r : s.ay);
    if (outC) {
      const a = { x: outC.c.x - s.dx * outC.r, y: outC.c.y - s.dy * outC.r };
      const n = segs[k + 1];
      const b = { x: outC.c.x + n.dx * outC.r, y: outC.c.y + n.dy * outC.r };
      push(a.x, a.y);
      for (let i = 1; i <= CORNER_STEPS; i++) {
        const u = i / CORNER_STEPS;
        const m = 1 - u;
        push(m * m * a.x + 2 * m * u * outC.c.x + u * u * b.x, m * m * a.y + 2 * m * u * outC.c.y + u * u * b.y);
      }
    } else {
      push(s.bx, s.by);
    }
  }
  return pts;
}

export class Truck {
  constructor(world, startNodeId) {
    this.world = world;
    this.nodeId = startNodeId;
    const n = world.nodes[startNodeId];
    this.heading = -Math.PI / 2; // facing north, out toward the gate
    // Start already in the right-hand lane (east side when facing north), so
    // the first trip doesn't slide sideways.
    this.x = n.x + CONFIG.laneOffset;
    this.y = n.y;
    this.state = 'parked'; // 'parked' | 'driving'
    this.pts = [];
    this.cum = [];
    this.travelled = 0;
    this.destNode = startNodeId;
    this.onArrive = null;
    this.tint = '#3e6fa8'; // cab colour on the map
  }

  // Put the truck at a node, parked in its lane and facing north (used for a new
  // truck, and when a save is loaded).
  placeAt(nodeId) {
    const n = this.world.nodes[nodeId];
    this.nodeId = nodeId;
    this.x = n.x + CONFIG.laneOffset;
    this.y = n.y;
    this.heading = -Math.PI / 2;
    this.state = 'parked';
    this.pts = [];
    this.cum = [];
    this.travelled = 0;
    this.destNode = nodeId;
  }

  placeAtHome() {
    this.placeAt(this.world.property.homeNode);
  }

  // Estimate (tiles and game minutes) without starting the trip.
  estimate(toNodeId) {
    const route = findPath(this.world, this.nodeId, toNodeId);
    if (!route) return null;
    return { tiles: route.distance, minutes: route.distance / CONFIG.truckTilesPerGameMinute };
  }

  driveTo(toNodeId) {
    const fromId = this.state === 'driving' ? this.destNode : this.nodeId;
    if (this.state === 'driving') return null; // finish the current trip first
    const route = findPath(this.world, fromId, toNodeId);
    if (!route) return null;
    if (route.path.length < 2) {
      this.destNode = toNodeId;
      return { tiles: 0, minutes: 0 };
    }

    const pts = buildLanePath(this.world, route.path, { x: this.x, y: this.y, heading: this.heading });
    this.pts = pts;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) {
      this.cum.push(this.cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    }
    this.travelled = 0;
    this.destNode = toNodeId;
    this.state = 'driving';
    return { tiles: route.distance, minutes: route.distance / CONFIG.truckTilesPerGameMinute };
  }

  update(gameMinutes) {
    // Returns how many tiles the truck moved this step (for fuel use).
    if (this.state !== 'driving' || gameMinutes <= 0) return 0;
    const before = Math.min(this.travelled, this.cum[this.cum.length - 1]);
    this.travelled += gameMinutes * CONFIG.truckTilesPerGameMinute;
    const total = this.cum[this.cum.length - 1];
    const t = Math.min(this.travelled, total);
    const moved = t - before;

    // Find the polyline segment containing distance t.
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < t) i++;
    const a = this.pts[i - 1];
    const b = this.pts[i];
    const segLen = this.cum[i] - this.cum[i - 1];
    const f = segLen > 0 ? (t - this.cum[i - 1]) / segLen : 1;
    this.x = a.x + (b.x - a.x) * f;
    this.y = a.y + (b.y - a.y) * f;

    if (segLen > 0.001) {
      // Follow the path's direction. Smoothing is by distance travelled (not
      // time), so it looks the same at 1x, 2x and 4x, and at any frame rate.
      const want = Math.atan2(b.y - a.y, b.x - a.x);
      this.heading += angleDelta(this.heading, want) * (1 - Math.exp(-moved / 0.12));
    }

    if (this.travelled >= total) {
      this.state = 'parked';
      this.nodeId = this.destNode;
      if (this.onArrive) this.onArrive(this.nodeId);
    }
    return moved;
  }

  progress() {
    if (this.state !== 'driving') return 1;
    return this.travelled / this.cum[this.cum.length - 1];
  }
}
