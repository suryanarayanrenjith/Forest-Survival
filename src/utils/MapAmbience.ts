import * as THREE from 'three';
import type { MapType } from './MapSystem';

/**
 * MAP AMBIENCE — signature per-map living particle layer (HIGH / ULTRA only).
 *
 * A single GPU-animated Points field that gives every map its own breathing
 * atmosphere ON TOP of the shared dust motes + storm weather:
 *
 *   deep_forest        drifting fireflies + pollen glinting in the shafts
 *   scorched_wasteland embers + ash sparks rising off the cooling lava
 *   frozen_tundra      crystalline snow-glints hanging in the cold air
 *   desert_canyon      sun-lit dust hazing sideways on the canyon wind
 *   toxic_swamp        luminous spores welling up out of the bog
 *   military_outpost   fine dust + grit drifting through the compound light
 *   autumn_grove       spectral wisps + magic motes floating through the dusk
 *   ancient_ruins      disturbed dust + pollen settling among the stones
 *
 * DESIGN / PERF CONTRACT
 *   • ONE draw call. All motion (rise/fall, lateral drift, per-mote twinkle and
 *     size bob) is computed in the vertex shader from a per-particle seed + a
 *     single uTime uniform — there is NO per-frame CPU particle loop and NO
 *     buffer re-upload. Advancing the field is literally two uniform writes and
 *     re-centring it on the player.
 *   • The field is a camera-local cylinder that rides the player (like the
 *     weather field), so the ambience is always around them with zero respawn
 *     churn and it wraps seamlessly.
 *   • Additive, depthWrite off, self-computed soft round sprite (no texture) so
 *     it composes cleanly with bloom and never writes depth over the world.
 *   • Built once at scene init and parented before the warmup compile pass, so
 *     its (single) program links during loading — never mid-fight. Count scales
 *     with the graphics preset's particleDensity.
 *
 * Gated to High/Ultra by the caller (terrainDetail >= 1.0). On Medium and below
 * the field is never constructed, so those tiers pay nothing.
 */

export interface AmbienceConfig {
  /** Base particle count at density 1.0 (scaled down by the preset). */
  count: number;
  /** Cylinder radius around the player (m). */
  radius: number;
  /** Vertical band the motes occupy (m). */
  yMin: number;
  yMax: number;
  /** Two-stop colour palette — each mote lerps between a and b by its seed. */
  colorA: THREE.Color;
  colorB: THREE.Color;
  /** Base point size (world units, size-attenuated). */
  size: number;
  /** Vertical drift m/s. Positive = rises (embers/spores), negative = falls. */
  rise: number;
  /** Lateral sway amplitude (m) and frequency (rad/s). */
  driftAmp: number;
  driftFreq: number;
  /** Prevailing lateral wind m/s (desert/tundra get real sideways travel). */
  windX: number;
  windZ: number;
  /** Twinkle speed (rad/s) and depth (0..1 of alpha swing). */
  twinkleSpeed: number;
  twinkleDepth: number;
  /** Master opacity. */
  opacity: number;
  /** Soft core hardness (0 = feathery haze, 1 = tight spark). */
  hardness: number;
  /** Extra opacity multiplier applied at night (0..1 blended by nightFactor). */
  nightBoost: number;
}

const C = (hex: number) => new THREE.Color(hex);

const AMBIENCE_CONFIGS: Record<MapType, AmbienceConfig> = {
  // Warm fireflies + drifting pollen. Barely rises, lots of bob + twinkle,
  // glows much brighter after dark.
  deep_forest: {
    count: 340, radius: 40, yMin: 0.4, yMax: 8, colorA: C(0xffe27a), colorB: C(0x9fe86a),
    size: 0.13, rise: 0.05, driftAmp: 0.7, driftFreq: 0.5, windX: 0.25, windZ: 0.15,
    twinkleSpeed: 2.2, twinkleDepth: 0.75, opacity: 0.5, hardness: 0.55, nightBoost: 0.9,
  },
  // Embers + ash sparks rising off the coals, cooling from orange to dim red.
  scorched_wasteland: {
    count: 300, radius: 38, yMin: 0.2, yMax: 14, colorA: C(0xff5a1e), colorB: C(0xffb347),
    size: 0.12, rise: 1.4, driftAmp: 0.5, driftFreq: 0.7, windX: 0.6, windZ: 0.3,
    twinkleSpeed: 3.0, twinkleDepth: 0.7, opacity: 0.6, hardness: 0.7, nightBoost: 0.5,
  },
  // Crystalline snow glints — slow fall, sharp twinkle, pale ice blue.
  frozen_tundra: {
    count: 360, radius: 42, yMin: 0.3, yMax: 12, colorA: C(0xdfeeff), colorB: C(0xbcd8f2),
    size: 0.1, rise: -0.55, driftAmp: 0.4, driftFreq: 0.6, windX: 1.4, windZ: 0.5,
    twinkleSpeed: 3.4, twinkleDepth: 0.85, opacity: 0.42, hardness: 0.8, nightBoost: 0.3,
  },
  // Sun-lit dust hazing sideways on the canyon wind — warm, subtle, no glow.
  desert_canyon: {
    count: 260, radius: 44, yMin: 0.3, yMax: 10, colorA: C(0xe8cf9a), colorB: C(0xcaa068),
    size: 0.11, rise: -0.08, driftAmp: 0.5, driftFreq: 0.4, windX: 2.2, windZ: 0.8,
    twinkleSpeed: 1.4, twinkleDepth: 0.4, opacity: 0.34, hardness: 0.4, nightBoost: 0.2,
  },
  // Luminous spores welling up out of the bog — lazy rise, sickly green glow.
  toxic_swamp: {
    count: 320, radius: 36, yMin: 0.2, yMax: 9, colorA: C(0x86e060), colorB: C(0x54c8a0),
    size: 0.14, rise: 0.5, driftAmp: 0.6, driftFreq: 0.45, windX: 0.3, windZ: 0.2,
    twinkleSpeed: 1.8, twinkleDepth: 0.7, opacity: 0.5, hardness: 0.55, nightBoost: 0.7,
  },
  // Fine dust + grit drifting through the compound — neutral, grounded.
  military_outpost: {
    count: 220, radius: 42, yMin: 0.3, yMax: 9, colorA: C(0xcfd2cc), colorB: C(0xa8a89c),
    size: 0.09, rise: -0.06, driftAmp: 0.45, driftFreq: 0.5, windX: 1.0, windZ: 0.4,
    twinkleSpeed: 1.2, twinkleDepth: 0.35, opacity: 0.3, hardness: 0.4, nightBoost: 0.25,
  },
  // Spectral wisps + magic motes floating through the dusk — violet + cyan,
  // strong bob, dreamy glow that lingers day and night.
  autumn_grove: {
    count: 300, radius: 40, yMin: 0.4, yMax: 11, colorA: C(0xb488ff), colorB: C(0x5ec8ff),
    size: 0.16, rise: 0.12, driftAmp: 0.9, driftFreq: 0.4, windX: 0.3, windZ: 0.25,
    twinkleSpeed: 1.6, twinkleDepth: 0.8, opacity: 0.55, hardness: 0.5, nightBoost: 0.8,
  },
  // Disturbed dust + drifting pollen among the stones — warm-grey, settling.
  ancient_ruins: {
    count: 240, radius: 42, yMin: 0.3, yMax: 10, colorA: C(0xe0d8c4), colorB: C(0xb8ac92),
    size: 0.1, rise: -0.12, driftAmp: 0.5, driftFreq: 0.45, windX: 0.7, windZ: 0.35,
    twinkleSpeed: 1.4, twinkleDepth: 0.45, opacity: 0.34, hardness: 0.45, nightBoost: 0.3,
  },
};

const AMBIENCE_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uRise;
  uniform float uDriftAmp;
  uniform float uDriftFreq;
  uniform float uWindX;
  uniform float uWindZ;
  uniform float uYMin;
  uniform float uYMax;
  uniform float uRadius;
  uniform float uTwinkleSpeed;
  uniform float uTwinkleDepth;
  uniform float uPixelScale;

  attribute vec3 aBase;    // base position in the camera-local cylinder
  attribute float aSeed;   // per-mote random phase 0..1
  attribute float aRate;   // per-mote speed multiplier

  varying float vTwinkle;
  varying vec3 vTint;      // 0..1 lerp weight between the palette stops

  void main() {
    float seed = aSeed * 6.2831853;
    float span = max(uYMax - uYMin, 0.001);

    // Vertical travel wraps seamlessly through the band (rise or fall).
    float y = aBase.y + uTime * uRise * aRate;
    y = uYMin + mod(y - uYMin, span);

    // Lateral: prevailing wind (wrapped through the cylinder) + a per-mote
    // sine sway so the field breathes instead of sliding as a rigid sheet.
    float R = uRadius;
    float x = aBase.x + uWindX * uTime;
    float z = aBase.z + uWindZ * uTime;
    x = mod(x + R, 2.0 * R) - R;
    z = mod(z + R, 2.0 * R) - R;
    x += sin(uTime * uDriftFreq + seed) * uDriftAmp;
    z += cos(uTime * uDriftFreq * 0.8 + seed * 1.7) * uDriftAmp;
    y += sin(uTime * uDriftFreq * 1.3 + seed * 2.3) * uDriftAmp * 0.4;

    vec3 pos = vec3(x, y, z);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);

    // Per-mote twinkle (alpha swing) + a gentle synced size bob.
    float tw = 0.5 + 0.5 * sin(uTime * uTwinkleSpeed + seed * 3.1);
    vTwinkle = 1.0 - uTwinkleDepth + uTwinkleDepth * tw;
    vTint = vec3(aSeed);

    float bob = 0.85 + 0.15 * sin(uTime * uTwinkleSpeed * 0.5 + seed);
    gl_PointSize = uSize * bob * uPixelScale / max(-mv.z, 0.1);
    gl_Position = projectionMatrix * mv;
  }
`;

const AMBIENCE_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uOpacity;
  uniform float uHardness;

  varying float vTwinkle;
  varying vec3 vTint;

  void main() {
    // Soft round sprite computed in-shader (no texture bind).
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float core = 1.0 - smoothstep(0.0, 0.5, d);
    float alpha = pow(core, mix(1.2, 3.0, uHardness)) * vTwinkle * uOpacity;
    vec3 col = mix(uColorA, uColorB, vTint.x);
    gl_FragColor = vec4(col, alpha);
  }
`;

export class MapAmbience {
  private readonly scene: THREE.Scene;
  private points: THREE.Points | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private cfg: AmbienceConfig;
  private baseOpacity = 0.5;
  private nightBoost = 0.5;

  constructor(scene: THREE.Scene, map: MapType, particleDensity: number, pixelRatio: number) {
    this.scene = scene;
    this.cfg = AMBIENCE_CONFIGS[map] ?? AMBIENCE_CONFIGS.deep_forest;
    this.build(particleDensity, pixelRatio);
  }

  private build(density: number, pixelRatio: number): void {
    const cfg = this.cfg;
    const count = Math.max(24, Math.round(cfg.count * THREE.MathUtils.clamp(density, 0.2, 1)));
    const base = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const rate = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * cfg.radius;
      base[i * 3] = Math.cos(a) * r;
      base[i * 3 + 1] = cfg.yMin + Math.random() * (cfg.yMax - cfg.yMin);
      base[i * 3 + 2] = Math.sin(a) * r;
      seed[i] = Math.random();
      rate[i] = 0.6 + Math.random() * 0.8;
    }

    const geo = new THREE.BufferGeometry();
    // A position attribute is required by three; the shader ignores it (motion
    // is derived from aBase), but its bounding sphere must cover the field so
    // the mesh isn't frustum-culled early. We also disable culling outright.
    geo.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3));
    geo.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('aRate', new THREE.BufferAttribute(rate, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), cfg.radius * 2 + cfg.yMax);

    this.baseOpacity = cfg.opacity;
    this.nightBoost = cfg.nightBoost;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: cfg.size * 90 },      // world size → screen px scale factor
        uRise: { value: cfg.rise },
        uDriftAmp: { value: cfg.driftAmp },
        uDriftFreq: { value: cfg.driftFreq },
        uWindX: { value: cfg.windX },
        uWindZ: { value: cfg.windZ },
        uYMin: { value: cfg.yMin },
        uYMax: { value: cfg.yMax },
        uRadius: { value: cfg.radius },
        uTwinkleSpeed: { value: cfg.twinkleSpeed },
        uTwinkleDepth: { value: cfg.twinkleDepth },
        uPixelScale: { value: pixelRatio },
        uColorA: { value: cfg.colorA.clone() },
        uColorB: { value: cfg.colorB.clone() },
        uOpacity: { value: cfg.opacity },
        uHardness: { value: cfg.hardness },
      },
      vertexShader: AMBIENCE_VERT,
      fragmentShader: AMBIENCE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    // Flags the AO / post passes leave it alone (matches the storm field).
    this.scene.add(this.points);
  }

  /**
   * Advance the field: one time write + re-centre on the player, plus a smooth
   * day→night opacity lift. `elapsed` is absolute seconds, `nightFactor` is
   * 0 (day) → 1 (night). Cheap — a couple of uniform writes.
   */
  update(elapsed: number, cameraPos: THREE.Vector3, nightFactor: number): void {
    if (!this.points || !this.material) return;
    this.material.uniforms.uTime.value = elapsed;
    // Field is camera-local; ride the player on X/Z (Y stays world-anchored so
    // the vertical band tracks the ground, not the camera height).
    this.points.position.set(cameraPos.x, 0, cameraPos.z);
    const n = THREE.MathUtils.clamp(nightFactor, 0, 1);
    this.material.uniforms.uOpacity.value = this.baseOpacity * (1 + this.nightBoost * n);
  }

  dispose(): void {
    if (this.points) {
      this.scene.remove(this.points);
      this.points.geometry.dispose();
      this.points = null;
    }
    this.material?.dispose();
    this.material = null;
  }
}
