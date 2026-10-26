import * as THREE from 'three';
import type { MapType } from './MapSystem';
import { Precipitation } from './Precipitation';
import { LightningBolt } from './Lightning';

/**
 * WEATHER SYSTEM v5 — a living sky, on par with the renderer.
 *
 * DIRECTOR — a Markov chain over five states (Auto time of day only — the
 * fixed Day / Night modes hold a permanently clear sky):
 *
 *     clear ⇄ mist        clear → overcast → drizzle → storm
 *       ↑        ↘           ↑         ↘________↙      │
 *       └──────── overcast ←───────────────────────────┘
 *
 * Fronts BUILD and DECAY through the intermediate states — a storm never
 * strikes out of a blue sky and never vanishes in one step. Holds are short
 * enough that a front rolls through every minute or two (clear spells are
 * still the longest), so an Auto run genuinely changes; each map's climate sets
 * its storm SPECIES, how storm-prone it is, whether its storms carry lightning
 * (forest/ruins/outpost thunderstorms; volcanic lightning in the ashfall) and
 * whether it breeds dawn mist. Nights run calmer and moodier.
 *
 * OUTPUT — a struct of atmosphere modifiers the render loop folds into the
 * day/night atmosphere (light, fog, grade, bloom, god rays, sky darken/tint,
 * ground wetness), plus the v5 terms:
 *   cloudCover  the sky shader's deck (clear wisps → a full storm ceiling)
 *   wind        0..1 gale strength (grass/trees/leaves gusts, precip slant)
 *   lightning   0..1 live flash (sky, ambient, bloom, rain sparkle)
 *   rainbow     0..1 bow left in the sky when a rain front clears into sun
 *   mist        0..1 low ground mist (height-fog boost)
 *
 * VISUALS it owns — GPU precipitation anchored in the world (Precipitation)
 * and a pooled lightning bolt (Lightning). Both are built at setClimate(), so
 * their programs link during the warmup compile, and cost nothing while clear.
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
  /** 0..1 — sky cloud deck coverage. */
  cloudCover: number;
  /** 0..1 — wind strength. */
  wind: number;
  /** 0..1+ — live lightning flash. */
  lightning: number;
  /** Unit direction (world) toward the latest strike — sky flash glow. */
  flashDir: THREE.Vector3;
  /** 0..1 — post-rain rainbow strength. */
  rainbow: number;
  /** 0..1 — ground mist density. */
  mist: number;
}

type WeatherState = 'clear' | 'mist' | 'overcast' | 'drizzle' | 'storm';
/** Wire order for multiplayer sync (index = the `ws` field). */
const WEATHER_STATES: readonly WeatherState[] = ['clear', 'mist', 'overcast', 'drizzle', 'storm'];
export type StormKind = 'rain' | 'sandstorm' | 'blizzard' | 'ashfall' | 'spores' | 'wisps';

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
  cloudCover: number;
  wind: number;
  mist: number;
}

const CLEAR_PRESET: ModsPreset = {
  lightMult: 1.04, ambientMult: 1.0, fogDensityMult: 0.92, saturationMult: 1.04,
  bloomMult: 1.06, godRayMult: 1.3, skyDarken: 0, tintHex: 0xffffff, tintStrength: 0,
  wetness: 0, rainAmount: 0, cloudCover: 0, wind: 0.12, mist: 0,
};

// Low ground mist: soft light, glowing shafts, the air thick only near the
// floor (height fog — see App). Kept well clear of a white-out: fog ≤ ~1.6×,
// tint ≤ 0.12, never wet.
const MIST_PRESET: ModsPreset = {
  lightMult: 0.86, ambientMult: 1.0, fogDensityMult: 1.45, saturationMult: 0.9,
  bloomMult: 1.08, godRayMult: 1.45, skyDarken: 0.04, tintHex: 0xcfd6dc, tintStrength: 0.1,
  wetness: 0, rainAmount: 0, cloudCover: 0.22, wind: 0.04, mist: 1,
};

const OVERCAST_PRESET: ModsPreset = {
  lightMult: 0.42, ambientMult: 0.96, fogDensityMult: 1.55, saturationMult: 0.8,
  bloomMult: 0.92, godRayMult: 0.22, skyDarken: 0.3, tintHex: 0x8d97a2, tintStrength: 0.16,
  // wetness 0: an overcast sky alone never wets the ground. Puddles form ONLY
  // from actual rain (and only on the deep forest — see the App.tsx uRainWet
  // gate), so dry maps never sprout reflective "potholes" under a grey sky.
  wetness: 0, rainAmount: 0, cloudCover: 0.85, wind: 0.32, mist: 0,
};

/** Atmosphere look for each storm species at full strength. */
const STORM_PRESETS: Record<StormKind, ModsPreset> = {
  // Downpour — dark storm deck, soaked reflective ground, gusting wind.
  rain: {
    lightMult: 0.26, ambientMult: 0.94, fogDensityMult: 1.8, saturationMult: 0.76,
    bloomMult: 0.96, godRayMult: 0.14, skyDarken: 0.42, tintHex: 0x76828e, tintStrength: 0.2,
    wetness: 1.0, rainAmount: 1.0, cloudCover: 1, wind: 0.7, mist: 0,
  },
  // Wall of wind-driven sand — warm tan haze swallows the horizon.
  sandstorm: {
    lightMult: 0.5, ambientMult: 1.02, fogDensityMult: 2.6, saturationMult: 0.94,
    bloomMult: 0.95, godRayMult: 0.12, skyDarken: 0.12, tintHex: 0xc89858, tintStrength: 0.55,
    wetness: 0, rainAmount: 1.0, cloudCover: 0.7, wind: 1, mist: 0,
  },
  // White-out — bright but blinding; the world dissolves into driven snow.
  blizzard: {
    lightMult: 0.42, ambientMult: 1.12, fogDensityMult: 3.0, saturationMult: 0.7,
    bloomMult: 0.95, godRayMult: 0.06, skyDarken: 0.08, tintHex: 0xdfe8f2, tintStrength: 0.5,
    wetness: 0, rainAmount: 1.0, cloudCover: 1, wind: 0.95, mist: 0,
  },
  // Volcanic ashfall — smothered light under a brown-grey pall.
  ashfall: {
    lightMult: 0.38, ambientMult: 0.92, fogDensityMult: 2.0, saturationMult: 0.84,
    bloomMult: 0.95, godRayMult: 0.1, skyDarken: 0.28, tintHex: 0x55483c, tintStrength: 0.42,
    wetness: 0, rainAmount: 1.0, cloudCover: 0.95, wind: 0.4, mist: 0,
  },
  // Toxic spore bloom (swamp) — sickly green murk, luminous spores welling up.
  spores: {
    lightMult: 0.60, ambientMult: 0.94, fogDensityMult: 1.95, saturationMult: 1.06,
    bloomMult: 1.10, godRayMult: 0.2, skyDarken: 0.24, tintHex: 0x3f5e36, tintStrength: 0.3,
    wetness: 0, rainAmount: 1.0, cloudCover: 0.8, wind: 0.15, mist: 0.6,
  },
  // Spectral wisps (Twilight Vale) — an ethereal front, not a harsh storm.
  wisps: {
    lightMult: 0.78, ambientMult: 0.98, fogDensityMult: 1.5, saturationMult: 1.0,
    bloomMult: 1.16, godRayMult: 0.42, skyDarken: 0.16, tintHex: 0x6a4a8a, tintStrength: 0.22,
    wetness: 0, rainAmount: 1.0, cloudCover: 0.6, wind: 0.12, mist: 0.7,
  },
};

/** Per-map climate. */
interface ClimateProfile {
  storm: StormKind;
  /** 0..1 — how readily clear spells give way to weather (never the clear-
   *  dominant SHAPE of the chain, only how often fronts roll through). */
  storminess: number;
  /** Do this map's storms throw lightning? */
  lightning: boolean;
  /** 0..1 — how readily the map breeds ground mist. */
  mistiness: number;
}

const MAP_CLIMATES: Record<MapType, ClimateProfile> = {
  deep_forest:        { storm: 'rain',      storminess: 0.5,  lightning: true,  mistiness: 0.7 },
  autumn_grove:       { storm: 'wisps',     storminess: 0.56, lightning: false, mistiness: 0.9 },
  toxic_swamp:        { storm: 'spores',    storminess: 0.8,  lightning: false, mistiness: 1.0 },
  military_outpost:   { storm: 'rain',      storminess: 0.52, lightning: true,  mistiness: 0.4 },
  ancient_ruins:      { storm: 'rain',      storminess: 0.48, lightning: true,  mistiness: 0.75 },
  desert_canyon:      { storm: 'sandstorm', storminess: 0.4,  lightning: false, mistiness: 0 },
  frozen_tundra:      { storm: 'blizzard',  storminess: 0.72, lightning: false, mistiness: 0.6 },
  scorched_wasteland: { storm: 'ashfall',   storminess: 0.64, lightning: true,  mistiness: 0 },
};

const DEFAULT_CLIMATE: ClimateProfile = MAP_CLIMATES.deep_forest;

const _top = new THREE.Vector3();
const _ground = new THREE.Vector3();

export interface StrikeEvent {
  x: number; y: number; z: number;
  distance: number;
  /** A visible bolt (vs. sheet lightning inside the clouds). */
  bolt: boolean;
}

export class WeatherSystem {
  private readonly scene: THREE.Scene;
  private climate: ClimateProfile = DEFAULT_CLIMATE;

  // Smoothly-blended live modifiers (what update() returns).
  private readonly current: WeatherMods = {
    lightMult: 1, ambientMult: 1, fogDensityMult: 1, saturationMult: 1,
    bloomMult: 1, godRayMult: 1, skyDarken: 0, tint: new THREE.Color(0xffffff),
    tintStrength: 0, wetness: 0, rainAmount: 0, cloudCover: 0.18, wind: 0.12,
    lightning: 0, flashDir: new THREE.Vector3(0, 1, 0), rainbow: 0, mist: 0,
  };
  private target: ModsPreset = CLEAR_PRESET;
  private readonly drizzle: ModsPreset = { ...CLEAR_PRESET };
  private readonly targetTint = new THREE.Color(0xffffff);

  // ── Director ──
  private state: WeatherState = 'clear';
  private holdRemaining = 0;
  private night = false;
  /** Auto time-of-day = a living, frequently changing sky; the fixed Day /
   *  Night modes are a deliberate choice of light and stay clear. */
  private dynamic = true;
  private lastRainEnd = -999;
  private clock = 0;

  // ── Visuals ──
  private precip: Precipitation | null = null;
  private bolt: LightningBolt | null = null;
  private quality = 1;
  private strikeTimer = 6;
  private sheetFlash = 0;
  private gust = 0;
  private gustTarget = 0;
  private gustTimer = 0;
  private readonly wind2 = new THREE.Vector2(1, 0);
  /** Strike callback (thunder audio, lighting): set by the owner. */
  onStrike: ((e: StrikeEvent) => void) | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** true = weather rolls (Auto time of day); false = permanently clear
   *  (fixed Day / Night). Call before setClimate. */
  setDynamic(dynamic: boolean): void {
    this.dynamic = dynamic;
  }

  /** Particle density (the preset's particleDensity). Call before setClimate. */
  setQuality(q: number): void {
    this.quality = q;
  }

  /**
   * Configure the climate for the selected map. Called once at scene init.
   * Opens on a fair director roll and SNAPS the blend to it, so a run that
   * begins in mist looks misty from the very first frame.
   */
  setClimate(map: MapType): void {
    this.climate = MAP_CLIMATES[map] ?? DEFAULT_CLIMATE;
    this.buildDrizzle();
    this.state = this.rollNextState(null);
    this.holdRemaining = this.holdSecondsFor(this.state);
    this.target = this.presetFor(this.state);
    this.snapToTarget();
    this.precip?.dispose();
    this.precip = new Precipitation(this.scene, this.climate.storm, this.quality);
    if (this.climate.lightning) {
      this.bolt = new LightningBolt(this.scene);
      // Volcanic lightning burns hotter than a summer thunderstorm.
      if (this.climate.storm === 'ashfall') this.bolt.setColors(0xfff1dc, 0xff9a5a);
    }
  }

  getStormKind(): StormKind {
    return this.climate.storm;
  }

  /** The director's current state (dev hooks / diagnostics). */
  getState(): WeatherState {
    return this.state;
  }

  /** Current state as a wire index (0 clear … 4 storm) for multiplayer sync. */
  getStateIndex(): number {
    return WEATHER_STATES.indexOf(this.state);
  }

  /**
   * Multiplayer guest: mirror the host's sky. Blends like a local change
   * (never snaps) and parks the local director so it never rolls on its own.
   */
  follow(index: number): void {
    this.holdRemaining = 1e9;
    const st = WEATHER_STATES[index];
    if (!st || st === this.state) return;
    const was = this.state;
    this.state = st;
    this.target = this.presetFor(st);
    if ((was === 'storm' || was === 'drizzle') && this.climate.storm === 'rain'
      && (st === 'overcast' || st === 'clear')) {
      this.lastRainEnd = this.clock;
    }
  }

  /** Drizzle = a light version of the map's storm species. */
  private buildDrizzle(): void {
    const s = STORM_PRESETS[this.climate.storm];
    const o = OVERCAST_PRESET;
    const k = 0.45;
    const d = this.drizzle;
    d.lightMult = o.lightMult + (s.lightMult - o.lightMult) * k;
    d.ambientMult = o.ambientMult + (s.ambientMult - o.ambientMult) * k;
    d.fogDensityMult = o.fogDensityMult + (s.fogDensityMult - o.fogDensityMult) * k;
    d.saturationMult = o.saturationMult + (s.saturationMult - o.saturationMult) * k;
    d.bloomMult = o.bloomMult + (s.bloomMult - o.bloomMult) * k;
    d.godRayMult = o.godRayMult + (s.godRayMult - o.godRayMult) * k;
    d.skyDarken = o.skyDarken + (s.skyDarken - o.skyDarken) * k;
    d.tintHex = s.tintHex;
    d.tintStrength = o.tintStrength + (s.tintStrength - o.tintStrength) * k;
    d.wetness = s.wetness * 0.45;
    d.rainAmount = 0.32;
    d.cloudCover = 0.9;
    d.wind = o.wind + (s.wind - o.wind) * 0.5;
    d.mist = s.mist * 0.5;
  }

  private presetFor(state: WeatherState): ModsPreset {
    switch (state) {
      case 'storm': return STORM_PRESETS[this.climate.storm];
      case 'drizzle': return this.drizzle;
      case 'overcast': return OVERCAST_PRESET;
      case 'mist': return MIST_PRESET;
      default: return CLEAR_PRESET;
    }
  }

  /** Bounded holds so the sky keeps moving: fronts arrive every minute or
   *  two, clear spells still the longest. */
  private holdSecondsFor(state: WeatherState): number {
    switch (state) {
      case 'storm': return 24 + Math.random() * 18;
      case 'drizzle': return 18 + Math.random() * 16;
      case 'overcast': return 18 + Math.random() * 18;
      case 'mist': return 26 + Math.random() * 22;
      default: return 34 + Math.random() * 36;
    }
  }

  /**
   * MARKOV next-state roll — transitions depend on the current state, so
   * fronts build and decay believably; `storminess` scales the drift toward
   * weather, `mistiness` gates mist, night calms storms and favours mist.
   */
  private rollNextState(previous: WeatherState | null): WeatherState {
    const s = this.climate.storminess * (this.night ? 0.6 : 1);
    const m = this.climate.mistiness * (this.night ? 1.3 : 1);
    if (!this.dynamic) return 'clear';
    if (previous === null) {
      const r = Math.random();
      if (r < 0.55) return 'clear';
      if (r < 0.55 + 0.18 * m) return 'mist';
      return 'overcast';
    }
    const pick = (weights: Array<[WeatherState, number]>): WeatherState => {
      let total = 0;
      for (const [, w] of weights) total += w;
      let r = Math.random() * total;
      for (const [st, w] of weights) { r -= w; if (r <= 0) return st; }
      return weights[0][0];
    };
    switch (previous) {
      // A clear spell usually gives way to SOMETHING — mist on the damp maps,
      // a gathering overcast everywhere — so Auto runs see real fronts.
      case 'clear':
        return pick([['clear', 0.34], ['mist', 0.2 * m], ['overcast', 0.46 * (0.5 + s)]]);
      case 'mist':
        return pick([['clear', 0.5], ['mist', 0.1], ['overcast', 0.4]]);
      case 'overcast':
        return pick([['clear', 0.26], ['overcast', 0.12], ['drizzle', 0.38 * (0.5 + s)], ['storm', 0.26 * s]]);
      case 'drizzle':
        return pick([['overcast', 0.32], ['drizzle', 0.12], ['storm', 0.5 * (0.3 + s)], ['clear', 0.12]]);
      default: // storm — winds down through drizzle / overcast
        return pick([['storm', 0.14], ['drizzle', 0.5], ['overcast', 0.36]]);
    }
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
    c.cloudCover = t.cloudCover;
    c.wind = t.wind;
    c.mist = t.mist;
  }

  /**
   * Advance the weather and return the live modifiers. Call once per frame
   * with the unscaled delta. `light` is the colour precipitation should take
   * from the sky this frame; `windDir` the breeze heading (unit XZ);
   * `sunUp` 0..1 how high/visible the sun is (rainbows need sun);
   * `viewDist` the camera far distance (lightning lands inside it).
   */
  update(
    delta: number, cameraPosition: THREE.Vector3, isNight: boolean,
    light?: THREE.Color, windDir?: THREE.Vector2, sunUp = 1, viewDist = 200,
  ): WeatherMods {
    this.night = isNight;
    this.clock += delta;

    this.holdRemaining -= delta;
    if (this.holdRemaining <= 0) {
      const was = this.state;
      this.state = this.rollNextState(this.state);
      this.target = this.presetFor(this.state);
      this.holdRemaining = this.holdSecondsFor(this.state);
      if ((was === 'storm' || was === 'drizzle') && this.climate.storm === 'rain'
        && (this.state === 'overcast' || this.state === 'clear')) {
        this.lastRainEnd = this.clock;
      }
    }

    // Cinematic cross-fade (~8 s time constant) — fronts roll in, never
    // snap. Wetness DRIES ~3× slower than it soaks, so puddles linger after
    // the rain stops and settle into still mirrors.
    const blend = 1 - Math.exp(-delta / 8);
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
    c.cloudCover += (t.cloudCover - c.cloudCover) * blend;
    c.mist += (t.mist - c.mist) * (1 - Math.exp(-delta / 14));

    // Wind: the preset's base plus gusts that build and fall away.
    this.gustTimer -= delta;
    if (this.gustTimer <= 0) {
      this.gustTimer = 2 + Math.random() * 5;
      this.gustTarget = Math.random() < 0.4 ? Math.random() * 0.45 : 0;
    }
    this.gust += (this.gustTarget - this.gust) * Math.min(1, delta * 0.9);
    const windTarget = Math.min(1, t.wind * (1 + this.gust));
    c.wind += (windTarget - c.wind) * Math.min(1, delta * 0.6);

    // Rainbow: a rain front clearing into sunlight paints a bow for a while.
    const sinceRain = this.clock - this.lastRainEnd;
    const bowTarget = sinceRain > 8 && sinceRain < 120 && !isNight
      ? (1 - c.rainAmount) * (1 - c.cloudCover * 0.6) * Math.min(1, sunUp * 2) * (1 - sinceRain / 120)
      : 0;
    c.rainbow += (bowTarget - c.rainbow) * Math.min(1, delta * 0.15);

    this.updateLightning(delta, cameraPosition, viewDist);

    // Precipitation rides the live wind (u/s) along the grass's heading.
    if (windDir) this.wind2.copy(windDir);
    if (this.precip) {
      const kind = this.climate.storm;
      const ws = kind === 'sandstorm' ? 26 : kind === 'blizzard' ? 15 : kind === 'rain' ? 9 : 3;
      const speed = c.wind * ws;
      this.precip.update(
        delta, cameraPosition, c.rainAmount,
        this.wind2.x * speed, this.wind2.y * speed,
        light ?? _white, c.lightning,
      );
    }
    return c;
  }

  private updateLightning(delta: number, cam: THREE.Vector3, viewDist: number): void {
    const c = this.current;
    let flash = 0;
    if (this.bolt) flash = this.bolt.update(delta);
    this.sheetFlash = Math.max(0, this.sheetFlash - delta * 5);
    // Thunderstorms only: a storm at full tilt strikes every few seconds.
    const intensity = this.climate.lightning ? Math.max(0, (c.rainAmount - 0.55) / 0.45) * (this.state === 'storm' ? 1 : 0.3) : 0;
    if (intensity > 0.02) {
      this.strikeTimer -= delta * intensity;
      if (this.strikeTimer <= 0) {
        this.strikeTimer = 3 + Math.random() * 9;
        const bolt = !!this.bolt && Math.random() < 0.65;
        const ang = Math.random() * Math.PI * 2;
        const dist = viewDist * (bolt ? 0.45 + Math.random() * 0.4 : 0.9 + Math.random() * 1.5);
        const gx = cam.x + Math.cos(ang) * dist, gz = cam.z + Math.sin(ang) * dist;
        c.flashDir.set(Math.cos(ang), 0.35, Math.sin(ang)).normalize();
        if (bolt && this.bolt) {
          _top.set(gx + (Math.random() - 0.5) * 30, 110 + Math.random() * 40, gz + (Math.random() - 0.5) * 30);
          _ground.set(gx, 0, gz);
          this.bolt.strike(_top, _ground, cam, 1.6 + Math.random() * 1.0);
        } else {
          this.sheetFlash = 0.5 + Math.random() * 0.5;
        }
        this.onStrike?.({ x: gx, y: bolt ? 0 : 90, z: gz, distance: dist, bolt });
      }
    }
    flash = Math.max(flash * 0.85, this.sheetFlash * 0.6);
    c.lightning = flash;
  }

  /** Dev / test: jump the director to a state (snap = skip the cross-fade). */
  forceState(state: string, snap = true): void {
    const st = (['clear', 'mist', 'overcast', 'drizzle', 'storm'] as WeatherState[]).find((x) => x === state);
    if (!st) return;
    this.state = st;
    this.target = this.presetFor(st);
    this.holdRemaining = 600;
    if (snap) this.snapToTarget();
    if (st === 'clear') this.lastRainEnd = this.clock - 10;
    this.strikeTimer = 0.5;
  }

  /** Back-compat no-op: the precipitation + bolt are built at setClimate()
   *  and stay in the scene (zero-cost while clear), so warmup links them. */
  prewarm(): void { /* built eagerly */ }

  /** Release everything. Safe to call multiple times. */
  dispose(): void {
    this.precip?.dispose();
    this.precip = null;
    this.bolt?.dispose(this.scene);
    this.bolt = null;
    this.onStrike = null;
  }

  /** Back-compat alias used by the scene teardown. */
  clear(): void {
    this.dispose();
  }
}

const _white = new THREE.Color(1, 1, 1);
