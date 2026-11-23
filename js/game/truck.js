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

export class Truck {
  constructor(world, startNodeId) {
    this.world = world;
    this.nodeId = startNodeId;
    const n = world.nodes[startNodeId];
    this.x = n.x;
    this.y = n.y;
    this.heading = -Math.PI / 2; // facing north, out toward the gate
    this.state = 'parked'; // 'parked' | 'driving'
    this.pts = [];
    this.cum = [];
    this.travelled = 0;
    this.destNode = startNodeId;
    this.onArrive = null;
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

    // Build a lane-offset polyline: one segment per road edge, shifted to the
    // right of the direction of travel. Corners are cut by the straight line
    // between segments, which reads as a turn.
    const pts = [{ x: this.x, y: this.y }];
    for (let i = 0; i < route.path.length - 1; i++) {
      const a = this.world.nodes[route.path[i]];
      const b = this.world.nodes[route.path[i + 1]];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const dx = (b.x - a.x) / len;
      const dy = (b.y - a.y) / len;
      const rx = -dy * CONFIG.laneOffset;
      const ry = dx * CONFIG.laneOffset;
      pts.push({ x: a.x + rx, y: a.y + ry });
      pts.push({ x: b.x + rx, y: b.y + ry });
    }
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
    if (this.state !== 'driving' || gameMinutes <= 0) return;
    this.travelled += gameMinutes * CONFIG.truckTilesPerGameMinute;
    const total = this.cum[this.cum.length - 1];
    const t = Math.min(this.travelled, total);

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
      const want = Math.atan2(b.y - a.y, b.x - a.x);
      const turn = angleDelta(this.heading, want);
      this.heading += turn * Math.min(1, gameMinutes * 3);
    }

    if (this.travelled >= total) {
      this.state = 'parked';
      this.nodeId = this.destNode;
      if (this.onArrive) this.onArrive(this.nodeId);
    }
  }

  progress() {
    if (this.state !== 'driving') return 1;
    return this.travelled / this.cum[this.cum.length - 1];
  }
}
