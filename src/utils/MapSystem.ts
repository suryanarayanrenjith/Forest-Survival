/**
 * MAP SYSTEM - Forest Survival Game
 *
 * 8 completely distinct environments, each with a unique biome, lighting,
 * atmosphere, and terrain generation profile.
 *
 * Map tuning philosophy (deep_forest is the reference):
 *   • fog should fade DISTANT geometry, not erase it — fogFar typically
 *     2.5–4× the player's combat range (~120–280m)
 *   • fog color sits BELOW scene mid-luminance so distant objects DARKEN
 *     into haze (bright fog washes everything to one colour at distance)
 *   • visibilityMult tracks how far the player can read the environment
 *   • bloomMultiplier kept modest (0.85–1.15) — the global cinematic
 *     bloom is already aggressive, per-map multipliers fine-tune feel
 */

import type { BiomeType } from './BiomeSystem';
import type { TerrainProfileInput } from './TerrainSystem';

export type MapType =
  | 'deep_forest'
  | 'scorched_wasteland'
  | 'frozen_tundra'
  | 'desert_canyon'
  | 'toxic_swamp'
  | 'military_outpost'
  | 'autumn_grove'
  | 'ancient_ruins';

export interface MapConfig {
  id: MapType;
  name: string;
  description: string;
  icon: string;
  primaryBiome: BiomeType;
  // Visual settings
  skyColor: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  ambientLightColor: number;
  ambientLightIntensity: number;
  directionalLightColor: number;
  directionalLightIntensity: number;
  // Ground settings
  groundColor: number;
  groundEmissive: number;
  groundSize: number;
  // Terrain generation
  treeDensityMult: number;
  rockDensityMult: number;
  bushDensityMult: number;
  // Special features
  hasSpecialWeather: boolean;
  weatherType?: 'rain' | 'snow' | 'sandstorm' | 'fog' | 'ash';
  // Gameplay modifiers
  visibilityMult: number;
  enemySpawnRadiusMult: number;
  // Explosive barrels per map. Optional — maps that don't set it get a
  // sensible default in HazardSystem. Range loosely 0.0 (none) — 1.0
  // (densely littered). Most maps sit around 0.3–0.5.
  barrelDensity?: number;
  // ── Post-FX tuning ─────────────────────────────────────────────────
  // Multipliers applied to the global bloom intensity for this map.
  // 1.0 = baseline; >1 = more dramatic bloom; <1 = restrained.
  bloomMultiplier?: number;
  bloomThresholdBias?: number; // added to base threshold; negative = MORE blooms
  // Map-aware rendering controls. These are intentionally multipliers so the
  // forest reference can stay close to the global grade while high-albedo maps
  // like snow/desert can pull back exposure, haze, and highlight energy.
  renderProfile?: {
    atmosphereWeight?: number;
    nightAtmosphereWeight?: number;
    exposure?: number;
    saturation?: number;
    contrast?: number;
    bloomStrength?: number;
    godRayStrength?: number;
    aerialPerspective?: number;
    highlightRecovery?: number;
    highlightDesaturation?: number;
    vibrance?: number;
    shadowLift?: number;
    hazeDensity?: number;
    fogDensity?: number;
    environmentIntensity?: number;
    directLight?: number;
    ambientLight?: number;
    volumetricLight?: number;
    fillLight?: number;
    rimLight?: number;
    groundSpecular?: number;
    groundNormal?: number;
    groundPatch?: number;
  };
  groundRoughness?: number;
  groundMetalness?: number;
  // ── Terrain shape + ground-texture identity ─────────────────────────────
  // Drives the GPU-displaced landscape (rolling hills, dunes, ridges) and the
  // per-map procedural ground material (sand ripples, snow sparkle, lava
  // cracks, wet swamp puddles, etc.). See TerrainSystem.ts. Optional — maps
  // that omit it get a grounded neutral-earth default.
  terrain?: TerrainProfileInput;
}

export const MAP_CONFIGS: Record<MapType, MapConfig> = {
  // ── Classic dense green forest (REFERENCE MAP) ──
  deep_forest: {
    id: 'deep_forest',
    name: 'Deep Forest',
    description: 'A thick, ancient forest with towering trees, fallen logs, and mushroom clusters.',
    icon: '🌲',
    primaryBiome: 'forest',
    skyColor: 0x1a2f1a,
    fogColor: 0x0a1f0a,
    fogNear: 20,
    fogFar: 150,
    ambientLightColor: 0x4a7a4a,
    ambientLightIntensity: 0.5,
    directionalLightColor: 0x88ff88,
    directionalLightIntensity: 0.8,
    groundColor: 0x1a4a1a,
    groundEmissive: 0x0a2a0a,
    groundSize: 640,
    treeDensityMult: 1.3,
    rockDensityMult: 0.7,
    bushDensityMult: 1.4,
    hasSpecialWeather: false,
    visibilityMult: 0.9,
    enemySpawnRadiusMult: 1.0,
    bloomMultiplier: 1.05,
    bloomThresholdBias: -0.02,
    renderProfile: {
      atmosphereWeight: 0.18,
      nightAtmosphereWeight: 0.12,
      exposure: 1.0,
      saturation: 1.0,
      contrast: 1.0,
      bloomStrength: 1.0,
      godRayStrength: 1.0,
      aerialPerspective: 0.9,
      highlightRecovery: 0.14,
      highlightDesaturation: 0.14,
      vibrance: 1.0,
      shadowLift: 1.0,
      hazeDensity: 1.0,
      fogDensity: 1.0,
      environmentIntensity: 1.0,
      directLight: 1.0,
      ambientLight: 1.0,
      volumetricLight: 1.0,
      fillLight: 1.0,
      rimLight: 1.0,
      groundSpecular: 1.0,
      groundNormal: 1.0,
      groundPatch: 1.0,
    },
    // Soft, mossy forest floor — gentle rolling humus broken by exposed roots
    // and damp earth. Warm/cool leaf-litter patches over a mossy rock talus.
    terrain: {
      amplitude: 3.0,
      frequency: 0.016,
      ridginess: 0.12,
      flatRadius: 20,
      falloff: 52,
      macroTintA: [1.10, 1.05, 0.90],
      macroTintB: [0.84, 0.96, 0.82],
      rockColor: 0x3a4a32,
      detailColor: [0.95, 1.0, 0.82],
      detailScale: 1.05,
      wetness: 0.18,
    },
  },

  // ── Charred volcanic hellscape ──
  scorched_wasteland: {
    id: 'scorched_wasteland',
    name: 'Scorched Wasteland',
    description: 'A charred landscape of obsidian pillars, lava pools, and smoldering embers.',
    icon: '🌋',
    primaryBiome: 'volcanic',
    skyColor: 0x1a0800,
    // Slightly darker fog so embers + lava still pop instead of being
    // drowned in warm fog at distance.
    fogColor: 0x1a0500,
    fogNear: 25,
    fogFar: 200,                          // was 160 — clearer distant reads
    ambientLightColor: 0x8a3a1a,
    ambientLightIntensity: 0.42,
    directionalLightColor: 0xff6633,
    directionalLightIntensity: 0.75,
    groundColor: 0x1a1210,
    groundEmissive: 0x2a0800,
    groundSize: 640,
    treeDensityMult: 1.2,
    rockDensityMult: 2.3,
    bushDensityMult: 1.4,
    hasSpecialWeather: true,
    weatherType: 'ash',
    visibilityMult: 0.85,
    enemySpawnRadiusMult: 1.1,
    barrelDensity: 0.55, // Plenty of barrels — fits the warzone vibe.
    // Warm bloom — embers glowing, lava-lit but not overwhelming with
    // the new boosted global baseline.
    bloomMultiplier: 1.25,                // was 1.55
    bloomThresholdBias: -0.06,            // was -0.10
    renderProfile: {
      atmosphereWeight: 0.66,
      nightAtmosphereWeight: 0.35,
      exposure: 0.82,
      saturation: 0.9,
      contrast: 1.04,
      bloomStrength: 0.9,
      godRayStrength: 0.62,
      aerialPerspective: 0.5,
      highlightRecovery: 0.36,
      highlightDesaturation: 0.22,
      vibrance: 0.9,
      shadowLift: 0.92,
      hazeDensity: 0.75,
      fogDensity: 0.9,
      environmentIntensity: 0.86,
      directLight: 0.92,
      ambientLight: 0.9,
      volumetricLight: 0.62,
      fillLight: 0.72,
      rimLight: 0.85,
      groundSpecular: 0.72,
      groundNormal: 1.05,
      groundPatch: 1.1,
    },
    // Cracked basalt plates with glowing magma seams running between them.
    // Sharp, jagged ridges of cooled lava. Dark obsidian talus on the slopes.
    terrain: {
      amplitude: 4.6,
      frequency: 0.019,
      ridginess: 0.42,
      flatRadius: 18,
      falloff: 46,
      macroTintA: [1.12, 0.86, 0.72],
      macroTintB: [0.7, 0.66, 0.66],
      rockColor: 0x130f0d,
      detailColor: [1.0, 0.7, 0.5],
      detailScale: 1.25,
      crackGlow: 1.6,
      crackColor: 0xff4a12,
    },
  },

  // ── Icy tundra with frozen pines ──
  // AGGRESSIVE retuning: previous values (skyColor 0x6090b8, fogColor 0x5c7894,
  // HDRI dayIntensity 0.98, bloom 0.72) still produced the bright-white wash
  // because every brightness contributor stacked: bright sky + bright HDRI
  // env + bright fog + bloom + sun god-rays. Pulled EVERY brightness lever
  // down so the player can actually read distant geometry. Tundra now reads
  // as a real "cold overcast highland" rather than a fog blowout.
  frozen_tundra: {
    id: 'frozen_tundra',
    name: 'Frozen Tundra',
    description: 'A frozen expanse of ice spires, snow-laden pines, and frozen ponds.',
    icon: '❄️',
    primaryBiome: 'tundra',
    skyColor: 0x435b72,                   // cold overcast blue, not white
    fogColor: 0x334657,                   // dark slate haze preserves silhouettes
    fogNear: 50,                          // was 40
    fogFar: 480,                          // was 320 — long sightlines
    ambientLightColor: 0x526a82,
    ambientLightIntensity: 0.34,          // snow reflects a lot; keep fill modest
    directionalLightColor: 0x9fb0bd,      // dim cool sun, not pure white
    directionalLightIntensity: 0.58,
    groundColor: 0x7f929e,                // blue-gray snow with readable value
    groundEmissive: 0x2f4352,
    groundSize: 736,
    treeDensityMult: 1.4,
    rockDensityMult: 2.1,
    bushDensityMult: 1.0,
    hasSpecialWeather: true,
    weatherType: 'snow',
    visibilityMult: 1.0,                  // open + readable
    enemySpawnRadiusMult: 1.1,
    // Heavily restrained bloom — was the primary cause of the wash.
    bloomMultiplier: 0.36,                // snow is high-albedo; keep bloom surgical
    bloomThresholdBias: 0.26,             // only weapon cores / pickups bloom
    renderProfile: {
      atmosphereWeight: 0.86,
      nightAtmosphereWeight: 0.42,
      exposure: 0.54,
      saturation: 0.62,
      contrast: 0.92,
      bloomStrength: 0.58,
      godRayStrength: 0.18,
      aerialPerspective: 0.08,
      highlightRecovery: 0.92,
      highlightDesaturation: 0.78,
      vibrance: 0.58,
      shadowLift: 0.82,
      hazeDensity: 0.32,
      fogDensity: 0.62,
      environmentIntensity: 0.52,
      directLight: 0.72,
      ambientLight: 0.68,
      volumetricLight: 0.22,
      fillLight: 0.42,
      rimLight: 0.45,
      groundSpecular: 0.25,
      groundNormal: 0.6,
      groundPatch: 0.72,
    },
    groundRoughness: 0.88,
    groundMetalness: 0.02,
    // Wind-sculpted snow drifts over a frozen highland. Long sightlines
    // (fogFar 480) so the undulation only swells far out where haze hides it.
    // Sparse crystalline sparkle + directional drift ripples sell the snow.
    terrain: {
      amplitude: 5.2,
      frequency: 0.011,
      ridginess: 0.08,
      flatRadius: 44,
      falloff: 170,
      macroTintA: [1.04, 1.06, 1.12],
      macroTintB: [0.9, 0.93, 1.0],
      rockColor: 0x5a6b78,
      detailColor: [0.9, 0.96, 1.1],
      detailScale: 0.8,
      rippleDir: [0.86, 0.5],
      rippleScale: 0.5,
      rippleStrength: 0.22,
      sparkle: 0.7,
    },
  },

  // ── Arid desert with mesa pillars ──
  desert_canyon: {
    id: 'desert_canyon',
    name: 'Desert Canyon',
    description: 'Towering sandstone pillars, sun-bleached arches, and hardy cacti dot this arid canyon.',
    icon: '🏜️',
    primaryBiome: 'desert',
    // Sky pulled away from orange to a sun-bleached pale blue so the
    // scene doesn't read as ALL orange — gives the warm ground
    // something to contrast against.
    skyColor: 0x738aa0,
    // Fog desaturated — was 0xc4a070 (warm orange/tan) which under the
    // boosted bloom + aerial perspective tinted the entire scene one
    // colour. Pulled to a neutral warm sand that fades distant pillars
    // without erasing them.
    fogColor: 0x81735f,
    fogNear: 60,                          // was 50 — clear close range
    fogFar: 420,                          // was 280 — long sightlines like a real canyon
    // Ambient lowered — desert ground reflects sun strongly, was
    // double-counting brightness with the directional + ambient combo.
    ambientLightColor: 0x9b8058,
    ambientLightIntensity: 0.42,          // sand bounces light aggressively
    directionalLightColor: 0xe7c48b,
    directionalLightIntensity: 0.72,
    groundColor: 0xb08155,                // warm but no neon-yellow floor
    groundEmissive: 0x5a3e27,
    groundSize: 800,
    treeDensityMult: 1.4,
    rockDensityMult: 2.7,
    bushDensityMult: 1.8,
    hasSpecialWeather: true,
    weatherType: 'sandstorm',
    visibilityMult: 1.25,                 // was 1.2 — open sightlines
    enemySpawnRadiusMult: 1.2,
    // Lower bloom — desert is already bright + warm.
    bloomMultiplier: 0.44,
    bloomThresholdBias: 0.24,
    renderProfile: {
      atmosphereWeight: 0.84,
      nightAtmosphereWeight: 0.38,
      exposure: 0.56,
      saturation: 0.58,
      contrast: 0.94,
      bloomStrength: 0.62,
      godRayStrength: 0.22,
      aerialPerspective: 0.06,
      highlightRecovery: 0.88,
      highlightDesaturation: 0.82,
      vibrance: 0.55,
      shadowLift: 0.78,
      hazeDensity: 0.28,
      fogDensity: 0.58,
      environmentIntensity: 0.5,
      directLight: 0.68,
      ambientLight: 0.62,
      volumetricLight: 0.18,
      fillLight: 0.38,
      rimLight: 0.36,
      groundSpecular: 0.22,
      groundNormal: 0.8,
      groundPatch: 0.95,
    },
    groundRoughness: 0.94,
    groundMetalness: 0.01,
    // Sweeping wind-carved dunes and eroded sandstone benches. Big, ridged
    // amplitude that only rises in the deep distance (fogFar 420). Crisp
    // directional sand ripples + a faint mica sparkle catch the harsh sun.
    terrain: {
      amplitude: 6.4,
      frequency: 0.012,
      ridginess: 0.5,
      flatRadius: 40,
      falloff: 155,
      macroTintA: [1.12, 1.02, 0.82],
      macroTintB: [0.92, 0.8, 0.62],
      rockColor: 0x8a5e34,
      detailColor: [1.1, 0.95, 0.72],
      detailScale: 1.0,
      rippleDir: [0.94, 0.34],
      rippleScale: 0.62,
      rippleStrength: 0.3,
      sparkle: 0.25,
    },
  },

  // ── Dark swamp with toxic pools ──
  toxic_swamp: {
    id: 'toxic_swamp',
    name: 'Toxic Swamp',
    description: 'A murky wetland of gnarled trees, glowing mushrooms, and bubbling toxic pools.',
    icon: '🍄',
    primaryBiome: 'swamp',
    skyColor: 0x1a2818,
    fogColor: 0x1a2a18,                    // very slightly darker for depth
    fogNear: 15,                           // was 8 — clear immediately around player
    fogFar: 140,                           // was 90 — bumped so mid-range enemies are readable
    ambientLightColor: 0x3a5a3a,
    ambientLightIntensity: 0.42,           // was 0.35 — slight lift for readability
    directionalLightColor: 0x7aaa7a,
    directionalLightIntensity: 0.6,        // was 0.5
    groundColor: 0x2a3825,
    groundEmissive: 0x1a2818,
    groundSize: 608,
    treeDensityMult: 1.5,
    rockDensityMult: 1.4,
    bushDensityMult: 2.1,
    hasSpecialWeather: true,
    weatherType: 'fog',
    visibilityMult: 0.7,                   // was 0.55 — playable while still murky
    enemySpawnRadiusMult: 0.85,
    // Strong green-tinted bloom — glowing mushrooms + toxic pools popping
    // off the dark swamp backdrop.
    bloomMultiplier: 1.20,                 // was 1.40 — pulled back with new baseline
    bloomThresholdBias: -0.05,             // was -0.08
    // Murky wetland grade — green-biased, shadows gently lifted for
    // readability through the fog, strong wet specular on the soaked ground.
    renderProfile: {
      atmosphereWeight: 0.5,
      nightAtmosphereWeight: 0.28,
      exposure: 0.92,
      saturation: 0.96,
      contrast: 1.02,
      bloomStrength: 1.0,
      godRayStrength: 0.55,
      aerialPerspective: 0.72,
      highlightRecovery: 0.22,
      highlightDesaturation: 0.2,
      vibrance: 1.0,
      shadowLift: 1.08,
      hazeDensity: 0.95,
      fogDensity: 1.0,
      environmentIntensity: 0.85,
      directLight: 0.9,
      ambientLight: 1.0,
      volumetricLight: 0.7,
      fillLight: 0.92,
      rimLight: 0.9,
      groundSpecular: 1.15,
      groundNormal: 1.05,
      groundPatch: 1.05,
    },
    // Sodden wetland — near-flat with low silt mounds, threaded with dark
    // pooled water. Heavy wetness gives the ground that black, reflective
    // bog sheen; mossy muck on the rare raised banks.
    terrain: {
      amplitude: 1.9,
      frequency: 0.018,
      ridginess: 0.05,
      flatRadius: 18,
      falloff: 48,
      macroTintA: [0.96, 1.06, 0.86],
      macroTintB: [0.78, 0.84, 0.7],
      rockColor: 0x22301c,
      detailColor: [0.85, 1.0, 0.78],
      detailScale: 1.1,
      wetness: 0.75,
    },
  },

  // ── Concrete walls and bunkers ──
  military_outpost: {
    id: 'military_outpost',
    name: 'Military Outpost',
    description: 'An abandoned base with concrete walls, sandbag bunkers, and watchtower frames.',
    icon: '🪖',
    primaryBiome: 'military',
    skyColor: 0x2a2a28,
    fogColor: 0x383832,                    // mildly darker for atmosphere
    fogNear: 35,
    fogFar: 240,                           // was 180 — better engagement distance
    ambientLightColor: 0x6a6a60,
    ambientLightIntensity: 0.5,
    directionalLightColor: 0xccccbb,
    directionalLightIntensity: 0.85,
    groundColor: 0x4a4a42,
    groundEmissive: 0x2a2a24,
    groundSize: 672,
    treeDensityMult: 1.4,
    rockDensityMult: 2.2,
    bushDensityMult: 1.5,
    hasSpecialWeather: false,
    visibilityMult: 1.05,
    enemySpawnRadiusMult: 0.95,
    barrelDensity: 0.75, // Mil-sim site — dense barrel cache.
    // Industrial / mil-sim — minimal bloom for a grounded look.
    bloomMultiplier: 0.70,
    bloomThresholdBias: 0.06,
    // Desaturated, grounded mil-sim grade — restrained bloom, crisp sun,
    // tight highlights. Reads like overcast-noon at an abandoned base.
    renderProfile: {
      atmosphereWeight: 0.2,
      nightAtmosphereWeight: 0.12,
      exposure: 0.96,
      saturation: 0.84,
      contrast: 1.05,
      bloomStrength: 0.85,
      godRayStrength: 0.8,
      aerialPerspective: 0.85,
      highlightRecovery: 0.16,
      highlightDesaturation: 0.16,
      vibrance: 0.85,
      shadowLift: 0.98,
      hazeDensity: 0.95,
      fogDensity: 1.0,
      environmentIntensity: 0.95,
      directLight: 1.0,
      ambientLight: 0.98,
      volumetricLight: 0.9,
      fillLight: 0.95,
      rimLight: 0.95,
      groundSpecular: 0.9,
      groundNormal: 1.15,
      groundPatch: 1.12,
    },
    // Compacted dirt-and-gravel parade ground with cracked asphalt aprons and
    // low blast berms. Mostly flat (a real base) with gritty micro-relief and
    // faint oil-slick sheen pooling in the ruts.
    terrain: {
      amplitude: 1.6,
      frequency: 0.02,
      ridginess: 0.18,
      flatRadius: 16,
      falloff: 44,
      macroTintA: [1.06, 1.03, 0.96],
      macroTintB: [0.86, 0.86, 0.84],
      rockColor: 0x3c3c38,
      detailColor: [1.0, 0.98, 0.92],
      detailScale: 1.35,
      wetness: 0.2,
    },
  },

  // ── TWILIGHT VALE — REPLACEMENT for the removed Crystal Caverns ──
  // Previous "Autumn Grove" iteration used a warm sunset palette over the
  // forest biome — too close to deep_forest visually + the warm tint
  // amplified the cinematic bloom/god-rays into a yellow-green blowout.
  //
  // Redesigned as a contemplative twilight forest: deep purple-blue sky,
  // dim warm-orange sun at the horizon, low ambient. The same forest
  // trees become silhouettes against the dusk — visually a completely
  // different map even though it reuses forest assets. Comfortable to
  // play in (the user explicitly asked for comfort vs. crystal's brightness).
  autumn_grove: {
    id: 'autumn_grove',
    name: 'Twilight Vale',
    description: 'A vale of bare, gnarled trees and floating wisps under a deep purple dusk sky — silent, haunted, otherworldly.',
    icon: '🌆',
    primaryBiome: 'twilight',
    skyColor: 0x2a1f3a,                    // deep purple twilight sky
    fogColor: 0x1c1530,                    // dark violet fog (DEEPENS distance)
    fogNear: 30,
    fogFar: 220,
    ambientLightColor: 0x6a4880,           // soft purple ambient
    ambientLightIntensity: 0.42,
    directionalLightColor: 0xd87838,       // low warm orange (setting sun)
    directionalLightIntensity: 0.55,       // dim — it's dusk
    groundColor: 0x231830,                 // deep purple forest floor
    groundEmissive: 0x180e22,
    groundSize: 672,
    treeDensityMult: 1.3,
    rockDensityMult: 0.7,
    bushDensityMult: 1.3,
    hasSpecialWeather: false,
    visibilityMult: 0.95,
    enemySpawnRadiusMult: 1.0,
    // Restrained bloom — twilight is moody, NOT bright. Just enough to
    // catch the orange horizon light + emissive enemy cores.
    bloomMultiplier: 0.78,
    bloomThresholdBias: 0.04,
    // Dusk grade — moody and violet, shadows held down, the deep purples
    // pushed by vibrance, a warm rim from the setting sun on the horizon.
    renderProfile: {
      atmosphereWeight: 0.32,
      nightAtmosphereWeight: 0.22,
      exposure: 0.86,
      saturation: 0.94,
      contrast: 1.04,
      bloomStrength: 0.9,
      godRayStrength: 0.7,
      aerialPerspective: 0.8,
      highlightRecovery: 0.2,
      highlightDesaturation: 0.2,
      vibrance: 1.06,
      shadowLift: 0.95,
      hazeDensity: 1.0,
      fogDensity: 1.0,
      environmentIntensity: 0.8,
      directLight: 0.95,
      ambientLight: 0.95,
      volumetricLight: 0.85,
      fillLight: 0.9,
      rimLight: 1.08,
      groundSpecular: 1.0,
      groundNormal: 1.0,
      groundPatch: 1.0,
    },
    // Haunted vale floor — soft rolling violet earth, dew-damp, with charred
    // dark-purple rock breaking the slopes. Quiet and otherworldly.
    terrain: {
      amplitude: 3.2,
      frequency: 0.015,
      ridginess: 0.14,
      flatRadius: 20,
      falloff: 54,
      macroTintA: [1.08, 0.94, 1.14],
      macroTintB: [0.82, 0.78, 0.96],
      rockColor: 0x271836,
      detailColor: [0.94, 0.86, 1.1],
      detailScale: 1.0,
      wetness: 0.16,
    },
  },

  // ── Crumbling stone ruins ──
  ancient_ruins: {
    id: 'ancient_ruins',
    name: 'Ancient Ruins',
    description: 'Crumbling stone columns, broken walls, arched doorways, and forgotten statues.',
    icon: '🏛️',
    primaryBiome: 'ruins',
    skyColor: 0x303028,
    fogColor: 0x3a3a32,
    fogNear: 25,
    fogFar: 220,                           // was 150 — more atmospheric depth
    ambientLightColor: 0x7a7a6a,
    ambientLightIntensity: 0.5,
    directionalLightColor: 0xbbbbaa,
    directionalLightIntensity: 0.8,
    groundColor: 0x5a5548,
    groundEmissive: 0x3a3530,
    groundSize: 672,
    treeDensityMult: 1.4,
    rockDensityMult: 2.5,
    bushDensityMult: 1.6,
    hasSpecialWeather: true,
    weatherType: 'rain',
    visibilityMult: 0.95,
    enemySpawnRadiusMult: 0.95,
    // Wet-stone rainy ruins — moderate bloom catching the rain highlights.
    bloomMultiplier: 1.00,                 // was 1.15
    bloomThresholdBias: -0.02,             // was -0.04
    // Rain-soaked stone grade — cool, slightly desaturated, with a strong
    // wet specular response so the flagstones glisten under the downpour.
    renderProfile: {
      atmosphereWeight: 0.4,
      nightAtmosphereWeight: 0.24,
      exposure: 0.94,
      saturation: 0.9,
      contrast: 1.03,
      bloomStrength: 1.0,
      godRayStrength: 0.6,
      aerialPerspective: 0.78,
      highlightRecovery: 0.2,
      highlightDesaturation: 0.18,
      vibrance: 0.95,
      shadowLift: 1.0,
      hazeDensity: 1.0,
      fogDensity: 1.0,
      environmentIntensity: 0.9,
      directLight: 0.95,
      ambientLight: 1.0,
      volumetricLight: 0.75,
      fillLight: 0.95,
      rimLight: 0.95,
      groundSpecular: 1.25,
      groundNormal: 1.12,
      groundPatch: 1.06,
    },
    // Worn flagstone plaza heaved by centuries of root and frost — broken
    // tiles, rubble ridges, rain pooling in the hollows between cracked
    // pavers (heavy wetness sheen).
    terrain: {
      amplitude: 2.6,
      frequency: 0.017,
      ridginess: 0.24,
      flatRadius: 19,
      falloff: 50,
      macroTintA: [1.08, 1.05, 0.98],
      macroTintB: [0.84, 0.85, 0.82],
      rockColor: 0x4c4840,
      detailColor: [1.0, 0.98, 0.9],
      detailScale: 1.3,
      wetness: 0.55,
    },
  },
};

// Get a specific map config
export function getMapConfig(mapType: MapType): MapConfig {
  return MAP_CONFIGS[mapType];
}

// Get random map for random mode — uses crypto for uniform distribution
export function getRandomMap(): MapType {
  const maps = Object.keys(MAP_CONFIGS) as MapType[];
  // Use crypto.getRandomValues for better entropy than Math.random
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const index = array[0] % maps.length;
  const chosen = maps[index];
  return chosen;
}

// Default map
export const DEFAULT_MAP: MapType = 'deep_forest';
