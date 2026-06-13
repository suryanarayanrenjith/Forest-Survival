import * as THREE from 'three';
import type { MapType } from './MapSystem';

/**
 * WEATHER SYSTEM v4 — Markov-chain director, clear-dominant.
 *
 * Always-on and fully automatic: there is no weather menu. Every run gets a
 * living sky driven by a weather DIRECTOR that, the vast majority of the time,
 * holds a CLEAR sky — and only occasionally lets weather roll in. Crucially the
 * transitions are SMART, not a coin-flip: the director is a 3-state Markov
 * chain (clear → gloomy → storm) where a storm can NEVER strike out of a blue
 * sky. Fronts BUILD — clear softens to overcast gloom, gloom thickens into the
 * map's signature storm — and DECAY back the same way (storm → gloom → clear).
 * Clear is a sticky self-loop with long hold times, so the stationary mix is
 * roughly ~70% clear / ~22% gloom / ~8% storm by roll, and even more clear by
 * wall-clock once the long clear holds are weighted in.
 *
 * The map's signature storm is still per-environment — the desert's rare but
 * blinding sandstorm, the tundra's white-out blizzard, the volcanic
 * wasteland's ashfall, and the forest/swamp maps' true rain (with growing
 * puddles + reflections, see TerrainSystem). A per-map `storminess` scalar only
 * tunes HOW OFTEN a clear spell gives way to weather, never the clear-dominant
 * shape of the chain. Time of day feeds back into the director: nights run
 * calmer and moodier than days.
 *
 * Architecture is atmosphere-first: the primary output is a small struct of
 * ATMOSPHERE MODIFIERS (light / fog / saturation / bloom / god-ray
 * multipliers, a sky tint, ground wetness) that the render loop folds into
 * the existing day-night atmosphere — a handful of multiplies per frame.
 * The only geometry is ONE Points field (single draw call, ≤2600 sprites)
 * shaped per storm: vertical rain streaks, drifting snow, wind-driven dust,
 * or slow-falling ash.
 */

/** Per-frame modifiers the render loop folds into the atmosphere. */
export interface WeatherMods {
  /** Multiplies the directional (sun/moon) light intensity. */
  lightMult: number;
  /** Multiplies ambient + hemisphere intensity. */
  ambientMult: number;
  /** Multiplies fog density (storms = thicker air). */
  fogDensityMult: number;
  /** Multiplies colour-grade saturation. */
  saturationMult: number;
  /** Multiplies bloom strength. */
  bloomMult: number;
  /** Multiplies god-ray strength (clear sky = dramatic shafts). */
  godRayMult: number;
  /** 0..1 — darkens sky + fog colours toward storm grey. */
  skyDarken: number;
  /** Sky/fog colour cast (sandstorm tan, blizzard white, ash brown). */
  tint: THREE.Color;
  /** 0..1 — how strongly the tint takes over the sky/fog colours. */
  tintStrength: number;
  /** 0..1 — rain soak: drives puddle growth + wet ground in the terrain shader. */
  wetness: number;
  /** 0..1 — live precipitation intensity (particles + puddle ripples). */
  rainAmount: number;
}

type WeatherState = 'clear' | 'gloomy' | 'storm';
export type StormKind = 'rain' | 'sandstorm' | 'blizzard' | 'ashfall';

interface ModsPreset {
  lightMult: number;
  ambientMult: number;
  fogDensityMult: number;
  saturationMult: number;
  bloomMult: number;
  godRayMult: number;
  skyDarken: number;
  tintHex: number;
  tintStrength: number;
  wetness: number;
  rainAmount: number;
}

const CLEAR_PRESET: ModsPreset = {
  lightMult: 1.04, ambientMult: 1.0, fogDensityMult: 0.92, saturationMult: 1.04,
  bloomMult: 1.06, godRayMult: 1.3, skyDarken: 0, tintHex: 0xffffff, tintStrength: 0,
  wetness: 0, rainAmount: 0,
};

const GLOOMY_PRESET: ModsPreset = {
  lightMult: 0.58, ambientMult: 0.88, fogDensityMult: 1.55, saturationMult: 0.78,
  bloomMult: 0.92, godRayMult: 0.22, skyDarken: 0.3, tintHex: 0x8d97a2, tintStrength: 0.16,
  wetness: 0.15, rainAmount: 0,
};

/** Atmosphere look for each storm species. */
const STORM_PRESETS: Record<StormKind, ModsPreset> = {
  // Downpour — dark storm deck, soaked reflective ground.
  rain: {
    lightMult: 0.52, ambientMult: 0.84, fogDensityMult: 1.8, saturationMult: 0.74,
    bloomMult: 0.96, godRayMult: 0.14, skyDarken: 0.4, tintHex: 0x76828e, tintStrength: 0.2,
    wetness: 1.0, rainAmount: 1.0,
  },
  // Wall of wind-driven sand — warm tan haze swallows the horizon.
  sandstorm: {
    lightMult: 0.66, ambientMult: 0.96, fogDensityMult: 2.6, saturationMult: 0.94,
    bloomMult: 0.95, godRayMult: 0.12, skyDarken: 0.12, tintHex: 0xc89858, tintStrength: 0.55,
    wetness: 0, rainAmount: 1.0,
  },
  // White-out — bright but blinding; the world dissolves into driven snow.
  blizzard: {
    lightMult: 0.72, ambientMult: 1.05, fogDensityMult: 3.0, saturationMult: 0.7,
    bloomMult: 0.95, godRayMult: 0.06, skyDarken: 0.08, tintHex: 0xdfe8f2, tintStrength: 0.5,
    wetness: 0, rainAmount: 1.0,
  },
  // Volcanic ashfall — smothered light under a brown-grey pall.
  ashfall: {
    lightMult: 0.56, ambientMult: 0.86, fogDensityMult: 2.0, saturationMult: 0.84,
    bloomMult: 0.95, godRayMult: 0.1, skyDarken: 0.28, tintHex: 0x55483c, tintStrength: 0.42,
    wetness: 0, rainAmount: 1.0,
  },
};

/** Particle-field shaping per storm species (one Points draw call). */
interface StormParticles {
  count: number;
  /** 'streak' = vertical rain sprite, 'flake' = soft round sprite. */
  sprite: 'streak' | 'flake';
  color: number;
  size: number;
  opacity: number;
  additive: boolean;
  fallMin: number;   // m/s
  fallVar: number;
  windX: number;     // m/s lateral drift
  windZ: number;
}

const STORM_PARTICLES: Record<StormKind, StormParticles> = {
  rain:      { count: 2200, sprite: 'streak', color: 0xbcd6ff, size: 0.65, opacity: 0.5,  additive: true,  fallMin: 26,  fallVar: 14,  windX: 2.6, windZ: 1.2 },
  sandstorm: { count: 2400, sprite: 'flake',  color: 0xd8b070, size: 1.35, opacity: 0.32, additive: false, fallMin: 2.5, fallVar: 2.5, windX: 30,  windZ: 9 },
  blizzard:  { count: 2600, sprite: 'flake',  color: 0xf2f7ff, size: 0.55, opacity: 0.8,  additive: false, fallMin: 7,   fallVar: 6,   windX: 17,  windZ: 5 },
  ashfall:   { count: 1700, sprite: 'flake',  color: 0x9a948c, size: 0.6,  opacity: 0.55, additive: false, fallMin: 2.2, fallVar: 2.2, windX: 3.5, windZ: 2 },
};

/** Per-map climate: which storm, and how storm-prone the map is. */
interface ClimateProfile {
  storm: StormKind;
  /**
   * 0..1 — how readily a clear spell gives way to weather on this map. Scales
   * the Markov chain's drift toward gloom and storm. Even at 1.0 the sky stays
   * clear most of the time; this only changes how often (and how hard) fronts
   * roll through. Swamps/tundra brood; deserts get rare-but-dramatic storms.
   */
  storminess: number;
}

const MAP_CLIMATES: Record<MapType, ClimateProfile> = {
  deep_forest:        { storm: 'rain',      storminess: 0.50 },
  autumn_grove:       { storm: 'rain',      storminess: 0.52 },
  toxic_swamp:        { storm: 'rain',      storminess: 0.82 },
  military_outpost:   { storm: 'rain',      storminess: 0.52 },
  ancient_ruins:      { storm: 'rain',      storminess: 0.44 },
  desert_canyon:      { storm: 'sandstorm', storminess: 0.40 },
  frozen_tundra:      { storm: 'blizzard',  storminess: 0.72 },
  scorched_wasteland: { storm: 'ashfall',   storminess: 0.64 },
};

const DEFAULT_CLIMATE: ClimateProfile = MAP_CLIMATES.deep_forest;

// ── Particle field bounds ──────────────────────────────────────────────────
const FIELD_RADIUS = 42;   // cylinder radius around the camera (m)
const FIELD_TOP = 34;      // sprites respawn / wrap at this height

/** Soft vertical streak sprite (rain) — built once, shared forever. */
let streakTexture: THREE.CanvasTexture | null = null;
function getStreakTexture(): THREE.CanvasTexture {
  if (streakTexture) return streakTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 32);
  grad.addColorStop(0, 'rgba(200,225,255,0)');
  grad.addColorStop(0.35, 'rgba(200,225,255,0.9)');
  grad.addColorStop(0.75, 'rgba(180,210,255,0.55)');
  grad.addColorStop(1, 'rgba(180,210,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(2.5, 0, 3, 32);
  streakTexture = new THREE.CanvasTexture(canvas);
  return streakTexture;
}

/** Soft round sprite (snow / dust / ash) — built once, shared forever. */
let flakeTexture: THREE.CanvasTexture | null = null;
function getFlakeTexture(): THREE.CanvasTexture {
  if (flakeTexture) return flakeTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  flakeTexture = new THREE.CanvasTexture(canvas);
  return flakeTexture;
}

export class WeatherSystem {
  private readonly scene: THREE.Scene;
  private climate: ClimateProfile = DEFAULT_CLIMATE;

  // Smoothly-blended live modifiers (what update() returns).
  private readonly current: WeatherMods = {
    lightMult: 1, ambientMult: 1, fogDensityMult: 1, saturationMult: 1,
    bloomMult: 1, godRayMult: 1, skyDarken: 0, tint: new THREE.Color(0xffffff),
    tintStrength: 0, wetness: 0, rainAmount: 0,
  };
  private target: ModsPreset = CLEAR_PRESET;
  private readonly targetTint = new THREE.Color(0xffffff);

  // ── Weather director ──
  private state: WeatherState = 'clear';
  private holdRemaining = 0;
  private night = false;

  // ── Storm particle field (lazy single Points mesh) ──
  private field: THREE.Points | null = null;
  private fieldMaterial: THREE.PointsMaterial | null = null;
  private fieldVelY: Float32Array | null = null;
  private fieldConfig: StormParticles = STORM_PARTICLES.rain;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Configure the climate for the selected map. Called once at scene init.
   * Opens on a fair director roll and SNAPS the blend to it, so a run that
   * begins mid-gloom looks gloomy from the very first frame.
   */
  setClimate(map: MapType): void {
    this.climate = MAP_CLIMATES[map] ?? DEFAULT_CLIMATE;
    this.fieldConfig = STORM_PARTICLES[this.climate.storm];
    this.state = this.rollNextState(null);
    this.holdRemaining = this.holdSecondsFor(this.state);
    this.target = this.presetFor(this.state);
    this.snapToTarget();
  }

  getStormKind(): StormKind {
    return this.climate.storm;
  }

  private presetFor(state: WeatherState): ModsPreset {
    if (state === 'storm') return STORM_PRESETS[this.climate.storm];
    return state === 'gloomy' ? GLOOMY_PRESET : CLEAR_PRESET;
  }

  /**
   * Hold times. Clear breathes LONG (it's the resting state and dominates the
   * run), gloom is a shorter transitional band, storms are intense but bounded.
   * The long clear holds are what tip the time-weighted mix heavily toward a
   * clear sky on top of the chain already favouring it.
   */
  private holdSecondsFor(state: WeatherState): number {
    if (state === 'storm') return 26 + Math.random() * 30;  // 26–56 s
    if (state === 'gloomy') return 30 + Math.random() * 34; // 30–64 s (transition)
    return 75 + Math.random() * 80;                          // 75–155 s clear (resting)
  }

  /**
   * MARKOV next-state roll — the heart of the "smart" weather. Transitions
   * depend on the CURRENT state so fronts build and decay believably instead
   * of teleporting:
   *   • clear  can only soften into gloom (never snap to a storm), and mostly
   *     re-rolls clear — a sticky, dominant resting state.
   *   • gloom  either burns back off to clear or thickens into the storm.
   *   • storm  winds down through gloom, occasionally digs in, rarely clears
   *     instantly.
   * `storminess` scales the drift toward weather; night calms the sky (fewer
   * storms, slightly more brooding gloom) so it tracks WHERE and WHEN you are.
   */
  private rollNextState(previous: WeatherState | null): WeatherState {
    // Opening roll: almost always a clear sky, occasionally overcast.
    if (previous === null) return Math.random() < 0.82 ? 'clear' : 'gloomy';

    const s = this.climate.storminess * (this.night ? 0.6 : 1);
    const gloomBias = this.night ? 1.25 : 1;

    let pClear: number, pGloomy: number;
    if (previous === 'clear') {
      pGloomy = Math.min(0.4, 0.16 * (0.45 + s) * gloomBias);
      pClear = 1 - pGloomy; // storm probability is 0 — no blue-sky storms
    } else if (previous === 'gloomy') {
      const pStorm = 0.5 * s;
      pClear = 0.42;
      pGloomy = Math.max(0, 1 - pStorm - pClear);
    } else { // storm — decay back through gloom
      const pStorm = 0.36;
      pClear = 0.14;
      pGloomy = Math.max(0, 1 - pStorm - pClear);
    }

    const roll = Math.random();
    if (roll < pClear) return 'clear';
    if (roll < pClear + pGloomy) return 'gloomy';
    return 'storm';
  }

  private snapToTarget(): void {
    const c = this.current;
    const t = this.target;
    c.lightMult = t.lightMult;
    c.ambientMult = t.ambientMult;
    c.fogDensityMult = t.fogDensityMult;
    c.saturationMult = t.saturationMult;
    c.bloomMult = t.bloomMult;
    c.godRayMult = t.godRayMult;
    c.skyDarken = t.skyDarken;
    c.tint.setHex(t.tintHex);
    c.tintStrength = t.tintStrength;
    c.wetness = t.wetness;
    c.rainAmount = t.rainAmount;
  }

  /**
   * Advance the weather and return the live modifiers. Call once per frame
   * with the unscaled delta. `isNight` tunes the director to the day cycle.
   */
  update(delta: number, cameraPosition: THREE.Vector3, isNight: boolean): WeatherMods {
    this.night = isNight;

    this.holdRemaining -= delta;
    if (this.holdRemaining <= 0) {
      this.state = this.rollNextState(this.state);
      this.target = this.presetFor(this.state);
      this.holdRemaining = this.holdSecondsFor(this.state);
    }

    // Cinematic cross-fade: exponential ease with a ~10 s time constant so
    // fronts roll in, never snap. Frame-rate independent. Wetness DRIES ~3×
    // slower than it soaks, so puddles linger after the rain stops — and with
    // the ripples gone they settle into still mirrors.
    const blend = 1 - Math.exp(-delta / 10);
    const dryBlend = 1 - Math.exp(-delta / 30);
    const c = this.current;
    const t = this.target;
    this.targetTint.setHex(t.tintHex);
    c.lightMult += (t.lightMult - c.lightMult) * blend;
    c.ambientMult += (t.ambientMult - c.ambientMult) * blend;
    c.fogDensityMult += (t.fogDensityMult - c.fogDensityMult) * blend;
    c.saturationMult += (t.saturationMult - c.saturationMult) * blend;
    c.bloomMult += (t.bloomMult - c.bloomMult) * blend;
    c.godRayMult += (t.godRayMult - c.godRayMult) * blend;
    c.skyDarken += (t.skyDarken - c.skyDarken) * blend;
    c.tint.lerp(this.targetTint, blend);
    c.tintStrength += (t.tintStrength - c.tintStrength) * blend;
    c.wetness += (t.wetness - c.wetness) * (t.wetness > c.wetness ? blend : dryBlend);
    c.rainAmount += (t.rainAmount - c.rainAmount) * blend;

    this.updateField(delta, cameraPosition, c.rainAmount);
    return c;
  }

  // ── Storm particle field ───────────────────────────────────────────────

  private buildField(): void {
    const cfg = this.fieldConfig;
    const positions = new Float32Array(cfg.count * 3);
    const velY = new Float32Array(cfg.count);
    for (let i = 0; i < cfg.count; i++) {
      const i3 = i * 3;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * FIELD_RADIUS;
      positions[i3] = Math.cos(a) * r;
      positions[i3 + 1] = Math.random() * FIELD_TOP;
      positions[i3 + 2] = Math.sin(a) * r;
      velY[i] = cfg.fallMin + Math.random() * cfg.fallVar;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    this.fieldMaterial = new THREE.PointsMaterial({
      color: cfg.color,
      size: cfg.size,
      map: cfg.sprite === 'streak' ? getStreakTexture() : getFlakeTexture(),
      transparent: true,
      opacity: 0,
      blending: cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
      sizeAttenuation: true,
      fog: false,
    });

    this.field = new THREE.Points(geometry, this.fieldMaterial);
    this.field.frustumCulled = false;
    this.field.visible = false;
    this.field.userData.cannotReceiveAO = true;
    this.fieldVelY = velY;
    this.scene.add(this.field);
  }

  private updateField(delta: number, cameraPosition: THREE.Vector3, amount: number): void {
    if (amount < 0.02) {
      if (this.field) this.field.visible = false;
      return;
    }
    if (!this.field) this.buildField();
    const field = this.field!;
    const material = this.fieldMaterial!;
    const velY = this.fieldVelY!;
    const cfg = this.fieldConfig;

    field.visible = true;
    material.opacity = cfg.opacity * amount;
    // The whole field rides the camera (positions are camera-local), so the
    // storm is always around the player with zero respawn churn.
    field.position.set(cameraPosition.x, 0, cameraPosition.z);

    const positions = (field.geometry.getAttribute('position') as THREE.BufferAttribute)
      .array as Float32Array;
    const windX = cfg.windX * delta;
    const windZ = cfg.windZ * delta;
    const wrap = FIELD_RADIUS * 2;
    for (let i = 0; i < cfg.count; i++) {
      const i3 = i * 3;
      positions[i3] += windX;
      positions[i3 + 1] -= velY[i] * delta;
      positions[i3 + 2] += windZ;
      // Vertical recycle (fell below ground).
      if (positions[i3 + 1] < 0) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * FIELD_RADIUS;
        positions[i3] = Math.cos(a) * r;
        positions[i3 + 1] = FIELD_TOP;
        positions[i3 + 2] = Math.sin(a) * r;
      }
      // Horizontal wrap — strong storm winds (sand/blizzard) push sprites
      // across the cylinder; wrap to the upwind side so density stays even.
      if (positions[i3] > FIELD_RADIUS) positions[i3] -= wrap;
      else if (positions[i3] < -FIELD_RADIUS) positions[i3] += wrap;
      if (positions[i3 + 2] > FIELD_RADIUS) positions[i3 + 2] -= wrap;
      else if (positions[i3 + 2] < -FIELD_RADIUS) positions[i3 + 2] += wrap;
    }
    (field.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  /**
   * Force-build the storm field (hidden) so its shader program compiles
   * during the warmup pass instead of when the first front rolls in.
   */
  prewarm(): void {
    if (!this.field) this.buildField();
  }

  /** Release everything. Safe to call multiple times. */
  dispose(): void {
    if (this.field) {
      this.scene.remove(this.field);
      this.field.geometry.dispose();
      this.fieldMaterial?.dispose();
      this.field = null;
      this.fieldMaterial = null;
      this.fieldVelY = null;
    }
  }

  /** Back-compat alias used by the scene teardown. */
  clear(): void {
    this.dispose();
  }
}
