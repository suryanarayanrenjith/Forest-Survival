import type { MapType } from './MapSystem';

/**
 * PER-MAP PARTICIPATING MEDIUM
 *
 * Art direction for the raymarched volumetric pass (PostProcessing.ts) and the
 * analytic height / sun-scatter terms of the material fog (AdvancedLighting.ts).
 * Kept separate from MapSystem's large configs so the atmosphere can be tuned
 * in one place. Every value is a BASELINE for clear daylight; App.tsx scales it
 * live by the weather front (storms thicken the air, overcast kills the sun
 * shafts) and by night (moonlight scatters less, the air reads denser).
 *
 *   density        base extinction of the air (1/m) — the general haze body
 *   groundFog      extra extinction at ground level (1/m) — mist between trunks
 *   groundFalloff  how fast the ground layer thins with height (1/m)
 *   sunScatter     multiplier on the key light's in-scattering — shaft brightness
 *   ambientScatter multiplier on the fog-coloured sky in-scattering (radiance)
 *   anisotropy     Henyey-Greenstein g: high = shafts concentrate toward the sun
 *   noise          0..1 heterogeneity (drifting wisps vs a uniform veil)
 *   heightFog      material-fog height density (1/m), all tiers incl. Low
 *   heightFalloff  material-fog height falloff (1/m)
 *   fogSun         material-fog sun in-scatter strength (fog glows toward the sun)
 */
export interface AtmosphereProfile {
  density: number;
  groundFog: number;
  groundFalloff: number;
  sunScatter: number;
  ambientScatter: number;
  anisotropy: number;
  noise: number;
  heightFog: number;
  heightFalloff: number;
  fogSun: number;
}

const BASE: AtmosphereProfile = {
  density: 0.0009,
  groundFog: 0.0065,
  groundFalloff: 0.45,
  sunScatter: 0.55,
  ambientScatter: 0.3,
  anisotropy: 0.62,
  noise: 0.6,
  heightFog: 0.0019,
  heightFalloff: 0.09,
  fogSun: 0.55,
};

const PROFILES: Record<MapType, Partial<AtmosphereProfile>> = {
  // Flagship: cathedral sun shafts through the canopy over a thin floor mist.
  deep_forest: { density: 0.0013, groundFog: 0.011, sunScatter: 0.62, anisotropy: 0.66, noise: 0.68 },
  // Ash-choked air: thick, warm, heterogeneous; lava glow does the rest.
  scorched_wasteland: { density: 0.0024, groundFog: 0.01, groundFalloff: 0.3, sunScatter: 0.5, ambientScatter: 0.5, anisotropy: 0.55, noise: 0.8, heightFog: 0.004, fogSun: 0.45 },
  // Crisp cold air: thin haze, low drifting snow mist, bright forward scatter.
  frozen_tundra: { density: 0.0008, groundFog: 0.007, groundFalloff: 0.5, sunScatter: 0.4, ambientScatter: 0.38, anisotropy: 0.7, noise: 0.45, heightFog: 0.002, fogSun: 0.6 },
  // Dry dusty air: wide, warm, low-contrast haze with little ground mist.
  desert_canyon: { density: 0.001, groundFog: 0.004, groundFalloff: 0.55, sunScatter: 0.38, ambientScatter: 0.4, anisotropy: 0.6, noise: 0.5, heightFog: 0.0016, fogSun: 0.7 },
  // Heavy bog: dense, low, rolling toxic mist you wade through.
  toxic_swamp: { density: 0.0022, groundFog: 0.032, groundFalloff: 0.32, sunScatter: 0.48, ambientScatter: 0.5, anisotropy: 0.6, noise: 0.85, heightFog: 0.007, heightFalloff: 0.12, fogSun: 0.4 },
  // Industrial: smoky mid haze, modest ground layer.
  military_outpost: { density: 0.0013, groundFog: 0.007, sunScatter: 0.5, anisotropy: 0.6, noise: 0.55 },
  // Golden-hour grove: warm luminous air, strong shafts.
  autumn_grove: { density: 0.0014, groundFog: 0.01, sunScatter: 0.66, anisotropy: 0.66, noise: 0.62, fogSun: 0.7 },
  // Haunted ruins: cool dense mist pooled in the low ground.
  ancient_ruins: { density: 0.0016, groundFog: 0.018, groundFalloff: 0.36, sunScatter: 0.55, ambientScatter: 0.46, anisotropy: 0.64, noise: 0.72, heightFog: 0.005 },
};

const cache = new Map<MapType, AtmosphereProfile>();

export function getAtmosphereProfile(map: MapType): AtmosphereProfile {
  let p = cache.get(map);
  if (!p) {
    p = { ...BASE, ...(PROFILES[map] ?? {}) };
    cache.set(map, p);
  }
  return p;
}
