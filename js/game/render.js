// Draws the world with simple flat vector shapes (see docs/DESIGN.md, section 2:
// lightweight visuals that run well on phones). Everything is in tile units;
// the camera transform turns tiles into pixels.

const HOUSE_PALETTE = [
  { wall: '#e8d9b5', roof: '#a8553f' },
  { wall: '#cfe0ea', roof: '#566d86' },
  { wall: '#efe0c8', roof: '#7a5a46' },
  { wall: '#dfead0', roof: '#6c7f4f' },
  { wall: '#f2d6d0', roof: '#8a4b52' },
  { wall: '#e4e0ee', roof: '#5f5a7a' },
];
const SHOP_PALETTE = [
  { wall: '#d9c7a6', roof: '#c0504d' },
  { wall: '#cfd8dc', roof: '#3f7f8c' },
  { wall: '#e6d3a3', roof: '#2f6f4f' },
  { wall: '#d8cfe0', roof: '#b0792f' },
  { wall: '#e0cfc6', roof: '#4d5f7a' },
  { wall: '#d6dfc6', roof: '#8a3f5a' },
];

const COLORS = {
  grass: '#79b25a',
  grassLot: '#8bc26b',
  grassDark: '#5f9a47',
  sidewalk: '#cfcdc4',
  road: '#4f545c',
  roadLine: '#e9c94e',
  gravel: '#bdb39a',
  dirt: '#a99a78',
  tree: '#3f7d3a',
  treeDark: '#2f6a2f',
  fence: '#7b6a4f',
  text: '#ffffff',
};

export function createCamera(canvasW, canvasH, world) {
  const fit = Math.min(canvasW / world.w, canvasH / world.h);
  return { x: world.w / 2, y: world.h / 2, zoom: fit, fit };
}

export function applyCamera(ctx, cam, cssW, cssH, dpr) {
  ctx.setTransform(
    dpr * cam.zoom, 0, 0, dpr * cam.zoom,
    dpr * (cssW / 2 - cam.x * cam.zoom),
    dpr * (cssH / 2 - cam.y * cam.zoom),
  );
}

export function screenToWorld(cam, cssW, cssH, sx, sy) {
  return { x: (sx - cssW / 2) / cam.zoom + cam.x, y: (sy - cssH / 2) / cam.zoom + cam.y };
}

function rect(ctx, x, y, w, h, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
}

function drawTree(ctx, t) {
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.arc(t.x + 0.15, t.y + 0.2, t.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.treeDark;
  ctx.beginPath();
  ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.tree;
  ctx.beginPath();
  ctx.arc(t.x - t.r * 0.15, t.y - t.r * 0.15, t.r * 0.72, 0, Math.PI * 2);
  ctx.fill();
}

function drawRoads(ctx, world) {
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  const stroke = (r, width, color, dash) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    ctx.moveTo(r.x1, r.y1);
    ctx.lineTo(r.x2, r.y2);
    ctx.stroke();
  };
  for (const r of world.roads) stroke(r, 3.4, COLORS.sidewalk);
  for (const r of world.roads) stroke(r, 2, COLORS.road);
  for (const r of world.roads) stroke(r, 0.09, COLORS.roadLine, [0.7, 0.7]);
  ctx.setLineDash([]);
}

function drawLot(ctx, lot, selected, showNumbers, zoom) {
  const palette = (lot.kind === 'shop' ? SHOP_PALETTE : HOUSE_PALETTE)[lot.palette];
  rect(ctx, lot.x, lot.y, lot.w, lot.h, lot.kind === 'shop' ? '#b9bdb0' : COLORS.grassLot);

  const towardStreet = lot.side === 'south' ? -1 : 1; // direction from lot to the road
  const houseH = lot.kind === 'shop' ? 2.4 : 2;
  const houseW = lot.kind === 'shop' ? 3.4 : 2.8;
  const hx = lot.x + (lot.w - houseW) / 2;
  const hy = lot.side === 'south' ? lot.y + 0.5 : lot.y + lot.h - 0.5 - houseH;

  // Driveway or entrance walk from the building to the road edge.
  const dwX = lot.x + lot.w / 2 - 0.45;
  if (lot.side === 'south') rect(ctx, dwX, lot.y - 0.2, 0.9, 0.9, COLORS.gravel);
  else rect(ctx, dwX, lot.y + lot.h - 0.7, 0.9, 0.9, COLORS.gravel);
  void towardStreet;

  // Building: shadow, wall, roof.
  rect(ctx, hx + 0.12, hy + 0.12, houseW, houseH, 'rgba(0,0,0,0.15)');
  rect(ctx, hx, hy, houseW, houseH, palette.wall);
  if (lot.kind === 'shop') {
    rect(ctx, hx, hy, houseW, houseH * 0.45, palette.roof);
    rect(ctx, hx + 0.3, hy + houseH * 0.62, houseW - 0.6, 0.55, 'rgba(60,90,120,0.55)');
  } else {
    rect(ctx, hx, hy, houseW, houseH * 0.55, palette.roof);
    rect(ctx, hx + houseW / 2 - 0.12, hy, 0.24, houseH * 0.55, 'rgba(0,0,0,0.14)');
    rect(ctx, hx + houseW * 0.4, hy + houseH * 0.68, 0.45, 0.32, '#8b6b4a');
  }

  if (selected) {
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = Math.max(0.12, 2.5 / zoom);
    ctx.strokeRect(lot.x, lot.y, lot.w, lot.h);
  }

  if (showNumbers) {
    // The number sits on its own building, so it's never confused with the
    // lot behind it (which belongs to the next street over).
    ctx.font = 'bold 0.8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 0.16;
    ctx.strokeStyle = 'rgba(20,28,32,0.85)';
    ctx.fillStyle = '#ffffff';
    const tx = hx + houseW / 2;
    const ty = hy + houseH / 2;
    ctx.strokeText(String(lot.number), tx, ty);
    ctx.fillText(String(lot.number), tx, ty);
    ctx.textBaseline = 'alphabetic';
  }
}

function drawProperty(ctx, world, zoom) {
  const p = world.property;
  // Undeveloped ground, then the developed yard on the left.
  rect(ctx, p.x, p.y, p.w, p.h, COLORS.grassDark);
  rect(ctx, p.x, p.y, p.developedMaxX - p.x, p.h, COLORS.dirt);

  // Driveway.
  const d = world.driveway;
  rect(ctx, d.x1 - 0.8, d.y1 + 1.4, 1.6, d.y2 - d.y1 - 1.4, COLORS.gravel);

  // Garage, crew building, fuel pump.
  rect(ctx, p.x + 1.2 + 0.1, p.y + 4.1, 3.6, 3, 'rgba(0,0,0,0.15)');
  rect(ctx, p.x + 1.2, p.y + 4, 3.6, 3, '#b9bec4');
  rect(ctx, p.x + 1.2, p.y + 4, 3.6, 1.3, '#6c7783');
  rect(ctx, p.x + 1.9, p.y + 5.5, 2.2, 1.5, '#8d97a2');
  rect(ctx, p.x + 6.4 + 0.1, p.y + 4.1, 3.4, 2.4, 'rgba(0,0,0,0.15)');
  rect(ctx, p.x + 6.4, p.y + 4, 3.4, 2.4, '#e3d6b5');
  rect(ctx, p.x + 6.4, p.y + 4, 3.4, 1.1, '#9c5a3c');
  rect(ctx, p.x + 8.9, p.y + 0.9, 0.7, 1.1, '#d64545');
  rect(ctx, p.x + 8.9, p.y + 0.9, 0.7, 0.3, '#f2f2f2');

  // Fence around the whole lot, with a gap at the gate.
  ctx.strokeStyle = COLORS.fence;
  ctx.lineWidth = 0.14;
  ctx.setLineDash([0.5, 0.25]);
  ctx.beginPath();
  ctx.moveTo(d.x1 - 0.9, p.y);
  ctx.lineTo(p.x, p.y);
  ctx.lineTo(p.x, p.y + p.h);
  ctx.lineTo(p.x + p.w, p.y + p.h);
  ctx.lineTo(p.x + p.w, p.y);
  ctx.lineTo(d.x1 + 0.9, p.y);
  ctx.stroke();
  ctx.setLineDash([]);

  if (zoom > 6) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.font = '0.8px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Your Property', p.x + 0.8, p.y + 1.1);
  }
}

function drawStreetLabels(ctx, world, zoom) {
  const size = Math.min(1.15, Math.max(0.6, 11 / zoom));
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  for (const r of world.roads) {
    if (r.y1 === r.y2) {
      for (const x of [20, 44]) ctx.fillText(r.name, x, r.y1);
    } else {
      ctx.save();
      ctx.translate(r.x1, 28);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(r.name, 0, 0);
      ctx.restore();
    }
  }
  ctx.textBaseline = 'alphabetic';
}

function drawTruck(ctx, truck, zoom) {
  // Keep the truck readable when the whole town is on screen.
  const scale = Math.min(2.2, Math.max(1, 16 / (1.4 * zoom)));
  ctx.save();
  ctx.translate(truck.x, truck.y);
  ctx.rotate(truck.heading);
  ctx.scale(scale, scale);
  rect(ctx, -0.62, -0.3, 1.4, 0.7, 'rgba(0,0,0,0.18)');
  rect(ctx, -0.7, -0.33, 1.4, 0.66, '#f4f1ea'); // body
  rect(ctx, -0.7, -0.33, 0.62, 0.66, '#d9d3c4'); // bed
  rect(ctx, 0.0, -0.3, 0.42, 0.6, '#3e6fa8'); // cab
  rect(ctx, 0.3, -0.24, 0.12, 0.48, '#a9cce8'); // windshield
  rect(ctx, 0.68, -0.28, 0.06, 0.14, '#ffe9a0'); // headlights
  rect(ctx, 0.68, 0.14, 0.06, 0.14, '#ffe9a0');
  ctx.restore();
}

export function render(ctx, state) {
  const { world, cam, truck, selectedLot, cssW, cssH, dpr } = state;

  // Clear in screen space, then draw in world space.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COLORS.grassDark;
  ctx.fillRect(0, 0, cssW * dpr, cssH * dpr);
  applyCamera(ctx, cam, cssW, cssH, dpr);

  rect(ctx, 0, 0, world.w, world.h, COLORS.grass);

  const showNumbers = cam.zoom >= 22;

  drawProperty(ctx, world, cam.zoom);
  drawRoads(ctx, world);
  for (const lot of world.lots) drawLot(ctx, lot, selectedLot === lot, showNumbers, cam.zoom);
  for (const t of world.trees) drawTree(ctx, t);
  drawStreetLabels(ctx, world, cam.zoom);
  drawTruck(ctx, truck, cam.zoom);
}
