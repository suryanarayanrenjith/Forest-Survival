/**
 * MAP SYSTEM - Forest Survival Game
 *
 * All maps are forest-themed environments for the survival game.
 * Each forest type has unique visual characteristics, lighting, fog, and atmosphere.
 */

import * as THREE from 'three';
import type { BiomeType } from './BiomeSystem';

export type MapType =
  | 'dense_forest'      // Classic deep forest
  | 'pine_woods'        // Conifer/Pine forest
  | 'autumn_forest'     // Fall colors forest
  | 'swamp_forest'      // Murky swamp with twisted trees
  | 'dark_hollow'       // Dark, eerie forest
  | 'snowy_forest'      // Winter snow-covered forest
  | 'bamboo_grove'      // Dense bamboo forest
  | 'overgrown_ruins';  // Ancient ruins reclaimed by forest

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
  visibilityMult: number;      // Affects player view distance
  enemySpawnRadiusMult: number; // How far enemies spawn
  // Color palette for vegetation
  treeColors: number[];
  bushColors: number[];
  rockColors: number[];
}

export const MAP_CONFIGS: Record<MapType, MapConfig> = {
  dense_forest: {
    id: 'dense_forest',
    name: 'Dense Forest',
    description: 'A thick, lush forest with towering trees and rich undergrowth.',
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
    treeColors: [0x1a7a1a, 0x0f5d0f, 0x0d4d0d, 0x246a24, 0x2a8a2a],
    bushColors: [0x1a6a1a, 0x156515, 0x2a7a2a, 0x3a8a3a],
    rockColors: [0x4a5a4a, 0x5a6a5a, 0x3a4a3a]
  },

  pine_woods: {
    id: 'pine_woods',
    name: 'Pine Woods',
    description: 'A serene conifer forest with tall pine trees and needle-covered ground.',
    icon: '🌲',
    primaryBiome: 'forest',
    skyColor: 0x2a4050,
    fogColor: 0x1a3040,
    fogNear: 30,
    fogFar: 200,
    ambientLightColor: 0x5a8a7a,
    ambientLightIntensity: 0.55,
    directionalLightColor: 0xaaddcc,
    directionalLightIntensity: 0.85,
    groundColor: 0x2a3a2a,
    groundEmissive: 0x1a2a1a,
    groundSize: 450,
    treeDensityMult: 1.1,
    rockDensityMult: 1.0,
    bushDensityMult: 0.6,
    hasSpecialWeather: false,
    visibilityMult: 1.1,
    enemySpawnRadiusMult: 1.1,
    treeColors: [0x1a5a3a, 0x0f4a2a, 0x2a6a4a, 0x3a7a5a],
    bushColors: [0x2a5a3a, 0x1a4a2a, 0x3a6a4a],
    rockColors: [0x5a6a5a, 0x6a7a6a, 0x4a5a4a]
  },

  autumn_forest: {
    id: 'autumn_forest',
    name: 'Autumn Forest',
    description: 'A beautiful forest ablaze with fall colors - reds, oranges, and golds.',
    icon: '🍂',
    primaryBiome: 'forest',
    skyColor: 0x5a4a40,
    fogColor: 0x4a3a30,
    fogNear: 35,
    fogFar: 180,
    ambientLightColor: 0xaa8060,
    ambientLightIntensity: 0.6,
    directionalLightColor: 0xffcc88,
    directionalLightIntensity: 0.9,
    groundColor: 0x4a3020,
    groundEmissive: 0x3a2010,
    groundSize: 400,
    treeDensityMult: 1.0,
    rockDensityMult: 0.8,
    bushDensityMult: 1.0,
    hasSpecialWeather: false,
    visibilityMult: 1.0,
    enemySpawnRadiusMult: 1.0,
    treeColors: [0xaa4420, 0xcc6630, 0xdd8840, 0xbb5530, 0x995520],
    bushColors: [0xaa5530, 0xcc7740, 0x996630, 0xbb6640],
    rockColors: [0x5a5040, 0x6a6050, 0x4a4030]
  },

  swamp_forest: {
    id: 'swamp_forest',
    name: 'Swamp Forest',
    description: 'A murky wetland with twisted trees, hanging moss, and thick fog.',
    icon: '🌿',
    primaryBiome: 'swamp',
    skyColor: 0x2a3a2a,
    fogColor: 0x3a5a4a,
    fogNear: 10,
    fogFar: 100,
    ambientLightColor: 0x4a7a5a,
    ambientLightIntensity: 0.4,
    directionalLightColor: 0x7aaa8a,
    directionalLightIntensity: 0.6,
    groundColor: 0x2a3a2a,
    groundEmissive: 0x1a2a1a,
    groundSize: 350,
    treeDensityMult: 0.9,
    rockDensityMult: 0.5,
    bushDensityMult: 1.6,
    hasSpecialWeather: true,
    weatherType: 'fog',
    visibilityMult: 0.6,
    enemySpawnRadiusMult: 0.8,
    treeColors: [0x2a5a3a, 0x1a4a2a, 0x3a6a4a, 0x4a7a5a],
    bushColors: [0x3a6a4a, 0x2a5a3a, 0x4a7a5a, 0x5a8a6a],
    rockColors: [0x3a4a3a, 0x4a5a4a, 0x2a3a2a]
  },

  dark_hollow: {
    id: 'dark_hollow',
    name: 'Dark Hollow',
    description: 'An eerie, shadowy forest where little light penetrates the canopy.',
    icon: '🌑',
    primaryBiome: 'forest',
    skyColor: 0x101518,
    fogColor: 0x0a1010,
    fogNear: 8,
    fogFar: 80,
    ambientLightColor: 0x2a3a4a,
    ambientLightIntensity: 0.25,
    directionalLightColor: 0x4a6a8a,
    directionalLightIntensity: 0.4,
    groundColor: 0x1a1a1a,
    groundEmissive: 0x0a0a0a,
    groundSize: 350,
    treeDensityMult: 1.4,
    rockDensityMult: 1.2,
    bushDensityMult: 1.3,
    hasSpecialWeather: true,
    weatherType: 'fog',
    visibilityMult: 0.5,
    enemySpawnRadiusMult: 0.7,
    treeColors: [0x1a2a1a, 0x0a1a0a, 0x2a3a2a, 0x1a3a1a],
    bushColors: [0x1a2a1a, 0x0a1a0a, 0x2a3a2a],
    rockColors: [0x2a2a2a, 0x3a3a3a, 0x1a1a1a, 0x404040]
  },

  snowy_forest: {
    id: 'snowy_forest',
    name: 'Snowy Forest',
    description: 'A winter wonderland with snow-covered pines and frozen ground.',
    icon: '❄️',
    primaryBiome: 'tundra',
    skyColor: 0x8090a0,
    fogColor: 0xb0c0d0,
    fogNear: 30,
    fogFar: 180,
    ambientLightColor: 0x9ab0c0,
    ambientLightIntensity: 0.7,
    directionalLightColor: 0xffffff,
    directionalLightIntensity: 1.0,
    groundColor: 0xd0e0f0,
    groundEmissive: 0xa0c0d0,
    groundSize: 450,
    treeDensityMult: 0.7,
    rockDensityMult: 1.0,
    bushDensityMult: 0.3,
    hasSpecialWeather: true,
    weatherType: 'snow',
    visibilityMult: 0.85,
    enemySpawnRadiusMult: 1.1,
    treeColors: [0x2a4a3a, 0x1a3a2a, 0x3a5a4a, 0x4a6a5a],
    bushColors: [0x5a7a6a, 0x4a6a5a, 0x6a8a7a],
    rockColors: [0xb0c0d0, 0xc0d0e0, 0xa0b0c0, 0xd0e0f0]
  },

  bamboo_grove: {
    id: 'bamboo_grove',
    name: 'Bamboo Grove',
    description: 'A dense bamboo forest with tall green stalks and dappled sunlight.',
    icon: '🎋',
    primaryBiome: 'forest',
    skyColor: 0x4a6a4a,
    fogColor: 0x3a5a3a,
    fogNear: 25,
    fogFar: 140,
    ambientLightColor: 0x6a9a6a,
    ambientLightIntensity: 0.55,
    directionalLightColor: 0xbbffbb,
    directionalLightIntensity: 0.85,
    groundColor: 0x3a5a3a,
    groundEmissive: 0x2a4a2a,
    groundSize: 380,
    treeDensityMult: 1.5,
    rockDensityMult: 0.4,
    bushDensityMult: 0.8,
    hasSpecialWeather: false,
    visibilityMult: 0.8,
    enemySpawnRadiusMult: 0.9,
    treeColors: [0x4a9a4a, 0x3a8a3a, 0x5aaa5a, 0x6abb6a, 0x3a7a3a],
    bushColors: [0x4a8a4a, 0x3a7a3a, 0x5a9a5a],
    rockColors: [0x5a6a5a, 0x6a7a6a, 0x4a5a4a]
  },

  overgrown_ruins: {
    id: 'overgrown_ruins',
    name: 'Overgrown Ruins',
    description: 'Ancient stone ruins slowly being reclaimed by the forest.',
    icon: '🏛️',
    primaryBiome: 'forest',
    skyColor: 0x304030,
    fogColor: 0x203020,
    fogNear: 15,
    fogFar: 130,
    ambientLightColor: 0x6a8a6a,
    ambientLightIntensity: 0.5,
    directionalLightColor: 0xaaccaa,
    directionalLightIntensity: 0.7,
    groundColor: 0x3a4a3a,
    groundEmissive: 0x2a3a2a,
    groundSize: 380,
    treeDensityMult: 0.9,
    rockDensityMult: 1.8,
    bushDensityMult: 1.3,
    hasSpecialWeather: true,
    weatherType: 'rain',
    visibilityMult: 0.9,
    enemySpawnRadiusMult: 0.95,
    treeColors: [0x2a6a2a, 0x1a5a1a, 0x3a7a3a, 0x4a8a4a],
    bushColors: [0x2a5a2a, 0x1a4a1a, 0x3a6a3a, 0x4a7a4a],
    rockColors: [0x6a6a5a, 0x7a7a6a, 0x5a5a4a, 0x8a8a7a]
  }
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
  // Update scene background
  scene.background = new THREE.Color(mapConfig.skyColor);

  // Update fog
  scene.fog = new THREE.Fog(mapConfig.fogColor, mapConfig.fogNear, mapConfig.fogFar);

  // Update ground if provided
  if (ground && ground.material instanceof THREE.MeshStandardMaterial) {
    ground.material.color.setHex(mapConfig.groundColor);
    ground.material.emissive.setHex(mapConfig.groundEmissive);
  }
}

// Get random map for random mode
export function getRandomMap(): MapType {
  const maps = Object.keys(MAP_CONFIGS) as MapType[];
  return maps[Math.floor(Math.random() * maps.length)];
}

// Default map
export const DEFAULT_MAP: MapType = 'dense_forest';
