import * as THREE from 'three';
import type { MapType } from './MapSystem';

/**
 * WEATHER SYSTEM v5 — clear-dominant real-weather director.
 *
 * Always-on and fully automatic: there is no weather menu. Every run gets a
 * living sky driven by a weather DIRECTOR that behaves like actual weather:
 *
 *   • MOSTLY CLEAR. Clear skies dominate every climate (~60-78% of rolls),
 *     starts are heavily biased toward clear, and long clear holds make sun
 *     the default mood. Rain/gloom/fog are occasional fronts, not a permanent
 *     filter over the game.
 *   • SIX CONDITIONS everywhere: clear, gloomy (overcast), fog/mist, light
 *     precipitation (drizzle / flurries / dust haze / ash drift), the map's
 *     signature storm, and — on rain climates — full THUNDERSTORMS with
 *     lightning flashes and rolling thunder.
 *   • WEATHER FRONTS, not slot-machine jumps. The director rolls the next
 *     condition from per-map weights, then routes through a short bridge
 *     state when the severity jump is too large — so a storm builds
 *     clear → overcast → storm and tapers storm → drizzle → clear, exactly
 *     like a front passing through. Holds are randomized per state (sunny
 *     spells breathe for minutes; storms are intense but bounded).
 *   • Night calms the sky: fewer violent storms, a touch more mist/gloom, and
 *     no snow-white tint leaking into non-snow maps.
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
  /** 0..1 — lightning flash envelope (thunderstorm only). */
  lightning: number;
}

type WeatherState = 'clear' | 'gloomy' | 'fog' | 'drizzle' | 'storm' | 'thunder';
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

// Fog / mist — a soft morning haze between the trunks; light shafts cut
// through it (godRay kept meaningful) and colours mute slightly. Tuned as
// MIST, not white-out: density ≤ ~2× and a restrained tint, so the map's
// own palette (forest greens etc.) stays readable — the original 3.1× /
// 0.42-tint version blanked the ground to fog-white on every map. No
// wetness: fog doesn't soak the ground or wake the puddle mirrors.
const FOG_PRESET: ModsPreset = {
  lightMult: 0.8, ambientMult: 0.98, fogDensityMult: 2.0, saturationMult: 0.86,
  bloomMult: 1.0, godRayMult: 0.45, skyDarken: 0.08, tintHex: 0xb6bdc6, tintStrength: 0.18,
  wetness: 0, rainAmount: 0,
};

/** Atmosphere look for each full-strength storm species. */
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

// Thunderstorm — only rolled on rain climates. Darker than the plain
// downpour; the lightning/thunder machinery lights it up.
const THUNDER_PRESET: ModsPreset = {
  lightMult: 0.42, ambientMult: 0.8, fogDensityMult: 2.0, saturationMult: 0.68,
  bloomMult: 1.0, godRayMult: 0.08, skyDarken: 0.52, tintHex: 0x6a7585, tintStrength: 0.26,
  wetness: 1.0, rainAmount: 1.0,
};

/** Blend two presets — used to derive each climate's "light precip" look. */
function mixPresets(a: ModsPreset, b: ModsPreset, t: number, overrides?: Partial<ModsPreset>): ModsPreset {
  const lerp = (x: number, y: number) => x + (y - x) * t;
  return {
    lightMult: lerp(a.lightMult, b.lightMult),
    ambientMult: lerp(a.ambientMult, b.ambientMult),
    fogDensityMult: lerp(a.fogDensityMult, b.fogDensityMult),
    saturationMult: lerp(a.saturationMult, b.saturationMult),
    bloomMult: lerp(a.bloomMult, b.bloomMult),
    godRayMult: lerp(a.godRayMult, b.godRayMult),
    skyDarken: lerp(a.skyDarken, b.skyDarken),
    tintHex: b.tintHex,
    tintStrength: lerp(a.tintStrength, b.tintStrength),
    wetness: lerp(a.wetness, b.wetness),
    rainAmount: lerp(a.rainAmount, b.rainAmount),
    ...overrides,
  };
}

// Light precipitation per storm species — drizzle on rain maps, flurries on
// the tundra, a dusty wind in the desert, drifting ash on the wasteland.
// Roughly 45% of the way to the full storm, with a softer particle load.
const DRIZZLE_PRESETS: Record<StormKind, ModsPreset> = {
  rain:      mixPresets(CLEAR_PRESET, STORM_PRESETS.rain, 0.45, { wetness: 0.35, rainAmount: 0.35 }),
  sandstorm: mixPresets(CLEAR_PRESET, STORM_PRESETS.sandstorm, 0.4, { rainAmount: 0.3 }),
  blizzard:  mixPresets(CLEAR_PRESET, STORM_PRESETS.blizzard, 0.4, { rainAmount: 0.35 }),
  ashfall:   mixPresets(CLEAR_PRESET, STORM_PRESETS.ashfall, 0.4, { rainAmount: 0.3 }),
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

type WeatherWeights = Record<WeatherState, number>;
type WeatherDurations = Partial<Record<WeatherState, [number, number]>>;
type PresetTuning = Partial<Record<WeatherState, Partial<ModsPreset>>>;

/**
 * Per-map climate. We keep the director data here instead of scattering map
 * checks through the update loop: each map owns its weather weights, start
 * bias, front durations, night behaviour and visual tuning.
 */
interface ClimateProfile {
  storm: StormKind;
  /** Opening roll bias. Runs can still start moody, but usually start clear. */
  openingClearChance: number;
  /** Base weather lottery. Clear is intentionally the largest weight. */
  weights: WeatherWeights;
  /** Multipliers applied to the base lottery while the sun is down. */
  nightMultipliers: WeatherWeights;
  /** Optional per-map front hold ranges in seconds. */
  durations?: WeatherDurations;
  /** After this many non-clear fronts, the director schedules a sun break. */
  clearBreakAfter: number;
  /** Map-specific visual overrides for each state. */
  tuning?: PresetTuning;
  /** Per-map particle load within the global graphics budget. */
  particleDensity?: number;
}

const BASE_DURATIONS: Record<WeatherState, [number, number]> = {
  clear: [120, 220],
  gloomy: [34, 64],
  fog: [38, 72],
  drizzle: [28, 56],
  storm: [22, 42],
  thunder: [20, 36],
};

function makeWeights(weights: WeatherWeights): WeatherWeights {
  return weights;
}

function makeNightMultipliers(overrides: Partial<WeatherWeights> = {}): WeatherWeights {
  return {
    clear: 1.08,
    gloomy: 1.12,
    fog: 1.18,
    drizzle: 0.85,
    storm: 0.62,
    thunder: 0.5,
    ...overrides,
  };
}

const MAP_CLIMATES: Record<MapType, ClimateProfile> = {
  deep_forest: {
    storm: 'rain',
    openingClearChance: 0.9,
    clearBreakAfter: 2,
    particleDensity: 0.86,
    weights: makeWeights({ clear: 74, gloomy: 8, fog: 6, drizzle: 5, storm: 4, thunder: 3 }),
    nightMultipliers: makeNightMultipliers({ fog: 1.25, storm: 0.55, thunder: 0.42 }),
    durations: { clear: [145, 260], fog: [28, 52], storm: [20, 34], thunder: [18, 30] },
    tuning: {
      gloomy: { fogDensityMult: 1.22, saturationMult: 0.86, skyDarken: 0.18, tintHex: 0x71816e, tintStrength: 0.08 },
      fog: { lightMult: 0.88, fogDensityMult: 1.55, saturationMult: 0.9, skyDarken: 0.04, tintHex: 0x8fa18d, tintStrength: 0.09 },
      drizzle: { lightMult: 0.7, fogDensityMult: 1.25, saturationMult: 0.82, skyDarken: 0.18, tintHex: 0x69756f, tintStrength: 0.12, wetness: 0.22, rainAmount: 0.28 },
      storm: { lightMult: 0.54, fogDensityMult: 1.48, saturationMult: 0.74, skyDarken: 0.32, tintHex: 0x5f6e68, tintStrength: 0.16, wetness: 0.74, rainAmount: 0.9 },
      thunder: { lightMult: 0.44, fogDensityMult: 1.65, saturationMult: 0.68, skyDarken: 0.42, tintHex: 0x586976, tintStrength: 0.2, wetness: 0.82, rainAmount: 0.95 },
    },
  },
  autumn_grove: {
    storm: 'rain',
    openingClearChance: 0.86,
    clearBreakAfter: 3,
    particleDensity: 0.78,
    weights: makeWeights({ clear: 68, gloomy: 13, fog: 8, drizzle: 5, storm: 4, thunder: 2 }),
    nightMultipliers: makeNightMultipliers({ gloomy: 1.22, fog: 1.2, storm: 0.5, thunder: 0.35 }),
    durations: { clear: [125, 230], gloomy: [42, 76], storm: [20, 34] },
    tuning: {
      gloomy: { lightMult: 0.58, fogDensityMult: 1.36, saturationMult: 0.82, skyDarken: 0.24, tintHex: 0x6f6480, tintStrength: 0.16 },
      fog: { lightMult: 0.72, fogDensityMult: 1.75, saturationMult: 0.84, skyDarken: 0.1, tintHex: 0x81799a, tintStrength: 0.16 },
      drizzle: { fogDensityMult: 1.32, skyDarken: 0.24, tintHex: 0x665b7a, tintStrength: 0.18, wetness: 0.2, rainAmount: 0.26 },
      storm: { fogDensityMult: 1.55, skyDarken: 0.38, tintHex: 0x574d68, tintStrength: 0.22, wetness: 0.62, rainAmount: 0.82 },
      thunder: { fogDensityMult: 1.7, skyDarken: 0.48, tintHex: 0x5d607c, tintStrength: 0.24, wetness: 0.72, rainAmount: 0.9 },
    },
  },
  toxic_swamp: {
    storm: 'rain',
    openingClearChance: 0.76,
    clearBreakAfter: 3,
    particleDensity: 0.9,
    weights: makeWeights({ clear: 60, gloomy: 14, fog: 12, drizzle: 7, storm: 4, thunder: 3 }),
    nightMultipliers: makeNightMultipliers({ clear: 0.98, gloomy: 1.26, fog: 1.3, storm: 0.58, thunder: 0.44 }),
    durations: { clear: [105, 195], fog: [48, 88], drizzle: [34, 62], storm: [22, 38] },
    tuning: {
      gloomy: { lightMult: 0.58, ambientMult: 0.94, fogDensityMult: 1.48, saturationMult: 0.86, skyDarken: 0.22, tintHex: 0x526b4d, tintStrength: 0.18 },
      fog: { lightMult: 0.76, ambientMult: 1.0, fogDensityMult: 2.25, saturationMult: 0.86, skyDarken: 0.02, tintHex: 0x607a55, tintStrength: 0.22 },
      drizzle: { lightMult: 0.66, fogDensityMult: 1.55, saturationMult: 0.82, skyDarken: 0.24, tintHex: 0x556f5a, tintStrength: 0.22, wetness: 0.44, rainAmount: 0.32 },
      storm: { lightMult: 0.48, fogDensityMult: 1.95, saturationMult: 0.76, skyDarken: 0.38, tintHex: 0x455846, tintStrength: 0.25, wetness: 0.95, rainAmount: 0.92 },
      thunder: { lightMult: 0.4, fogDensityMult: 2.15, saturationMult: 0.72, skyDarken: 0.5, tintHex: 0x465364, tintStrength: 0.28, wetness: 1.0, rainAmount: 1.0 },
    },
  },
  military_outpost: {
    storm: 'rain',
    openingClearChance: 0.88,
    clearBreakAfter: 3,
    particleDensity: 0.72,
    weights: makeWeights({ clear: 70, gloomy: 12, fog: 6, drizzle: 6, storm: 4, thunder: 2 }),
    nightMultipliers: makeNightMultipliers({ gloomy: 1.18, fog: 1.12, storm: 0.52, thunder: 0.36 }),
    durations: { clear: [135, 245], gloomy: [38, 70], storm: [24, 40] },
    tuning: {
      gloomy: { lightMult: 0.66, fogDensityMult: 1.32, saturationMult: 0.78, skyDarken: 0.24, tintHex: 0x77776d, tintStrength: 0.12 },
      fog: { lightMult: 0.78, fogDensityMult: 1.7, saturationMult: 0.78, skyDarken: 0.06, tintHex: 0x8a887a, tintStrength: 0.14 },
      drizzle: { fogDensityMult: 1.28, saturationMult: 0.76, skyDarken: 0.24, tintHex: 0x6d7175, tintStrength: 0.15, wetness: 0.24, rainAmount: 0.3 },
      storm: { fogDensityMult: 1.6, saturationMult: 0.7, skyDarken: 0.42, tintHex: 0x626b72, tintStrength: 0.2, wetness: 0.78, rainAmount: 0.9 },
      thunder: { fogDensityMult: 1.78, saturationMult: 0.66, skyDarken: 0.52, tintHex: 0x677386, tintStrength: 0.24, wetness: 0.86, rainAmount: 1.0 },
    },
  },
  ancient_ruins: {
    storm: 'rain',
    openingClearChance: 0.86,
    clearBreakAfter: 3,
    particleDensity: 0.82,
    weights: makeWeights({ clear: 66, gloomy: 12, fog: 7, drizzle: 8, storm: 5, thunder: 2 }),
    nightMultipliers: makeNightMultipliers({ gloomy: 1.16, fog: 1.14, storm: 0.58, thunder: 0.42 }),
    durations: { clear: [120, 230], drizzle: [34, 68], storm: [24, 44] },
    tuning: {
      gloomy: { lightMult: 0.6, fogDensityMult: 1.38, saturationMult: 0.82, skyDarken: 0.26, tintHex: 0x777b76, tintStrength: 0.13 },
      fog: { lightMult: 0.78, fogDensityMult: 1.85, saturationMult: 0.86, skyDarken: 0.06, tintHex: 0x85877e, tintStrength: 0.14 },
      drizzle: { lightMult: 0.66, fogDensityMult: 1.34, saturationMult: 0.78, skyDarken: 0.24, tintHex: 0x707981, tintStrength: 0.18, wetness: 0.42, rainAmount: 0.36 },
      storm: { lightMult: 0.48, fogDensityMult: 1.72, saturationMult: 0.72, skyDarken: 0.42, tintHex: 0x63717c, tintStrength: 0.22, wetness: 0.9, rainAmount: 0.95 },
      thunder: { lightMult: 0.4, fogDensityMult: 1.9, saturationMult: 0.66, skyDarken: 0.54, tintHex: 0x687993, tintStrength: 0.25, wetness: 1.0, rainAmount: 1.0 },
    },
  },
  desert_canyon: {
    storm: 'sandstorm',
    openingClearChance: 0.94,
    clearBreakAfter: 3,
    particleDensity: 0.95,
    weights: makeWeights({ clear: 78, gloomy: 6, fog: 4, drizzle: 5, storm: 7, thunder: 0 }),
    nightMultipliers: makeNightMultipliers({ clear: 1.15, gloomy: 0.9, fog: 1.05, drizzle: 0.82, storm: 0.7, thunder: 0 }),
    durations: { clear: [165, 290], fog: [28, 50], drizzle: [24, 44], storm: [20, 38] },
    tuning: {
      gloomy: { lightMult: 0.78, ambientMult: 0.98, fogDensityMult: 1.18, saturationMult: 0.9, skyDarken: 0.08, tintHex: 0xa68d67, tintStrength: 0.16 },
      fog: { lightMult: 0.82, ambientMult: 1.0, fogDensityMult: 1.55, saturationMult: 0.92, skyDarken: 0.02, tintHex: 0xb49566, tintStrength: 0.24 },
      drizzle: { lightMult: 0.78, ambientMult: 1.0, fogDensityMult: 1.9, saturationMult: 0.96, skyDarken: 0.06, tintHex: 0xc29758, tintStrength: 0.38, wetness: 0, rainAmount: 0.28 },
      storm: { lightMult: 0.62, ambientMult: 0.96, fogDensityMult: 2.55, saturationMult: 0.9, skyDarken: 0.12, tintHex: 0xc09250, tintStrength: 0.52, wetness: 0, rainAmount: 0.92 },
    },
  },
  frozen_tundra: {
    storm: 'blizzard',
    openingClearChance: 0.82,
    clearBreakAfter: 3,
    particleDensity: 0.9,
    weights: makeWeights({ clear: 64, gloomy: 12, fog: 8, drizzle: 8, storm: 8, thunder: 0 }),
    nightMultipliers: makeNightMultipliers({ clear: 1.02, gloomy: 1.18, fog: 1.24, drizzle: 0.92, storm: 0.68, thunder: 0 }),
    durations: { clear: [125, 240], fog: [36, 72], drizzle: [30, 58], storm: [24, 46] },
    tuning: {
      gloomy: { lightMult: 0.7, ambientMult: 1.02, fogDensityMult: 1.42, saturationMult: 0.72, skyDarken: 0.04, tintHex: 0xaebdcc, tintStrength: 0.22 },
      fog: { lightMult: 0.78, ambientMult: 1.05, fogDensityMult: 2.08, saturationMult: 0.68, skyDarken: 0.02, tintHex: 0xc6d3df, tintStrength: 0.3 },
      drizzle: { lightMult: 0.72, ambientMult: 1.05, fogDensityMult: 1.85, saturationMult: 0.68, skyDarken: 0.04, tintHex: 0xd0dce8, tintStrength: 0.38, wetness: 0, rainAmount: 0.34 },
      storm: { lightMult: 0.66, ambientMult: 1.06, fogDensityMult: 2.75, saturationMult: 0.62, skyDarken: 0.06, tintHex: 0xd8e4ee, tintStrength: 0.46, wetness: 0, rainAmount: 0.95 },
    },
  },
  scorched_wasteland: {
    storm: 'ashfall',
    openingClearChance: 0.84,
    clearBreakAfter: 3,
    particleDensity: 0.78,
    weights: makeWeights({ clear: 66, gloomy: 12, fog: 7, drizzle: 7, storm: 8, thunder: 0 }),
    nightMultipliers: makeNightMultipliers({ clear: 1.06, gloomy: 1.1, fog: 1.12, drizzle: 0.9, storm: 0.72, thunder: 0 }),
    durations: { clear: [120, 225], gloomy: [36, 68], storm: [24, 48] },
    tuning: {
      gloomy: { lightMult: 0.62, ambientMult: 0.88, fogDensityMult: 1.34, saturationMult: 0.82, skyDarken: 0.28, tintHex: 0x5a493f, tintStrength: 0.22 },
      fog: { lightMult: 0.7, ambientMult: 0.9, fogDensityMult: 1.75, saturationMult: 0.82, skyDarken: 0.18, tintHex: 0x6a5747, tintStrength: 0.26 },
      drizzle: { lightMult: 0.62, ambientMult: 0.86, fogDensityMult: 1.65, saturationMult: 0.82, skyDarken: 0.3, tintHex: 0x5a4b43, tintStrength: 0.32, wetness: 0, rainAmount: 0.3 },
      storm: { lightMult: 0.52, ambientMult: 0.82, fogDensityMult: 2.05, saturationMult: 0.78, skyDarken: 0.42, tintHex: 0x51453c, tintStrength: 0.42, wetness: 0, rainAmount: 0.88 },
    },
  },
};

const DEFAULT_CLIMATE: ClimateProfile = MAP_CLIMATES.deep_forest;

// Severity ladder for the front-routing bridge logic. A roll that jumps ≥2
// severity steps routes through a short bridge state first, so storms build
// and taper like real fronts instead of snapping from blue sky to downpour.
const SEVERITY: Record<WeatherState, number> = {
  clear: 0, fog: 1, gloomy: 1, drizzle: 2, storm: 3, thunder: 3,
};

function random01(): number {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    const value = new Uint32Array(1);
    cryptoObj.getRandomValues(value);
    return value[0] / 0x100000000;
  }
  return Math.random();
}

function randomRange(range: [number, number]): number {
  return range[0] + random01() * (range[1] - range[0]);
}

function tunePreset(base: ModsPreset, tuning?: Partial<ModsPreset>): ModsPreset {
  return { ...base, ...(tuning ?? {}) };
}

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
  private particleScale = 1;

  // Smoothly-blended live modifiers (what update() returns).
  private readonly current: WeatherMods = {
    lightMult: 1, ambientMult: 1, fogDensityMult: 1, saturationMult: 1,
    bloomMult: 1, godRayMult: 1, skyDarken: 0, tint: new THREE.Color(0xffffff),
    tintStrength: 0, wetness: 0, rainAmount: 0, lightning: 0,
  };
  private target: ModsPreset = CLEAR_PRESET;
  private readonly targetTint = new THREE.Color(0xffffff);

  // ── Weather director ──
  private state: WeatherState = 'clear';
  private holdRemaining = 0;
  private night = false;
  private nonClearFronts = 0;
  /** Set when the director routed through a bridge state — applied next. */
  private pendingTarget: WeatherState | null = null;

  // ── Lightning / thunder (thunderstorm state only) ──
  private flashEnv = 0;            // live flash envelope (fast attack, ~0.4s decay)
  private nextStrikeIn = 0;        // seconds until the next strike
  private secondFlashIn = -1;      // staggered double-flash timer
  private thunderDelay = -1;       // strike → clap delay (distance illusion)
  private thunderPower = 0;        // clap volume hint handed to the caller
  private pendingClap = 0;         // consumed by consumeThunderClap()

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
    this.pendingTarget = null;
    this.flashEnv = 0;
    this.secondFlashIn = -1;
    this.thunderDelay = -1;
    this.pendingClap = 0;
    this.state = this.rollInitialState();
    this.nonClearFronts = this.state === 'clear' ? 0 : 1;
    this.holdRemaining = this.holdSecondsFor(this.state);
    this.target = this.presetFor(this.state);
    this.snapToTarget();
  }

  getStormKind(): StormKind {
    return this.climate.storm;
  }

  private presetFor(state: WeatherState): ModsPreset {
    let base: ModsPreset;
    switch (state) {
      case 'storm':   base = STORM_PRESETS[this.climate.storm]; break;
      case 'thunder': base = THUNDER_PRESET; break;
      case 'drizzle': base = DRIZZLE_PRESETS[this.climate.storm]; break;
      case 'fog':     base = FOG_PRESET; break;
      case 'gloomy':  base = GLOOMY_PRESET; break;
      default:        base = CLEAR_PRESET; break;
    }
    return tunePreset(base, this.climate.tuning?.[state]);
  }

  /** Storms are intense but bounded; clear spells breathe longer. */
  private holdSecondsFor(state: WeatherState): number {
    return randomRange(this.climate.durations?.[state] ?? BASE_DURATIONS[state]);
  }

  private rollInitialState(): WeatherState {
    if (random01() < this.climate.openingClearChance) return 'clear';
    return this.rollNextState(null, true);
  }

  /**
   * Weighted next-state roll. Map climate sets the base odds; night calms
   * the sky (fewer storms, a touch more brooding gloom) so the environment
   * tracks both WHERE you are and WHEN it is.
   */
  private rollNextState(previous: WeatherState | null, ignoreClearBreak = false): WeatherState {
    const c = this.climate;
    if (!ignoreClearBreak && this.nonClearFronts >= c.clearBreakAfter) return 'clear';
    const states: WeatherState[] = ['clear', 'gloomy', 'fog', 'drizzle', 'storm', 'thunder'];
    const entries = states.map((state): [WeatherState, number] => {
      let weight = c.weights[state] * (this.night ? c.nightMultipliers[state] : 1);
      if (state === 'thunder' && c.storm !== 'rain') weight = 0;
      if (state === previous && state !== 'clear') weight *= 0.16;
      if (state === 'clear' && previous !== 'clear') weight *= 1.35 + this.nonClearFronts * 0.22;
      return [state, Math.max(0, weight)];
    });
    let total = 0;
    for (const [, weight] of entries) total += weight;
    if (total <= 0) return 'clear';
    let roll = random01() * total;
    for (const [state, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return state;
    }
    return 'clear';
  }

  /**
   * Front routing: a jump of ≥2 severity steps passes through a short bridge
   * state — overcast on the way UP (the deck builds before it breaks), light
   * precipitation on the way DOWN (rain tapers off before the sun returns).
   */
  private bridgeFor(from: WeatherState, to: WeatherState): WeatherState | null {
    const jump = SEVERITY[to] - SEVERITY[from];
    if (jump >= 2) return 'gloomy';
    if (jump <= -2) return from === 'storm' || from === 'thunder' ? 'drizzle' : 'gloomy';
    return null;
  }

  private advanceDirector(): void {
    let next: WeatherState;
    if (this.pendingTarget) {
      next = this.pendingTarget;
      this.pendingTarget = null;
      this.holdRemaining = this.holdSecondsFor(next);
    } else {
      const rolled = this.rollNextState(this.state);
      const bridge = this.bridgeFor(this.state, rolled);
      if (bridge && bridge !== rolled) {
        this.pendingTarget = rolled;
        next = bridge;
        this.holdRemaining = randomRange([9, 17]); // brief transitional front
      } else {
        next = rolled;
        this.holdRemaining = this.holdSecondsFor(rolled);
      }
    }
    this.state = next;
    this.nonClearFronts = next === 'clear' ? 0 : this.nonClearFronts + 1;
    this.target = this.presetFor(next);
    if (next === 'thunder') this.scheduleStrike();
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
    c.lightning = 0;
  }

  // ── Lightning ────────────────────────────────────────────────────────────

  private scheduleStrike(): void {
    this.nextStrikeIn = randomRange([3, 12]);
  }

  private updateLightning(delta: number): void {
    // Flash envelope: instant attack, exponential decay (~0.35 s tail).
    if (this.flashEnv > 0) {
      this.flashEnv = Math.max(0, this.flashEnv - this.flashEnv * delta * 7 - delta * 0.4);
    }
    // Staggered second pop — real strikes flicker.
    if (this.secondFlashIn >= 0) {
      this.secondFlashIn -= delta;
      if (this.secondFlashIn < 0) this.flashEnv = Math.min(1, this.flashEnv + 0.7);
    }
    // Strike → thunder clap delay (sound lags light; farther = quieter).
    if (this.thunderDelay >= 0) {
      this.thunderDelay -= delta;
      if (this.thunderDelay < 0) {
        this.pendingClap = this.thunderPower;
      }
    }
    if (this.state !== 'thunder') return;
    this.nextStrikeIn -= delta;
    if (this.nextStrikeIn <= 0) {
      // Closer strikes flash brighter, clap sooner and louder.
      const proximity = 0.35 + random01() * 0.65; // 1 = overhead
      this.flashEnv = 0.55 + proximity * 0.45;
      this.secondFlashIn = random01() < 0.6 ? 0.1 + random01() * 0.12 : -1;
      this.thunderDelay = 0.4 + (1 - proximity) * 2.4;
      this.thunderPower = proximity;
      this.scheduleStrike();
    }
  }

  /**
   * Returns the pending thunder-clap power (0..1) ONCE per strike, 0
   * otherwise. The caller owns audio — typically a low-pitched rumble
   * sample scaled by the returned power.
   */
  consumeThunderClap(): number {
    const clap = this.pendingClap;
    this.pendingClap = 0;
    return clap;
  }

  /**
   * Advance the weather and return the live modifiers. Call once per frame
   * with the unscaled delta. `isNight` tunes the director to the day cycle.
   */
  update(delta: number, cameraPosition: THREE.Vector3, isNight: boolean): WeatherMods {
    this.night = isNight;

    this.holdRemaining -= delta;
    if (this.holdRemaining <= 0) {
      this.advanceDirector();
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

    this.updateLightning(delta);
    c.lightning = this.flashEnv;

    this.updateField(delta, cameraPosition, c.rainAmount);
    return c;
  }

  // ── Storm particle field ───────────────────────────────────────────────

  private buildField(): void {
    const cfg = this.fieldConfig;
    const count = Math.max(200, Math.round(cfg.count * this.particleScale * (this.climate.particleDensity ?? 1)));
    const positions = new Float32Array(count * 3);
    const velY = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const a = random01() * Math.PI * 2;
      const r = Math.sqrt(random01()) * FIELD_RADIUS;
      positions[i3] = Math.cos(a) * r;
      positions[i3 + 1] = random01() * FIELD_TOP;
      positions[i3 + 2] = Math.sin(a) * r;
      velY[i] = cfg.fallMin + random01() * cfg.fallVar;
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
    const count = positions.length / 3;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3] += windX;
      positions[i3 + 1] -= velY[i] * delta;
      positions[i3 + 2] += windZ;
      // Vertical recycle (fell below ground).
      if (positions[i3 + 1] < 0) {
        const a = random01() * Math.PI * 2;
        const r = Math.sqrt(random01()) * FIELD_RADIUS;
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
