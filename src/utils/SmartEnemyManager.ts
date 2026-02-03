// Smart Enemy Manager - Advanced enemy pooling, LOD, and optimization system
// Reduces lag by intelligently managing enemy resources through:
// - Object pooling (reuse meshes instead of creating/destroying)
// - Shared geometries and materials (single instances reused across all enemies)
// - LOD (Level of Detail) - simpler meshes for distant enemies
// - Frustum culling - hide enemies outside camera view
// - Adaptive enemy limits - reduce max enemies when FPS drops
// - Spatial partitioning - efficient proximity queries

import * as THREE from 'three';
import { type GraphicsPreset } from './GameSettingsManager';

export type EnemyType = 'normal' | 'fast' | 'tank' | 'boss';

// Result type for mesh acquisition - used by App.tsx createEnemy
export interface AcquiredMesh {
  mesh: THREE.Group;
  body: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  head: THREE.Mesh;
  poolId: number; // ID for returning to pool
}

// LOD levels for enemies based on distance
export const LODLevel = {
  HIGH: 0,    // Full detail - close range (0-30 units)
  MEDIUM: 1,  // Reduced detail - medium range (30-60 units)
  LOW: 2,     // Minimal detail - far range (60-100 units)
  CULLED: 3,  // Not visible - beyond view distance or off-screen
} as const;

export type LODLevel = typeof LODLevel[keyof typeof LODLevel];

// Enemy visual configuration
interface EnemyVisualConfig {
  baseColor: number;
  accentColor: number;
  brightColor: number;
  emissiveIntensity: number;
  scale: number;
}

const ENEMY_CONFIGS: Record<EnemyType, EnemyVisualConfig> = {
  normal: {
    baseColor: 0xcc0000,
    accentColor: 0x990000,
    brightColor: 0xff3333,
    emissiveIntensity: 0.2,
    scale: 1.0,
  },
  fast: {
    baseColor: 0x0066ff,
    accentColor: 0x0044cc,
    brightColor: 0x3399ff,
    emissiveIntensity: 0.25,
    scale: 0.7,
  },
  tank: {
    baseColor: 0x339933,
    accentColor: 0x226622,
    brightColor: 0x55cc55,
    emissiveIntensity: 0.15,
    scale: 1.5,
  },
  boss: {
    baseColor: 0xcc00cc,
    accentColor: 0x990099,
    brightColor: 0xff33ff,
    emissiveIntensity: 0.3,
    scale: 2.0,
  },
};

// Shared geometry cache - created once, reused for all enemies
interface SharedGeometries {
  // High detail
  bodyHigh: THREE.BoxGeometry;
  armHigh: THREE.BoxGeometry;
  legHigh: THREE.BoxGeometry;
  headHigh: THREE.BoxGeometry;
  eyeHigh: THREE.BoxGeometry;

  // Medium detail - simplified
  bodyMedium: THREE.BoxGeometry;
  limbMedium: THREE.BoxGeometry; // Single geometry for arms/legs
  headMedium: THREE.BoxGeometry;

  // Low detail - minimal (single box representation)
  bodyLow: THREE.BoxGeometry;
}

// Pooled enemy mesh structure
interface PooledEnemyMesh {
  group: THREE.Group;
  lodGroups: {
    high: THREE.Group;
    medium: THREE.Group;
    low: THREE.Group;
  };
  parts: {
    body?: THREE.Mesh;
    leftArm?: THREE.Mesh;
    rightArm?: THREE.Mesh;
    leftLeg?: THREE.Mesh;
    rightLeg?: THREE.Mesh;
    head?: THREE.Mesh;
    leftEye?: THREE.Mesh;
    rightEye?: THREE.Mesh;
  };
  currentLOD: LODLevel;
  inUse: boolean;
  type: EnemyType | null;
  lastActivationTime: number;
  _cellKey?: string; // Spatial grid cell key for quick removal
}

// Performance metrics for adaptive optimization
interface PerformanceMetrics {
  frameCount: number;
  totalFrameTime: number;
  avgFPS: number;
  lastMeasureTime: number;
  consecutiveLowFPSFrames: number;
  consecutiveHighFPSFrames: number;
}

// LOD distance thresholds
const LOD_DISTANCES = {
  HIGH_TO_MEDIUM: 30,
  MEDIUM_TO_LOW: 60,
  LOW_TO_CULLED: 100,
};

// Performance thresholds
const PERFORMANCE_THRESHOLDS = {
  TARGET_FPS: 55,
  LOW_FPS: 40,
  HIGH_FPS: 58,
  MEASURE_INTERVAL: 1000, // 1 second
  ADJUSTMENT_COOLDOWN: 2000, // 2 seconds between adjustments
};

class SmartEnemyManager {
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  private graphicsPreset: GraphicsPreset | null = null;

  // Shared resources
  private sharedGeometries: SharedGeometries | null = null;
  private sharedMaterials: Map<string, THREE.MeshLambertMaterial> = new Map();
  private eyeMaterial: THREE.MeshBasicMaterial | null = null;

  // Object pool
  private enemyPool: PooledEnemyMesh[] = [];
  private poolSize: number = 0;
  private maxPoolSize: number = 50;

  // Active tracking
  private activeEnemies: Set<PooledEnemyMesh> = new Set();

  // Performance monitoring
  private metrics: PerformanceMetrics = {
    frameCount: 0,
    totalFrameTime: 0,
    avgFPS: 60,
    lastMeasureTime: 0,
    consecutiveLowFPSFrames: 0,
    consecutiveHighFPSFrames: 0,
  };

  // Adaptive limits
  private currentMaxEnemies: number = 40;
  private baseMaxEnemies: number = 40;
  private lastAdjustmentTime: number = 0;

  // Frustum culling
  private frustum: THREE.Frustum = new THREE.Frustum();
  private frustumMatrix: THREE.Matrix4 = new THREE.Matrix4();

  // Spatial partitioning for efficient queries
  private spatialGrid: Map<string, Set<PooledEnemyMesh>> = new Map();
  private gridCellSize: number = 20;

  // LOD update throttling
  private lastLODUpdateTime: number = 0;
  private lodUpdateInterval: number = 100; // Update LOD every 100ms

  /**
   * Initialize the enemy manager with scene and graphics preset
   */
  initialize(scene: THREE.Scene, camera: THREE.Camera, graphicsPreset: GraphicsPreset): void {
    this.scene = scene;
    this.camera = camera;
    this.graphicsPreset = graphicsPreset;

    // Set max enemies based on graphics preset
    this.baseMaxEnemies = graphicsPreset.maxEnemies;
    this.currentMaxEnemies = this.baseMaxEnemies;
    this.maxPoolSize = Math.ceil(this.baseMaxEnemies * 1.5); // Pool 50% extra for smooth spawning

    // Initialize shared resources
    this.createSharedGeometries();
    this.createSharedMaterials();

    // Pre-populate pool based on graphics preset
    const initialPoolSize = Math.ceil(this.baseMaxEnemies * 0.75);
    this.warmupPool(initialPoolSize);

    console.log(`[SmartEnemyManager] Initialized with pool size ${initialPoolSize}, max enemies ${this.currentMaxEnemies}`);
  }

  /**
   * Create all shared geometries (called once)
   */
  private createSharedGeometries(): void {
    this.sharedGeometries = {
      // High detail geometries
      bodyHigh: new THREE.BoxGeometry(1, 1.5, 0.6),
      armHigh: new THREE.BoxGeometry(0.3, 1.2, 0.3),
      legHigh: new THREE.BoxGeometry(0.35, 1, 0.35),
      headHigh: new THREE.BoxGeometry(0.8, 0.8, 0.8),
      eyeHigh: new THREE.BoxGeometry(0.12, 0.12, 0.06),

      // Medium detail - simplified (fewer segments)
      bodyMedium: new THREE.BoxGeometry(1, 1.5, 0.6, 1, 1, 1),
      limbMedium: new THREE.BoxGeometry(0.4, 1.5, 0.4, 1, 1, 1),
      headMedium: new THREE.BoxGeometry(0.8, 0.8, 0.8, 1, 1, 1),

      // Low detail - single box
      bodyLow: new THREE.BoxGeometry(1.2, 2.5, 0.8, 1, 1, 1),
    };
  }

  /**
   * Create shared materials for each enemy type
   */
  private createSharedMaterials(): void {
    // Create eye material (shared across all enemies)
    // MeshBasicMaterial is unlit and appears at full brightness
    this.eyeMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
    });

    // Create materials for each enemy type
    for (const [type, config] of Object.entries(ENEMY_CONFIGS)) {
      // Body material
      this.sharedMaterials.set(`${type}_body`, new THREE.MeshLambertMaterial({
        color: config.baseColor,
        emissive: config.baseColor,
        emissiveIntensity: config.emissiveIntensity,
        flatShading: true,
      }));

      // Accent material (arms/legs)
      this.sharedMaterials.set(`${type}_accent`, new THREE.MeshLambertMaterial({
        color: config.accentColor,
        emissive: config.accentColor,
        emissiveIntensity: config.emissiveIntensity * 0.8,
        flatShading: true,
      }));

      // Bright material (head)
      this.sharedMaterials.set(`${type}_bright`, new THREE.MeshLambertMaterial({
        color: config.brightColor,
        emissive: config.brightColor,
        emissiveIntensity: config.emissiveIntensity * 1.2,
        flatShading: true,
      }));

      // Low LOD material (single color, simplified)
      this.sharedMaterials.set(`${type}_low`, new THREE.MeshLambertMaterial({
        color: config.baseColor,
        emissive: config.baseColor,
        emissiveIntensity: config.emissiveIntensity,
        flatShading: true,
      }));
    }
  }

  /**
   * Pre-populate the enemy pool
   */
  private warmupPool(count: number): void {
    for (let i = 0; i < count; i++) {
      this.createPooledEnemy();
    }
    this.poolSize = this.enemyPool.length;
  }

  /**
   * Create a single pooled enemy mesh with all LOD levels
   */
  private createPooledEnemy(): PooledEnemyMesh {
    if (!this.sharedGeometries) {
      throw new Error('SmartEnemyManager not initialized');
    }

    const group = new THREE.Group();
    group.visible = false; // Hidden until activated

    // Create LOD groups - all start hidden, applyLOD will show the correct one
    const highGroup = new THREE.Group();
    highGroup.visible = false;
    const mediumGroup = new THREE.Group();
    mediumGroup.visible = false;
    const lowGroup = new THREE.Group();
    lowGroup.visible = false;

    // We'll populate these when the enemy is activated with a specific type
    // This saves memory by not creating meshes until needed

    group.add(highGroup);
    group.add(mediumGroup);
    group.add(lowGroup);

    const pooledEnemy: PooledEnemyMesh = {
      group,
      lodGroups: { high: highGroup, medium: mediumGroup, low: lowGroup },
      parts: {},
      currentLOD: LODLevel.CULLED,
      inUse: false,
      type: null,
      lastActivationTime: 0,
    };

    this.enemyPool.push(pooledEnemy);

    if (this.scene) {
      this.scene.add(group);
    }

    return pooledEnemy;
  }

  /**
   * Setup mesh parts for a specific enemy type
   */
  private setupEnemyMeshes(pooledEnemy: PooledEnemyMesh, type: EnemyType): void {
    if (!this.sharedGeometries) return;

    const config = ENEMY_CONFIGS[type];
    const bodyMat = this.sharedMaterials.get(`${type}_body`)!;
    const accentMat = this.sharedMaterials.get(`${type}_accent`)!;
    const brightMat = this.sharedMaterials.get(`${type}_bright`)!;
    const lowMat = this.sharedMaterials.get(`${type}_low`)!;

    // Clear existing meshes
    this.clearLODGroups(pooledEnemy);

    // HIGH LOD - Full detail
    const highGroup = pooledEnemy.lodGroups.high;

    const body = new THREE.Mesh(this.sharedGeometries.bodyHigh, bodyMat);
    body.castShadow = this.graphicsPreset?.shadowsEnabled ?? true;
    body.position.y = 0.75;
    highGroup.add(body);
    pooledEnemy.parts.body = body;

    const leftArm = new THREE.Mesh(this.sharedGeometries.armHigh, accentMat);
    leftArm.castShadow = this.graphicsPreset?.shadowsEnabled ?? true;
    leftArm.position.set(-0.65, 0.6, 0);
    highGroup.add(leftArm);
    pooledEnemy.parts.leftArm = leftArm;

    const rightArm = new THREE.Mesh(this.sharedGeometries.armHigh, accentMat);
    rightArm.castShadow = this.graphicsPreset?.shadowsEnabled ?? true;
    rightArm.position.set(0.65, 0.6, 0);
    highGroup.add(rightArm);
    pooledEnemy.parts.rightArm = rightArm;

    const leftLeg = new THREE.Mesh(this.sharedGeometries.legHigh, accentMat);
    leftLeg.castShadow = this.graphicsPreset?.shadowsEnabled ?? true;
    leftLeg.position.set(-0.25, -0.5, 0);
    highGroup.add(leftLeg);
    pooledEnemy.parts.leftLeg = leftLeg;

    const rightLeg = new THREE.Mesh(this.sharedGeometries.legHigh, accentMat);
    rightLeg.castShadow = this.graphicsPreset?.shadowsEnabled ?? true;
    rightLeg.position.set(0.25, -0.5, 0);
    highGroup.add(rightLeg);
    pooledEnemy.parts.rightLeg = rightLeg;

    const head = new THREE.Mesh(this.sharedGeometries.headHigh, brightMat);
    head.castShadow = this.graphicsPreset?.shadowsEnabled ?? true;
    head.position.y = 1.9;
    highGroup.add(head);
    pooledEnemy.parts.head = head;

    // Eyes
    const leftEye = new THREE.Mesh(this.sharedGeometries.eyeHigh, this.eyeMaterial!);
    leftEye.position.set(-0.2, 1.95, 0.41);
    highGroup.add(leftEye);
    pooledEnemy.parts.leftEye = leftEye;

    const rightEye = new THREE.Mesh(this.sharedGeometries.eyeHigh, this.eyeMaterial!);
    rightEye.position.set(0.2, 1.95, 0.41);
    highGroup.add(rightEye);
    pooledEnemy.parts.rightEye = rightEye;

    // MEDIUM LOD - Simplified (no separate arms/legs, just body + head)
    const mediumGroup = pooledEnemy.lodGroups.medium;

    const bodyMed = new THREE.Mesh(this.sharedGeometries.bodyMedium, bodyMat);
    bodyMed.castShadow = this.graphicsPreset?.shadowsEnabled ?? true;
    bodyMed.position.y = 0.75;
    bodyMed.scale.set(1.2, 1, 1);
    mediumGroup.add(bodyMed);

    const headMed = new THREE.Mesh(this.sharedGeometries.headMedium, brightMat);
    headMed.castShadow = this.graphicsPreset?.shadowsEnabled ?? true;
    headMed.position.y = 1.9;
    mediumGroup.add(headMed);

    // Simplified limbs (just two boxes)
    const limbsMed = new THREE.Mesh(this.sharedGeometries.limbMedium, accentMat);
    limbsMed.position.y = -0.25;
    limbsMed.scale.set(1.5, 0.8, 1);
    mediumGroup.add(limbsMed);

    // LOW LOD - Single box
    const lowGroup = pooledEnemy.lodGroups.low;

    const bodyLow = new THREE.Mesh(this.sharedGeometries.bodyLow, lowMat);
    bodyLow.castShadow = false; // No shadows for low LOD
    bodyLow.position.y = 1.0;
    lowGroup.add(bodyLow);

    // Apply scale based on enemy type
    pooledEnemy.group.scale.setScalar(config.scale);
  }

  /**
   * Clear all meshes from LOD groups and reset their state
   */
  private clearLODGroups(pooledEnemy: PooledEnemyMesh): void {
    for (const lodGroup of Object.values(pooledEnemy.lodGroups)) {
      // Reset LOD group visibility (will be set properly by applyLOD)
      lodGroup.visible = false;

      while (lodGroup.children.length > 0) {
        const child = lodGroup.children[0];
        lodGroup.remove(child);
        // Don't dispose geometry/material as they're shared
      }
    }
    pooledEnemy.parts = {};

    // Reset the main group's transform state
    pooledEnemy.group.rotation.set(0, 0, 0);
    pooledEnemy.group.scale.set(1, 1, 1);
  }

  /**
   * Get an enemy from the pool or create a new one
   */
  acquireEnemy(type: EnemyType, position: THREE.Vector3): PooledEnemyMesh | null {
    // Check if we've hit the adaptive limit
    if (this.activeEnemies.size >= this.currentMaxEnemies) {
      return null;
    }

    // Find an available pooled enemy
    let pooledEnemy = this.enemyPool.find(e => !e.inUse);

    // If no available enemy in pool, create new one if under max pool size
    if (!pooledEnemy && this.poolSize < this.maxPoolSize) {
      pooledEnemy = this.createPooledEnemy();
      this.poolSize++;
    }

    if (!pooledEnemy) {
      return null; // Pool exhausted
    }

    // Setup the enemy for the specific type
    this.setupEnemyMeshes(pooledEnemy, type);

    // Activate the enemy
    pooledEnemy.inUse = true;
    pooledEnemy.type = type;
    pooledEnemy.lastActivationTime = performance.now();
    pooledEnemy.group.visible = true;
    pooledEnemy.group.position.copy(position);
    pooledEnemy.group.rotation.set(0, 0, 0);
    pooledEnemy.currentLOD = LODLevel.HIGH;

    // Add to active set
    this.activeEnemies.add(pooledEnemy);

    // Update spatial grid
    this.updateSpatialGrid(pooledEnemy);

    // Set initial LOD
    this.updateEnemyLOD(pooledEnemy);

    return pooledEnemy;
  }

  /**
   * Return an enemy to the pool
   */
  releaseEnemy(pooledEnemy: PooledEnemyMesh): void {
    if (!pooledEnemy.inUse) return;

    // Reset transform state (death animation modifies these)
    pooledEnemy.group.position.set(0, 0, 0);
    pooledEnemy.group.rotation.set(0, 0, 0);
    pooledEnemy.group.scale.set(1, 1, 1);

    // Reset LOD group transforms
    for (const lodGroup of Object.values(pooledEnemy.lodGroups)) {
      lodGroup.rotation.set(0, 0, 0);
      lodGroup.position.set(0, 0, 0);
    }

    // Reset individual mesh part rotations and scales (death/damage animations modify these)
    if (pooledEnemy.parts.leftArm) {
      pooledEnemy.parts.leftArm.rotation.set(0, 0, 0);
      pooledEnemy.parts.leftArm.scale.set(1, 1, 1);
    }
    if (pooledEnemy.parts.rightArm) {
      pooledEnemy.parts.rightArm.rotation.set(0, 0, 0);
      pooledEnemy.parts.rightArm.scale.set(1, 1, 1);
    }
    if (pooledEnemy.parts.leftLeg) {
      pooledEnemy.parts.leftLeg.rotation.set(0, 0, 0);
      pooledEnemy.parts.leftLeg.scale.set(1, 1, 1);
    }
    if (pooledEnemy.parts.rightLeg) {
      pooledEnemy.parts.rightLeg.rotation.set(0, 0, 0);
      pooledEnemy.parts.rightLeg.scale.set(1, 1, 1);
    }
    if (pooledEnemy.parts.body) {
      pooledEnemy.parts.body.scale.set(1, 1, 1);
    }

    // NOTE: We do NOT reset materials because they are SHARED across all enemies.
    // The death/damage animations now use scale effects instead of material changes.

    pooledEnemy.inUse = false;
    pooledEnemy.group.visible = false;
    pooledEnemy.type = null;
    pooledEnemy.currentLOD = LODLevel.CULLED;

    // Remove from active set
    this.activeEnemies.delete(pooledEnemy);

    // Remove from spatial grid
    this.removeFromSpatialGrid(pooledEnemy);
  }

  /**
   * Update the LOD level for a single enemy based on distance
   */
  private updateEnemyLOD(pooledEnemy: PooledEnemyMesh): void {
    if (!pooledEnemy.inUse || !this.camera) return;

    const distance = pooledEnemy.group.position.distanceTo(this.camera.position);
    const viewDistance = this.graphicsPreset?.viewDistance ?? 200;

    // Calculate LOD based on distance
    let newLOD: LODLevel;
    if (distance > Math.min(viewDistance, LOD_DISTANCES.LOW_TO_CULLED)) {
      newLOD = LODLevel.CULLED;
    } else if (distance > LOD_DISTANCES.MEDIUM_TO_LOW) {
      newLOD = LODLevel.LOW;
    } else if (distance > LOD_DISTANCES.HIGH_TO_MEDIUM) {
      newLOD = LODLevel.MEDIUM;
    } else {
      newLOD = LODLevel.HIGH;
    }

    // Check frustum culling
    if (newLOD !== LODLevel.CULLED && !this.isInFrustum(pooledEnemy.group.position)) {
      newLOD = LODLevel.CULLED;
    }

    // Apply LOD change if needed
    if (newLOD !== pooledEnemy.currentLOD) {
      this.applyLOD(pooledEnemy, newLOD);
    }
  }

  /**
   * Apply a specific LOD level to an enemy
   */
  private applyLOD(pooledEnemy: PooledEnemyMesh, lod: LODLevel): void {
    pooledEnemy.currentLOD = lod;

    // Hide all LOD groups
    pooledEnemy.lodGroups.high.visible = false;
    pooledEnemy.lodGroups.medium.visible = false;
    pooledEnemy.lodGroups.low.visible = false;

    // Show the appropriate LOD group
    switch (lod) {
      case LODLevel.HIGH:
        pooledEnemy.lodGroups.high.visible = true;
        pooledEnemy.group.visible = true;
        break;
      case LODLevel.MEDIUM:
        pooledEnemy.lodGroups.medium.visible = true;
        pooledEnemy.group.visible = true;
        break;
      case LODLevel.LOW:
        pooledEnemy.lodGroups.low.visible = true;
        pooledEnemy.group.visible = true;
        break;
      case LODLevel.CULLED:
        pooledEnemy.group.visible = false;
        break;
    }
  }

  /**
   * Check if a position is within the camera frustum
   */
  private isInFrustum(position: THREE.Vector3): boolean {
    return this.frustum.containsPoint(position);
  }

  /**
   * Update the frustum for culling
   */
  updateFrustum(): void {
    if (!this.camera) return;

    this.frustumMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(this.frustumMatrix);
  }

  /**
   * Update spatial grid for an enemy
   */
  private updateSpatialGrid(pooledEnemy: PooledEnemyMesh): void {
    const cellKey = this.getCellKey(pooledEnemy.group.position);

    // Remove from old cell if exists
    this.removeFromSpatialGrid(pooledEnemy);

    // Add to new cell
    if (!this.spatialGrid.has(cellKey)) {
      this.spatialGrid.set(cellKey, new Set());
    }
    this.spatialGrid.get(cellKey)!.add(pooledEnemy);

    // Store cell key on enemy for quick removal
    pooledEnemy._cellKey = cellKey;
  }

  /**
   * Remove enemy from spatial grid
   */
  private removeFromSpatialGrid(pooledEnemy: PooledEnemyMesh): void {
    const cellKey = pooledEnemy._cellKey;
    if (cellKey && this.spatialGrid.has(cellKey)) {
      this.spatialGrid.get(cellKey)!.delete(pooledEnemy);
    }
  }

  /**
   * Get spatial grid cell key for a position
   */
  private getCellKey(position: THREE.Vector3): string {
    const x = Math.floor(position.x / this.gridCellSize);
    const z = Math.floor(position.z / this.gridCellSize);
    return `${x},${z}`;
  }

  /**
   * Get nearby enemies from spatial grid
   */
  getNearbyEnemies(position: THREE.Vector3, radius: number): PooledEnemyMesh[] {
    const result: PooledEnemyMesh[] = [];
    const cellRadius = Math.ceil(radius / this.gridCellSize);
    const centerX = Math.floor(position.x / this.gridCellSize);
    const centerZ = Math.floor(position.z / this.gridCellSize);

    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dz = -cellRadius; dz <= cellRadius; dz++) {
        const cellKey = `${centerX + dx},${centerZ + dz}`;
        const cell = this.spatialGrid.get(cellKey);
        if (cell) {
          for (const enemy of cell) {
            if (enemy.inUse) {
              const dist = enemy.group.position.distanceTo(position);
              if (dist <= radius) {
                result.push(enemy);
              }
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * Update performance metrics and adjust enemy limits
   */
  updatePerformanceMetrics(deltaTime: number): void {
    const now = performance.now();

    this.metrics.frameCount++;
    this.metrics.totalFrameTime += deltaTime;

    // Calculate average FPS every second
    if (now - this.metrics.lastMeasureTime >= PERFORMANCE_THRESHOLDS.MEASURE_INTERVAL) {
      this.metrics.avgFPS = this.metrics.frameCount / (this.metrics.totalFrameTime);

      // Track consecutive low/high FPS frames
      if (this.metrics.avgFPS < PERFORMANCE_THRESHOLDS.LOW_FPS) {
        this.metrics.consecutiveLowFPSFrames++;
        this.metrics.consecutiveHighFPSFrames = 0;
      } else if (this.metrics.avgFPS > PERFORMANCE_THRESHOLDS.HIGH_FPS) {
        this.metrics.consecutiveHighFPSFrames++;
        this.metrics.consecutiveLowFPSFrames = 0;
      } else {
        this.metrics.consecutiveLowFPSFrames = 0;
        this.metrics.consecutiveHighFPSFrames = 0;
      }

      // Adjust enemy limit if needed
      this.adjustEnemyLimit(now);

      // Reset metrics
      this.metrics.frameCount = 0;
      this.metrics.totalFrameTime = 0;
      this.metrics.lastMeasureTime = now;
    }
  }

  /**
   * Dynamically adjust enemy limit based on performance
   */
  private adjustEnemyLimit(now: number): void {
    // Don't adjust too frequently
    if (now - this.lastAdjustmentTime < PERFORMANCE_THRESHOLDS.ADJUSTMENT_COOLDOWN) {
      return;
    }

    // Reduce enemies if FPS is consistently low
    if (this.metrics.consecutiveLowFPSFrames >= 3) {
      const reduction = Math.max(5, Math.floor(this.currentMaxEnemies * 0.15));
      this.currentMaxEnemies = Math.max(10, this.currentMaxEnemies - reduction);
      this.lastAdjustmentTime = now;
      console.log(`[SmartEnemyManager] Reduced max enemies to ${this.currentMaxEnemies} (FPS: ${this.metrics.avgFPS.toFixed(1)})`);
    }
    // Increase enemies if FPS is consistently high and below base limit
    else if (this.metrics.consecutiveHighFPSFrames >= 5 && this.currentMaxEnemies < this.baseMaxEnemies) {
      const increase = Math.min(3, this.baseMaxEnemies - this.currentMaxEnemies);
      this.currentMaxEnemies += increase;
      this.lastAdjustmentTime = now;
      console.log(`[SmartEnemyManager] Increased max enemies to ${this.currentMaxEnemies} (FPS: ${this.metrics.avgFPS.toFixed(1)})`);
    }
  }

  /**
   * Main update function - call once per frame
   */
  update(deltaTime: number): void {
    const now = performance.now();

    // Update frustum for culling
    this.updateFrustum();

    // Update performance metrics
    this.updatePerformanceMetrics(deltaTime);

    // Throttle LOD updates for performance
    if (now - this.lastLODUpdateTime >= this.lodUpdateInterval) {
      // Update LOD for all active enemies
      for (const enemy of this.activeEnemies) {
        this.updateEnemyLOD(enemy);
        this.updateSpatialGrid(enemy);
      }
      this.lastLODUpdateTime = now;
    }
  }

  /**
   * Get animation parts for a pooled enemy (for leg/arm animations)
   */
  getAnimationParts(pooledEnemy: PooledEnemyMesh): {
    leftLeg?: THREE.Mesh;
    rightLeg?: THREE.Mesh;
    leftArm?: THREE.Mesh;
    rightArm?: THREE.Mesh;
  } {
    // Only return parts if using high LOD (animations only at close range)
    if (pooledEnemy.currentLOD === LODLevel.HIGH) {
      return pooledEnemy.parts;
    }
    return {};
  }

  /**
   * Check if enemy should receive full AI updates
   */
  shouldUpdateAI(pooledEnemy: PooledEnemyMesh): boolean {
    // Only update AI for visible enemies (not culled)
    return pooledEnemy.currentLOD !== LODLevel.CULLED;
  }

  /**
   * Check if enemy should have detailed animations
   */
  shouldAnimate(pooledEnemy: PooledEnemyMesh): boolean {
    // Only animate at high LOD
    return pooledEnemy.currentLOD === LODLevel.HIGH;
  }

  /**
   * Get current statistics
   */
  getStats(): {
    poolSize: number;
    activeCount: number;
    maxEnemies: number;
    avgFPS: number;
    lodCounts: Record<LODLevel, number>;
  } {
    const lodCounts = {
      [LODLevel.HIGH]: 0,
      [LODLevel.MEDIUM]: 0,
      [LODLevel.LOW]: 0,
      [LODLevel.CULLED]: 0,
    };

    for (const enemy of this.activeEnemies) {
      lodCounts[enemy.currentLOD]++;
    }

    return {
      poolSize: this.poolSize,
      activeCount: this.activeEnemies.size,
      maxEnemies: this.currentMaxEnemies,
      avgFPS: this.metrics.avgFPS,
      lodCounts,
    };
  }

  /**
   * Get all active enemies
   */
  getActiveEnemies(): PooledEnemyMesh[] {
    return Array.from(this.activeEnemies);
  }

  /**
   * Get current max enemies (may be lower than base due to performance)
   */
  getCurrentMaxEnemies(): number {
    return this.currentMaxEnemies;
  }

  /**
   * Force a specific max enemy count (for testing)
   */
  setMaxEnemies(count: number): void {
    this.currentMaxEnemies = Math.min(count, this.baseMaxEnemies);
  }

  /**
   * SIMPLIFIED API: Acquire a mesh for use with the existing Enemy system
   * Returns the mesh group and all parts needed for animations
   * This method is designed to integrate with the existing createEnemy function
   */
  acquireMeshForEnemy(type: EnemyType, position: THREE.Vector3): AcquiredMesh | null {
    // Check if we've hit the adaptive limit
    if (this.activeEnemies.size >= this.currentMaxEnemies) {
      return null;
    }

    // Find an available pooled enemy
    let pooledEnemy = this.enemyPool.find(e => !e.inUse);

    // If no available enemy in pool, create new one if under max pool size
    if (!pooledEnemy && this.poolSize < this.maxPoolSize) {
      pooledEnemy = this.createPooledEnemy();
      this.poolSize++;
    }

    if (!pooledEnemy) {
      return null; // Pool exhausted
    }

    // Setup the enemy meshes for the specific type
    this.setupEnemyMeshes(pooledEnemy, type);

    // Activate the enemy
    pooledEnemy.inUse = true;
    pooledEnemy.type = type;
    pooledEnemy.lastActivationTime = performance.now();
    pooledEnemy.group.position.copy(position);
    pooledEnemy.group.rotation.set(0, 0, 0);

    // CRITICAL: Apply LOD to set correct visibility for LOD groups
    // This makes the HIGH detail group visible and hides MEDIUM/LOW groups
    this.applyLOD(pooledEnemy, LODLevel.HIGH);

    // Add to active set
    this.activeEnemies.add(pooledEnemy);

    // Update spatial grid
    this.updateSpatialGrid(pooledEnemy);

    // Get pool index for ID
    const poolId = this.enemyPool.indexOf(pooledEnemy);

    // Return the mesh and parts for use with the existing Enemy interface
    return {
      mesh: pooledEnemy.group,
      body: pooledEnemy.parts.body!,
      leftArm: pooledEnemy.parts.leftArm!,
      rightArm: pooledEnemy.parts.rightArm!,
      leftLeg: pooledEnemy.parts.leftLeg!,
      rightLeg: pooledEnemy.parts.rightLeg!,
      head: pooledEnemy.parts.head!,
      poolId,
    };
  }

  /**
   * Release a mesh back to the pool by pool ID
   */
  releaseMeshById(poolId: number): void {
    if (poolId < 0 || poolId >= this.enemyPool.length) return;

    const pooledEnemy = this.enemyPool[poolId];
    if (!pooledEnemy || !pooledEnemy.inUse) return;

    this.releaseEnemy(pooledEnemy);
  }

  /**
   * Check if a position is visible (in frustum and within view distance)
   */
  isPositionVisible(position: THREE.Vector3): boolean {
    if (!this.camera || !this.graphicsPreset) return true;

    const distance = position.distanceTo(this.camera.position);
    if (distance > this.graphicsPreset.viewDistance) return false;

    return this.isInFrustum(position);
  }

  /**
   * Get the LOD level for a mesh by pool ID
   */
  getLODLevel(poolId: number): LODLevel {
    if (poolId < 0 || poolId >= this.enemyPool.length) return LODLevel.HIGH;
    return this.enemyPool[poolId].currentLOD;
  }

  /**
   * Check if an enemy should skip expensive updates based on LOD
   */
  shouldSkipAIUpdate(poolId: number): boolean {
    if (poolId < 0 || poolId >= this.enemyPool.length) return false;
    return this.enemyPool[poolId].currentLOD === LODLevel.CULLED;
  }

  /**
   * Check if an enemy should have full animations (only at close range)
   */
  shouldAnimateFull(poolId: number): boolean {
    if (poolId < 0 || poolId >= this.enemyPool.length) return true;
    return this.enemyPool[poolId].currentLOD === LODLevel.HIGH;
  }

  /**
   * Check if spawning is allowed (adaptive limit check)
   */
  canSpawnMore(): boolean {
    return this.activeEnemies.size < this.currentMaxEnemies;
  }

  /**
   * Get number of active enemies
   */
  getActiveCount(): number {
    return this.activeEnemies.size;
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    // Remove all enemies from scene
    for (const enemy of this.enemyPool) {
      if (this.scene) {
        this.scene.remove(enemy.group);
      }
    }

    // Clear collections
    this.enemyPool = [];
    this.activeEnemies.clear();
    this.spatialGrid.clear();
    this.poolSize = 0;

    // Dispose shared geometries
    if (this.sharedGeometries) {
      for (const geometry of Object.values(this.sharedGeometries)) {
        geometry.dispose();
      }
      this.sharedGeometries = null;
    }

    // Dispose shared materials
    for (const material of this.sharedMaterials.values()) {
      material.dispose();
    }
    this.sharedMaterials.clear();

    if (this.eyeMaterial) {
      this.eyeMaterial.dispose();
      this.eyeMaterial = null;
    }

    this.scene = null;
    this.camera = null;
  }
}

// Singleton export
export const smartEnemyManager = new SmartEnemyManager();
export default smartEnemyManager;
