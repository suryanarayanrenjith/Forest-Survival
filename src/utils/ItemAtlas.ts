/**
 * ITEM ATLAS — every pickup, grenade and airdrop part, one material.
 * ===================================================================
 *
 * Pickups used to be coloured gem shapes inside glow spheres and gyroscope
 * rings: readable, but nothing in the world LOOKED like the thing it gave you.
 * They are now the item itself — a hard-shell first-aid case, an M2A1 ammo can,
 * an auto-injector, a plate carrier, a liquid-nitrogen dewar — presented the way
 * GTA IV presents its pickups: the object alone, slowly turning, with a soft
 * pool of light under it.
 *
 * HOW IT STAYS CHEAP
 *   • ONE texture atlas painted procedurally at load (the game ships no image
 *     assets): albedo (sRGB), an ORM map (G = roughness, B = metalness — three
 *     reads exactly those channels, so ONE texture feeds both slots), a normal
 *     map Sobel'd from a painted height layer, and an emissive layer for LEDs.
 *   • ONE MeshStandardMaterial for every item, grenade and airdrop part → ONE
 *     shader program, warmed once by the loader. Adding an item never adds a
 *     program, only a few cells of atlas.
 *   • Each item is a single MERGED geometry (one draw), cached for the session.
 *
 * The atlas is a 16×16 grid of cells. Geometry primitives are authored with
 * their usual 0..1 UVs and remapped into a cell, inset by a small gutter so
 * mip-mapping never bleeds a neighbour's colour across an edge.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightToNormal } from './ProceduralSurface';
import type { ThrowableKind } from './Throwables';

// ── ATLAS LAYOUT ─────────────────────────────────────────────────────────────

const GRID = 16;
type Cell = readonly [cx: number, cy: number, cw: number, ch: number];

const C = {
  // Row 0 — base materials
  steel: [0, 0, 1, 1], darkSteel: [1, 0, 1, 1], brass: [2, 0, 1, 1], copper: [3, 0, 1, 1],
  blackPoly: [4, 0, 1, 1], rubber: [5, 0, 1, 1], whitePlastic: [6, 0, 1, 1], redPaint: [7, 0, 1, 1],
  odPaint: [8, 0, 1, 1], yellowPaint: [9, 0, 1, 1], bluePaint: [10, 0, 1, 1], orangePaint: [11, 0, 1, 1],
  ledGreen: [12, 0, 1, 1], ledAmber: [13, 0, 1, 1], ledBlue: [14, 0, 1, 1], ledPurple: [15, 0, 1, 1],
  // Row 1 — surfaced materials
  glass: [0, 1, 1, 1], knurl: [1, 1, 1, 1], coil: [2, 1, 1, 1], frost: [3, 1, 1, 1],
  canvas: [4, 1, 1, 1], webbing: [5, 1, 1, 1], hazard: [6, 1, 1, 1], aluminum: [7, 1, 1, 1],
  ceramic: [8, 1, 1, 1], gunmetal: [9, 1, 1, 1], ribbed: [10, 1, 1, 1], redTip: [11, 1, 1, 1],
  ledRed: [12, 1, 1, 1], ledWhite: [13, 1, 1, 1], plywood: [14, 1, 1, 1], nylonOD: [15, 1, 1, 1],
  // Rows 2–7 — labelled / larger surfaces
  crate: [0, 2, 4, 3],
  chute: [4, 2, 2, 2],
  strap: [6, 2, 1, 3],
  pallet: [7, 2, 2, 1],
  medCross: [9, 2, 2, 2],
  ammoSide: [11, 2, 3, 1],
  stimLabel: [14, 2, 2, 1],
  magSide: [7, 3, 2, 1],
  batteryLabel: [11, 3, 3, 1],
  dewarLabel: [14, 3, 2, 1],
  radLabel: [7, 4, 2, 1],
  ecmFace: [9, 4, 2, 1],
  empLabel: [11, 4, 2, 1],
  thermLabel: [13, 4, 2, 1],
  fragBody: [15, 4, 1, 1],
  vestFront: [0, 5, 2, 2],
  kineticTop: [2, 5, 2, 2],
  cmagSide: [4, 5, 2, 1],
  teslaLabel: [4, 6, 2, 1],
  medkitBack: [6, 5, 2, 2],
  pouch: [8, 5, 1, 1],
  crateTop: [9, 5, 4, 3],
  c4Label: [13, 6, 2, 1],
  decoyLabel: [0, 7, 2, 1],
  hijackLabel: [2, 7, 2, 1],
  knifeBlade: [4, 7, 1, 1],
  paracord: [5, 7, 1, 1],
  c4Putty: [6, 7, 1, 1],
} as const satisfies Record<string, Cell>;


/** Stencilled crate label plates, one per airdrop reward (rows 8–13, 4×2 cells). */
export type CrateLabelId =
  | 'health' | 'ammo' | 'speed' | 'damage' | 'shield' | 'invincible'
  | 'infinite_ammo' | 'rapid_fire' | 'nuke' | 'random_weapon' | 'frenzy' | 'juggernaut';
const CRATE_LABELS: CrateLabelId[] = [
  'health', 'ammo', 'speed', 'damage', 'shield', 'invincible',
  'infinite_ammo', 'rapid_fire', 'nuke', 'random_weapon', 'frenzy', 'juggernaut',
];
const crateLabelCell = (id: CrateLabelId): Cell => {
  const i = CRATE_LABELS.indexOf(id);
  return [(i % 4) * 4, 8 + Math.floor(i / 4) * 2, 4, 2];
};

// ── PAINTING ─────────────────────────────────────────────────────────────────

type Ctx = CanvasRenderingContext2D;
interface Layers { a: Ctx; o: Ctx; h: Ctx; e: Ctx; S: number }
interface Rect { x: number; y: number; w: number; h: number }

const cellRect = (L: Layers, c: Cell): Rect => ({ x: c[0] * L.S, y: c[1] * L.S, w: c[2] * L.S, h: c[3] * L.S });

/** Deterministic PRNG so the atlas is identical every load. */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
const grey = (v: number, a = 1) => `rgba(${Math.round(v * 255)},${Math.round(v * 255)},${Math.round(v * 255)},${a})`;
const orm = (rough: number, metal: number) => `rgb(255,${Math.round(rough * 255)},${Math.round(metal * 255)})`;

/** Base fill of every layer for a rect: colour, roughness, metalness, flat height. */
function base(L: Layers, r: Rect, color: number, rough: number, metal: number, height = 0.5): void {
  L.a.fillStyle = hex(color); L.a.fillRect(r.x, r.y, r.w, r.h);
  L.o.fillStyle = orm(rough, metal); L.o.fillRect(r.x, r.y, r.w, r.h);
  L.h.fillStyle = grey(height); L.h.fillRect(r.x, r.y, r.w, r.h);
  L.e.fillStyle = '#000'; L.e.fillRect(r.x, r.y, r.w, r.h);
}

/** Fine mottling: tiny light/dark specks on albedo + a whisper of height. */
function speckle(L: Layers, r: Rect, rnd: () => number, amount: number, alpha: number, heightAmp = 0.04): void {
  const n = Math.round((r.w * r.h) / 40 * amount);
  for (let i = 0; i < n; i++) {
    const x = r.x + rnd() * r.w, y = r.y + rnd() * r.h;
    const s = 0.6 + rnd() * 1.8;
    const light = rnd() < 0.5;
    L.a.fillStyle = light ? `rgba(255,255,255,${alpha * rnd()})` : `rgba(0,0,0,${alpha * rnd()})`;
    L.a.fillRect(x, y, s, s);
    if (heightAmp > 0) {
      L.h.fillStyle = grey(0.5 + (light ? 1 : -1) * heightAmp * rnd(), 0.6);
      L.h.fillRect(x, y, s, s);
    }
  }
}

/** Directional brushing streaks (machined / brushed metal). */
function brushed(L: Layers, r: Rect, rnd: () => number, alpha: number, vertical = false): void {
  const n = Math.round((vertical ? r.w : r.h) * 1.4);
  for (let i = 0; i < n; i++) {
    const t = rnd();
    L.a.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${alpha * rnd()})` : `rgba(0,0,0,${alpha * rnd()})`;
    if (vertical) L.a.fillRect(r.x + t * r.w, r.y, 0.8, r.h);
    else L.a.fillRect(r.x, r.y + t * r.h, r.w, 0.8);
  }
}

/** Paint chips: small flakes of bare steel showing through a painted surface. */
function chips(L: Layers, r: Rect, rnd: () => number, count: number, metalColor = 0x9a9c9e): void {
  for (let i = 0; i < count; i++) {
    const x = r.x + rnd() * r.w, y = r.y + rnd() * r.h;
    const w = 1 + rnd() * r.w * 0.03, h = 1 + rnd() * r.h * 0.02;
    // Edges wear first — bias chips toward the rim.
    const edge = rnd() < 0.6;
    const ex = edge ? (rnd() < 0.5 ? r.x + rnd() * r.w * 0.06 : r.x + r.w * (0.94 + rnd() * 0.06)) : x;
    L.a.fillStyle = hex(metalColor, 0.85);
    L.a.fillRect(ex, y, w, h);
    L.o.fillStyle = orm(0.35, 0.95);
    L.o.fillRect(ex, y, w, h);
    L.h.fillStyle = grey(0.42);
    L.h.fillRect(ex, y, w, h);
  }
}

/** A recessed seam line (dark on albedo, cut into the height). */
function seam(L: Layers, x1: number, y1: number, x2: number, y2: number, w: number, depth = 0.22, alpha = 0.55): void {
  for (const [ctx, style] of [[L.a, `rgba(0,0,0,${alpha})`], [L.h, grey(0.5 - depth)]] as const) {
    ctx.strokeStyle = style;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}

/** Text on the albedo, raised (or recessed) on the height layer. */
function text(
  L: Layers, str: string, x: number, y: number, px: number, color: number,
  opts: { align?: CanvasTextAlign; weight?: string; font?: string; raise?: number; alpha?: number; maxW?: number; stencil?: number } = {},
): void {
  const font = `${opts.weight ?? '700'} ${Math.max(4, px)}px ${opts.font ?? '"Arial Narrow", "Roboto Condensed", Arial, sans-serif'}`;
  for (const ctx of [L.a, L.h]) {
    ctx.font = font;
    ctx.textAlign = opts.align ?? 'center';
    ctx.textBaseline = 'middle';
  }
  L.a.fillStyle = hex(color, opts.alpha ?? 1);
  if (opts.maxW) L.a.fillText(str, x, y, opts.maxW); else L.a.fillText(str, x, y);
  if (opts.raise) {
    L.h.fillStyle = grey(0.5 + opts.raise);
    if (opts.maxW) L.h.fillText(str, x, y, opts.maxW); else L.h.fillText(str, x, y);
  }
  if (opts.stencil !== undefined) {
    // Stencil bridges: thin gaps (painted in the surface colour) where a real
    // stencil's ties hold the letter islands in place.
    const m = L.a.measureText(str);
    const tw = Math.min(m.width, opts.maxW ?? m.width);
    const left = (opts.align ?? 'center') === 'center' ? x - tw / 2 : (opts.align === 'right' ? x - tw : x);
    const step = px * 0.62;
    L.a.fillStyle = hex(opts.stencil, 0.9);
    for (let bx = left + step * 0.45; bx < left + tw; bx += step) {
      L.a.fillRect(bx, y - px * 0.5, Math.max(1, px * 0.06), px);
    }
  }
}

/** Weathering grime gathered toward the bottom of a surface. */
function grime(L: Layers, r: Rect, strength: number): void {
  const g = L.a.createLinearGradient(0, r.y, 0, r.y + r.h);
  g.addColorStop(0, 'rgba(30,24,16,0)');
  g.addColorStop(0.6, `rgba(30,24,16,${strength * 0.3})`);
  g.addColorStop(1, `rgba(30,24,16,${strength})`);
  L.a.fillStyle = g;
  L.a.fillRect(r.x, r.y, r.w, r.h);
}

/** An emissive LED dot (albedo + emissive). */
function led(L: Layers, x: number, y: number, rad: number, color: number): void {
  for (const [ctx, a] of [[L.a, 1], [L.e, 1]] as const) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, hex(0xffffff, a));
    g.addColorStop(0.35, hex(color, a));
    g.addColorStop(1, hex(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintBaseMaterials(L: Layers, rnd: () => number): void {
  const mat = (c: Cell, color: number, rough: number, metal: number, f?: (r: Rect) => void) => {
    const r = cellRect(L, c);
    base(L, r, color, rough, metal);
    f?.(r);
  };
  mat(C.steel, 0xb4b8bc, 0.3, 1, (r) => { brushed(L, r, rnd, 0.08); speckle(L, r, rnd, 0.4, 0.06, 0.02); });
  mat(C.darkSteel, 0x3c3f42, 0.48, 0.9, (r) => { speckle(L, r, rnd, 1.2, 0.08, 0.03); brushed(L, r, rnd, 0.04); });
  mat(C.brass, 0xc9a24f, 0.28, 1, (r) => { brushed(L, r, rnd, 0.07); speckle(L, r, rnd, 0.3, 0.05, 0.01); });
  mat(C.copper, 0xc4744a, 0.32, 1, (r) => { brushed(L, r, rnd, 0.08); speckle(L, r, rnd, 0.5, 0.08, 0.02); });
  mat(C.blackPoly, 0x1c1d20, 0.62, 0, (r) => speckle(L, r, rnd, 2.2, 0.07, 0.05));
  mat(C.rubber, 0x121314, 0.9, 0, (r) => speckle(L, r, rnd, 1.6, 0.05, 0.05));
  mat(C.whitePlastic, 0xe6e8e4, 0.42, 0, (r) => { speckle(L, r, rnd, 0.8, 0.05, 0.02); grime(L, r, 0.16); });
  mat(C.redPaint, 0xb4191c, 0.4, 0, (r) => { speckle(L, r, rnd, 0.6, 0.06, 0.02); chips(L, r, rnd, 5); });
  mat(C.odPaint, 0x4b5233, 0.62, 0, (r) => { speckle(L, r, rnd, 1.2, 0.07, 0.03); chips(L, r, rnd, 10); grime(L, r, 0.22); });
  mat(C.yellowPaint, 0xd5a51f, 0.45, 0, (r) => { speckle(L, r, rnd, 0.8, 0.06, 0.02); chips(L, r, rnd, 8, 0x7c7e80); });
  mat(C.bluePaint, 0x2a5fb4, 0.42, 0, (r) => speckle(L, r, rnd, 0.6, 0.06, 0.02));
  mat(C.orangePaint, 0xe0621c, 0.45, 0, (r) => speckle(L, r, rnd, 0.6, 0.06, 0.02));
  const ledCell = (c: Cell, color: number) => mat(c, color, 0.18, 0, (r) => {
    L.e.fillStyle = hex(color); L.e.fillRect(r.x, r.y, r.w, r.h);
    led(L, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.6, color);
  });
  ledCell(C.ledGreen, 0x3dff8a);
  ledCell(C.ledAmber, 0xffb030);
  ledCell(C.ledBlue, 0x3aa8ff);
  ledCell(C.ledPurple, 0xb066ff);
  ledCell(C.ledRed, 0xff2a20);
  ledCell(C.ledWhite, 0xf4f6ff);

  mat(C.glass, 0x18262c, 0.06, 0.2, (r) => {
    const g = L.a.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    g.addColorStop(0, 'rgba(120,170,190,0.25)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(120,170,190,0.12)');
    L.a.fillStyle = g; L.a.fillRect(r.x, r.y, r.w, r.h);
  });
  mat(C.knurl, 0x2c2e31, 0.55, 0.85, (r) => {
    const step = Math.max(3, r.w / 22);
    for (let i = -r.h; i < r.w + r.h; i += step) {
      seam(L, r.x + i, r.y, r.x + i + r.h, r.y + r.h, 1, 0.12, 0.35);
      seam(L, r.x + i + r.h, r.y, r.x + i, r.y + r.h, 1, 0.12, 0.35);
    }
  });
  mat(C.coil, 0xb86a3e, 0.3, 1, (r) => {
    const step = Math.max(2.5, r.h / 30);
    for (let y = r.y; y < r.y + r.h; y += step) {
      L.a.fillStyle = 'rgba(60,24,8,0.45)'; L.a.fillRect(r.x, y, r.w, step * 0.25);
      L.a.fillStyle = 'rgba(255,200,150,0.18)'; L.a.fillRect(r.x, y + step * 0.45, r.w, step * 0.15);
      L.h.fillStyle = grey(0.3); L.h.fillRect(r.x, y, r.w, step * 0.25);
      L.h.fillStyle = grey(0.72); L.h.fillRect(r.x, y + step * 0.35, r.w, step * 0.4);
    }
  });
  mat(C.frost, 0xc2c8cc, 0.36, 0.95, (r) => {
    brushed(L, r, rnd, 0.06, true);
    for (let i = 0; i < 26; i++) {
      const x = r.x + rnd() * r.w, y = r.y + rnd() * r.h, rad = r.w * (0.05 + rnd() * 0.14);
      const g = L.a.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(240,250,255,0.55)'); g.addColorStop(1, 'rgba(240,250,255,0)');
      L.a.fillStyle = g; L.a.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      L.o.fillStyle = `rgba(255,${Math.round(0.75 * 255)},${Math.round(0.4 * 255)},0.5)`;
      L.o.beginPath(); L.o.arc(x, y, rad * 0.6, 0, Math.PI * 2); L.o.fill();
    }
  });
  const weave = (r: Rect, color: number, rough: number) => {
    base(L, r, color, rough, 0);
    const step = Math.max(2, r.w / 40);
    for (let y = r.y; y < r.y + r.h; y += step) {
      L.a.fillStyle = 'rgba(0,0,0,0.12)'; L.a.fillRect(r.x, y, r.w, step * 0.4);
      L.h.fillStyle = grey(0.44); L.h.fillRect(r.x, y, r.w, step * 0.4);
    }
    for (let x = r.x; x < r.x + r.w; x += step) {
      L.a.fillStyle = 'rgba(255,255,255,0.05)'; L.a.fillRect(x, r.y, step * 0.4, r.h);
      L.h.fillStyle = grey(0.56, 0.6); L.h.fillRect(x, r.y, step * 0.4, r.h);
    }
    speckle(L, r, rnd, 0.6, 0.05, 0.02);
  };
  weave(cellRect(L, C.canvas), 0x86725a, 0.9);
  weave(cellRect(L, C.webbing), 0x232425, 0.88);
  weave(cellRect(L, C.nylonOD), 0x56603e, 0.86);
  mat(C.hazard, 0xd8a81f, 0.5, 0, (r) => {
    L.a.save();
    L.a.beginPath(); L.a.rect(r.x, r.y, r.w, r.h); L.a.clip();
    L.a.fillStyle = '#16171a';
    const step = r.w / 4;
    for (let i = -r.h; i < r.w + r.h; i += step * 2) {
      L.a.beginPath();
      L.a.moveTo(r.x + i, r.y + r.h); L.a.lineTo(r.x + i + step, r.y + r.h);
      L.a.lineTo(r.x + i + step + r.h, r.y); L.a.lineTo(r.x + i + r.h, r.y);
      L.a.closePath(); L.a.fill();
    }
    L.a.restore();
    chips(L, r, rnd, 8, 0x7c7e80);
  });
  mat(C.aluminum, 0xbcc0c5, 0.36, 1, (r) => brushed(L, r, rnd, 0.06));
  mat(C.ceramic, 0x6f7174, 0.7, 0, (r) => speckle(L, r, rnd, 1.6, 0.06, 0.03));
  mat(C.gunmetal, 0x2a2c2f, 0.42, 0.85, (r) => { brushed(L, r, rnd, 0.05); speckle(L, r, rnd, 0.6, 0.05, 0.02); });
  mat(C.ribbed, 0x1d1e21, 0.58, 0.1, (r) => {
    const step = r.h / 9;
    for (let i = 1; i < 9; i++) seam(L, r.x, r.y + i * step, r.x + r.w, r.y + i * step, Math.max(1.5, step * 0.18), 0.2, 0.5);
    speckle(L, r, rnd, 1, 0.05, 0.03);
  });
  mat(C.redTip, 0xb11e1a, 0.34, 0.6);
  mat(C.plywood, 0x9f7d50, 0.82, 0, (r) => {
    for (let i = 0; i < 18; i++) {
      const y = r.y + rnd() * r.h;
      L.a.strokeStyle = `rgba(60,36,14,${0.08 + rnd() * 0.12})`;
      L.a.lineWidth = 1;
      L.a.beginPath(); L.a.moveTo(r.x, y); L.a.bezierCurveTo(r.x + r.w * 0.3, y + 2, r.x + r.w * 0.7, y - 2, r.x + r.w, y + 1); L.a.stroke();
    }
    speckle(L, r, rnd, 0.6, 0.05, 0.03);
  });
}

/** Wood grain + plank seams + OD paint over it — the airdrop crate panels. */
function paintCrate(L: Layers, rnd: () => number): void {
  const r = cellRect(L, C.crate);
  base(L, r, 0x4c5534, 0.7, 0);
  // Planks under the paint: tone bands, grain, seams.
  const planks = 6;
  for (let p = 0; p < planks; p++) {
    const px = r.x + (p / planks) * r.w;
    L.a.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + rnd() * 0.05})`;
    L.a.fillRect(px, r.y, r.w / planks, r.h);
    for (let g = 0; g < 9; g++) {
      const gx = px + rnd() * (r.w / planks);
      L.a.strokeStyle = `rgba(20,24,10,${0.06 + rnd() * 0.1})`;
      L.a.lineWidth = 1 + rnd();
      L.a.beginPath(); L.a.moveTo(gx, r.y); L.a.bezierCurveTo(gx + 3, r.y + r.h * 0.33, gx - 3, r.y + r.h * 0.66, gx + 1, r.y + r.h); L.a.stroke();
      L.h.strokeStyle = grey(0.46, 0.7); L.h.lineWidth = 1;
      L.h.beginPath(); L.h.moveTo(gx, r.y); L.h.lineTo(gx + 1, r.y + r.h); L.h.stroke();
    }
    if (p > 0) seam(L, px, r.y, px, r.y + r.h, Math.max(1.5, r.w * 0.004), 0.25, 0.5);
  }
  // Frame battens around the face (raised).
  const bw = r.w * 0.075;
  L.a.fillStyle = 'rgba(70,78,48,1)';
  L.h.fillStyle = grey(0.66);
  for (const [x, y, w, h] of [[r.x, r.y, r.w, bw], [r.x, r.y + r.h - bw, r.w, bw], [r.x, r.y, bw, r.h], [r.x + r.w - bw, r.y, bw, r.h]]) {
    L.a.fillRect(x, y, w, h); L.h.fillRect(x, y, w, h);
  }
  seam(L, r.x + bw, r.y + bw, r.x + r.w - bw, r.y + bw, 2, 0.2, 0.45);
  seam(L, r.x + bw, r.y + r.h - bw, r.x + r.w - bw, r.y + r.h - bw, 2, 0.2, 0.45);
  seam(L, r.x + bw, r.y + bw, r.x + bw, r.y + r.h - bw, 2, 0.2, 0.45);
  seam(L, r.x + r.w - bw, r.y + bw, r.x + r.w - bw, r.y + r.h - bw, 2, 0.2, 0.45);
  // Nails along the battens.
  for (let i = 0; i < 14; i++) {
    const t = (i + 0.5) / 14;
    for (const [x, y] of [[r.x + t * r.w, r.y + bw / 2], [r.x + t * r.w, r.y + r.h - bw / 2]]) {
      L.a.fillStyle = 'rgba(40,40,36,0.9)'; L.a.beginPath(); L.a.arc(x, y, r.w * 0.004, 0, Math.PI * 2); L.a.fill();
    }
  }
  // Stencils.
  const S = r.w;
  text(L, 'SUPPLY · AIRDROP', r.x + S * 0.5, r.y + r.h * 0.27, S * 0.075, 0x0f1108, { stencil: 0x4c5534, weight: '900', alpha: 0.85, maxW: S * 0.8 });
  text(L, 'NSN 8140-01-552-7704', r.x + S * 0.5, r.y + r.h * 0.42, S * 0.036, 0x0f1108, { alpha: 0.75, maxW: S * 0.8 });
  text(L, 'LOT 07-26  ·  GROSS WT 68 KG  ·  CUBE 2.1', r.x + S * 0.5, r.y + r.h * 0.5, S * 0.03, 0x0f1108, { alpha: 0.7, maxW: S * 0.8 });
  // "This side up" arrows.
  for (const ax of [0.2, 0.8]) {
    const cx = r.x + S * ax, cy = r.y + r.h * 0.72;
    L.a.fillStyle = 'rgba(14,16,8,0.82)';
    for (const dx of [-S * 0.025, S * 0.025]) {
      L.a.beginPath();
      L.a.moveTo(cx + dx, cy - S * 0.07); L.a.lineTo(cx + dx + S * 0.022, cy - S * 0.035); L.a.lineTo(cx + dx + S * 0.008, cy - S * 0.035);
      L.a.lineTo(cx + dx + S * 0.008, cy + S * 0.04); L.a.lineTo(cx + dx - S * 0.008, cy + S * 0.04); L.a.lineTo(cx + dx - S * 0.008, cy - S * 0.035);
      L.a.lineTo(cx + dx - S * 0.022, cy - S * 0.035); L.a.closePath(); L.a.fill();
    }
  }
  text(L, 'THIS SIDE UP', r.x + S * 0.5, r.y + r.h * 0.72, S * 0.04, 0x0f1108, { stencil: 0x4c5534, alpha: 0.8 });
  // A yellow band (air-cargo marking).
  L.a.fillStyle = 'rgba(205,160,40,0.85)';
  L.a.fillRect(r.x + bw, r.y + r.h * 0.84, r.w - bw * 2, r.h * 0.035);
  chips(L, r, rnd, 60, 0x8a6a40);
  grime(L, r, 0.35);
  speckle(L, r, rnd, 0.8, 0.06, 0.02);

  // Top panel: the plank deck + a big stencilled cross-arrow and lift points.
  const t = cellRect(L, C.crateTop);
  base(L, t, 0x4a5233, 0.72, 0);
  const tp = 7;
  for (let p = 0; p < tp; p++) {
    const py = t.y + (p / tp) * t.h;
    L.a.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + rnd() * 0.05})`;
    L.a.fillRect(t.x, py, t.w, t.h / tp);
    if (p > 0) seam(L, t.x, py, t.x + t.w, py, Math.max(1.5, t.w * 0.004), 0.25, 0.5);
  }
  text(L, 'HANDLE WITH CARE', t.x + t.w * 0.5, t.y + t.h * 0.2, t.w * 0.05, 0x0f1108, { stencil: 0x4a5233, alpha: 0.8, maxW: t.w * 0.8 });
  text(L, 'DO NOT STACK', t.x + t.w * 0.5, t.y + t.h * 0.82, t.w * 0.04, 0x0f1108, { stencil: 0x4a5233, alpha: 0.75 });
  chips(L, t, rnd, 50, 0x8a6a40);
  speckle(L, t, rnd, 0.8, 0.06, 0.02);
  grime(L, t, 0.18);
}

function paintChute(L: Layers, rnd: () => number): void {
  const r = cellRect(L, C.chute);
  base(L, r, 0x6b6d4e, 0.82, 0);
  // Ripstop grid.
  const step = Math.max(3, r.w / 36);
  for (let x = r.x; x < r.x + r.w; x += step) { L.a.fillStyle = 'rgba(0,0,0,0.06)'; L.a.fillRect(x, r.y, 1, r.h); }
  for (let y = r.y; y < r.y + r.h; y += step) { L.a.fillStyle = 'rgba(0,0,0,0.06)'; L.a.fillRect(r.x, y, r.w, 1); }
  // Alternating gore panels (sand / olive) with stitched seams.
  const gores = 10;
  for (let g = 0; g < gores; g++) {
    const x = r.x + (g / gores) * r.w;
    if (g % 2 === 1) { L.a.fillStyle = 'rgba(190,170,120,0.35)'; L.a.fillRect(x, r.y, r.w / gores, r.h); }
    seam(L, x, r.y, x, r.y + r.h, 2, 0.12, 0.35);
  }
  // Reinforced skirt band at the rim (v = 0 → bottom of the cell).
  L.a.fillStyle = 'rgba(40,42,28,0.7)';
  L.a.fillRect(r.x, r.y + r.h * 0.9, r.w, r.h * 0.1);
  speckle(L, r, rnd, 0.6, 0.04, 0.01);
}

function paintStrapAndPallet(L: Layers, rnd: () => number): void {
  const s = cellRect(L, C.strap);
  base(L, s, 0xb88a2c, 0.86, 0);
  const st = Math.max(2, s.w / 20);
  for (let x = s.x; x < s.x + s.w; x += st) { L.a.fillStyle = 'rgba(0,0,0,0.1)'; L.a.fillRect(x, s.y, st * 0.4, s.h); L.h.fillStyle = grey(0.44); L.h.fillRect(x, s.y, st * 0.4, s.h); }
  // Stitch lines along both edges.
  for (const ex of [s.x + s.w * 0.1, s.x + s.w * 0.9]) {
    for (let y = s.y; y < s.y + s.h; y += 6) { L.a.fillStyle = 'rgba(40,30,10,0.6)'; L.a.fillRect(ex - 1, y, 2, 3); }
  }
  speckle(L, s, rnd, 0.8, 0.06, 0.02);
  grime(L, s, 0.3);

  const p = cellRect(L, C.pallet);
  base(L, p, 0x9a7a50, 0.84, 0);
  for (let i = 0; i < 26; i++) {
    const y = p.y + rnd() * p.h;
    L.a.strokeStyle = `rgba(60,36,14,${0.1 + rnd() * 0.14})`;
    L.a.lineWidth = 1 + rnd() * 1.5;
    L.a.beginPath(); L.a.moveTo(p.x, y); L.a.bezierCurveTo(p.x + p.w * 0.3, y + 3, p.x + p.w * 0.7, y - 3, p.x + p.w, y + 1); L.a.stroke();
  }
  speckle(L, p, rnd, 1, 0.07, 0.04);
  grime(L, p, 0.4);
}

/** Pictogram glyphs for labels (drawn on the albedo in `color`). */
function glyph(L: Layers, kind: string, cx: number, cy: number, s: number, color: number): void {
  const a = L.a;
  a.save();
  a.fillStyle = hex(color);
  a.strokeStyle = hex(color);
  a.lineWidth = s * 0.14;
  a.lineCap = 'round';
  a.lineJoin = 'round';
  switch (kind) {
    case 'cross':
      a.fillRect(cx - s * 0.16, cy - s * 0.5, s * 0.32, s);
      a.fillRect(cx - s * 0.5, cy - s * 0.16, s, s * 0.32);
      break;
    case 'bullet':
      for (const dx of [-0.26, 0, 0.26]) {
        const x = cx + dx * s;
        a.fillRect(x - s * 0.08, cy - s * 0.12, s * 0.16, s * 0.6);
        a.beginPath(); a.moveTo(x - s * 0.08, cy - s * 0.12); a.quadraticCurveTo(x, cy - s * 0.55, x + s * 0.08, cy - s * 0.12); a.fill();
      }
      break;
    case 'bolt':
      a.beginPath();
      a.moveTo(cx + s * 0.1, cy - s * 0.5); a.lineTo(cx - s * 0.25, cy + s * 0.05); a.lineTo(cx, cy + s * 0.05);
      a.lineTo(cx - s * 0.1, cy + s * 0.5); a.lineTo(cx + s * 0.28, cy - s * 0.08); a.lineTo(cx + s * 0.02, cy - s * 0.08);
      a.closePath(); a.fill();
      break;
    case 'burst':
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        a.beginPath(); a.moveTo(cx + Math.cos(ang) * s * 0.16, cy + Math.sin(ang) * s * 0.16);
        a.lineTo(cx + Math.cos(ang) * s * 0.5, cy + Math.sin(ang) * s * 0.5); a.stroke();
      }
      break;
    case 'shield':
      a.beginPath();
      a.moveTo(cx, cy - s * 0.5); a.lineTo(cx + s * 0.4, cy - s * 0.32); a.lineTo(cx + s * 0.34, cy + s * 0.1);
      a.quadraticCurveTo(cx + s * 0.2, cy + s * 0.4, cx, cy + s * 0.5); a.quadraticCurveTo(cx - s * 0.2, cy + s * 0.4, cx - s * 0.34, cy + s * 0.1);
      a.lineTo(cx - s * 0.4, cy - s * 0.32); a.closePath(); a.fill();
      break;
    case 'star':
      a.beginPath();
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        const rr = i % 2 === 0 ? s * 0.5 : s * 0.2;
        if (i === 0) a.moveTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
        else a.lineTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
      }
      a.closePath(); a.fill();
      break;
    case 'infinity':
      a.beginPath();
      a.ellipse(cx - s * 0.2, cy, s * 0.2, s * 0.16, 0, 0, Math.PI * 2);
      a.moveTo(cx + s * 0.4, cy);
      a.ellipse(cx + s * 0.2, cy, s * 0.2, s * 0.16, 0, 0, Math.PI * 2);
      a.stroke();
      break;
    case 'trefoil':
      a.beginPath(); a.arc(cx, cy, s * 0.09, 0, Math.PI * 2); a.fill();
      for (let i = 0; i < 3; i++) {
        const ang = -Math.PI / 2 + (i / 3) * Math.PI * 2;
        a.beginPath();
        a.moveTo(cx + Math.cos(ang - 0.52) * s * 0.15, cy + Math.sin(ang - 0.52) * s * 0.15);
        a.arc(cx, cy, s * 0.5, ang - 0.52, ang + 0.52);
        a.lineTo(cx + Math.cos(ang + 0.52) * s * 0.15, cy + Math.sin(ang + 0.52) * s * 0.15);
        a.arc(cx, cy, s * 0.15, ang + 0.52, ang - 0.52, true);
        a.fill();
      }
      break;
    case 'question':
      a.font = `900 ${s}px Arial, sans-serif`; a.textAlign = 'center'; a.textBaseline = 'middle';
      a.fillText('?', cx, cy + s * 0.04);
      break;
    case 'flame':
      a.beginPath();
      a.moveTo(cx, cy - s * 0.5);
      a.bezierCurveTo(cx + s * 0.45, cy - s * 0.05, cx + s * 0.32, cy + s * 0.5, cx, cy + s * 0.5);
      a.bezierCurveTo(cx - s * 0.32, cy + s * 0.5, cx - s * 0.42, cy, cx - s * 0.1, cy - s * 0.18);
      a.bezierCurveTo(cx - s * 0.05, cy, cx + s * 0.05, cy - s * 0.25, cx, cy - s * 0.5);
      a.fill();
      break;
    case 'helmet':
      a.beginPath(); a.arc(cx, cy + s * 0.1, s * 0.42, Math.PI, 0); a.closePath(); a.fill();
      a.fillRect(cx - s * 0.5, cy + s * 0.08, s, s * 0.12);
      break;
    case 'snow':
      for (let i = 0; i < 3; i++) {
        const ang = (i / 3) * Math.PI;
        a.beginPath(); a.moveTo(cx + Math.cos(ang) * s * 0.5, cy + Math.sin(ang) * s * 0.5);
        a.lineTo(cx - Math.cos(ang) * s * 0.5, cy - Math.sin(ang) * s * 0.5); a.stroke();
      }
      break;
  }
  a.restore();
}

/** The per-reward stencilled crate plates. */
function paintCrateLabels(L: Layers, rnd: () => number): void {
  const spec: Record<CrateLabelId, { name: string; sub: string; glyph: string; plate: number }> = {
    health:        { name: 'MEDICAL', sub: 'TRAUMA · FIRST AID', glyph: 'cross', plate: 0xe9e7df },
    ammo:          { name: 'AMMUNITION', sub: 'CTG 5.56MM · 1680 RDS', glyph: 'bullet', plate: 0xd9b23a },
    speed:         { name: 'STIMULANT', sub: 'AUTO-INJECTOR KIT', glyph: 'bolt', plate: 0xe0e3e6 },
    damage:        { name: 'AP ROUNDS', sub: 'ARMOR PIERCING', glyph: 'burst', plate: 0xd7b03c },
    shield:        { name: 'BODY ARMOR', sub: 'PLATE · LVL IV', glyph: 'shield', plate: 0xe0e3e6 },
    invincible:    { name: 'HEAVY ARMOR', sub: 'EOD · CLASS V', glyph: 'helmet', plate: 0xd7b03c },
    infinite_ammo: { name: 'BELT FEED', sub: 'LINKED · 2000 RDS', glyph: 'infinity', plate: 0xd9b23a },
    rapid_fire:    { name: 'FIRE CONTROL', sub: 'TRIGGER GROUP KIT', glyph: 'burst', plate: 0xe0e3e6 },
    nuke:          { name: 'TAC-WARHEAD', sub: 'RADIOACTIVE · CAT 7', glyph: 'trefoil', plate: 0xe2b81d },
    random_weapon: { name: 'ORDNANCE', sub: 'CONTENTS CLASSIFIED', glyph: 'question', plate: 0xe0e3e6 },
    frenzy:        { name: 'INCENDIARY', sub: 'HAZMAT · CLASS 4.1', glyph: 'flame', plate: 0xe0712a },
    juggernaut:    { name: 'EXO KIT', sub: 'POWERED · RESTRICTED', glyph: 'shield', plate: 0xe2b81d },
  };
  for (const id of CRATE_LABELS) {
    const r = cellRect(L, crateLabelCell(id));
    const sp = spec[id];
    base(L, r, sp.plate, 0.6, 0, 0.58);
    // Plate border (embossed) + 4 rivets.
    L.a.strokeStyle = 'rgba(20,20,18,0.85)'; L.a.lineWidth = r.h * 0.035;
    L.a.strokeRect(r.x + r.h * 0.06, r.y + r.h * 0.06, r.w - r.h * 0.12, r.h - r.h * 0.12);
    L.h.strokeStyle = grey(0.66); L.h.lineWidth = r.h * 0.035;
    L.h.strokeRect(r.x + r.h * 0.06, r.y + r.h * 0.06, r.w - r.h * 0.12, r.h - r.h * 0.12);
    for (const [x, y] of [[0.035, 0.07], [0.965, 0.07], [0.035, 0.93], [0.965, 0.93]]) {
      L.a.fillStyle = 'rgba(90,90,86,1)'; L.a.beginPath(); L.a.arc(r.x + r.w * x, r.y + r.h * y, r.h * 0.035, 0, Math.PI * 2); L.a.fill();
      L.o.fillStyle = orm(0.35, 0.9); L.o.beginPath(); L.o.arc(r.x + r.w * x, r.y + r.h * y, r.h * 0.035, 0, Math.PI * 2); L.o.fill();
    }
    glyph(L, sp.glyph, r.x + r.h * 0.55, r.y + r.h * 0.5, r.h * 0.55, 0x15140f);
    text(L, sp.name, r.x + r.w * 0.6, r.y + r.h * 0.4, r.h * 0.26, 0x15140f, { weight: '900', stencil: sp.plate, maxW: r.w * 0.62 });
    text(L, sp.sub, r.x + r.w * 0.6, r.y + r.h * 0.7, r.h * 0.11, 0x15140f, { alpha: 0.85, maxW: r.w * 0.62 });
    speckle(L, r, rnd, 0.8, 0.07, 0.02);
    chips(L, r, rnd, 18, 0x6a6c6e);
    grime(L, r, 0.2);
  }
}

/** Labelled item surfaces (pickups + grenades). */
function paintItemLabels(L: Layers, rnd: () => number): void {
  // ── Med case: white shell, red cross, "FIRST AID". ──
  {
    const r = cellRect(L, C.medCross);
    base(L, r, 0xe8e9e4, 0.42, 0);
    speckle(L, r, rnd, 0.7, 0.05, 0.02);
    glyph(L, 'cross', r.x + r.w / 2, r.y + r.h * 0.44, r.w * 0.48, 0xc0161b);
    L.h.fillStyle = grey(0.56);
    L.h.fillRect(r.x + r.w / 2 - r.w * 0.077, r.y + r.h * 0.2, r.w * 0.154, r.w * 0.48);
    L.h.fillRect(r.x + r.w / 2 - r.w * 0.24, r.y + r.h * 0.44 - r.w * 0.077, r.w * 0.48, r.w * 0.154);
    text(L, 'FIRST AID', r.x + r.w / 2, r.y + r.h * 0.82, r.w * 0.1, 0x2a2a2a, { weight: '900' });
    grime(L, r, 0.12);
  }
  {
    const r = cellRect(L, C.medkitBack);
    base(L, r, 0xe4e5e0, 0.44, 0);
    speckle(L, r, rnd, 0.7, 0.05, 0.02);
    // Moulded ribs + a green "TRAUMA" label strip.
    for (let i = 1; i < 6; i++) seam(L, r.x + r.w * 0.08, r.y + (i / 6) * r.h, r.x + r.w * 0.92, r.y + (i / 6) * r.h, 2, 0.08, 0.15);
    L.a.fillStyle = '#1d7a3c'; L.a.fillRect(r.x + r.w * 0.1, r.y + r.h * 0.4, r.w * 0.8, r.h * 0.2);
    text(L, 'TRAUMA KIT · IFAK', r.x + r.w / 2, r.y + r.h * 0.5, r.w * 0.07, 0xf2f2ee, { weight: '900', maxW: r.w * 0.76 });
    grime(L, r, 0.14);
  }
  // ── M2A1 ammo can side: OD, pressed ribs, yellow stencil. ──
  {
    const r = cellRect(L, C.ammoSide);
    base(L, r, 0x4a5132, 0.6, 0.15);
    for (const fy of [0.16, 0.84]) {
      L.h.fillStyle = grey(0.62); L.h.fillRect(r.x, r.y + r.h * fy - r.h * 0.04, r.w, r.h * 0.08);
      seam(L, r.x, r.y + r.h * fy + r.h * 0.04, r.x + r.w, r.y + r.h * fy + r.h * 0.04, 2, 0.15, 0.4);
    }
    text(L, '1680 CARTRIDGES 5.56MM', r.x + r.w / 2, r.y + r.h * 0.38, r.h * 0.13, 0xd8b23a, { weight: '800', stencil: 0x4a5132, maxW: r.w * 0.86 });
    text(L, 'BALL M855 · 10 RD CLIPS · BANDOLEER', r.x + r.w / 2, r.y + r.h * 0.56, r.h * 0.08, 0xd8b23a, { maxW: r.w * 0.86 });
    text(L, 'LOT LC-26F311-047', r.x + r.w / 2, r.y + r.h * 0.69, r.h * 0.07, 0xd8b23a, { maxW: r.w * 0.86 });
    chips(L, r, rnd, 26);
    speckle(L, r, rnd, 1, 0.07, 0.03);
    grime(L, r, 0.3);
  }
  // ── Auto-injector label. ──
  {
    const r = cellRect(L, C.stimLabel);
    base(L, r, 0xe1e3e0, 0.38, 0);
    L.a.fillStyle = '#d8a51e'; L.a.fillRect(r.x, r.y, r.w * 0.22, r.h);
    L.a.fillStyle = '#d8a51e'; L.a.fillRect(r.x + r.w * 0.78, r.y, r.w * 0.22, r.h);
    text(L, 'ADRENALINE', r.x + r.w / 2, r.y + r.h * 0.32, r.h * 0.2, 0x151515, { weight: '900', maxW: r.w * 0.52 });
    text(L, 'AUTO-INJECTOR 0.3 MG', r.x + r.w / 2, r.y + r.h * 0.56, r.h * 0.1, 0x151515, { maxW: r.w * 0.52 });
    // Inspection window.
    L.a.fillStyle = '#7a5a20'; L.a.fillRect(r.x + r.w * 0.36, r.y + r.h * 0.72, r.w * 0.28, r.h * 0.14);
    L.o.fillStyle = orm(0.1, 0); L.o.fillRect(r.x + r.w * 0.36, r.y + r.h * 0.72, r.w * 0.28, r.h * 0.14);
  }
  // ── Rifle magazine side: ribbed steel body + witness holes. ──
  {
    const r = cellRect(L, C.magSide);
    base(L, r, 0x34363a, 0.46, 0.85);
    brushed(L, r, rnd, 0.05, true);
    for (let i = 1; i < 4; i++) {
      const y = r.y + (i / 4) * r.h;
      L.h.fillStyle = grey(0.62); L.h.fillRect(r.x + r.w * 0.06, y - r.h * 0.05, r.w * 0.88, r.h * 0.1);
    }
    for (let i = 0; i < 6; i++) {
      const x = r.x + r.w * (0.2 + i * 0.12);
      L.a.fillStyle = '#0a0a0b'; L.a.beginPath(); L.a.arc(x, r.y + r.h * 0.5, r.h * 0.05, 0, Math.PI * 2); L.a.fill();
      L.h.fillStyle = grey(0.2); L.h.beginPath(); L.h.arc(x, r.y + r.h * 0.5, r.h * 0.05, 0, Math.PI * 2); L.h.fill();
    }
    text(L, 'AP · 5.56', r.x + r.w * 0.12, r.y + r.h * 0.2, r.h * 0.13, 0xc93a2e, { align: 'left', weight: '900' });
    chips(L, r, rnd, 18, 0xb9bbbd);
  }
  // ── Power cell label. ──
  {
    const r = cellRect(L, C.batteryLabel);
    base(L, r, 0x26282b, 0.5, 0.2);
    // Hazard bands top/bottom.
    for (const by of [r.y, r.y + r.h * 0.82]) {
      L.a.save(); L.a.beginPath(); L.a.rect(r.x, by, r.w, r.h * 0.18); L.a.clip();
      L.a.fillStyle = '#d8a81f'; L.a.fillRect(r.x, by, r.w, r.h * 0.18);
      L.a.fillStyle = '#141416';
      for (let i = -r.h; i < r.w; i += r.h * 0.36) {
        L.a.beginPath(); L.a.moveTo(r.x + i, by + r.h * 0.18); L.a.lineTo(r.x + i + r.h * 0.18, by + r.h * 0.18);
        L.a.lineTo(r.x + i + r.h * 0.36, by); L.a.lineTo(r.x + i + r.h * 0.18, by); L.a.closePath(); L.a.fill();
      }
      L.a.restore();
    }
    text(L, 'HV POWER CELL', r.x + r.w * 0.5, r.y + r.h * 0.4, r.h * 0.16, 0xe8e8e2, { weight: '900', maxW: r.w * 0.8 });
    text(L, '48V · 9.6 kWh · Li-ION', r.x + r.w * 0.5, r.y + r.h * 0.6, r.h * 0.09, 0xd8a81f, { maxW: r.w * 0.8 });
    for (let i = 0; i < 5; i++) led(L, r.x + r.w * (0.78 + i * 0.035), r.y + r.h * 0.72, r.h * 0.035, i < 4 ? 0xffb030 : 0x553300);
  }
  // ── LN2 dewar label. ──
  {
    const r = cellRect(L, C.dewarLabel);
    base(L, r, 0xb9bfc4, 0.32, 0.95);
    brushed(L, r, rnd, 0.06, true);
    L.a.fillStyle = '#1f5fb8'; L.a.fillRect(r.x, r.y + r.h * 0.3, r.w, r.h * 0.4);
    L.o.fillStyle = orm(0.4, 0); L.o.fillRect(r.x, r.y + r.h * 0.3, r.w, r.h * 0.4);
    glyph(L, 'snow', r.x + r.w * 0.16, r.y + r.h * 0.5, r.h * 0.3, 0xf2f6ff);
    text(L, 'LN₂ CRYOGENIC', r.x + r.w * 0.56, r.y + r.h * 0.44, r.h * 0.13, 0xf2f6ff, { weight: '900', maxW: r.w * 0.66 });
    text(L, '−196 °C · KEEP UPRIGHT', r.x + r.w * 0.56, r.y + r.h * 0.6, r.h * 0.07, 0xdce6ff, { maxW: r.w * 0.66 });
  }
  // ── Isotope container label (trefoil). ──
  {
    const r = cellRect(L, C.radLabel);
    base(L, r, 0xe2b81d, 0.48, 0);
    L.a.fillStyle = '#121212'; L.a.fillRect(r.x, r.y, r.w, r.h * 0.12); L.a.fillRect(r.x, r.y + r.h * 0.88, r.w, r.h * 0.12);
    glyph(L, 'trefoil', r.x + r.w * 0.2, r.y + r.h * 0.5, r.h * 0.55, 0x121212);
    text(L, 'RADIOACTIVE', r.x + r.w * 0.6, r.y + r.h * 0.42, r.h * 0.16, 0x121212, { weight: '900', maxW: r.w * 0.64 });
    text(L, 'CAT 7 · TYPE B(U)', r.x + r.w * 0.6, r.y + r.h * 0.62, r.h * 0.09, 0x121212, { maxW: r.w * 0.64 });
    chips(L, r, rnd, 16, 0x6c6e70);
    grime(L, r, 0.25);
  }
  // ── ECM module face. ──
  {
    const r = cellRect(L, C.ecmFace);
    base(L, r, 0x1b1c1f, 0.6, 0.1);
    speckle(L, r, rnd, 1.6, 0.06, 0.04);
    for (let i = 0; i < 7; i++) seam(L, r.x + r.w * 0.55, r.y + r.h * (0.25 + i * 0.08), r.x + r.w * 0.92, r.y + r.h * (0.25 + i * 0.08), 2, 0.18, 0.5);
    text(L, 'ECM-7', r.x + r.w * 0.06, r.y + r.h * 0.22, r.h * 0.14, 0x9a9ca0, { align: 'left', weight: '900' });
    text(L, 'SIGNATURE SUPPRESSOR', r.x + r.w * 0.06, r.y + r.h * 0.36, r.h * 0.06, 0x7a7c80, { align: 'left' });
    led(L, r.x + r.w * 0.12, r.y + r.h * 0.68, r.h * 0.06, 0xb066ff);
    led(L, r.x + r.w * 0.22, r.y + r.h * 0.68, r.h * 0.06, 0xb066ff);
    led(L, r.x + r.w * 0.32, r.y + r.h * 0.68, r.h * 0.06, 0x3dff8a);
  }
  // ── Grenade labels. ──
  {
    const r = cellRect(L, C.empLabel);
    base(L, r, 0x2a2d31, 0.46, 0.4);
    L.a.fillStyle = '#2a6fd0'; L.a.fillRect(r.x, r.y + r.h * 0.36, r.w, r.h * 0.28);
    L.e.fillStyle = 'rgba(40,120,255,0.35)'; L.e.fillRect(r.x, r.y + r.h * 0.36, r.w, r.h * 0.28);
    glyph(L, 'bolt', r.x + r.w * 0.16, r.y + r.h * 0.5, r.h * 0.3, 0xf2f6ff);
    text(L, 'EMP · M84E', r.x + r.w * 0.58, r.y + r.h * 0.5, r.h * 0.16, 0xf2f6ff, { weight: '900', maxW: r.w * 0.7 });
    text(L, 'PULSE · NON-LETHAL TO PERSONNEL', r.x + r.w * 0.5, r.y + r.h * 0.2, r.h * 0.07, 0xb8bcc2, { maxW: r.w * 0.9 });
    text(L, 'FUZE 1.8 S', r.x + r.w * 0.5, r.y + r.h * 0.8, r.h * 0.08, 0xb8bcc2);
  }
  {
    const r = cellRect(L, C.thermLabel);
    base(L, r, 0x5a5d60, 0.55, 0.2);
    speckle(L, r, rnd, 1, 0.06, 0.03);
    L.a.fillStyle = '#b32a1a'; L.a.fillRect(r.x, r.y + r.h * 0.36, r.w, r.h * 0.28);
    glyph(L, 'flame', r.x + r.w * 0.16, r.y + r.h * 0.5, r.h * 0.3, 0xf6e6c8);
    text(L, 'TH3 INCENDIARY', r.x + r.w * 0.58, r.y + r.h * 0.5, r.h * 0.15, 0xf6e6c8, { weight: '900', maxW: r.w * 0.7 });
    text(L, 'AN-M14 · 4000 °C', r.x + r.w * 0.5, r.y + r.h * 0.2, r.h * 0.08, 0x1a1a1a);
    text(L, 'DO NOT HOLD AFTER RELEASE', r.x + r.w * 0.5, r.y + r.h * 0.8, r.h * 0.065, 0x1a1a1a, { maxW: r.w * 0.9 });
  }
  {
    // M67 body: OD sphere with the yellow band and a lot stamp.
    const r = cellRect(L, C.fragBody);
    base(L, r, 0x485031, 0.58, 0.05);
    speckle(L, r, rnd, 1.6, 0.07, 0.04);
    L.a.fillStyle = '#c9a43a'; L.a.fillRect(r.x, r.y + r.h * 0.2, r.w, r.h * 0.05);
    text(L, 'M67 · FRAG', r.x + r.w * 0.5, r.y + r.h * 0.5, r.h * 0.11, 0xc9a43a, { weight: '800' });
    chips(L, r, rnd, 10);
  }
  // ── Plate carrier front: coyote nylon with MOLLE rows. ──
  {
    const r = cellRect(L, C.vestFront);
    base(L, r, 0x86725a, 0.9, 0);
    const step = Math.max(2, r.w / 60);
    for (let y = r.y; y < r.y + r.h; y += step) { L.a.fillStyle = 'rgba(0,0,0,0.08)'; L.a.fillRect(r.x, y, r.w, step * 0.4); }
    for (let row = 0; row < 6; row++) {
      const y = r.y + r.h * (0.3 + row * 0.1);
      L.a.fillStyle = 'rgba(90,74,54,1)'; L.a.fillRect(r.x + r.w * 0.06, y, r.w * 0.88, r.h * 0.045);
      L.h.fillStyle = grey(0.64); L.h.fillRect(r.x + r.w * 0.06, y, r.w * 0.88, r.h * 0.045);
      for (let c = 0; c < 9; c++) seam(L, r.x + r.w * (0.06 + c * 0.11), y, r.x + r.w * (0.06 + c * 0.11), y + r.h * 0.045, 2, 0.15, 0.45);
    }
    // Velcro ID panel.
    L.a.fillStyle = 'rgba(70,58,42,1)'; L.a.fillRect(r.x + r.w * 0.3, r.y + r.h * 0.08, r.w * 0.4, r.h * 0.15);
    text(L, 'LVL IV', r.x + r.w * 0.5, r.y + r.h * 0.155, r.h * 0.08, 0x2a241a, { weight: '900' });
    speckle(L, r, rnd, 0.8, 0.06, 0.02);
    grime(L, r, 0.25);
  }
  {
    const r = cellRect(L, C.pouch);
    base(L, r, 0x7e6b52, 0.9, 0);
    seam(L, r.x, r.y + r.h * 0.22, r.x + r.w, r.y + r.h * 0.22, 2, 0.2, 0.5);
    L.a.fillStyle = 'rgba(40,40,40,1)'; L.a.fillRect(r.x + r.w * 0.38, r.y + r.h * 0.1, r.w * 0.24, r.h * 0.1);
    speckle(L, r, rnd, 0.8, 0.06, 0.02);
  }
  // ── Kinetic charge top: yellow disc, chevrons, warning ring. ──
  {
    const r = cellRect(L, C.kineticTop);
    base(L, r, 0xd4a420, 0.46, 0);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    L.a.fillStyle = '#17171a';
    L.a.beginPath(); L.a.arc(cx, cy, r.w * 0.2, 0, Math.PI * 2); L.a.fill();
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      L.a.save(); L.a.translate(cx, cy); L.a.rotate(ang);
      L.a.beginPath(); L.a.moveTo(r.w * 0.26, -r.w * 0.05); L.a.lineTo(r.w * 0.36, 0); L.a.lineTo(r.w * 0.26, r.w * 0.05);
      L.a.lineTo(r.w * 0.3, 0); L.a.closePath(); L.a.fill();
      L.a.restore();
    }
    L.a.save(); L.a.translate(cx, cy);
    L.a.font = `900 ${r.w * 0.05}px Arial, sans-serif`; L.a.fillStyle = '#17171a';
    const msg = 'KINETIC CHARGE · STAND CLEAR · ';
    for (let i = 0; i < msg.length; i++) {
      L.a.save(); L.a.rotate((i / msg.length) * Math.PI * 2); L.a.fillText(msg[i], -r.w * 0.012, -r.w * 0.43); L.a.restore();
    }
    L.a.restore();
    chips(L, r, rnd, 20, 0x7a7c7e);
  }
  // ── Drum magazine side. ──
  {
    const r = cellRect(L, C.cmagSide);
    base(L, r, 0x1e1f22, 0.6, 0.1);
    for (let i = 0; i < 10; i++) {
      const y = r.y + r.h * (0.12 + i * 0.08);
      seam(L, r.x, y, r.x + r.w, y, 1.5, 0.16, 0.4);
    }
    text(L, '100 RD', r.x + r.w * 0.5, r.y + r.h * 0.5, r.h * 0.18, 0x8a8c90, { weight: '900' });
  }
  // ── Tesla base label. ──
  {
    const r = cellRect(L, C.teslaLabel);
    base(L, r, 0x1c1d20, 0.56, 0.2);
    text(L, 'TESLA ARC · 1.2 MV', r.x + r.w * 0.5, r.y + r.h * 0.42, r.h * 0.14, 0xd8d8d0, { weight: '900', maxW: r.w * 0.86 });
    text(L, 'DANGER HIGH VOLTAGE', r.x + r.w * 0.5, r.y + r.h * 0.66, r.h * 0.09, 0xd8a81f, { maxW: r.w * 0.86 });
    led(L, r.x + r.w * 0.06, r.y + r.h * 0.5, r.h * 0.06, 0x3aa8ff);
  }
  // ── C4 sticky charge. ──
  {
    const r = cellRect(L, C.c4Label);
    base(L, r, 0x5a5f3c, 0.8, 0);
    text(L, 'CHARGE DEMOLITION M112', r.x + r.w * 0.5, r.y + r.h * 0.3, r.h * 0.1, 0xd8d2b0, { maxW: r.w * 0.9 });
    text(L, 'COMP C-4 · 1.25 LB', r.x + r.w * 0.5, r.y + r.h * 0.52, r.h * 0.13, 0xd8d2b0, { weight: '900', maxW: r.w * 0.9 });
    text(L, 'ADHESIVE FACE ↓', r.x + r.w * 0.5, r.y + r.h * 0.76, r.h * 0.08, 0xd8d2b0);
    speckle(L, r, rnd, 1, 0.06, 0.03);
    grime(L, r, 0.2);
  }
  {
    const r = cellRect(L, C.c4Putty);
    base(L, r, 0xe4dcc4, 0.86, 0);
    speckle(L, r, rnd, 2.4, 0.08, 0.08);
    for (let i = 0; i < 5; i++) {
      const x = r.x + rnd() * r.w, y = r.y + rnd() * r.h;
      L.a.fillStyle = 'rgba(120,108,80,0.25)'; L.a.beginPath(); L.a.arc(x, y, r.w * (0.05 + rnd() * 0.1), 0, Math.PI * 2); L.a.fill();
    }
  }
  // ── Decoy beacon. ──
  {
    const r = cellRect(L, C.decoyLabel);
    base(L, r, 0x26292c, 0.55, 0.2);
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 3; j++) {
        L.a.fillStyle = '#08090a';
        L.a.beginPath(); L.a.arc(r.x + r.w * (0.08 + i * 0.05), r.y + r.h * (0.3 + j * 0.2), r.h * 0.04, 0, Math.PI * 2); L.a.fill();
        L.h.fillStyle = grey(0.25);
        L.h.beginPath(); L.h.arc(r.x + r.w * (0.08 + i * 0.05), r.y + r.h * (0.3 + j * 0.2), r.h * 0.04, 0, Math.PI * 2); L.h.fill();
      }
    }
    text(L, 'DECOY', r.x + r.w * 0.68, r.y + r.h * 0.4, r.h * 0.2, 0x9be56a, { weight: '900' });
    text(L, 'NOISE · SIGNATURE EMITTER', r.x + r.w * 0.68, r.y + r.h * 0.64, r.h * 0.07, 0xb8bcc2, { maxW: r.w * 0.6 });
    led(L, r.x + r.w * 0.95, r.y + r.h * 0.2, r.h * 0.06, 0x9be56a);
  }
  // ── HJK-7 hijack spike body: machined gunmetal over a lit circuit lattice. ──
  {
    const r = cellRect(L, C.hijackLabel);
    base(L, r, 0x1b2026, 0.4, 0.75);
    brushed(L, r, rnd, 0.06, true);
    // Circuit traces: right-angled runs ending in solder pads, lit azure on
    // the emissive layer and cut a hair into the height.
    for (let t = 0; t < 16; t++) {
      let x = r.x + rnd() * r.w, y = r.y + r.h * (0.12 + rnd() * 0.76);
      L.a.strokeStyle = 'rgba(76,157,255,0.9)'; L.e.strokeStyle = 'rgba(76,157,255,0.75)';
      L.a.lineWidth = L.e.lineWidth = Math.max(1, r.h * 0.012);
      for (const ctx of [L.a, L.e]) { ctx.beginPath(); ctx.moveTo(x, y); }
      for (let k = 0; k < 3; k++) {
        if (k % 2 === 0) x += (rnd() - 0.5) * r.w * 0.22; else y += (rnd() - 0.5) * r.h * 0.3;
        for (const ctx of [L.a, L.e]) ctx.lineTo(x, y);
      }
      for (const ctx of [L.a, L.e]) ctx.stroke();
      led(L, x, y, r.h * 0.018, 0x4c9dff);
    }
    // Stencilled band with the designation.
    L.a.fillStyle = 'rgba(8,10,14,0.85)'; L.a.fillRect(r.x, r.y + r.h * 0.4, r.w, r.h * 0.2);
    text(L, 'HJK-7 · OVERRIDE', r.x + r.w * 0.5, r.y + r.h * 0.5, r.h * 0.13, 0x9cc8ff, { weight: '900', raise: 0.05 });
    text(L, 'INTRUSION SPIKE · DO NOT HANDLE TIP', r.x + r.w * 0.5, r.y + r.h * 0.86, r.h * 0.06, 0x7f8a96, { maxW: r.w * 0.9 });
    chips(L, r, rnd, 6, 0x9aa4ae);
  }
  // ── Knife blade + paracord grip. ──
  {
    const r = cellRect(L, C.knifeBlade);
    base(L, r, 0x8e9499, 0.28, 1);
    brushed(L, r, rnd, 0.1);
    // Polished edge bevel along the bottom + etched maker's mark.
    L.a.fillStyle = 'rgba(235,240,245,0.55)'; L.a.fillRect(r.x, r.y + r.h * 0.78, r.w, r.h * 0.22);
    L.o.fillStyle = orm(0.12, 1); L.o.fillRect(r.x, r.y + r.h * 0.78, r.w, r.h * 0.22);
    L.h.fillStyle = grey(0.62); L.h.fillRect(r.x, r.y + r.h * 0.74, r.w, r.h * 0.04);
    text(L, 'THROWER', r.x + r.w * 0.5, r.y + r.h * 0.42, r.h * 0.11, 0x3a3e42, { weight: '900', alpha: 0.6 });
  }
  {
    const r = cellRect(L, C.paracord);
    base(L, r, 0x2a2c24, 0.92, 0);
    const step = r.h / 10;
    for (let i = 0; i < 10; i++) {
      const y = r.y + i * step;
      L.a.fillStyle = i % 2 ? 'rgba(90,96,64,0.6)' : 'rgba(10,10,8,0.5)';
      L.a.beginPath(); L.a.moveTo(r.x, y); L.a.lineTo(r.x + r.w, y + step * 0.6); L.a.lineTo(r.x + r.w, y + step); L.a.lineTo(r.x, y + step * 0.4); L.a.closePath(); L.a.fill();
      L.h.fillStyle = grey(i % 2 ? 0.62 : 0.38);
      L.h.beginPath(); L.h.moveTo(r.x, y); L.h.lineTo(r.x + r.w, y + step * 0.6); L.h.lineTo(r.x + r.w, y + step); L.h.lineTo(r.x, y + step * 0.4); L.h.closePath(); L.h.fill();
    }
  }
}

// ── ATLAS + MATERIAL ─────────────────────────────────────────────────────────

let material: THREE.MeshStandardMaterial | null = null;
const textures: THREE.Texture[] = [];
let atlasSize = 2048;

/** Atlas resolution (call before the first getItemMaterial): 2048 on Medium+, 1024 below. */
export function setItemAtlasQuality(high: boolean): void {
  if (material) return;
  atlasSize = high ? 2048 : 1024;
}

function buildAtlas(): THREE.MeshStandardMaterial {
  const size = atlasSize;
  const mk = (s: number) => { const c = document.createElement('canvas'); c.width = c.height = s; return c; };
  const ca = mk(size), co = mk(size), ch = mk(size), ce = mk(Math.max(256, size / 4));
  const L: Layers = {
    a: ca.getContext('2d')!, o: co.getContext('2d')!, h: ch.getContext('2d')!, e: ce.getContext('2d')!,
    S: size / GRID,
  };
  // The emissive layer is lower-res: draw it in atlas coordinates, scaled.
  L.e.setTransform(ce.width / size, 0, 0, ce.width / size, 0, 0);
  // Neutral defaults everywhere (unused cells stay mid-grey dielectric).
  L.a.fillStyle = '#808080'; L.a.fillRect(0, 0, size, size);
  L.o.fillStyle = orm(0.7, 0); L.o.fillRect(0, 0, size, size);
  L.h.fillStyle = grey(0.5); L.h.fillRect(0, 0, size, size);
  L.e.fillStyle = '#000'; L.e.fillRect(0, 0, size, size);

  const rnd = prng(0x1fe75);
  paintBaseMaterials(L, rnd);
  paintCrate(L, rnd);
  paintChute(L, rnd);
  paintStrapAndPallet(L, rnd);
  paintCrateLabels(L, rnd);
  paintItemLabels(L, rnd);

  const map = new THREE.CanvasTexture(ca);
  map.colorSpace = THREE.SRGBColorSpace;
  const ormTex = new THREE.CanvasTexture(co);
  // The Sobel runs at half resolution — normal detail reads at a coarser
  // scale than print, and it halves the bake cost.
  const hs = Math.max(512, size / 2);
  const chHalf = mk(hs);
  chHalf.getContext('2d')!.drawImage(ch, 0, 0, hs, hs);
  const normal = heightToNormal(chHalf, size >= 2048 ? 3.2 : 2.4);
  const emissive = new THREE.CanvasTexture(ce);
  emissive.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, ormTex, normal, emissive]) {
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    textures.push(t);
  }
  const m = new THREE.MeshStandardMaterial({
    map,
    roughnessMap: ormTex,
    metalnessMap: ormTex,
    normalMap: normal,
    normalScale: new THREE.Vector2(1, 1),
    emissiveMap: emissive,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 1.6,
    roughness: 1,
    metalness: 1,
    envMapIntensity: 1.05,
  });
  m.name = 'itemAtlas';
  return m;
}

/** THE shared material for every pickup / grenade / airdrop part. */
export function getItemMaterial(): THREE.MeshStandardMaterial {
  if (!material) material = buildAtlas();
  return material;
}

// ── GEOMETRY BUILDER ─────────────────────────────────────────────────────────

/** Remap a geometry's 0..1 UVs into an atlas cell (with a mip-safe gutter). */
function toCell(g: THREE.BufferGeometry, cell: Cell): THREE.BufferGeometry {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const gut = 0.04;
  const u0 = (cell[0] + gut) / GRID, u1 = (cell[0] + cell[2] - gut) / GRID;
  const v0 = 1 - (cell[1] + cell[3] - gut) / GRID, v1 = 1 - (cell[1] + gut) / GRID;
  for (let i = 0; i < uv.count; i++) {
    const u = THREE.MathUtils.clamp(uv.getX(i), 0, 1), v = THREE.MathUtils.clamp(uv.getY(i), 0, 1);
    uv.setXY(i, u0 + u * (u1 - u0), v0 + v * (v1 - v0));
  }
  uv.needsUpdate = true;
  return g;
}

interface Xf { p?: [number, number, number]; r?: [number, number, number]; s?: [number, number, number] }
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _sv = new THREE.Vector3();

function place(g: THREE.BufferGeometry, xf: Xf = {}): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  if (ng !== g) g.dispose();
  for (const name of Object.keys(ng.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') ng.deleteAttribute(name);
  }
  ng.clearGroups();
  _q.setFromEuler(_e.set(...(xf.r ?? [0, 0, 0])));
  _m4.compose(_v.set(...(xf.p ?? [0, 0, 0])), _q, _sv.set(...(xf.s ?? [1, 1, 1])));
  ng.applyMatrix4(_m4);
  return ng;
}

/** A small builder that accumulates parts and merges them into one geometry. */
class Item {
  private parts: THREE.BufferGeometry[] = [];
  box(w: number, h: number, d: number, cell: Cell, xf?: Xf, radius = 0.02, seg = 1): this {
    const r = Math.min(radius, Math.min(w, h, d) / 2 - 1e-4);
    const g = r > 0.002 ? new RoundedBoxGeometry(w, h, d, seg, r) : new THREE.BoxGeometry(w, h, d);
    this.parts.push(place(toCell(g, cell), xf));
    return this;
  }
  cyl(rTop: number, rBot: number, h: number, cell: Cell, xf?: Xf, radial = 20, open = false): this {
    this.parts.push(place(toCell(new THREE.CylinderGeometry(rTop, rBot, h, radial, 1, open), cell), xf));
    return this;
  }
  sphere(r: number, cell: Cell, xf?: Xf, w = 20, h = 14, thetaStart = 0, thetaLen = Math.PI): this {
    this.parts.push(place(toCell(new THREE.SphereGeometry(r, w, h, 0, Math.PI * 2, thetaStart, thetaLen), cell), xf));
    return this;
  }
  torus(R: number, r: number, cell: Cell, xf?: Xf, arc = Math.PI * 2, rs = 10, ts = 28): this {
    this.parts.push(place(toCell(new THREE.TorusGeometry(R, r, rs, ts, arc), cell), xf));
    return this;
  }
  /** A flat decal plane (faces +Z before the transform). */
  decal(w: number, h: number, cell: Cell, xf?: Xf): this {
    this.parts.push(place(toCell(new THREE.PlaneGeometry(w, h), cell), xf));
    return this;
  }
  build(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.parts, false) ?? this.parts[0];
    if (merged !== this.parts[0]) for (const p of this.parts) p.dispose();
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  }
}

// ── ITEM MODELS ──────────────────────────────────────────────────────────────

/** Every throwable kind (kept under the old name — grenades came first). */
export type GrenadeKind = ThrowableKind;
export type ItemModelId =
  | 'health' | 'ammo' | 'speed' | 'damage' | 'shield' | 'infinite_ammo' | 'overcharge'
  | 'phantom' | 'cryo' | 'tesla' | 'shockwave' | 'nuke'
  | `grenade_${ThrowableKind}` | 'grenade_pin';

/** Throwables authored at REAL scale (a grenade's radius ≈ 0.12 u ≈ 4 cm); pickups and the viewmodel scale them. */
function buildGrenade(kind: GrenadeKind, withPin: boolean): THREE.BufferGeometry {
  const it = new Item();
  // Kinds that are armed by pulling a pin carry the spoon + ring.
  const pinned = kind === 'frag' || kind === 'emp' || kind === 'thermite';
  const topY = 0.16;
  let sideX = 0.09;
  switch (kind) {
    case 'frag':
      it.sphere(0.12, C.fragBody, { s: [1, 1.08, 1] }, 22, 16);
      it.cyl(0.046, 0.05, 0.05, C.darkSteel, { p: [0, 0.135, 0] }, 14);      // fuze body
      it.cyl(0.034, 0.04, 0.03, C.darkSteel, { p: [0, 0.17, 0] }, 12);       // striker housing
      sideX = 0.118;
      break;
    case 'emp':
      it.cyl(0.085, 0.085, 0.26, C.empLabel, { r: [0, Math.PI, 0] }, 22);
      it.cyl(0.088, 0.088, 0.02, C.ledBlue, { p: [0, 0.07, 0] }, 22);       // pulse ring
      it.cyl(0.07, 0.085, 0.03, C.darkSteel, { p: [0, -0.145, 0] }, 20);
      it.cyl(0.05, 0.06, 0.05, C.knurl, { p: [0, 0.15, 0] }, 16);           // twist-arm collar
      break;
    case 'thermite':
      it.cyl(0.08, 0.08, 0.24, C.thermLabel, { r: [0, Math.PI, 0] }, 22);
      it.cyl(0.064, 0.08, 0.03, C.darkSteel, { p: [0, -0.135, 0] }, 20);
      it.cyl(0.046, 0.058, 0.04, C.darkSteel, { p: [0, 0.14, 0] }, 14);
      break;
    case 'hijack':
      // HJK-7 intrusion spike, tip DOWN (−Y): the flight + stick code aim −Y
      // along the throw. Tungsten penetrator → hex body with the lit lattice →
      // azure status band → finned tail cap with the arming button.
      it.cyl(0.026, 0.002, 0.1, C.steel, { p: [0, -0.14, 0] }, 12);           // penetrator tip
      it.cyl(0.03, 0.026, 0.022, C.darkSteel, { p: [0, -0.08, 0] }, 6);       // collar
      it.cyl(0.032, 0.032, 0.15, C.hijackLabel, { r: [0, Math.PI / 6, 0] }, 6); // hex body
      it.cyl(0.0345, 0.0345, 0.014, C.ledBlue, { p: [0, 0.035, 0] }, 6);     // status band
      it.cyl(0.028, 0.032, 0.03, C.darkSteel, { p: [0, 0.09, 0] }, 6);        // tail cap
      for (let k = 0; k < 3; k++) {                                          // stabiliser fins
        const a = (k / 3) * Math.PI * 2;
        it.box(0.004, 0.07, 0.045, C.blackPoly, { p: [Math.cos(a) * 0.04, 0.08, Math.sin(a) * 0.04], r: [0, -a, 0] }, 0.0015);
      }
      it.cyl(0.011, 0.011, 0.012, C.ledBlue, { p: [0, 0.111, 0] }, 10);      // arming button
      break;
    case 'sticky':
      // A wrapped M112 block, adhesive pad underneath, timer-detonator on top.
      it.box(0.2, 0.08, 0.13, C.c4Label, {}, 0.012);
      it.box(0.21, 0.012, 0.14, C.c4Putty, { p: [0, -0.046, 0] }, 0.005);   // tacky face
      it.box(0.07, 0.035, 0.06, C.blackPoly, { p: [0.03, 0.058, 0] }, 0.008);
      it.box(0.022, 0.012, 0.022, C.ledRed, { p: [0.045, 0.08, 0.012] }, 0.004);
      it.cyl(0.008, 0.008, 0.06, C.brass, { p: [-0.025, 0.06, 0], r: [0, 0, Math.PI / 2] }, 6); // blasting cap
      it.torus(0.03, 0.005, C.redPaint, { p: [-0.07, 0.05, 0], r: [Math.PI / 2, 0, 0] }, Math.PI * 1.4, 6, 14); // lead
      break;
    case 'decoy':
      it.cyl(0.07, 0.075, 0.2, C.decoyLabel, { r: [0, -Math.PI / 2, 0] }, 20);
      it.cyl(0.075, 0.07, 0.03, C.blackPoly, { p: [0, -0.115, 0] }, 20);
      it.cyl(0.06, 0.07, 0.03, C.blackPoly, { p: [0, 0.115, 0] }, 20);
      it.cyl(0.006, 0.009, 0.18, C.darkSteel, { p: [0.03, 0.2, 0] }, 6);    // whip antenna
      it.sphere(0.012, C.ledGreen, { p: [0.03, 0.29, 0] }, 8, 6);
      it.box(0.03, 0.02, 0.02, C.steel, { p: [-0.03, 0.135, 0] }, 0.004);   // power switch
      break;
    case 'knife':
      // Balanced one-piece thrower: spear-point blade, paracord-wrapped grip.
      it.box(0.022, 0.2, 0.006, C.knifeBlade, { p: [0, 0.07, 0] }, 0.002);
      it.box(0.016, 0.05, 0.005, C.knifeBlade, { p: [0, 0.19, 0], r: [0, 0, Math.PI / 4] }, 0.0015);
      it.box(0.05, 0.012, 0.012, C.darkSteel, { p: [0, -0.035, 0] }, 0.003);  // guard
      it.cyl(0.013, 0.012, 0.12, C.paracord, { p: [0, -0.1, 0] }, 10);
      it.cyl(0.015, 0.015, 0.012, C.darkSteel, { p: [0, -0.165, 0] }, 10);    // pommel
      break;
  }
  if (pinned) {
    // The spoon (safety lever) down the side + its curl at the fuze.
    it.box(0.026, 0.2, 0.012, C.steel, { p: [sideX, topY - 0.11, 0], r: [0, 0, 0.12] }, 0.004);
    it.box(0.06, 0.02, 0.026, C.steel, { p: [sideX * 0.55, topY + 0.01, 0], r: [0, 0, -0.35] }, 0.004);
    if (withPin) {
      it.torus(0.03, 0.005, C.steel, { p: [-0.035, topY + 0.01, 0.045], r: [0, 0.4, 0] }, Math.PI * 2, 6, 18);
      it.cyl(0.004, 0.004, 0.09, C.steel, { p: [0, topY - 0.005, 0.01], r: [Math.PI / 2, 0, 0] }, 6);
    }
  }
  return it.build();
}

function buildPin(): THREE.BufferGeometry {
  return new Item()
    .torus(0.03, 0.005, C.steel, { r: [0, 0, 0] }, Math.PI * 2, 6, 18)
    .cyl(0.004, 0.004, 0.08, C.steel, { p: [0.03, 0, 0], r: [0, 0, Math.PI / 2] }, 6)
    .build();
}

const builders: Record<ItemModelId, () => THREE.BufferGeometry> = {
  // Hard-shell first-aid case.
  health: () => new Item()
    .box(1.0, 0.62, 0.34, C.whitePlastic, {}, 0.07, 2)
    .box(1.02, 0.035, 0.36, C.blackPoly, { p: [0, 0.07, 0] }, 0.012)              // lid seam
    .decal(0.5, 0.5, C.medCross, { p: [0, -0.04, 0.172] })
    .decal(0.62, 0.42, C.medkitBack, { p: [0, -0.04, -0.172], r: [0, Math.PI, 0] })
    .box(0.08, 0.06, 0.05, C.steel, { p: [-0.3, 0.07, 0.18] }, 0.01)              // latches
    .box(0.08, 0.06, 0.05, C.steel, { p: [0.3, 0.07, 0.18] }, 0.01)
    .box(0.05, 0.12, 0.08, C.blackPoly, { p: [-0.17, 0.36, 0] }, 0.015)            // handle posts
    .box(0.05, 0.12, 0.08, C.blackPoly, { p: [0.17, 0.36, 0] }, 0.015)
    .box(0.4, 0.05, 0.09, C.rubber, { p: [0, 0.43, 0] }, 0.022)                    // grip
    .box(0.06, 0.4, 0.03, C.darkSteel, { p: [-0.5, -0.02, 0], r: [0, 0, 0] }, 0.01) // hinge
    .build(),
  // M2A1 ammunition can.
  ammo: () => new Item()
    .box(0.92, 0.6, 0.4, C.odPaint, {}, 0.025, 1)
    .decal(0.86, 0.29, C.ammoSide, { p: [0, -0.03, 0.202] })
    .decal(0.86, 0.29, C.ammoSide, { p: [0, -0.03, -0.202], r: [0, Math.PI, 0] })
    .box(0.96, 0.09, 0.44, C.odPaint, { p: [0, 0.34, 0] }, 0.02)                  // lid
    .box(0.98, 0.03, 0.46, C.darkSteel, { p: [0, 0.29, 0] }, 0.01)                // gasket lip
    .box(0.05, 0.06, 0.05, C.blackPoly, { p: [-0.18, 0.41, 0] }, 0.01)            // handle mounts
    .box(0.05, 0.06, 0.05, C.blackPoly, { p: [0.18, 0.41, 0] }, 0.01)
    .box(0.42, 0.035, 0.07, C.blackPoly, { p: [0, 0.44, 0] }, 0.015)              // folding handle
    .box(0.06, 0.32, 0.16, C.darkSteel, { p: [0.49, 0.12, 0], r: [0, 0, -0.18] }, 0.015) // cam latch
    .build(),
  // Adrenaline auto-injector, tilted for silhouette.
  speed: () => new Item()
    .cyl(0.085, 0.085, 0.62, C.stimLabel, { r: [0, Math.PI / 2, 0] }, 24)
    .cyl(0.09, 0.08, 0.16, C.orangePaint, { p: [0, -0.39, 0] }, 24)               // needle-end cap
    .cyl(0.06, 0.09, 0.03, C.orangePaint, { p: [0, -0.485, 0] }, 24)
    .cyl(0.06, 0.06, 0.08, C.bluePaint, { p: [0, 0.35, 0] }, 20)                  // safety release
    .cyl(0.035, 0.05, 0.05, C.bluePaint, { p: [0, 0.415, 0] }, 16)
    .torus(0.088, 0.008, C.blackPoly, { p: [0, 0.31, 0], r: [Math.PI / 2, 0, 0] })
    .build(),
  // Curved AP rifle magazine with red-tipped rounds in the feed lips.
  damage: () => {
    const it = new Item();
    const segs = 4;
    for (let i = 0; i < segs; i++) {
      const t = i / (segs - 1);
      it.box(0.36, 0.26, 0.11, C.magSide, { p: [t * 0.12, 0.3 - i * 0.24, 0], r: [0, 0, -0.08 - t * 0.12] }, 0.012);
    }
    it.box(0.4, 0.07, 0.13, C.blackPoly, { p: [0.15, -0.46, 0], r: [0, 0, -0.2] }, 0.02); // floor plate
    // Rounds: brass case + red-tipped projectile.
    for (const [x, z] of [[-0.06, 0.02], [0.06, -0.02]]) {
      it.cyl(0.03, 0.03, 0.26, C.brass, { p: [x, 0.47, z], r: [0, 0, Math.PI / 2] }, 12);
      it.cyl(0.004, 0.026, 0.11, C.redTip, { p: [x + 0.185, 0.47, z], r: [0, 0, -Math.PI / 2] }, 12);
    }
    return it.build();
  },
  // Plate carrier: front plate bag, mag pouches, shoulder straps, back panel.
  shield: () => new Item()
    .box(0.84, 0.96, 0.14, C.vestFront, { p: [0, 0, 0.12] }, 0.06, 2)
    .box(0.82, 0.92, 0.1, C.canvas, { p: [0, 0, -0.16] }, 0.05, 1)
    .box(0.17, 0.36, 0.36, C.canvas, { p: [-0.27, 0.56, -0.02] }, 0.05)            // shoulder straps
    .box(0.17, 0.36, 0.36, C.canvas, { p: [0.27, 0.56, -0.02] }, 0.05)
    .box(0.06, 0.62, 0.3, C.webbing, { p: [-0.44, -0.14, -0.02] }, 0.02)          // cummerbund
    .box(0.06, 0.62, 0.3, C.webbing, { p: [0.44, -0.14, -0.02] }, 0.02)
    .box(0.22, 0.27, 0.11, C.pouch, { p: [-0.25, -0.26, 0.24] }, 0.03)            // triple mag pouch
    .box(0.22, 0.27, 0.11, C.pouch, { p: [0, -0.26, 0.24] }, 0.03)
    .box(0.22, 0.27, 0.11, C.pouch, { p: [0.25, -0.26, 0.24] }, 0.03)
    .box(0.3, 0.08, 0.06, C.webbing, { p: [0, 0.42, 0.2] }, 0.02)                 // drag handle
    .build(),
  // Twin-drum magazine.
  infinite_ammo: () => new Item()
    .cyl(0.27, 0.27, 0.2, C.cmagSide, { p: [-0.29, 0, 0], r: [Math.PI / 2, 0, 0] }, 28)
    .cyl(0.27, 0.27, 0.2, C.cmagSide, { p: [0.29, 0, 0], r: [Math.PI / 2, 0, 0] }, 28)
    .cyl(0.2, 0.2, 0.22, C.ribbed, { p: [-0.29, 0, 0], r: [Math.PI / 2, 0, 0] }, 24)
    .cyl(0.2, 0.2, 0.22, C.ribbed, { p: [0.29, 0, 0], r: [Math.PI / 2, 0, 0] }, 24)
    .box(0.24, 0.5, 0.15, C.gunmetal, { p: [0, 0.2, 0] }, 0.02)                   // feed tower
    .cyl(0.028, 0.028, 0.2, C.brass, { p: [0, 0.47, 0.02], r: [0, 0, Math.PI / 2] }, 10)
    .cyl(0.004, 0.022, 0.08, C.brass, { p: [0.14, 0.47, 0.02], r: [0, 0, -Math.PI / 2] }, 10)
    .cyl(0.06, 0.06, 0.06, C.knurl, { p: [-0.29, 0, 0.13], r: [Math.PI / 2, 0, 0] }, 16) // winding knobs
    .cyl(0.06, 0.06, 0.06, C.knurl, { p: [0.29, 0, 0.13], r: [Math.PI / 2, 0, 0] }, 16)
    .build(),
  // High-voltage power cell.
  overcharge: () => new Item()
    .box(0.62, 0.82, 0.42, C.gunmetal, {}, 0.05, 2)
    .decal(0.58, 0.19, C.batteryLabel, { p: [0, 0.05, 0.212], s: [1, 2.6, 1] })
    .box(0.66, 0.06, 0.46, C.blackPoly, { p: [0, 0.38, 0] }, 0.02)
    .cyl(0.05, 0.05, 0.1, C.copper, { p: [-0.16, 0.46, 0.06] }, 14)               // terminals
    .cyl(0.055, 0.055, 0.05, C.redPaint, { p: [-0.16, 0.53, 0.06] }, 14)
    .cyl(0.05, 0.05, 0.1, C.copper, { p: [0.16, 0.46, 0.06] }, 14)
    .cyl(0.055, 0.055, 0.05, C.blackPoly, { p: [0.16, 0.53, 0.06] }, 14)
    .box(0.36, 0.04, 0.06, C.darkSteel, { p: [0, 0.5, -0.12] }, 0.015)            // carry bar
    .box(0.05, 0.08, 0.05, C.darkSteel, { p: [-0.16, 0.45, -0.12] }, 0.01)
    .box(0.05, 0.08, 0.05, C.darkSteel, { p: [0.16, 0.45, -0.12] }, 0.01)
    .box(0.06, 0.62, 0.02, C.ledAmber, { p: [0.33, 0.0, 0.1] }, 0.006)            // charge strip
    .build(),
  // ECM signature suppressor.
  phantom: () => new Item()
    .box(0.72, 0.4, 0.3, C.blackPoly, {}, 0.04, 2)
    .decal(0.66, 0.33, C.ecmFace, { p: [0, 0, 0.152] })
    .box(0.74, 0.08, 0.32, C.knurl, { p: [0, -0.22, 0] }, 0.02)
    .cyl(0.012, 0.018, 0.38, C.darkSteel, { p: [-0.24, 0.38, -0.06] }, 8)          // antennas
    .cyl(0.012, 0.018, 0.3, C.darkSteel, { p: [0, 0.34, -0.08] }, 8)
    .cyl(0.012, 0.018, 0.42, C.darkSteel, { p: [0.24, 0.4, -0.06] }, 8)
    .sphere(0.022, C.ledPurple, { p: [-0.24, 0.58, -0.06] }, 8, 6)
    .cyl(0.07, 0.08, 0.05, C.glass, { p: [0.22, 0.04, 0.17], r: [Math.PI / 2, 0, 0] }, 18) // emitter lens
    .torus(0.08, 0.012, C.ledPurple, { p: [0.22, 0.04, 0.19] })
    .build(),
  // Liquid-nitrogen dewar.
  cryo: () => new Item()
    .cyl(0.28, 0.28, 0.66, C.frost, {}, 30)
    .cyl(0.284, 0.284, 0.26, C.dewarLabel, { r: [0, -Math.PI / 2, 0] }, 30, true)
    .sphere(0.28, C.frost, { p: [0, 0.33, 0], s: [1, 0.42, 1] }, 30, 10, 0, Math.PI / 2)
    .cyl(0.26, 0.24, 0.05, C.darkSteel, { p: [0, -0.355, 0] }, 28)
    .cyl(0.05, 0.06, 0.1, C.brass, { p: [0, 0.48, 0] }, 14)                       // valve
    .cyl(0.012, 0.012, 0.18, C.brass, { p: [0, 0.53, 0], r: [0, 0, Math.PI / 2] }, 8)
    .cyl(0.06, 0.06, 0.03, C.whitePlastic, { p: [0.12, 0.45, 0.04], r: [Math.PI / 2, 0, 0] }, 16) // gauge
    .torus(0.11, 0.018, C.steel, { p: [-0.3, 0.12, 0], r: [0, Math.PI / 2, 0] }, Math.PI, 8, 16)
    .torus(0.11, 0.018, C.steel, { p: [0.3, 0.12, 0], r: [0, -Math.PI / 2, 0] }, Math.PI, 8, 16)
    .build(),
  // Tesla coil capacitor.
  tesla: () => new Item()
    .cyl(0.34, 0.36, 0.14, C.blackPoly, { p: [0, -0.32, 0] }, 28)
    .cyl(0.345, 0.345, 0.06, C.teslaLabel, { p: [0, -0.32, 0], r: [0, Math.PI / 2, 0] }, 28, true)
    .cyl(0.15, 0.17, 0.54, C.coil, { p: [0, 0.02, 0] }, 26)
    .cyl(0.04, 0.04, 0.16, C.aluminum, { p: [0, 0.34, 0] }, 12)
    .torus(0.2, 0.075, C.aluminum, { p: [0, 0.43, 0], r: [Math.PI / 2, 0, 0] }, Math.PI * 2, 14, 32)
    .torus(0.36, 0.01, C.ledBlue, { p: [0, -0.24, 0], r: [Math.PI / 2, 0, 0] })
    .build(),
  // Kinetic charge puck.
  shockwave: () => new Item()
    .cyl(0.42, 0.44, 0.16, C.yellowPaint, {}, 36)
    .cyl(0.42, 0.42, 0.005, C.kineticTop, { p: [0, 0.083, 0] }, 36)
    .cyl(0.2, 0.26, 0.09, C.steel, { p: [0, 0.13, 0] }, 28)
    .sphere(0.16, C.darkSteel, { p: [0, 0.17, 0], s: [1, 0.45, 1] }, 24, 8, 0, Math.PI / 2)
    .torus(0.43, 0.022, C.darkSteel, { p: [0, -0.05, 0], r: [Math.PI / 2, 0, 0] }, Math.PI * 2, 8, 40)
    .box(0.05, 0.05, 0.08, C.ledRed, { p: [0.3, 0.1, 0.18] }, 0.01)
    .build(),
  // Radioisotope container.
  nuke: () => new Item()
    .cyl(0.3, 0.3, 0.72, C.yellowPaint, {}, 30)
    .cyl(0.304, 0.304, 0.3, C.radLabel, { r: [0, -Math.PI / 2, 0] }, 30, true)
    .cyl(0.31, 0.31, 0.04, C.darkSteel, { p: [0, 0.25, 0] }, 30)
    .cyl(0.31, 0.31, 0.04, C.darkSteel, { p: [0, -0.25, 0] }, 30)
    .cyl(0.28, 0.3, 0.06, C.darkSteel, { p: [0, 0.39, 0] }, 30)                    // lid
    .torus(0.12, 0.018, C.steel, { p: [0, 0.44, 0] }, Math.PI, 8, 16)
    .cyl(0.035, 0.035, 0.04, C.ledGreen, { p: [0.16, 0.43, 0.12] }, 10)
    .build(),
  grenade_frag: () => buildGrenade('frag', true),
  grenade_emp: () => buildGrenade('emp', true),
  grenade_thermite: () => buildGrenade('thermite', true),
  grenade_hijack: () => buildGrenade('hijack', true),
  grenade_sticky: () => buildGrenade('sticky', true),
  grenade_decoy: () => buildGrenade('decoy', true),
  grenade_knife: () => buildGrenade('knife', true),
  grenade_pin: () => buildPin(),
};

const geoCache = new Map<string, THREE.BufferGeometry>();

/** Merged, centred geometry for an item (cached for the session). */
export function getItemGeometry(id: ItemModelId): THREE.BufferGeometry {
  let g = geoCache.get(id);
  if (!g) {
    g = builders[id]();
    // Centre on the bounding box so a pickup turns about its own middle.
    const bb = g.boundingBox!;
    g.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    geoCache.set(id, g);
  }
  return g;
}

/** A thrown grenade without its pin (the in-flight / world model). */
export function getThrownGrenadeGeometry(kind: GrenadeKind): THREE.BufferGeometry {
  const key = `thrown_${kind}`;
  let g = geoCache.get(key);
  if (!g) { g = buildGrenade(kind, false); geoCache.set(key, g); }
  return g;
}

// ── AIRDROP PARTS ────────────────────────────────────────────────────────────

/** Crate body + battens + brackets + straps + pallet (crate centre at origin). */
export function getAirdropCrateGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const key = `crate_${w}_${h}_${d}`;
  let g = geoCache.get(key);
  if (g) return g;
  const it = new Item();
  it.box(w, h, d, C.crate, {}, 0.03, 1);
  // Top deck decal + edge battens.
  it.decal(w * 0.98, d * 0.98, C.crateTop, { p: [0, h / 2 + 0.004, 0], r: [-Math.PI / 2, 0, 0] });
  const bt = 0.09;
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) it.box(w + 0.04, bt, bt, C.plywood, { p: [0, sy * (h / 2 - bt / 2 + 0.02), sz * (d / 2 - bt / 2 + 0.02)] }, 0.012);
    for (const sx of [-1, 1]) it.box(bt, bt, d + 0.04, C.plywood, { p: [sx * (w / 2 - bt / 2 + 0.02), sy * (h / 2 - bt / 2 + 0.02), 0] }, 0.012);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    it.box(bt, h + 0.04, bt, C.plywood, { p: [sx * (w / 2 - bt / 2 + 0.02), 0, sz * (d / 2 - bt / 2 + 0.02)] }, 0.012);
    // Steel corner brackets top + bottom.
    for (const sy of [-1, 1]) it.box(0.16, 0.16, 0.16, C.darkSteel, { p: [sx * (w / 2 + 0.015), sy * (h / 2 + 0.015), sz * (d / 2 + 0.015)] }, 0.025);
  }
  // Two cargo straps wrapping the crate around X.
  for (const sx of [-w * 0.28, w * 0.28]) {
    it.box(0.14, 0.012, d + 0.07, C.strap, { p: [sx, h / 2 + 0.03, 0] }, 0.004);
    it.box(0.14, h + 0.07, 0.012, C.strap, { p: [sx, 0, d / 2 + 0.03] }, 0.004);
    it.box(0.14, h + 0.07, 0.012, C.strap, { p: [sx, 0, -d / 2 - 0.03] }, 0.004);
    it.box(0.12, 0.08, 0.04, C.steel, { p: [sx, h * 0.15, d / 2 + 0.05] }, 0.01);   // ratchet buckle
  }
  // Pallet: three skids + deck boards.
  const py = -h / 2 - 0.12;
  for (const sz of [-d * 0.38, 0, d * 0.38]) it.box(w * 1.04, 0.14, 0.16, C.pallet, { p: [0, py - 0.06, sz] }, 0.012);
  for (let i = 0; i < 6; i++) {
    const x = -w * 0.48 + (i / 5) * w * 0.96;
    it.box(0.2, 0.05, d * 1.04, C.pallet, { p: [x, py + 0.035, 0] }, 0.01);
  }
  g = it.build();
  geoCache.set(key, g);
  return g;
}

/** A stencilled label plate for an airdrop reward (faces +Z). */
export function getCrateLabelGeometry(id: CrateLabelId, w: number): THREE.BufferGeometry {
  const key = `label_${id}_${w}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new Item().box(w, w * 0.5, 0.025, crateLabelCell(id), {}, 0.008).build();
    geoCache.set(key, g);
  }
  return g;
}

/** Parachute canopy (gored nylon dome) with its skirt at y = 0, opening downward. */
export function getChuteGeometry(radius: number): THREE.BufferGeometry {
  const key = `chute_${radius}`;
  let g = geoCache.get(key);
  if (!g) {
    const it = new Item();
    it.sphere(radius, C.chute, { s: [1, 0.55, 1] }, 28, 10, 0, Math.PI * 0.46);
    // Vent hole rim at the crown.
    it.torus(radius * 0.12, 0.03, C.nylonOD, { p: [0, radius * 0.55, 0], r: [Math.PI / 2, 0, 0] }, Math.PI * 2, 6, 18);
    g = it.build();
    // Skirt to y = 0.
    const bb = g.boundingBox!;
    g.translate(0, -bb.min.y, 0);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    geoCache.set(key, g);
  }
  return g;
}

/** A unit suspension line (length 1 along +Y from the origin). */
export function getLineGeometry(): THREE.BufferGeometry {
  let g = geoCache.get('line');
  if (!g) {
    g = new Item().cyl(0.012, 0.012, 1, C.webbing, { p: [0, 0.5, 0] }, 5).build();
    geoCache.set('line', g);
  }
  return g;
}

/** Free every cached geometry and the atlas (scene teardown only). */
export function disposeItemAtlas(): void {
  geoCache.forEach((g) => g.dispose());
  geoCache.clear();
  textures.forEach((t) => t.dispose());
  textures.length = 0;
  material?.dispose();
  material = null;
}
