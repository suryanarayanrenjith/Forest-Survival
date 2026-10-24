import * as THREE from 'three';

/**
 * BAKED NOISE — the GPU-time fix for procedural shading.
 *
 * The ground, prop-weathering and sky shaders evaluated value-noise fBm
 * PROCEDURALLY per pixel: the terrain alone ran ~12 three-octave fBm calls per
 * fragment (≈150 sin-hashes) and measured 6.6 ms of a 31 ms frame on an
 * integrated GPU. The same statistical noise is baked here ONCE into two small
 * tileable textures, so each fBm becomes a single filtered texture fetch:
 *
 *   NOISE  (RGBA8, 256²):
 *     R, G, A — independent 3-octave value-noise fBm, base lattice 8 cells
 *               across the tile  → sample at  uv = p / 8
 *               (same range as the shaders' old fbm: 0 … 0.875)
 *     B       — single-octave value noise, lattice 32 cells across the tile
 *               → sample at uv = p / 32   (the old one-octave noise())
 *
 *   GRADIENT (RGBA8, 256²): forward-difference gradient of the R-channel fBm,
 *     exactly the old gFbmGradient(p, eps) =  (f(p+e) − f(p)) / e :
 *     RG — eps 0.9, BA — eps 0.45, encoded 0.5 + d × 0.2   (d ∈ ±2.5)
 *
 * Lacunarity is 2 (the old shaders used 2.07 with per-octave offsets — the
 * difference is statistically invisible) so every octave tiles. Mipmaps +
 * anisotropy also antialias the noise for free, which the procedural version
 * had to fake with fwidth() fades.
 */
const SIZE = 256;
let _noise: THREE.DataTexture | null = null;
let _grad: THREE.DataTexture | null = null;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Periodic value noise over a `cells`×`cells` lattice (wraps). */
function makeLattice(cells: number, rnd: () => number): Float32Array {
  const l = new Float32Array(cells * cells);
  for (let i = 0; i < l.length; i++) l[i] = rnd();
  return l;
}

function valueNoise(l: Float32Array, cells: number, x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const x0 = ((xi % cells) + cells) % cells, y0 = ((yi % cells) + cells) % cells;
  const x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
  const a = l[y0 * cells + x0], b = l[y0 * cells + x1];
  const c = l[y1 * cells + x0], d = l[y1 * cells + x1];
  return a + (b - a) * fx + (c - a) * fy * (1 - fx) + (d - b) * fx * fy;
}

/** 3-octave fBm with the old shaders' weights (0.5, 0.25, 0.125). */
function fbm3(oct: Float32Array[], base: number, x: number, y: number): number {
  return 0.5 * valueNoise(oct[0], base, x, y)
    + 0.25 * valueNoise(oct[1], base * 2, x * 2, y * 2)
    + 0.125 * valueNoise(oct[2], base * 4, x * 4, y * 4);
}

function texture(data: Uint8Array, name: string): THREE.DataTexture {
  const t = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.NoColorSpace;
  // Smooth, low-frequency noise: anisotropic taps buy nothing here, and the
  // global 16× default made every grazing-angle ground fetch 16 taps.
  t.anisotropy = 1;
  t.name = name;
  t.needsUpdate = true;
  return t;
}

function build(): void {
  const BASE = 8;
  const octs = (seed: number) => {
    const r = rng(seed);
    return [makeLattice(BASE, r), makeLattice(BASE * 2, r), makeLattice(BASE * 4, r)];
  };
  const oR = octs(0x51ed), oG = octs(0x7a31), oA = octs(0x3c97);
  const fine = makeLattice(32, rng(0x1f2e));
  const noise = new Uint8Array(SIZE * SIZE * 4);
  const grad = new Uint8Array(SIZE * SIZE * 4);
  const q = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  const e = (d: number) => q(0.5 + d * 0.2);
  const k = BASE / SIZE;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const px = x * k, py = y * k;       // noise-space coords (period 8)
      const i = (y * SIZE + x) * 4;
      const fR = fbm3(oR, BASE, px, py);
      noise[i] = q(fR);
      noise[i + 1] = q(fbm3(oG, BASE, px, py));
      noise[i + 2] = q(valueNoise(fine, 32, x * (32 / SIZE), y * (32 / SIZE)));
      noise[i + 3] = q(fbm3(oA, BASE, px, py));
      // Forward differences, matching gFbmGradient exactly.
      const g9x = (fbm3(oR, BASE, px + 0.9, py) - fR) / 0.9;
      const g9y = (fbm3(oR, BASE, px, py + 0.9) - fR) / 0.9;
      const g4x = (fbm3(oR, BASE, px + 0.45, py) - fR) / 0.45;
      const g4y = (fbm3(oR, BASE, px, py + 0.45) - fR) / 0.45;
      grad[i] = e(g9x); grad[i + 1] = e(g9y); grad[i + 2] = e(g4x); grad[i + 3] = e(g4y);
    }
  }
  _noise = texture(noise, 'bakedNoise');
  _grad = texture(grad, 'bakedNoiseGrad');
}

/** Shared baked value-noise texture (see header for the channel layout). */
export function getNoiseTexture(): THREE.DataTexture {
  if (!_noise) build();
  return _noise!;
}

/** Shared baked fBm-gradient texture (see header). */
export function getNoiseGradientTexture(): THREE.DataTexture {
  if (!_grad) build();
  return _grad!;
}

/** Release the GPU copies (CPU data kept; the next scene re-uploads). */
export function disposeNoiseTextures(): void {
  _noise?.dispose();
  _grad?.dispose();
}

/** GLSL: drop-in replacements for the old procedural helpers. */
export const BAKED_NOISE_GLSL = /* glsl */ `
  uniform sampler2D uBakedNoise;
  uniform sampler2D uBakedNoiseGrad;
  float bnFbm(vec2 p)  { return texture2D(uBakedNoise, p * 0.125).r; }
  float bnFbmG(vec2 p) { return texture2D(uBakedNoise, p * 0.125).g; }
  float bnFbmA(vec2 p) { return texture2D(uBakedNoise, p * 0.125).a; }
  float bnNoise(vec2 p) { return texture2D(uBakedNoise, p * 0.03125).b; }
  // eps is a literal at every call site, so the select folds at compile time.
  vec2 bnFbmGradient(vec2 p, float eps) {
    vec4 g = texture2D(uBakedNoiseGrad, p * 0.125);
    return ((eps > 0.6) ? g.rg : g.ba) * 5.0 - 2.5;
  }
`;
