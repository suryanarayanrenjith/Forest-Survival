/**
 * MAP SYSTEM - Forest Survival Game
 *
 * 8 completely distinct environments, each with a unique biome, lighting,
 * atmosphere, and terrain generation profile.
 */

import * as THREE from 'three';
import type { BiomeType } from './BiomeSystem';

export type MapType =
  | 'deep_forest'
  | 'scorched_wasteland'
  | 'frozen_tundra'
  | 'desert_canyon'
  | 'toxic_swamp'
  | 'military_outpost'
  | 'crystal_caverns'
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
}

export const MAP_CONFIGS: Record<MapType, MapConfig> = {
  // ── Classic dense green forest ──
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
  },

  // ── Charred volcanic hellscape ──
  scorched_wasteland: {
    id: 'scorched_wasteland',
    name: 'Scorched Wasteland',
    description: 'A charred landscape of obsidian pillars, lava pools, and smoldering embers.',
    icon: '🌋',
    primaryBiome: 'volcanic',
    skyColor: 0x1a0800,
    fogColor: 0x2a0a00,
    fogNear: 25,
    fogFar: 160,
    ambientLightColor: 0x8a3a1a,
    ambientLightIntensity: 0.4,
    directionalLightColor: 0xff6633,
    directionalLightIntensity: 0.7,
    groundColor: 0x1a1210,
    groundEmissive: 0x2a0800,
    groundSize: 400,
    treeDensityMult: 0.6,
    rockDensityMult: 1.5,
    bushDensityMult: 0.8,
    hasSpecialWeather: true,
    weatherType: 'ash',
    visibilityMult: 0.8,
    enemySpawnRadiusMult: 1.1,
  },

  // ── Icy tundra with frozen pines ──
  frozen_tundra: {
    id: 'frozen_tundra',
    name: 'Frozen Tundra',
    description: 'A frozen expanse of ice spires, snow-laden pines, and frozen ponds.',
    icon: '❄️',
    primaryBiome: 'tundra',
    skyColor: 0x8090a0,
    fogColor: 0xb0c0d0,
    fogNear: 30,
    fogFar: 200,
    ambientLightColor: 0x9ab0c0,
    ambientLightIntensity: 0.7,
    directionalLightColor: 0xeeeeff,
    directionalLightIntensity: 1.0,
    groundColor: 0xd0e0f0,
    groundEmissive: 0xa0c0d0,
    groundSize: 450,
    treeDensityMult: 0.7,
    rockDensityMult: 1.2,
    bushDensityMult: 0.4,
    hasSpecialWeather: true,
    weatherType: 'snow',
    visibilityMult: 0.85,
    enemySpawnRadiusMult: 1.1,
  },

  // ── Arid desert with mesa pillars ──
  desert_canyon: {
    id: 'desert_canyon',
    name: 'Desert Canyon',
    description: 'Towering sandstone pillars, sun-bleached arches, and hardy cacti dot this arid canyon.',
    icon: '🏜️',
    primaryBiome: 'desert',
    skyColor: 0x7a6040,
    fogColor: 0xc4a070,
    fogNear: 50,
    fogFar: 280,
    ambientLightColor: 0xc09060,
    ambientLightIntensity: 0.65,
    directionalLightColor: 0xffdd99,
    directionalLightIntensity: 1.1,
    groundColor: 0xd4a574,
    groundEmissive: 0xa47544,
    groundSize: 450,
    treeDensityMult: 0.5,
    rockDensityMult: 1.3,
    bushDensityMult: 0.5,
    hasSpecialWeather: true,
    weatherType: 'sandstorm',
    visibilityMult: 1.2,
    enemySpawnRadiusMult: 1.2,
  },

  // ── Dark swamp with toxic pools ──
  toxic_swamp: {
    id: 'toxic_swamp',
    name: 'Toxic Swamp',
    description: 'A murky wetland of gnarled trees, glowing mushrooms, and bubbling toxic pools.',
    icon: '🍄',
    primaryBiome: 'swamp',
    skyColor: 0x1a2818,
    fogColor: 0x2a3828,
    fogNear: 8,
    fogFar: 90,
    ambientLightColor: 0x3a5a3a,
    ambientLightIntensity: 0.35,
    directionalLightColor: 0x6a9a6a,
    directionalLightIntensity: 0.5,
    groundColor: 0x2a3825,
    groundEmissive: 0x1a2818,
    groundSize: 350,
    treeDensityMult: 1.0,
    rockDensityMult: 0.5,
    bushDensityMult: 1.6,
    hasSpecialWeather: true,
    weatherType: 'fog',
    visibilityMult: 0.55,
    enemySpawnRadiusMult: 0.8,
  },

  // ── Concrete walls and bunkers ──
  military_outpost: {
    id: 'military_outpost',
    name: 'Military Outpost',
    description: 'An abandoned base with concrete walls, sandbag bunkers, and watchtower frames.',
    icon: '🪖',
    primaryBiome: 'military',
    skyColor: 0x2a2a28,
    fogColor: 0x3a3a35,
    fogNear: 30,
    fogFar: 180,
    ambientLightColor: 0x6a6a60,
    ambientLightIntensity: 0.55,
    directionalLightColor: 0xccccbb,
    directionalLightIntensity: 0.85,
    groundColor: 0x4a4a42,
    groundEmissive: 0x2a2a24,
    groundSize: 400,
    treeDensityMult: 0.8,
    rockDensityMult: 1.2,
    bushDensityMult: 0.9,
    hasSpecialWeather: false,
    visibilityMult: 1.0,
    enemySpawnRadiusMult: 0.9,
  },

  // ── Glowing crystal underground ──
  crystal_caverns: {
    id: 'crystal_caverns',
    name: 'Crystal Caverns',
    description: 'A subterranean wonderland of glowing crystal spires, mineral clusters, and alien flora.',
    icon: '💎',
    primaryBiome: 'crystal',
    skyColor: 0x0a0520,
    fogColor: 0x1a1040,
    fogNear: 15,
    fogFar: 120,
    ambientLightColor: 0x5533aa,
    ambientLightIntensity: 0.45,
    directionalLightColor: 0xaa77ff,
    directionalLightIntensity: 0.65,
    groundColor: 0x1a102a,
    groundEmissive: 0x2a1a4a,
    groundSize: 380,
    treeDensityMult: 0.9,
    rockDensityMult: 1.4,
    bushDensityMult: 1.0,
    hasSpecialWeather: false,
    visibilityMult: 0.7,
    enemySpawnRadiusMult: 0.85,
  },

  // ── Crumbling stone ruins ──
  ancient_ruins: {
    id: 'ancient_ruins',
    name: 'Ancient Ruins',
    description: 'Crumbling stone columns, broken walls, arched doorways, and forgotten statues.',
    icon: '🏛️',
    primaryBiome: 'ruins',
    skyColor: 0x303028,
    fogColor: 0x404038,
    fogNear: 20,
    fogFar: 150,
    ambientLightColor: 0x7a7a6a,
    ambientLightIntensity: 0.5,
    directionalLightColor: 0xbbbbaa,
    directionalLightIntensity: 0.75,
    groundColor: 0x5a5548,
    groundEmissive: 0x3a3530,
    groundSize: 400,
    treeDensityMult: 0.8,
    rockDensityMult: 1.6,
    bushDensityMult: 1.0,
    hasSpecialWeather: true,
    weatherType: 'rain',
    visibilityMult: 0.9,
    enemySpawnRadiusMult: 0.95,
  },
};

// Get all available maps for UI display
export function getAvailableMaps(): MapConfig[] {
  return Object.values(MAP_CONFIGS);
}

// Get a specific map config
export function getMapConfig(mapType: MapType): MapConfig {
  return MAP_CONFIGS[mapType];
}

// Apply map configuration to scene
export function applyMapToScene(
  scene: THREE.Scene,
  mapConfig: MapConfig,
  ground?: THREE.Mesh
): void {
  scene.background = new THREE.Color(mapConfig.skyColor);
  scene.fog = new THREE.Fog(mapConfig.fogColor, mapConfig.fogNear, mapConfig.fogFar);

  if (ground && ground.material instanceof THREE.MeshStandardMaterial) {
    ground.material.color.setHex(mapConfig.groundColor);
    ground.material.emissive.setHex(mapConfig.groundEmissive);
  }
}

// Get random map for random mode — uses crypto for uniform distribution
export function getRandomMap(): MapType {
  const maps = Object.keys(MAP_CONFIGS) as MapType[];
  // Use crypto.getRandomValues for better entropy than Math.random
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const index = array[0] % maps.length;
  const chosen = maps[index];
  console.log(`[MapSystem] Random map selected: ${chosen} (index ${index} of ${maps.length})`);
  return chosen;
}

// Default map
export const DEFAULT_MAP: MapType = 'deep_forest';
