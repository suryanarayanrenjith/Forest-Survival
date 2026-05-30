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
  // ── Post-FX tuning ─────────────────────────────────────────────────
  // Multipliers applied to the global bloom intensity for this map.
  // 1.0 = baseline; >1 = more dramatic bloom; <1 = restrained.
  bloomMultiplier?: number;
  bloomThresholdBias?: number; // added to base threshold; negative = MORE blooms
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
    groundSize: 400,
    treeDensityMult: 1.3,
    rockDensityMult: 0.7,
    bushDensityMult: 1.4,
    hasSpecialWeather: false,
    visibilityMult: 0.9,
    enemySpawnRadiusMult: 1.0,
    bloomMultiplier: 1.05,
    bloomThresholdBias: -0.02,
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
    groundSize: 400,
    treeDensityMult: 1.2,
    rockDensityMult: 2.3,
    bushDensityMult: 1.4,
    hasSpecialWeather: true,
    weatherType: 'ash',
    visibilityMult: 0.85,
    enemySpawnRadiusMult: 1.1,
    // Warm bloom — embers glowing, lava-lit but not overwhelming with
    // the new boosted global baseline.
    bloomMultiplier: 1.25,                // was 1.55
    bloomThresholdBias: -0.06,            // was -0.10
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
    skyColor: 0x4a6480,                   // dark steel blue (was 0x6090b8)
    fogColor: 0x3a4e64,                   // deep slate (was 0x5c7894)
    fogNear: 50,                          // was 40
    fogFar: 480,                          // was 320 — long sightlines
    ambientLightColor: 0x6080a0,
    ambientLightIntensity: 0.42,          // was 0.55
    directionalLightColor: 0xb8c8d8,      // dim cool sun (was bright 0xeeeeff)
    directionalLightIntensity: 0.75,      // was 0.95
    groundColor: 0x90a8c0,                // mid-tone snow (was 0xb0c8e0)
    groundEmissive: 0x506880,
    groundSize: 460,
    treeDensityMult: 1.4,
    rockDensityMult: 2.1,
    bushDensityMult: 1.0,
    hasSpecialWeather: true,
    weatherType: 'snow',
    visibilityMult: 1.0,                  // open + readable
    enemySpawnRadiusMult: 1.1,
    // Heavily restrained bloom — was the primary cause of the wash.
    bloomMultiplier: 0.50,                // was 0.72
    bloomThresholdBias: 0.18,             // was 0.10 — only true highlights bloom
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
    skyColor: 0x8a9eb0,
    // Fog desaturated — was 0xc4a070 (warm orange/tan) which under the
    // boosted bloom + aerial perspective tinted the entire scene one
    // colour. Pulled to a neutral warm sand that fades distant pillars
    // without erasing them.
    fogColor: 0xa89478,
    fogNear: 60,                          // was 50 — clear close range
    fogFar: 420,                          // was 280 — long sightlines like a real canyon
    // Ambient lowered — desert ground reflects sun strongly, was
    // double-counting brightness with the directional + ambient combo.
    ambientLightColor: 0xb89868,
    ambientLightIntensity: 0.55,          // was 0.65
    directionalLightColor: 0xffdda0,
    directionalLightIntensity: 0.95,      // was 1.1
    groundColor: 0xc89868,                // slightly desaturated from 0xd4a574
    groundEmissive: 0x8a6840,
    groundSize: 500,
    treeDensityMult: 1.4,
    rockDensityMult: 2.7,
    bushDensityMult: 1.8,
    hasSpecialWeather: true,
    weatherType: 'sandstorm',
    visibilityMult: 1.25,                 // was 1.2 — open sightlines
    enemySpawnRadiusMult: 1.2,
    // Lower bloom — desert is already bright + warm.
    bloomMultiplier: 0.68,                // was 0.80
    bloomThresholdBias: 0.12,             // was 0.06
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
    groundSize: 380,
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
    groundSize: 420,
    treeDensityMult: 1.4,
    rockDensityMult: 2.2,
    bushDensityMult: 1.5,
    hasSpecialWeather: false,
    visibilityMult: 1.05,
    enemySpawnRadiusMult: 0.95,
    // Industrial / mil-sim — minimal bloom for a grounded look.
    bloomMultiplier: 0.70,
    bloomThresholdBias: 0.06,
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
    groundSize: 420,
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
    groundSize: 420,
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
