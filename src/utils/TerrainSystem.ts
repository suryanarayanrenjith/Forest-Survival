/**
 * TERRAIN SYSTEM — Forest Survival
 *
 * Turns the previously DEAD-FLAT ground plane into a believable, AAA-grade
 * landscape with:
 *
 *   • GPU vertex displacement — rolling hills, indentations, bumps and ridges
 *     sampled from a seeded, precision-stable height field (different every run,
 *     "Minecraft-style" world variety) that is locked to WORLD space so the
 *     terrain doesn't swim as the camera-following ground plane recenters.
 *
 *   • A PLAYER-RELATIVE FLAT ZONE — the displacement is multiplied by a radial
 *     envelope that is ~0 within `flatRadius` of the player and ramps to full
 *     only out in the fogged mid/far field. The combat arena the player and
 *     enemies actually fight in therefore stays perfectly flat (y == 0), so the
 *     entire gameplay/VFX layer is untouched and nothing floats or clips. The
 *     undulation lives where the eye reads "terrain" (the horizon/mid-ground)
 *     and where fog hides any parallax against world props.
 *
 *   • Ultra-detailed procedural ground material — macro earth-tone patches,
 *     cavity ambient-occlusion, micro grain, slope→rock (talus) blending, and
 *     per-pixel normal-mapped micro-relief, PLUS a per-map IDENTITY layer:
 *     sand ripples, snow drift + sparkle, lava cracks, wet swamp puddles, etc.
 *
 * The height field is intentionally built from band-limited TRIG (not a
 * fract()/sin-hash) so it evaluates to the same value in JS (float64) and on
 * the GPU (float32) to sub-millimetre precision — important if gameplay ever
 * needs to sample it. The high-frequency "noisy" realism is added per-pixel in
 * the fragment shader where an exact CPU match is irrelevant.
 *
 * Everything here is injected into a standard `MeshStandardMaterial` through
 * `onBeforeCompile`, so three.js's full PBR + shadow + fog path stays intact.
 */

import * as THREE from 'three';
import type { MapConfig } from './MapSystem';
import { BAKED_NOISE_GLSL, getNoiseGradientTexture, getNoiseTexture } from './NoiseTextures';

// ── Per-map terrain authoring input (lives on MapConfig.terrain) ────────────
export interface TerrainProfileInput {
  /** Peak macro undulation height in world units (hills/valleys). */
  amplitude?: number;
  /** Base spatial frequency (≈ 1 / wavelength). Smaller = broader hills. */
  frequency?: number;
  /** 0..1 — biases the field toward sharp ridges/dunes/canyon walls. */
  ridginess?: number;
  /** Inner radius (m) kept perfectly flat around the player. */
  flatRadius?: number;
  /** Distance (m) over which displacement ramps from 0 → full. */
  falloff?: number;
  /** Multiplicative warm/cool macro tints (subtle, centred near 1.0). */
  macroTintA?: [number, number, number];
  macroTintB?: [number, number, number];
  /** Target colour the surface blends toward on steep slopes (talus rock). */
  rockColor?: number;
  /** Fine grain tint (additive micro grit). */
  detailColor?: [number, number, number];
  /** Micro detail frequency multiplier. */
  detailScale?: number;
  /** Directional ripple identity (sand dunes / snow drift). */
  rippleDir?: [number, number];
  rippleScale?: number;
  rippleStrength?: number;
  /** View-dependent glint (snow / sand). */
  sparkle?: number;
  /** Wet sheen + dark puddle pooling (swamp / rain). */
  wetness?: number;
  /** 0..1 — GLOBAL standing-water coverage (the toxic swamp's drowned bog).
   *  Reuses the exact rain-puddle shading stack (dark water body + fresnel
   *  PMREM mirror reflection + animated ripples + tight sun glint) but floods
   *  the WHOLE floor, leaving only noise-raised silt banks dry. */
  swampWater?: number;
  /** Water-body tint for the global bog (toxic green, black-water, etc.). */
  waterColor?: number;
  /** Emissive crack veins (lava). */
  crackGlow?: number;
  crackColor?: number;
  /** Near-field micro-surface family (see getGroundDetailTexture). */
  groundDetail?: GroundDetailKind;
  /** 0..1.5 — how strongly the detail tile shows (albedo + relief). */
  groundDetailStrength?: number;
  /** Multiplier the tile's secondary-material mask tints toward (straw
   *  blades, rust leaves, pale pebbles, dark mineral grains, icy crust). */
  groundDetailTint?: [number, number, number];
}

export interface ResolvedTerrainProfile {
  amplitude: number;
  frequency: number;
  ridginess: number;
  flatRadius: number;
  falloff: number;
  warpAmp: number;
  macroTintA: [number, number, number];
  macroTintB: [number, number, number];
  rockColor: number;
  detailColor: [number, number, number];
  detailScale: number;
  rippleDir: [number, number];
  rippleScale: number;
  rippleStrength: number;
  sparkle: number;
  wetness: number;
  swampWater: number;
  waterColor: number;
  crackGlow: number;
  crackColor: number;
  groundDetail: GroundDetailKind;
  groundDetailStrength: number;
  groundDetailTint: [number, number, number];
}

// Per-family defaults for the detail tile's secondary-material tint.
const DETAIL_TINT: Record<GroundDetailKind, [number, number, number]> = {
  turf: [1.3, 1.18, 0.7],     // sun-bleached straw blades in the green
  litter: [1.5, 0.8, 0.5],    // rust-red fallen leaves
  grit: [1.3, 1.27, 1.22],    // pale pebbles on darker soil
  sand: [0.62, 0.57, 0.53],   // dark mineral grains
  snow: [0.9, 0.97, 1.08],    // blue-white wind crust
};

// Sensible neutral defaults — every map overrides the parts that give it
// character; anything omitted falls back to a grounded "earth" look.
const DEFAULTS: ResolvedTerrainProfile = {
  amplitude: 3.0,
  frequency: 0.015,
  ridginess: 0.15,
  flatRadius: 20,
  falloff: 55,
  warpAmp: 10,
  macroTintA: [1.08, 1.03, 0.93],
  macroTintB: [0.9, 0.95, 1.04],
  rockColor: 0x4a4640,
  detailColor: [1.0, 0.96, 0.88],
  detailScale: 1.0,
  rippleDir: [0.9, 0.42],
  rippleScale: 0.0,
  rippleStrength: 0.0,
  sparkle: 0.0,
  wetness: 0.0,
  swampWater: 0.0,
  waterColor: 0x2fc356,
  crackGlow: 0.0,
  crackColor: 0xff5512,
  groundDetail: 'grit',
  groundDetailStrength: 1.0,
  groundDetailTint: DETAIL_TINT.grit,
};

/** Merge a map's authored terrain block with the neutral defaults. */
export function resolveTerrainProfile(map: MapConfig): ResolvedTerrainProfile {
  const t = map.terrain ?? {};
  const frequency = t.frequency ?? DEFAULTS.frequency;
  return {
    amplitude: t.amplitude ?? DEFAULTS.amplitude,
    frequency,
    ridginess: t.ridginess ?? DEFAULTS.ridginess,
    flatRadius: t.flatRadius ?? DEFAULTS.flatRadius,
    falloff: t.falloff ?? DEFAULTS.falloff,
    // Domain-warp amount scales with the hill wavelength so warp reads the
    // same regardless of frequency.
    warpAmp: 0.15 / frequency,
    macroTintA: t.macroTintA ?? DEFAULTS.macroTintA,
    macroTintB: t.macroTintB ?? DEFAULTS.macroTintB,
    rockColor: t.rockColor ?? DEFAULTS.rockColor,
    detailColor: t.detailColor ?? DEFAULTS.detailColor,
    detailScale: t.detailScale ?? DEFAULTS.detailScale,
    rippleDir: t.rippleDir ?? DEFAULTS.rippleDir,
    rippleScale: t.rippleScale ?? DEFAULTS.rippleScale,
    rippleStrength: t.rippleStrength ?? DEFAULTS.rippleStrength,
    sparkle: t.sparkle ?? DEFAULTS.sparkle,
    wetness: t.wetness ?? DEFAULTS.wetness,
    swampWater: t.swampWater ?? DEFAULTS.swampWater,
    waterColor: t.waterColor ?? DEFAULTS.waterColor,
    crackGlow: t.crackGlow ?? DEFAULTS.crackGlow,
    crackColor: t.crackColor ?? DEFAULTS.crackColor,
    groundDetail: t.groundDetail ?? DEFAULTS.groundDetail,
    groundDetailStrength: t.groundDetailStrength ?? DEFAULTS.groundDetailStrength,
    groundDetailTint: t.groundDetailTint ?? DETAIL_TINT[t.groundDetail ?? DEFAULTS.groundDetail],
  };
}

/**
 * Per-run terrain seed. Uses crypto for uniform entropy so every playthrough
 * gets a distinct hill layout (the "truly random" world the design calls for).
 * Kept moderate so the trig arguments inside the shader stay in a range where
 * float32 sin/cos is accurate.
 */
export function createTerrainSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0] % 100000) * 0.001; // 0 .. 100
}

/**
 * Map the preset's terrainDetail to the ground-shader detail-quality scalar.
 * High/Ultra get the full extra detail stack, Medium a softened cut, the low
 * tiers exactly the pre-overhaul fragment cost (all new terms multiply to 0
 * and their texture taps sit behind uniform branches).
 */
export function terrainQualityFor(terrainDetail: number): number {
  if (terrainDetail >= 1.0) return 1.0;   // HIGH / ULTRA
  if (terrainDetail >= 0.82) return 0.55; // MEDIUM
  return 0.0;                              // LOW / ULTRA LOW
}

// Recommended ground-plane segment count for the displaced mesh, scaled by the
// graphics preset's terrainDetail. The flat near-zone needs far fewer triangles
// than the undulating far field, but a uniform grid is simplest and robust.
export function terrainSegments(terrainDetail: number): number {
  if (terrainDetail >= 1.0) return 200;   // HIGH / ULTRA
  if (terrainDetail >= 0.82) return 160;  // MEDIUM
  if (terrainDetail >= 0.50) return 112;  // LOW
  // ULTRA LOW (terrainDetail 0.40): the ground plane's displaced vertices are
  // processed every frame by the terrain vertex shader, so halving the grid
  // (~6.4k vs 12.5k quads) is a direct vertex-shader saving. The far hills read
  // a touch more faceted, but the tight fog wall + low render scale hide it.
  return 80;
}

// ── Uniform holders ─────────────────────────────────────────────────────────
// Returned to the caller so the static terrain uniforms can be created once and
// the per-frame day-cycle uniforms (uTime etc.) keep their existing wiring.
export interface TerrainUniforms {
  [name: string]: { value: number | THREE.Color | THREE.Vector2 | THREE.Vector3 | THREE.Texture };
}

/**
 * `quality` (0..1) gates the EXTRA surface-detail layers added in the graphics
 * overhaul (mid-frequency strata mottle, close-range grit octave, second
 * normal-relief octave, talus breakup). 0 = the original shader cost exactly
 * (Low / Ultra-Low pay nothing new); 1 = full AAA detail (High / Ultra).
 * Derive it from the preset's terrainDetail — see terrainQualityFor().
 */
export function createTerrainUniforms(
  profile: ResolvedTerrainProfile,
  seed: number,
  quality = 1.0,
): TerrainUniforms {
  return {
    uTQuality: { value: quality },
    uTSeed: { value: seed },
    uTAmp: { value: profile.amplitude },
    uTFreq: { value: profile.frequency },
    uTWarpAmp: { value: profile.warpAmp },
    uTRidge: { value: profile.ridginess },
    uTFlatR: { value: profile.flatRadius },
    uTFalloff: { value: profile.falloff },
    uTMacroA: { value: new THREE.Color(profile.macroTintA[0], profile.macroTintA[1], profile.macroTintA[2]) },
    uTMacroB: { value: new THREE.Color(profile.macroTintB[0], profile.macroTintB[1], profile.macroTintB[2]) },
    uTRock: { value: new THREE.Color(profile.rockColor) },
    uTDetailCol: { value: new THREE.Color(profile.detailColor[0], profile.detailColor[1], profile.detailColor[2]) },
    uTDetailScale: { value: profile.detailScale },
    uTRippleDir: { value: new THREE.Vector2(profile.rippleDir[0], profile.rippleDir[1]).normalize() },
    uTRippleScale: { value: profile.rippleScale },
    uTRippleStr: { value: profile.rippleStrength },
    uTSparkle: { value: profile.sparkle },
    uTWetness: { value: profile.wetness },
    uTSwampWater: { value: profile.swampWater },
    uTWaterCol: { value: new THREE.Color(profile.waterColor) },
    uTCrackGlow: { value: profile.crackGlow },
    uTCrackCol: { value: new THREE.Color(profile.crackColor) },
    uTDetailTex: { value: getGroundDetailTexture(profile.groundDetail) },
    uBakedNoise: { value: getNoiseTexture() },
    uBakedNoiseGrad: { value: getNoiseGradientTexture() },
    uTDetailTexStr: { value: profile.groundDetailStrength * DETAIL_STRENGTH[profile.groundDetail] },
    uTDetailNrm: { value: DETAIL_RELIEF[profile.groundDetail] },
    uTDetailTint: {
      value: new THREE.Color(profile.groundDetailTint[0], profile.groundDetailTint[1], profile.groundDetailTint[2]),
    },
  };
}

// ── GROUND DETAIL TILE ──────────────────────────────────────────────────────
// The ground shader's procedural layers are all value noise: nothing finer
// than a few centimetres and no real micro-shape, so up close the floor read as
// soft, blurry mottling (and smeared when looking down). AAA terrain solves
// this with a tiling DETAIL texture blended in near the camera. This builds one
// on the CPU, once per session and seeded (identical every run): a 512²
// tileable micro-surface per ground family, packed as
//   RG = height-field slope (−dh/du, −dh/dv), 0.5 = flat
//   B  = albedo + cavity modulation, mean-centred on 0.5
//   A  = secondary-material mask (straw / rust leaf / pebble / grain / crust)
// RG and B average to neutral down the mip chain, so the tile fades to the
// plain ground with distance on its own; mipmaps + anisotropy mean it can
// never shimmer the way sub-pixel procedural noise does.
export type GroundDetailKind = 'turf' | 'litter' | 'grit' | 'sand' | 'snow';

// Albedo/relief weight per family — sand and snow are fine-grained surfaces
// whose character should stay quiet next to their ripples and sparkle.
const DETAIL_STRENGTH: Record<GroundDetailKind, number> = {
  turf: 1.0, litter: 1.0, grit: 0.9, sand: 0.6, snow: 0.5,
};
const DETAIL_RELIEF: Record<GroundDetailKind, number> = {
  turf: 0.55, litter: 0.5, grit: 0.6, sand: 0.35, snow: 0.3,
};

const DETAIL_N = 512; // power of two: mipmaps + bit-mask wrapping
const _detailTiles = new Map<GroundDetailKind, THREE.DataTexture>();

/** Deterministic PRNG (mulberry32) so the tile is the same every session. */
function detailRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable fBm value noise in 0..1 (lattice wraps every `cells`). */
function periodicFbm(n: number, baseCells: number, octaves: number, rnd: () => number): Float32Array {
  const out = new Float32Array(n * n);
  let amp = 0.5;
  let norm = 0;
  let cells = baseCells;
  for (let o = 0; o < octaves; o++) {
    const lat = new Float32Array(cells * cells);
    for (let i = 0; i < lat.length; i++) lat[i] = rnd();
    const s = cells / n;
    for (let y = 0; y < n; y++) {
      const fy = y * s;
      const y0 = Math.floor(fy);
      let ty = fy - y0;
      ty = ty * ty * (3 - 2 * ty);
      const r0 = (y0 % cells) * cells;
      const r1 = ((y0 + 1) % cells) * cells;
      for (let x = 0; x < n; x++) {
        const fx = x * s;
        const x0 = Math.floor(fx);
        let tx = fx - x0;
        tx = tx * tx * (3 - 2 * tx);
        const c0 = x0 % cells;
        const c1 = (x0 + 1) % cells;
        const top = lat[r0 + c0] + (lat[r0 + c1] - lat[r0 + c0]) * tx;
        const bot = lat[r1 + c0] + (lat[r1 + c1] - lat[r1 + c0]) * tx;
        out[y * n + x] += (top + (bot - top) * ty) * amp;
      }
    }
    norm += amp;
    amp *= 0.5;
    cells *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

/** Wrap-aware stamping target shared by the shape painters below. */
interface DetailCanvas {
  n: number;
  h: Float32Array;   // height
  alb: Float32Array; // signed albedo modulation
  mat: Float32Array; // secondary-material mask 0..1
}

/** A tapered grass blade (or twig) lying on the ground; the tip stands proud. */
function stampBlade(
  c: DetailCanvas, cx: number, cy: number, ang: number,
  len: number, wid: number, hgt: number, tone: number, mat: number,
): void {
  const m = c.n - 1;
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const ex = cx + dx * len;
  const ey = cy + dy * len;
  const x0 = Math.floor(Math.min(cx, ex) - wid - 1);
  const x1 = Math.ceil(Math.max(cx, ex) + wid + 1);
  const y0 = Math.floor(Math.min(cy, ey) - wid - 1);
  const y1 = Math.ceil(Math.max(cy, ey) + wid + 1);
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const rx = px + 0.5 - cx;
      const ry = py + 0.5 - cy;
      const t = (rx * dx + ry * dy) / len;
      if (t < 0 || t > 1) continue;
      const w = wid * (1 - 0.85 * t);
      const d = Math.abs(ry * dx - rx * dy);
      if (d >= w) continue;
      const q = d / w;
      const v = hgt * (0.35 + 0.65 * t) * Math.sqrt(1 - q * q);
      const i = (py & m) * c.n + (px & m);
      if (v > c.h[i]) {
        c.h[i] = v;
        c.alb[i] = tone * (0.55 + 0.45 * t);
        c.mat[i] = mat * t;
      }
    }
  }
}

/** An irregular domed pebble. */
function stampPebble(
  c: DetailCanvas, cx: number, cy: number, r: number,
  hgt: number, tone: number, mat: number, rnd: () => number,
): void {
  const m = c.n - 1;
  const p1 = rnd() * 6.2832;
  const p2 = rnd() * 6.2832;
  const k1 = 0.2 * rnd();
  const k2 = 0.12 * rnd();
  const reach = Math.ceil(r * (1 + k1 + k2) + 1);
  const ix = Math.floor(cx);
  const iy = Math.floor(cy);
  for (let py = iy - reach; py <= iy + reach; py++) {
    for (let px = ix - reach; px <= ix + reach; px++) {
      const rx = px + 0.5 - cx;
      const ry = py + 0.5 - cy;
      const dist = Math.sqrt(rx * rx + ry * ry);
      const a = Math.atan2(ry, rx);
      const rr = r * (1 + k1 * Math.sin(3 * a + p1) + k2 * Math.sin(5 * a + p2));
      if (dist >= rr) continue;
      const q = dist / rr;
      const v = hgt * Math.sqrt(1 - q * q);
      const i = (py & m) * c.n + (px & m);
      if (v > c.h[i]) {
        c.h[i] = v;
        c.alb[i] = tone + 0.25 * (1 - q); // sunlit crown, darker rim
        c.mat[i] = mat;
      }
    }
  }
}

/** A flat leaf with a pointed outline and a midrib groove, painted on top. */
function stampLeaf(
  c: DetailCanvas, cx: number, cy: number, ang: number,
  len: number, wid: number, base: number, tone: number, mat: number,
): void {
  const m = c.n - 1;
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const reach = Math.ceil(len * 0.5 + wid + 1);
  const ix = Math.floor(cx);
  const iy = Math.floor(cy);
  for (let py = iy - reach; py <= iy + reach; py++) {
    for (let px = ix - reach; px <= ix + reach; px++) {
      const rx = px + 0.5 - cx;
      const ry = py + 0.5 - cy;
      const t = (rx * dx + ry * dy) / len + 0.5;
      if (t < 0 || t > 1) continue;
      const w = wid * Math.pow(Math.sin(Math.PI * t), 0.75);
      const perp = Math.abs(ry * dx - rx * dy);
      if (perp >= w) continue;
      const q = perp / w;
      const rib = Math.max(0, 1 - perp / 0.9);
      const i = (py & m) * c.n + (px & m);
      // Later leaves lie ON TOP (painter's order), so overwrite.
      c.h[i] = base + 0.18 * (1 - q * q) - 0.12 * rib;
      c.alb[i] = tone - 0.3 * rib + 0.12 * (1 - q);
      c.mat[i] = mat;
    }
  }
}

/** Box blur with wrap-around (one axis per pass), in place via a scratch row. */
function wrapBlur(src: Float32Array, n: number, r: number): Float32Array {
  const tmp = new Float32Array(n * n);
  const out = new Float32Array(n * n);
  const m = n - 1;
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < n; y++) {
    const row = y * n;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[row + (k & m)];
    for (let x = 0; x < n; x++) {
      tmp[row + x] = acc * inv;
      acc += src[row + ((x + r + 1) & m)] - src[row + ((x - r) & m)];
    }
  }
  for (let x = 0; x < n; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[(k & m) * n + x];
    for (let y = 0; y < n; y++) {
      out[y * n + x] = acc * inv;
      acc += tmp[((y + r + 1) & m) * n + x] - tmp[((y - r) & m) * n + x];
    }
  }
  return out;
}

/** 97th-percentile magnitude (robust normaliser, ignores rare spikes). */
function robustMax(values: Float32Array, centre: number): number {
  const sample = new Float32Array(4096);
  const step = Math.max(1, Math.floor(values.length / sample.length));
  for (let i = 0, j = 0; j < sample.length; i += step, j++) sample[j] = Math.abs(values[i] - centre);
  sample.sort();
  return Math.max(1e-6, sample[Math.floor(sample.length * 0.97)]);
}

function buildDetailCanvas(kind: GroundDetailKind): DetailCanvas {
  const n = DETAIL_N;
  const rnd = detailRng(0x5eed0 + kind.length * 7919 + kind.charCodeAt(0) * 131);
  const c: DetailCanvas = {
    n,
    h: new Float32Array(n * n),
    alb: new Float32Array(n * n),
    mat: new Float32Array(n * n),
  };
  // Base soil body shared by every family: low clumps + albedo mottle.
  const soil = periodicFbm(n, 8, 4, rnd);
  const soilTone = periodicFbm(n, 16, 3, rnd);
  for (let i = 0; i < n * n; i++) {
    c.h[i] = soil[i] * 0.22;
    c.alb[i] = (soilTone[i] - 0.5) * 0.5;
  }

  if (kind === 'turf') {
    // Clumpy turf: blade density follows a coarse mask, leaving bare,
    // darker soil between tufts; ~10% sun-bleached straw blades.
    const clump = periodicFbm(n, 4, 3, rnd);
    for (let i = 0; i < n * n; i++) c.alb[i] -= 0.45;
    let placed = 0;
    for (let tries = 0; placed < 9000 && tries < 40000; tries++) {
      const x = rnd() * n;
      const y = rnd() * n;
      const k = clump[(Math.floor(y) & (n - 1)) * n + (Math.floor(x) & (n - 1))];
      if (rnd() > 0.15 + 0.85 * Math.min(1, Math.max(0, (k - 0.32) / 0.3))) continue;
      const straw = rnd() < 0.07;
      stampBlade(
        c, x, y, rnd() * Math.PI * 2,
        14 + rnd() * 26, 1.3 + rnd() * 1.5,
        0.5 + rnd() * 0.5,
        straw ? 0.55 : -0.1 + rnd() * 0.55,
        straw ? 1 : 0,
      );
      placed++;
    }
  } else if (kind === 'litter') {
    // Layered fallen leaves over dark humus, a few twigs on top.
    for (let i = 0; i < n * n; i++) c.alb[i] -= 0.5;
    for (let k = 0; k < 2600; k++) {
      stampLeaf(
        c, rnd() * n, rnd() * n, rnd() * Math.PI * 2,
        18 + rnd() * 24, 5 + rnd() * 7,
        0.4 + rnd() * 0.25, -0.2 + rnd() * 0.6, Math.pow(rnd(), 1.5),
      );
    }
    for (let k = 0; k < 260; k++) {
      stampBlade(c, rnd() * n, rnd() * n, rnd() * Math.PI * 2, 28 + rnd() * 40, 1.1 + rnd() * 0.6, 0.9, -0.55, 0);
    }
  } else if (kind === 'grit') {
    // Gravel: mostly small stones, a few fist-sized, over fine soil grain.
    for (let k = 0; k < 1500; k++) {
      const r = 2 + Math.pow(rnd(), 2.2) * 10;
      stampPebble(c, rnd() * n, rnd() * n, r, 0.16 + r * 0.05, -0.25 + rnd() * 0.6, 0.35 + rnd() * 0.65, rnd);
    }
    for (let i = 0; i < n * n; i++) {
      c.h[i] += (rnd() - 0.5) * 0.05;
      c.alb[i] += (rnd() - 0.5) * 0.22;
    }
  } else if (kind === 'sand') {
    // Fine grain + sparse dark mineral flecks + the odd small stone.
    const fine = periodicFbm(n, 64, 2, rnd);
    for (let i = 0; i < n * n; i++) {
      c.h[i] = c.h[i] * 0.6 + fine[i] * 0.12 + (rnd() - 0.5) * 0.06;
      c.alb[i] = c.alb[i] * 0.5 + (rnd() - 0.5) * 0.3;
      if (rnd() > 0.965) c.mat[i] = 0.6 + rnd() * 0.4;
    }
    for (let k = 0; k < 140; k++) {
      stampPebble(c, rnd() * n, rnd() * n, 1.5 + rnd() * 3, 0.3, -0.1 + rnd() * 0.4, 0.5, rnd);
    }
  } else {
    // Snow: soft wind-crust bumps, faint crystal grain, icy patches.
    const crust = periodicFbm(n, 16, 3, rnd);
    const ice = periodicFbm(n, 8, 3, rnd);
    for (let i = 0; i < n * n; i++) {
      c.h[i] = c.h[i] * 0.8 + crust[i] * 0.3 + (rnd() - 0.5) * 0.025;
      c.alb[i] = c.alb[i] * 0.35 + (rnd() - 0.5) * 0.08;
      c.mat[i] = Math.min(1, Math.max(0, (ice[i] - 0.56) / 0.12));
    }
  }
  return c;
}

/**
 * The session-cached detail tile for a ground family. Built on first use
 * (~tens of ms, during the loader) and reused by every later run; call
 * disposeGroundDetailTextures() at game teardown to release the GPU copy.
 */
export function getGroundDetailTexture(kind: GroundDetailKind): THREE.DataTexture {
  const cached = _detailTiles.get(kind);
  if (cached) return cached;

  const c = buildDetailCanvas(kind);
  const n = c.n;
  const m = n - 1;

  // Cavity: anything below its blurred neighbourhood darkens (crevices,
  // gaps between blades / leaves / stones), crowns brighten slightly.
  const blurred = wrapBlur(c.h, n, 4);
  for (let i = 0; i < n * n; i++) c.alb[i] += (c.h[i] - blurred[i]) * 1.6;

  // Slope from wrapped central differences (texel units).
  const sx = new Float32Array(n * n);
  const sy = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      sx[i] = -(c.h[y * n + ((x + 1) & m)] - c.h[y * n + ((x - 1) & m)]) * 0.5;
      sy[i] = -(c.h[((y + 1) & m) * n + x] - c.h[((y - 1) & m) * n + x]) * 0.5;
    }
  }

  // Normalise: slopes to ±0.42 and albedo to ±0.4 at the 97th percentile, and
  // centre the albedo on its mean so the mip tail is exactly neutral.
  let albMean = 0;
  for (let i = 0; i < n * n; i++) albMean += c.alb[i];
  albMean /= n * n;
  const sNorm = 0.42 / Math.max(robustMax(sx, 0), robustMax(sy, 0));
  const aNorm = 0.4 / robustMax(c.alb, albMean);

  const data = new Uint8Array(n * n * 4);
  const q = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  for (let i = 0; i < n * n; i++) {
    data[i * 4] = q(0.5 + sx[i] * sNorm);
    data[i * 4 + 1] = q(0.5 + sy[i] * sNorm);
    data[i * 4 + 2] = q(0.5 + (c.alb[i] - albMean) * aNorm);
    data[i * 4 + 3] = q(c.mat[i]);
  }

  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace; // data, not colour
  // 4× keeps the grain crisp at grazing angles; the global 16× default cost
  // up to 16 taps per fetch on a surface seen almost edge-on all the time.
  tex.anisotropy = 4;
  tex.name = `groundDetail:${kind}`;
  tex.needsUpdate = true;
  _detailTiles.set(kind, tex);
  return tex;
}

/**
 * Release the GPU copies of the cached detail tiles (CPU data is kept, so the
 * next run re-uploads instead of rebuilding). Also detaches the old renderer's
 * dispose listener, which would otherwise pin that renderer in memory.
 */
export function disposeGroundDetailTextures(): void {
  _detailTiles.forEach((tex) => tex.dispose());
}

// ── Shared GLSL: noise helpers + the precision-stable height field ──────────
const TERRAIN_VERT_COMMON = /* glsl */ `
  varying vec3 vGroundWorldPos;
  varying float vTerrainSlope;

  uniform float uTSeed;
  uniform float uTAmp;
  uniform float uTFreq;
  uniform float uTWarpAmp;
  uniform float uTRidge;
  uniform float uTFlatR;
  uniform float uTFalloff;

  // Band-limited trig height field — domain-warped, 3 octaves, optional ridge
  // bias. Identical in JS and GLSL because every trig argument stays bounded.
  float tHeight(vec2 p) {
    float s = uTSeed;
    float f = uTFreq;
    vec2 w = p + vec2(
      sin(p.y * f * 1.7 + s),
      cos(p.x * f * 1.7 + s * 1.31)
    ) * uTWarpAmp;
    float h  = sin(w.x * f         + s)       * cos(w.y * f * 0.93       + s * 0.7);
    h       += sin(w.x * f * 2.07  + 1.7 + s) * cos(w.y * f * 1.96 - 0.8) * 0.5;
    h       += sin(w.x * f * 4.13  - 2.1)     * cos(w.y * f * 3.88 + s)   * 0.25;
    h /= 1.75;
    // Ridge bias — turns rolling hills into sharper dunes / canyon walls.
    float ridge = 1.0 - abs(h);
    ridge = ridge * ridge * 2.0 - 1.0;
    h = mix(h, ridge, uTRidge);
    return h * uTAmp;
  }
`;

const TERRAIN_FRAG_COMMON = /* glsl */ `
  uniform float uTime;
  uniform vec3  uSunDirection;
  uniform vec3  uSunColor;
  uniform float uIncidentBoost;
  uniform float uSpecularStrength;
  uniform float uNormalStrength;
  uniform float uPatchScale;
  uniform float uPatchStrength;
  uniform float uIsNight;
  // ── LIVE RAIN (weather system) ──
  // uRainWet  — 0..1 ground soak; grows puddles + darkens soil, lingers
  //             after the rain ends (slow dry-out).
  // uRainRipple — 0..1 active precipitation; animates ripple rings on the
  //             puddles so still pools only form once the rain has stopped.
  uniform float uRainWet;
  uniform float uRainRipple;
  // uRainDamp — 0..1 soak WITHOUT puddles (rain on maps whose floor drains):
  // darker soil + a broad wet sheen, never a reflective pool.
  uniform float uRainDamp;

  uniform float uTQuality;
  uniform vec3  uTMacroA;
  uniform vec3  uTMacroB;
  uniform vec3  uTRock;
  uniform vec3  uTDetailCol;
  uniform float uTDetailScale;
  uniform vec2  uTRippleDir;
  uniform float uTRippleScale;
  uniform float uTRippleStr;
  uniform float uTSparkle;
  uniform float uTWetness;
  uniform float uTSwampWater;
  uniform vec3  uTWaterCol;
  uniform float uTCrackGlow;
  uniform vec3  uTCrackCol;
  uniform sampler2D uTDetailTex;
  uniform float uTDetailTexStr;
  uniform float uTDetailNrm;
  uniform vec3  uTDetailTint;

  varying vec3  vGroundWorldPos;
  varying float vTerrainSlope;

  float gHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  // Noise is BAKED (see NoiseTextures.ts): these used to evaluate value-noise
  // fBm procedurally — ~12 three-octave calls per ground pixel, measured at
  // 6.6 ms of a 31 ms frame on an integrated GPU. Same statistics, one fetch.
  ${BAKED_NOISE_GLSL}
  float gNoise(vec2 p) { return bnNoise(p); }
  float gFbm(vec2 p) { return bnFbm(p); }
  vec2 gFbmGradient(vec2 p, float epsilon) { return bnFbmGradient(p, epsilon); }
`;

/**
 * Inject the terrain displacement + ultra-detailed ground material into a
 * standard MeshStandardMaterial's compiled shader. Call this from the
 * material's `onBeforeCompile`, passing BOTH the existing day-cycle uniform
 * holders and the static terrain uniforms so all of them get wired up.
 */
export function applyGroundTerrainShader(
  shader: { vertexShader: string; fragmentShader: string; uniforms: Record<string, { value: unknown }> },
  dayUniforms: Record<string, { value: unknown }>,
  terrainUniforms: TerrainUniforms,
): void {
  for (const k in dayUniforms) shader.uniforms[k] = dayUniforms[k];
  for (const k in terrainUniforms) shader.uniforms[k] = terrainUniforms[k] as { value: unknown };

  // ════════════════════════ VERTEX ════════════════════════
  shader.vertexShader = shader.vertexShader.replace(
    '#include <common>',
    `#include <common>\n${TERRAIN_VERT_COMMON}`,
  );

  // Replace the geometry normal with the analytic terrain normal so hill
  // slopes shade correctly. Object-space basis: plane is rotated -90° about X
  // (local +Z → world +Y), so a world height-field normal (-dH/dx, 1, -dH/dz)
  // maps back to object space as (-dH/dx, dH/dz, 1).
  shader.vertexShader = shader.vertexShader.replace(
    '#include <beginnormal_vertex>',
    `#include <beginnormal_vertex>
    {
      vec3 tW = (modelMatrix * vec4(position, 1.0)).xyz;
      float tR = length(position.xy);
      float tEnv = smoothstep(uTFlatR, uTFlatR + uTFalloff, tR);
      float e = 1.6;
      float h0 = tHeight(tW.xz);
      float dHdx = (tHeight(tW.xz + vec2(e, 0.0)) - h0) / e * tEnv;
      float dHdz = (tHeight(tW.xz + vec2(0.0, e)) - h0) / e * tEnv;
      objectNormal = normalize(vec3(-dHdx, dHdz, 1.0));
      vTerrainSlope = clamp(1.0 - objectNormal.z, 0.0, 1.0);
    }`,
  );

  // Displace along world-up (local +Z) by the enveloped height.
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `#include <begin_vertex>
    {
      vec3 tW = (modelMatrix * vec4(position, 1.0)).xyz;
      float tR = length(position.xy);
      float tEnv = smoothstep(uTFlatR, uTFlatR + uTFalloff, tR);
      transformed.z += tHeight(tW.xz) * tEnv;
    }`,
  );

  // World-space position varying (now includes the displacement on Y).
  shader.vertexShader = shader.vertexShader.replace(
    '#include <worldpos_vertex>',
    `#include <worldpos_vertex>
    #ifdef USE_INSTANCING
      vGroundWorldPos = (instanceMatrix * vec4(transformed, 1.0)).xyz;
    #else
      vGroundWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
    #endif`,
  );

  // ════════════════════════ FRAGMENT ════════════════════════
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    `#include <common>\n${TERRAIN_FRAG_COMMON}`,
  );

  // ── Albedo: macro patches, cavity AO, micro grit, slope rock, wet/crack ──
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <color_fragment>',
    `#include <color_fragment>
    // Shared with the normal / emissive / lighting chunks downstream. Declared
    // at main() scope (the per-chunk locals stay inside their own { } blocks).
    float gNear = 1.0 - smoothstep(45.0, 150.0, length(vViewPosition));
    float gMicro = 0.0;   // antialiased micro-detail visibility (set below)
    float gWet = 0.0;
    float gCrackMask = 0.0;
    vec2 gDetailSlope = vec2(0.0); // detail-tile relief, consumed by the normal chunk
    {
      vec2 gWP = vGroundWorldPos.xz;

      // ── ANALYTIC ANTIALIASING ──────────────────────────────────────────
      // The screen-space texel footprint (world units covered by one pixel).
      // When a procedural feature gets smaller than a texel it aliases into
      // the harsh shimmering "static" look. We fade ALL high-frequency detail
      // (grit + normal relief + ripples) toward 0 as the footprint approaches
      // the feature size — the standard fwidth() LOD technique. This also
      // kills shimmer at grazing angles where pure distance fade fails.
      vec2 gFw = fwidth(gWP);
      float gTexel = max(gFw.x, gFw.y);
      float gDetailAA = 1.0 - smoothstep(0.45, 2.2, gTexel * uTDetailScale);
      gMicro = gNear * gDetailAA;

      // Macro tonal variation — broad, soft warm/cool earth patches. Pulled
      // 45% toward neutral so the ground reads natural, not technicolor.
      float gMacro = gFbm(gWP * (uPatchScale * 0.5) + 11.3);
      vec3 gMacroTint = mix(uTMacroA, uTMacroB, smoothstep(0.35, 0.7, gMacro));
      diffuseColor.rgb *= mix(vec3(1.0), gMacroTint, 0.55);

      // Meso weathering patches — softened.
      float gPatch = gFbm(gWP * uPatchScale + 4.0);
      diffuseColor.rgb *= 1.0 + (gPatch - 0.5) * uPatchStrength * 0.7;

      // Cavity ambient occlusion — gently darken creases for grounded depth.
      // Kept conservative (floor 0.88) so already-dark biomes don't muddy.
      float gCav = gFbm(gWP * (uTDetailScale * 0.45) + 31.0);
      diffuseColor.rgb *= 0.88 + 0.12 * smoothstep(0.2, 0.8, gCav);

      // Micro grit — fine grain, antialiased so it never shimmers.
      float gGrit = gNoise(gWP * uTDetailScale * 2.4);
      diffuseColor.rgb += (gGrit - 0.5) * 0.035 * gMicro * uTDetailCol;

      // ── QUALITY DETAIL LAYER (High/Ultra; Medium softened; Low = 0) ────
      // The extra surface richness of the graphics overhaul, all gated by
      // uTQuality so the low tiers pay the exact pre-overhaul cost. Two
      // terms: a mid-frequency STRATA MOTTLE that breaks the ground into
      // organic soil variation between the broad macro patches and the fine
      // grit (the band the old shader left flat — the main "one-note floor"
      // tell), and a second, tighter GRIT octave that only resolves close-up.
      if (uTQuality > 0.01) {
        float gStrata = gFbm(gWP * (uPatchScale * 3.2) + 57.0);
        diffuseColor.rgb *= 1.0 + (gStrata - 0.5) * 0.16 * uTQuality;
        float gFine = gNoise(gWP * uTDetailScale * 6.1 + 3.7);
        diffuseColor.rgb += (gFine - 0.5) * 0.05 * gMicro * uTQuality * uTDetailCol;

        // ── DETAIL TILE ── the crisp near-field micro-surface (turf blades /
        // leaf litter / gravel / sand grain / snow crust — see
        // getGroundDetailTexture). Two scales, the coarse one rotated so the
        // tiling never lines up; both fade with distance (and the tile's mip
        // tail is neutral anyway, so nothing pops).
        float gDist = length(vViewPosition);
        float gDW = uTDetailTexStr * uTQuality;
        float gWA = gDW * (1.0 - smoothstep(8.0, 42.0, gDist));
        float gWB = gDW * 0.6 * (1.0 - smoothstep(28.0, 120.0, gDist));
        const mat2 gRot = mat2(0.8, -0.6, 0.6, 0.8);
        vec4 gDA = texture2D(uTDetailTex, gWP * (0.45 * uTDetailScale));
        vec4 gDB = texture2D(uTDetailTex, gRot * gWP * (0.13 * uTDetailScale) + vec2(0.37, 0.61));
        diffuseColor.rgb *= 1.0 + ((gDA.b - 0.5) * gWA + (gDB.b - 0.5) * gWB) * 0.8;
        float gDMat = clamp(gDA.a * gWA + gDB.a * gWB * 0.8, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uTDetailTint, gDMat);
        // Slope back to world XZ (the coarse layer's UVs are rotated: v * M = Mᵀv).
        gDetailSlope = ((gDA.rg - 0.5) * gWA + ((gDB.rg - 0.5) * gRot) * gWB) * 2.0;
      }

      // Slope → talus rock. Steep terrain (far hills/dunes) reveals bare rock.
      // The quality tier breaks the blend up with the cavity field so exposed
      // rock reads as strewn scree rather than a flat colour ramp.
      float gSlope = clamp(vTerrainSlope * 2.4, 0.0, 1.0);
      float gTalusBreak = 1.0 - (0.35 * uTQuality) * smoothstep(0.3, 0.7, gCav);
      diffuseColor.rgb = mix(diffuseColor.rgb, uTRock * gTalusBreak, gSlope * 0.6);

      // Wet pooling — low-lying puddle patches darken & desaturate the soil.
      // uTWetness is the map's static base (swamp); uRainWet is the LIVE rain
      // soak from the weather system. As the rain soaks in, the puddle
      // threshold widens so pools visibly GROW outward from the low spots,
      // then slowly recede as the ground dries.
      float wetAmt = max(uTWetness, uRainWet);
      if (wetAmt > 0.001) {
        float pudNoise = gFbm(gWP * 0.06 + 21.0);
        float pud = smoothstep(0.54 - uRainWet * 0.16, 0.8 - uRainWet * 0.2, pudNoise);
        // ── GLOBAL BOG WATER (toxic swamp) ─────────────────────────────
        // uTSwampWater floods the WHOLE floor through the same puddle
        // machinery the rain uses — only noise-raised silt banks break the
        // surface. Everything downstream (dark water body, fresnel PMREM
        // mirror, ripples, sun glint) is the proven rain-puddle stack, so
        // the bog reads as one continuous sheet of standing toxic water.
        pud = max(pud, uTSwampWater * (1.0 - smoothstep(0.56, 0.74, pudNoise)));
        gWet = pud * wetAmt;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.42, gWet);
        // Toxic water body — tint the flooded soil toward the map's water
        // colour, deeper (darker) where the puddle noise dips lowest so the
        // bog has readable depth instead of one flat green sheet.
        if (uTSwampWater > 0.001) {
          vec3 bogCol = uTWaterCol * (0.09 + 0.11 * pudNoise);
          diffuseColor.rgb = mix(diffuseColor.rgb, bogCol, gWet * uTSwampWater * 0.85);
        }
        // Rain also soak-darkens the ground BETWEEN the puddles.
        diffuseColor.rgb *= 1.0 - uRainWet * 0.16 * (1.0 - pud);
      }
      diffuseColor.rgb *= 1.0 - uRainDamp * 0.22;

      // Lava crack veins — thin emissive seams between cooled plates.
      if (uTCrackGlow > 0.001) {
        float cv = gFbm(gWP * 0.13 + 5.0);
        gCrackMask = smoothstep(0.47, 0.5, cv) * (1.0 - smoothstep(0.5, 0.53, cv));
        diffuseColor.rgb += uTCrackCol * gCrackMask * uTCrackGlow * 0.5;
      }
    }`,
  );

  // ── Normal: procedural micro-relief + directional ripples ────────────────
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <normal_fragment_maps>',
    `#include <normal_fragment_maps>
    {
      vec2 gWP = vGroundWorldPos.xz;
      // Lower-frequency, gentler relief — antialiased by gMicro so it fades
      // out before it can sparkle. This is the main fix for the harsh
      // "crumpled-foil" ground: the perturbation is now soft and resolves
      // to a flat surface in the mid/far field instead of speckling.
      vec2 gGrad = gFbmGradient(gWP * (0.32 * uTDetailScale), 0.9);
      vec3 gPerturb = vec3(-gGrad.x, 0.0, -gGrad.y) * uNormalStrength * gMicro;

      // Quality tier: a second, higher-frequency relief octave that only
      // resolves in the near field (scaled by gMicro so it antialiases to
      // flat with distance — no shimmer). This is what makes the High/Ultra
      // floor read as genuinely dimensional up close: pebbles, clods and
      // hardpan cracks catching the sun instead of a smooth sheet. Gated
      // above Medium's 0.55 — only High/Ultra (1.0) pay these extra taps;
      // Medium keeps just the cheap albedo strata/grit terms.
      if (uTQuality > 0.75) {
        vec2 gGrad2 = gFbmGradient(gWP * (1.35 * uTDetailScale) + 41.0, 0.45);
        gPerturb += vec3(-gGrad2.x, 0.0, -gGrad2.y) * uNormalStrength * 0.45 * gMicro * uTQuality;
      }

      // Ripples / drifts — a band-limited sinusoid along a fixed direction.
      if (uTRippleStr > 0.001) {
        float rp = dot(gWP, uTRippleDir) * uTRippleScale;
        // Secondary cross-ripple breaks up the regularity of pure dunes.
        float rp2 = dot(gWP, vec2(-uTRippleDir.y, uTRippleDir.x)) * uTRippleScale * 0.37;
        vec3 rdir = vec3(uTRippleDir.x, 0.0, uTRippleDir.y);
        gPerturb += rdir * (cos(rp) + 0.3 * cos(rp2)) * uTRippleScale * uTRippleStr * gMicro;
      }
      // Detail-tile relief (zero on the tiers that skip the tile).
      gPerturb += vec3(gDetailSlope.x, 0.0, gDetailSlope.y) * uTDetailNrm;
      // gPerturb is a WORLD-space tangent offset, but \`normal\` is VIEW space
      // here — rotate it in first. (It used to be added raw: the relief swung
      // with the camera, lit from a different side at every yaw, and all but
      // vanished when looking down, which read as a blurry floor.)
      normal = normalize(normal + (viewMatrix * vec4(gPerturb, 0.0)).xyz);
    }`,
  );

  // ── Emissive: lava crack glow + toxic bog luminescence ──────────────────
  // The bog water carries a faint self-glow (dissolved toxins luminescing) so
  // it stays readable — and pops off the bloom pass — even under the swamp's
  // dark canopy. Subtle by design: the mirror reflections do the heavy lifting.
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <emissivemap_fragment>',
    `#include <emissivemap_fragment>
    totalEmissiveRadiance += uTCrackCol * gCrackMask * uTCrackGlow;
    totalEmissiveRadiance += uTWaterCol * gWet * uTSwampWater * 0.024;`,
  );

  // ── Lighting: sharp directional sun + crisp specular + wet/sparkle ───────
  // (Carried over from the original ground shader, extended with the terrain
  // wet-sheen and sparkle contributions.)
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <lights_fragment_end>',
    `#include <lights_fragment_end>
    {
      // Every term below is SUNLIGHT, so it must respect the sun's shadow.
      // (It used to be added unshadowed — shaded ground still caught the sun
      // glint and diffuse boost, which washed every cast shadow out.)
      #ifdef FS_SUN_SHADOW
      float gSunVis = fsSunShadow;
      #else
      float gSunVis = 1.0;
      #endif
      // Everything below is VIEW space (normal, viewDir): bring the world-space
      // sun direction across. It used to be mixed in raw, so the diffuse boost
      // drifted with camera pitch and the sun glint sat in the wrong place.
      vec3 sunDir = normalize((viewMatrix * vec4(uSunDirection, 0.0)).xyz);
      float sunDot = max(dot(normal, sunDir), 0.0) * gSunVis;
      float baseLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      float lumaDamp = clamp(1.0 - baseLuma * 1.2, 0.20, 1.0);

      float incident = pow(sunDot, 3.0);
      float patchMod = 0.6 + gFbm(vGroundWorldPos.xz * 0.10) * 0.8;
      reflectedLight.directDiffuse +=
        uSunColor * incident * uIncidentBoost * patchMod * lumaDamp;

      vec3 viewDir = normalize(vViewPosition);
      vec3 halfVec = normalize(sunDir + viewDir);
      float specPower = pow(max(dot(normal, halfVec), 0.0), 48.0);
      float specPatch = 0.55 + gFbm(vGroundWorldPos.xz * 0.22) * 0.9;
      reflectedLight.directSpecular +=
        uSunColor * specPower * uSpecularStrength * specPatch * sunDot * lumaDamp;

      // Wet sheen — puddles throw a tight, bright sun reflection. Scaled WAY
      // down when the water is the GLOBAL bog sheet: a rain puddle is a small
      // bright accent, but the same 1.6× glint over an entire flooded map
      // integrated into a blinding sun-coloured wall of bloom (user report).
      // Murky toxin-laden water scatters the sun instead of mirroring it.
      if (gWet > 0.001) {
        float wetSpec = pow(max(dot(normal, halfVec), 0.0), 160.0);
        float glint = mix(1.6, 0.35, uTSwampWater);
        reflectedLight.directSpecular += uSunColor * wetSpec * gWet * glint * sunDot;
      }
      // Rain-damp ground: a broad, soft wet sheen (no mirror).
      if (uRainDamp > 0.001) {
        float dampSpec = pow(max(dot(normal, halfVec), 0.0), 48.0);
        reflectedLight.directSpecular += uSunColor * dampSpec * uRainDamp * 0.3 * sunDot;
      }

      // ── PUDDLE MIRROR REFLECTIONS — the "RTX puddle" moment ──────────
      // Each puddle is shaded as a thin sheet of water: a near-mirror
      // world-up normal perturbed by LIVE rain ripples, a fresnel-weighted
      // sample of the scene's PMREM environment (the same prefiltered IBL
      // the PBR pipeline already uses — so this is one extra texture fetch,
      // not a render pass), and the bloom pass then catches the bright sky
      // bounce. While rain falls the surface shivers with travelling
      // ripples; once it stops the pools settle into still mirrors and
      // slowly dry out. Guarded so a missing environment map (failed HDRI
      // load) simply skips the reflection instead of breaking the shader.
      #if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
      if (gWet > 0.003) {
        vec2 rWP = vGroundWorldPos.xz;
        // Two interleaved travelling waves — amplitude follows the live
        // precipitation and the antialiasing fade so distant puddles never
        // shimmer.
        float rT = uTime * 6.0;
        float rw1 = sin(rWP.x * 9.1 + rT) * sin(rWP.y * 8.3 - rT * 0.9);
        float rw2 = sin((rWP.x + rWP.y) * 13.7 - rT * 1.4);
        // Rain agitates hard; the global bog keeps a gentle ever-present
        // shiver (gas bubbles working up through the toxic water). Kept very
        // small — at 0.035 the wave interference read as a moiré/halftone
        // pattern ringing the camera on the flooded swamp.
        float rAmp = (0.085 * uRainRipple + 0.016 * uTSwampWater) * gMicro;
        vec3 puddleN = normalize(vec3(
          (rw1 * 0.7 + rw2 * 0.3) * rAmp,
          1.0,
          (rw1 * 0.3 - rw2 * 0.7) * rAmp
        ));
        vec3 viewDirW = normalize(cameraPosition - vGroundWorldPos);
        vec3 refW = reflect(-viewDirW, puddleN);
        refW.y = max(refW.y, 0.04); // water reflects the world above it
        // Fresnel — grazing angles turn the pool into a true mirror.
        float fres = 0.05 + 0.95 * pow(1.0 - max(dot(viewDirW, puddleN), 0.0), 5.0);
        // Sharpest reflection in a full, still puddle; rain agitation and
        // partial dryness rough it up. The global bog reads MURKY on purpose:
        // suspended silt/toxins blur the mirror (higher roughness) and absorb
        // most of the bounce (lower amplitude) — a clean sharp mirror over a
        // whole map read as blown-out glare, not water.
        float mirrorRough = 0.05 + (1.0 - gWet) * 0.22 + uRainRipple * 0.08 + uTSwampWater * 0.14;
        vec3 reflCol = textureCubeUV(envMap, envMapRotation * refW, mirrorRough).rgb;
        float mirrorAmp = mix(1.0, 0.38, uTSwampWater);
        reflectedLight.indirectSpecular += reflCol * envMapIntensity * gWet * (0.30 + 0.70 * fres) * mirrorAmp;
      }
      #endif

      // Sparkle — glitter on snow / sand. A hash cell may hold ONE crystal: a
      // tiny round antialiased point jittered inside the cell, with its own
      // randomly tilted facet, so crystals flash one by one as the view moves.
      // (The old version lit whole 9 cm cells at the exact mirror angle, which
      // read as scattered white squares.) Gated by gMicro so distant glints
      // never shimmer.
      if (uTSparkle > 0.001) {
        vec2 spP = vGroundWorldPos.xz * 11.0;
        float spPx = max(fwidth(spP.x), fwidth(spP.y)); // uniform flow: before the branch
        vec2 spCell = floor(spP);
        if (gHash(spCell) > 0.88) {
          vec2 spJit = vec2(gHash(spCell + 1.7), gHash(spCell + 3.1)) * 0.6 + 0.2;
          float spR = clamp(spPx * 1.1, 0.04, 0.35);
          float spCore = 1.0 - smoothstep(spR * 0.35, spR, length(fract(spP) - spJit));
          vec3 spTilt = vec3(gHash(spCell + 5.3) - 0.5, 0.0, gHash(spCell + 7.9) - 0.5) * 0.9;
          vec3 spN = normalize(normal + (viewMatrix * vec4(spTilt, 0.0)).xyz);
          float spGlint = pow(max(dot(spN, halfVec), 0.0), 64.0);
          reflectedLight.directSpecular += uSunColor * spGlint * spCore * uTSparkle * 2.2
            * gMicro * (1.0 - uIsNight) * gSunVis;
        }
      }

      // Subtle subsurface back-spill at grazing-toward-sun angles (day only).
      float backSpill = pow(max(dot(-sunDir, viewDir), 0.0), 8.0) * 0.14 * (1.0 - uIsNight) * lumaDamp * gSunVis;
      reflectedLight.indirectDiffuse += diffuseColor.rgb * backSpill;
    }`,
  );
}
