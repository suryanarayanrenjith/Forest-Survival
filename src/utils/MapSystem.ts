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
 *
 * VOLUMETRIC PARITY RULE — every map keeps the full forest-grade
 * atmosphere stack visibly alive: god rays ≥ ~0.95, volumetric bounce
 * light ≥ ~1.0, haze dome ≥ ~0.9, rim light ≥ ~0.9, ground micro-relief
 * ≥ ~1.0. High-albedo maps (tundra, desert) must NOT fight brightness by
 * zeroing the volumetrics (that just reads as "no shaders on this map")
 * — blow-out is controlled at the correct levers instead: exposure,
 * highlightRecovery/Desaturation, and the bloom threshold bias. The
 * result is the same dreamy light-in-the-air feel on snow and sand as
 * under the forest canopy, without the wash.
 *
 * UNIFORMITY PASS (graphics overhaul): the non-forest maps used to run
 * their atmosphere channels 20–40% below the forest reference, which is
 * exactly why they read as an older, flatter game next to it. Every map
 * now holds the floors above — the per-map identity comes from palette,
 * fog, terrain shape and storm species, never from getting LESS of the
 * shader stack.
 *
 * SECOND LIFT (sunlit-volumetric pass): the floors were raised again —
 * god rays, volumetric bounce, haze and rim on every map now sit within
 * ~10% of the deep-forest showcase values, so the signature light-in-the-
 * air look is the BASELINE everywhere. Brightness on high-albedo maps is
 * still controlled ONLY at exposure / highlightRecovery / bloom threshold
 * — never by dimming the volumetrics.
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
    // Moderate-sunny daylight forest: a warmer gold-green sun streams through
    // the canopy over a brighter sky, instead of the old dim neon-green murk.
    skyColor: 0x33503a,
    fogColor: 0x16301c,
    fogNear: 20,
    fogFar: 150,
    ambientLightColor: 0x5e8a5c,
    ambientLightIntensity: 0.58,
    directionalLightColor: 0xe9f4c2,
    directionalLightIntensity: 0.95,
    groundColor: 0x1a4a1a,
    groundEmissive: 0x0a2a0a,
    groundSize: 640,
    treeDensityMult: 1.3,
    rockDensityMult: 0.7,
    bushDensityMult: 1.4,
    hasSpecialWeather: false,
    visibilityMult: 0.9,
    enemySpawnRadiusMult: 1.0,
    bloomMultiplier: 1.12,
    bloomThresholdBias: -0.04,
    // SHOWCASE GRADE — the forest is the flagship map, pushed slightly past
    // the neutral 1.0 baseline: thicker canopy god rays, a denser breathing
    // haze, richer foliage vibrance and a dewier, more tactile floor. The
    // other maps' parity values are tuned relative to THIS look.
    renderProfile: {
      atmosphereWeight: 0.18,
      nightAtmosphereWeight: 0.12,
      exposure: 1.0,
      saturation: 1.04,
      contrast: 1.03,
      bloomStrength: 1.05,
      godRayStrength: 1.15,            // sunbeams pour through the canopy
      aerialPerspective: 1.0,
      // Highlight guard raised alongside the brighter sun so the lifted daylight
      // never clips to white — sun-struck leaves roll off, they don't blow out.
      highlightRecovery: 0.2,
      highlightDesaturation: 0.2,
      vibrance: 1.08,                  // lusher greens, deeper sky blues
      shadowLift: 1.0,
      hazeDensity: 1.12,               // morning-mist body between the trunks
      fogDensity: 1.0,
      environmentIntensity: 1.05,
      directLight: 1.0,
      ambientLight: 1.0,
      volumetricLight: 1.1,            // warm golden bounce under the canopy
      fillLight: 1.0,
      rimLight: 1.1,                   // leaf-edge / trunk-edge sun rim
      groundSpecular: 1.08,            // dew glint on the moss
      groundNormal: 1.12,              // more tactile root-and-humus relief
      groundPatch: 1.1,
    },
    // Soft, mossy forest floor — gentle rolling humus broken by exposed roots
    // and damp earth. Warm/cool leaf-litter patches over a mossy rock talus.
    // NOTE: no static `wetness` — the deep forest is the ONLY map that grows
    // puddles, and only while/after its rain storm soaks the ground (driven
    // live by the weather system via uRainWet, gated to this map in App.tsx).
    // A dry forest floor in clear weather, a glistening rain-soaked one after
    // a storm — puddles never appear on any other map.
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
      detailScale: 1.15,
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
      exposure: 0.84,
      saturation: 0.9,
      contrast: 1.04,
      bloomStrength: 1.0,
      godRayStrength: 1.08,            // ember-laden shafts burn through the smoke
      aerialPerspective: 0.6,
      highlightRecovery: 0.36,
      highlightDesaturation: 0.22,
      vibrance: 1.02,                  // lava oranges pushed past forest-grade richness
      shadowLift: 0.92,
      hazeDensity: 1.06,               // full volcanic particulate haze dome
      fogDensity: 0.9,
      environmentIntensity: 0.86,
      directLight: 0.92,
      ambientLight: 0.9,
      volumetricLight: 1.06,           // warm lava-glow bounce, showcase parity
      fillLight: 0.88,
      rimLight: 1.08,                  // hot rim off obsidian silhouettes
      groundSpecular: 0.8,
      groundNormal: 1.15,              // jagged cooled-lava relief, forest-grade
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
      crackGlow: 1.9,                  // magma seams read from further out
      crackColor: 0xff4a12,
    },
  },

  // ── Icy tundra with frozen pines ──
  // Third-pass tuning. The first fix for the bright-white wash pulled EVERY
  // lever down — including the volumetrics — which killed the wash but left
  // tundra reading as "the map with no shaders": no god rays, no haze, no
  // light in the air. This pass restores full forest-grade volumetrics
  // (god rays, haze dome, warm bounce) and controls brightness ONLY at the
  // correct levers: exposure, highlight recovery/desaturation, and a high
  // bloom threshold. Cold sunlight now visibly streams between the pines
  // while the snowfield itself stays readable and un-blown.
  frozen_tundra: {
    id: 'frozen_tundra',
    name: 'Frozen Tundra',
    description: 'A frozen expanse of ice spires, snow-laden pines, and frozen ponds.',
    icon: '❄️',
    primaryBiome: 'tundra',
    // Crisp, moderately-sunny winter day — a brighter cold-blue sky and a
    // stronger sun off the snow. Brightness stays controlled by the LOW exposure
    // (0.72) + very high highlightRecovery (0.78) below, so the snowfield reads
    // sun-lit, NOT blown to white.
    skyColor: 0x587aa4,                   // brighter sunny cold sky
    fogColor: 0x3c5167,                   // slate haze, slightly lifted
    fogNear: 50,                          // was 40
    fogFar: 480,                          // was 320 — long sightlines
    ambientLightColor: 0x61788e,
    ambientLightIntensity: 0.4,           // snow reflects a lot; keep fill modest
    directionalLightColor: 0xe8eef4,      // bright cool sun (still not pure white)
    directionalLightIntensity: 0.74,
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
    // Restrained-but-alive bloom: high threshold keeps the snowfield from
    // blooming wholesale while the sun disc / god-ray core still glows.
    bloomMultiplier: 0.52,                // snow is high-albedo; bloom stays surgical
    bloomThresholdBias: 0.16,             // sun + emissives bloom, snow doesn't
    renderProfile: {
      atmosphereWeight: 0.86,
      nightAtmosphereWeight: 0.42,
      exposure: 0.72,                     // brightness control lever #1
      saturation: 0.78,                   // cold but no longer grey-dead
      contrast: 0.98,
      bloomStrength: 0.72,
      godRayStrength: 0.96,               // cold shafts pour between frozen pines
      aerialPerspective: 0.3,
      highlightRecovery: 0.78,            // brightness control lever #2
      highlightDesaturation: 0.6,
      vibrance: 0.92,                     // sky blues + pine teals at showcase parity
      shadowLift: 0.9,
      hazeDensity: 0.92,                  // fuller breathing ice-haze dome
      fogDensity: 0.62,
      environmentIntensity: 0.6,
      directLight: 0.78,
      ambientLight: 0.7,
      volumetricLight: 1.0,               // warm-vs-cold bounce at showcase parity
      fillLight: 0.68,
      rimLight: 0.95,                     // strong snow-edge rim sparkle
      groundSpecular: 0.52,               // crystalline glint, not mirror
      groundNormal: 1.0,                  // sculpted wind-packed snowdrift relief, forest-grade
      groundPatch: 0.8,
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
      rippleStrength: 0.26,               // crisper drift ridges under the low sun
      sparkle: 0.85,                      // denser crystalline glint field
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
    // Bloom restrained via THRESHOLD (sand never blooms wholesale) while
    // the multiplier stays high enough that the harsh sun + god-ray core
    // read as a real desert glare. Volumetrics restored to forest parity —
    // heat-haze + golden shafts are the signature "dreamy 2014" desert look.
    bloomMultiplier: 0.58,
    bloomThresholdBias: 0.14,
    renderProfile: {
      atmosphereWeight: 0.84,
      nightAtmosphereWeight: 0.38,
      exposure: 0.74,                     // brightness control lever #1
      saturation: 0.74,
      contrast: 0.98,
      bloomStrength: 0.74,
      godRayStrength: 1.0,                // harsh sun shafts rake off the mesas
      aerialPerspective: 0.42,            // golden distance tint (Mie scatter)
      highlightRecovery: 0.72,            // brightness control lever #2
      highlightDesaturation: 0.58,
      vibrance: 0.86,                     // richer terracotta strata, still sun-bleached
      shadowLift: 0.86,
      hazeDensity: 0.92,                  // fuller shimmering heat-haze dome
      fogDensity: 0.6,
      environmentIntensity: 0.6,
      directLight: 0.8,
      ambientLight: 0.66,
      volumetricLight: 1.0,               // warm sand-bounce at showcase parity
      fillLight: 0.62,
      rimLight: 0.9,                      // hot rim on mesa + cactus silhouettes
      groundSpecular: 0.42,               // mica glints in the hardpan
      groundNormal: 1.1,                  // tactile wind-rippled sand relief, forest-grade
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
      rippleStrength: 0.34,               // deeper wind ripples under the raking sun
      sparkle: 0.32,
    },
  },

  // ── Dark swamp with toxic pools ──
  toxic_swamp: {
    id: 'toxic_swamp',
    name: 'Toxic Swamp',
    description: 'A drowned wetland — one vast sheet of glowing toxic water threading between gnarled trees, silt banks, and luminous fungi.',
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
    // Restrained bloom — with the WHOLE floor now standing water, the old
    // generous multiplier + negative threshold turned every specular ripple
    // into a wall of glare (user report). Emissive accents (fungi, enemy
    // cores) still bloom; the water itself stays under the knee.
    bloomMultiplier: 1.0,
    bloomThresholdBias: 0.04,
    // Murky wetland grade — green-biased, shadows gently lifted for
    // readability through the fog, strong wet specular on the soaked ground.
    renderProfile: {
      atmosphereWeight: 0.5,
      nightAtmosphereWeight: 0.28,
      exposure: 0.88,
      saturation: 0.96,
      contrast: 1.02,
      bloomStrength: 1.0,
      godRayStrength: 1.02,             // murky god-shafts through the canopy
      aerialPerspective: 0.72,
      highlightRecovery: 0.22,
      highlightDesaturation: 0.2,
      vibrance: 1.06,                   // luminous fungus greens/purples pushed
      shadowLift: 1.08,
      hazeDensity: 1.1,                 // swamp breathes — thick vapor dome
      fogDensity: 1.0,
      environmentIntensity: 0.85,
      directLight: 0.9,
      ambientLight: 1.0,
      volumetricLight: 1.06,            // sickly-warm bounce at showcase parity
      fillLight: 0.92,
      rimLight: 1.08,                   // wet-bark rim off the gnarled trees
      // Ground specular pulled well back: this multiplies the sun glint over
      // what is now a FULL map of water — at 1.25 the whole floor integrated
      // into blinding sun-glare. The water read comes from the murky mirror
      // reflections + soft sheen, not raw specular energy.
      groundSpecular: 0.62,
      groundNormal: 1.12,               // mud-rut relief at forest grade
      groundPatch: 1.05,
    },
    // DROWNED wetland — the whole floor is one continuous sheet of standing
    // TOXIC WATER (user mandate: water globally, not land). `swampWater` floods
    // everything except noise-raised silt banks through the exact rain-puddle
    // shading stack (dark water body + fresnel PMREM mirror reflections +
    // rippling surface + tight sun glint) tinted toxic green with a faint
    // luminescent glow, so it reads as a luminous poisoned bog rather than wet
    // dirt. Full-strength static `wetness` (uTWetness) drives the sheen; this
    // is baked terrain identity, independent of the live-rain gate, and never
    // spreads to the dry maps.
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
      wetness: 1.0,
      swampWater: 1.0,
      // Murky bog green — desaturated + darkened from the first pass's neon
      // 0x2fc356, which under bloom read as radioactive slime rather than
      // realistic standing water with dissolved toxins.
      waterColor: 0x1e7a38,
    },
  },

  // ── Concrete walls and bunkers ──
  military_outpost: {
    id: 'military_outpost',
    name: 'Military Outpost',
    description: 'An abandoned base with concrete walls, sandbag bunkers, and watchtower frames.',
    icon: '🪖',
    primaryBiome: 'military',
    // Clear, moderately-sunny day over the compound — a soft blue sky and a
    // warm sun replace the old flat overcast (the dust haze still grounds it).
    skyColor: 0x5b6f80,
    fogColor: 0x53606a,                    // lighter haze, still below mid-luma
    fogNear: 35,
    fogFar: 240,                           // was 180 — better engagement distance
    ambientLightColor: 0x8a93a0,
    ambientLightIntensity: 0.56,
    directionalLightColor: 0xffeecf,
    directionalLightIntensity: 1.0,
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
      bloomStrength: 0.9,
      godRayStrength: 1.05,             // dust-laden sun shafts across the compound
      aerialPerspective: 0.85,
      // Brighter sun → stronger highlight roll-off so concrete + sand stay
      // readable instead of clipping to white.
      highlightRecovery: 0.24,
      highlightDesaturation: 0.2,
      vibrance: 0.95,                   // olive drab + rust warmed toward parity
      shadowLift: 0.98,
      hazeDensity: 1.08,                // dusty parade-ground air, full dome
      fogDensity: 1.0,
      environmentIntensity: 0.95,
      directLight: 1.0,
      ambientLight: 0.98,
      volumetricLight: 1.05,            // sun-through-dust bounce, forest-grade
      fillLight: 0.95,
      rimLight: 1.05,                   // crisp metal/concrete edge light
      groundSpecular: 1.0,
      groundNormal: 1.2,                // cracked-asphalt + gravel bite
      groundPatch: 1.12,
    },
    // Compacted dirt-and-gravel parade ground with cracked asphalt aprons and
    // low blast berms. Mostly flat (a real base) with gritty micro-relief. Dry
    // hardpan — no standing water on an active outpost (puddles are reserved
    // for the rained-on deep forest); the gritty detail + crisp sun specular
    // carry the surface read instead.
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
      bloomStrength: 0.98,
      godRayStrength: 1.08,             // low orange sun rakes long dusk shafts
      aerialPerspective: 0.8,
      highlightRecovery: 0.2,
      highlightDesaturation: 0.2,
      vibrance: 1.1,                    // deep violets + wisp glows pushed
      shadowLift: 0.95,
      hazeDensity: 1.08,                // dusk mist hangs between the bare trees
      fogDensity: 1.0,
      environmentIntensity: 0.8,
      directLight: 0.95,
      ambientLight: 0.95,
      volumetricLight: 1.08,            // dusk bounce — wisps hang in the air
      fillLight: 0.9,
      rimLight: 1.18,                   // signature sunset rim on bare branches
      groundSpecular: 1.08,
      groundNormal: 1.1,                // rooty violet-earth relief, forest-grade
      groundPatch: 1.0,
    },
    // Haunted vale floor — soft rolling violet earth with charred dark-purple
    // rock breaking the slopes. Quiet and otherworldly. Dry dusk soil (no
    // puddle pattern — those live only in the rained-on deep forest); the
    // moody violet macro tints + soft specular carry the floor.
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
    },
  },

  // ── Crumbling stone ruins ──
  ancient_ruins: {
    id: 'ancient_ruins',
    name: 'Ancient Ruins',
    description: 'Crumbling stone columns, broken walls, arched doorways, and forgotten statues.',
    icon: '🏛️',
    primaryBiome: 'ruins',
    // Warm, moderately-sunny day over the ruins by default — sun-warmed stone
    // and a soft sky. The 'rain' storm still rolls in to darken + soak it
    // situationally, so the wet-stone drama is earned, not the constant state.
    skyColor: 0x6a7488,
    fogColor: 0x5a6470,
    fogNear: 25,
    fogFar: 220,                           // was 150 — more atmospheric depth
    ambientLightColor: 0x97a0a6,
    ambientLightIntensity: 0.56,
    directionalLightColor: 0xffeccc,
    directionalLightIntensity: 0.95,
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
      godRayStrength: 1.05,             // storm-light shafts between the columns
      aerialPerspective: 0.78,
      // Sunnier base → firmer highlight roll-off so pale flagstones don't clip.
      highlightRecovery: 0.26,
      highlightDesaturation: 0.22,
      vibrance: 1.02,                   // moss greens + warm stone lifted
      shadowLift: 1.0,
      hazeDensity: 1.08,
      fogDensity: 1.0,
      environmentIntensity: 0.9,
      directLight: 0.95,
      ambientLight: 1.0,
      volumetricLight: 1.08,            // rain-mist bounce at showcase parity
      fillLight: 0.95,
      rimLight: 1.1,                    // wet-stone edge light on the columns
      groundSpecular: 1.3,              // rain-glossed flagstones
      groundNormal: 1.18,               // heaved-tile relief at forest grade
      groundPatch: 1.06,
    },
    // Worn flagstone plaza heaved by centuries of root and frost — broken
    // tiles and rubble ridges. Rain glistens the stone through the strong
    // groundSpecular grade (a clean wet sheen), NOT the discrete rain-puddle
    // pattern — pooled puddles are reserved for the deep forest, so the ruins
    // stay free of stray ground "potholes".
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
