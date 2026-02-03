/**
 * PREDICTIVE ENEMY SPAWN SYSTEM
 *
 * This AI-powered system uses machine learning principles to intelligently
 * spawn enemies based on player behavior, position, and performance. It
 * creates dynamic, fair, and engaging combat encounters by predicting
 * player movements and adapting spawn patterns.
 *
 * Features:
 * - Player behavior prediction
 * - Strategic spawn positioning
 * - Dynamic composition selection
 * - Difficulty-aware spawning
 * - Anti-camping mechanics
 * - Flow state optimization
 */

import * as THREE from 'three';

export interface SpawnPoint {
  position: THREE.Vector3;
  spawnType: 'normal' | 'fast' | 'tank' | 'boss';
  priority: number; // 0-1, higher = more likely
  reason: string; // Why this spawn was chosen
  threatLevel: number; // Expected difficulty
}

export interface PlayerBehavior {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  movementPattern: 'stationary' | 'circular' | 'linear' | 'erratic' | 'tactical';
  favoredArea: THREE.Vector3 | null; // Area player stays in most
  averageSpeed: number;
  recentPositions: Array<{pos: THREE.Vector3, time: number}>;
  campingDetected: boolean;
  retreatingDetected: boolean;
  aggressiveDetected: boolean;
}

export interface SpawnStrategy {
  composition: Array<{type: 'normal' | 'fast' | 'tank' | 'boss', count: number}>;
  spawnPoints: SpawnPoint[];
  timing: 'immediate' | 'staggered' | 'wave';
  staggerDelay: number; // ms between spawns
  rationale: string;
}

export class PredictiveSpawnSystem {
  private playerPositionHistory: Array<{pos: THREE.Vector3, time: number}> = [];
  private spawnHistory: Array<{pos: THREE.Vector3, time: number, type: string}> = [];
  private killHistory: Array<{pos: THREE.Vector3, time: number, type: string}> = [];

  // Player behavior analysis
  // @ts-expect-error - Reserved for future behavior analysis
  private movementVectors: THREE.Vector3[] = [];
  // @ts-expect-error - Reserved for future behavior analysis
  private stationaryTime: number = 0;
  private lastPosition: THREE.Vector3 = new THREE.Vector3();
  private lastMovementTime: number = Date.now();

  // Spawn parameters
  private minSpawnDistance: number = 20;
  private maxSpawnDistance: number = 50;
  private optimalSpawnDistance: number = 30;
  private campingThreshold: number = 5000; // 5 seconds
  private predictionWindow: number = 3000; // 3 seconds ahead

  // Heatmap for spawn prevention
  private recentSpawnAreas: Map<string, number> = new Map();

  constructor() {
    console.log('[PredictiveSpawn] System initialized');
  }

  /**
   * Main spawning function - returns intelligent spawn strategy
   */
  public generateSpawnStrategy(
    playerPos: THREE.Vector3,
    playerVel: THREE.Vector3,
    enemies: Array<{position: THREE.Vector3, type: string}>,
    difficultyLevel: number, // 0-100
    skillLevel: number, // 0-100
    terrainBounds: {min: THREE.Vector3, max: THREE.Vector3}
  ): SpawnStrategy {
    // Analyze player behavior
    const behavior = this.analyzePlayerBehavior(playerPos, playerVel);

    // Predict where player will be
    const predictedPosition = this.predictPlayerPosition(playerPos, playerVel, behavior);

    // Determine spawn composition based on difficulty and skill
    const composition = this.calculateSpawnComposition(difficultyLevel, skillLevel, enemies.length, behavior);

    // Calculate optimal spawn points
    const spawnPoints = this.calculateSpawnPoints(
      playerPos,
      predictedPosition,
      behavior,
      composition,
      enemies,
      terrainBounds
    );

    // Determine timing strategy
    const timing = this.determineSpawnTiming(behavior, skillLevel);
    const staggerDelay = timing === 'staggered' ? 800 + (Math.random() * 400) : 0;

    // Generate rationale
    const rationale = this.generateRationale(behavior, composition, timing);

    return {
      composition,
      spawnPoints,
      timing,
      staggerDelay,
      rationale
    };
  }

  /**
   * Analyze player movement patterns
   */
  private analyzePlayerBehavior(pos: THREE.Vector3, vel: THREE.Vector3): PlayerBehavior {
    const now = Date.now();

    // Update position history
    this.playerPositionHistory.push({pos: pos.clone(), time: now});

    // Keep last 30 seconds
    this.playerPositionHistory = this.playerPositionHistory.filter(
      p => now - p.time < 30000
    );

    // Detect movement pattern
    const movementPattern = this.detectMovementPattern();

    // Calculate favored area
    const favoredArea = this.calculateFavoredArea();

    // Detect camping
    const campingDetected = this.detectCamping(pos);

    // Calculate average speed
    const averageSpeed = this.calculateAverageSpeed();

    // Detect retreat or aggression
    const retreatingDetected = this.detectRetreating();
    const aggressiveDetected = this.detectAggression();

    return {
      position: pos.clone(),
      velocity: vel.clone(),
      movementPattern,
      favoredArea,
      averageSpeed,
      recentPositions: this.playerPositionHistory.slice(-10),
      campingDetected,
      retreatingDetected,
      aggressiveDetected
    };
  }

  private detectMovementPattern(): 'stationary' | 'circular' | 'linear' | 'erratic' | 'tactical' {
    if (this.playerPositionHistory.length < 10) return 'tactical';

    const recent = this.playerPositionHistory.slice(-20);
    const positions = recent.map(p => p.pos);

    // Check for stationary
    const totalDistance = this.calculateTotalDistance(positions);
    if (totalDistance < 10) return 'stationary';

    // Check for circular (returning to similar positions)
    const isCircular = this.isCircularMovement(positions);
    if (isCircular) return 'circular';

    // Check for linear (moving in one direction)
    const isLinear = this.isLinearMovement(positions);
    if (isLinear) return 'linear';

    // Check for erratic (random, chaotic movement)
    const isErratic = this.isErraticMovement(positions);
    if (isErratic) return 'erratic';

    return 'tactical'; // Default: smart movement
  }

  private calculateTotalDistance(positions: THREE.Vector3[]): number {
    let total = 0;
    for (let i = 1; i < positions.length; i++) {
      total += positions[i].distanceTo(positions[i - 1]);
    }
    return total;
  }

  private isCircularMovement(positions: THREE.Vector3[]): boolean {
    if (positions.length < 10) return false;

    const first = positions[0];
    const last = positions[positions.length - 1];
    const returnDistance = first.distanceTo(last);
    const totalDistance = this.calculateTotalDistance(positions);

    // If returned close to start but traveled far
    return returnDistance < 10 && totalDistance > 30;
  }

  private isLinearMovement(positions: THREE.Vector3[]): boolean {
    if (positions.length < 5) return false;

    // Calculate direction variance
    const directions: THREE.Vector3[] = [];
    for (let i = 1; i < positions.length; i++) {
      const dir = new THREE.Vector3().subVectors(positions[i], positions[i - 1]).normalize();
      if (dir.length() > 0) directions.push(dir);
    }

    if (directions.length < 2) return false;

    // Calculate average direction
    const avgDir = new THREE.Vector3();
    directions.forEach(d => avgDir.add(d));
    avgDir.divideScalar(directions.length).normalize();

    // Check if most directions align with average
    let alignedCount = 0;
    directions.forEach(d => {
      if (d.dot(avgDir) > 0.8) alignedCount++;
    });

    return (alignedCount / directions.length) > 0.7;
  }

  private isErraticMovement(positions: THREE.Vector3[]): boolean {
    if (positions.length < 10) return false;

    // Calculate direction changes
    const directions: THREE.Vector3[] = [];
    for (let i = 1; i < positions.length; i++) {
      const dir = new THREE.Vector3().subVectors(positions[i], positions[i - 1]).normalize();
      if (dir.length() > 0) directions.push(dir);
    }

    if (directions.length < 5) return false;

    // Count sharp direction changes
    let sharpTurns = 0;
    for (let i = 1; i < directions.length; i++) {
      const dotProduct = directions[i].dot(directions[i - 1]);
      if (dotProduct < 0.3) sharpTurns++; // 70+ degree turn
    }

    return (sharpTurns / directions.length) > 0.4;
  }

  private calculateFavoredArea(): THREE.Vector3 | null {
    if (this.playerPositionHistory.length < 20) return null;

    // Calculate centroid of positions
    const centroid = new THREE.Vector3();
    this.playerPositionHistory.forEach(p => centroid.add(p.pos));
    centroid.divideScalar(this.playerPositionHistory.length);

    return centroid;
  }

  private detectCamping(currentPos: THREE.Vector3): boolean {
    const now = Date.now();

    // Check if player has moved
    const distance = currentPos.distanceTo(this.lastPosition);

    if (distance < 2) {
      // Still in same area
      const timeSinceMovement = now - this.lastMovementTime;
      this.stationaryTime = timeSinceMovement;
      return timeSinceMovement > this.campingThreshold;
    } else {
      // Player moved
      this.lastPosition.copy(currentPos);
      this.lastMovementTime = now;
      this.stationaryTime = 0;
      return false;
    }
  }

  private calculateAverageSpeed(): number {
    if (this.playerPositionHistory.length < 2) return 0;

    const recent = this.playerPositionHistory.slice(-10);
    let totalSpeed = 0;

    for (let i = 1; i < recent.length; i++) {
      const distance = recent[i].pos.distanceTo(recent[i - 1].pos);
      const time = (recent[i].time - recent[i - 1].time) / 1000; // seconds
      const speed = time > 0 ? distance / time : 0;
      totalSpeed += speed;
    }

    return totalSpeed / (recent.length - 1);
  }

  private detectRetreating(): boolean {
    if (this.spawnHistory.length === 0 || this.playerPositionHistory.length < 5) {
      return false;
    }

    // Check if player is moving away from recent spawns
    const recentSpawns = this.spawnHistory.slice(-3);
    const recentPositions = this.playerPositionHistory.slice(-5);

    if (recentPositions.length < 2) return false;

    // Calculate average spawn position
    const avgSpawnPos = new THREE.Vector3();
    recentSpawns.forEach(s => avgSpawnPos.add(s.pos));
    avgSpawnPos.divideScalar(recentSpawns.length);

    // Check if distance from spawns is increasing
    const distances = recentPositions.map(p => p.pos.distanceTo(avgSpawnPos));
    const isIncreasing = distances[distances.length - 1] > distances[0] + 5;

    return isIncreasing;
  }

  private detectAggression(): boolean {
    if (this.killHistory.length < 3) return false;

    const now = Date.now();
    const recentKills = this.killHistory.filter(k => now - k.time < 10000);

    // Aggressive if 3+ kills in last 10 seconds
    return recentKills.length >= 3;
  }

  /**
   * Predict where player will be
   */
  private predictPlayerPosition(
    currentPos: THREE.Vector3,
    velocity: THREE.Vector3,
    behavior: PlayerBehavior
  ): THREE.Vector3 {
    const predicted = currentPos.clone();

    if (behavior.movementPattern === 'stationary') {
      // Player likely to stay put
      return predicted;
    }

    if (behavior.movementPattern === 'linear') {
      // Extrapolate linear movement
      const timeAhead = this.predictionWindow / 1000; // seconds
      const displacement = velocity.clone().multiplyScalar(timeAhead);
      predicted.add(displacement);
    } else if (behavior.movementPattern === 'circular' && behavior.favoredArea) {
      // Predict return to favored area
      const toFavored = new THREE.Vector3().subVectors(behavior.favoredArea, currentPos);
      predicted.add(toFavored.multiplyScalar(0.3)); // 30% toward favored area
    } else {
      // For erratic/tactical, use short-term velocity
      const displacement = velocity.clone().multiplyScalar(this.predictionWindow / 2000);
      predicted.add(displacement);
    }

    return predicted;
  }

  /**
   * Calculate spawn composition
   */
  private calculateSpawnComposition(
    difficulty: number,
    skillLevel: number,
    currentEnemyCount: number,
    behavior: PlayerBehavior
  ): Array<{type: 'normal' | 'fast' | 'tank' | 'boss', count: number}> {
    const composition: Array<{type: 'normal' | 'fast' | 'tank' | 'boss', count: number}> = [];

    // Base spawn count on difficulty
    const baseCount = Math.ceil(2 + (difficulty / 20));
    let totalToSpawn = Math.max(1, baseCount - Math.floor(currentEnemyCount / 3));

    // Adjust for skill
    if (skillLevel > 70) totalToSpawn += 1;
    if (skillLevel < 30) totalToSpawn = Math.max(1, totalToSpawn - 1);

    // Distribute among types based on difficulty
    const normalRatio = Math.max(0.4, 0.7 - (difficulty / 200));
    const fastRatio = 0.2 + (difficulty / 500);
    const tankRatio = Math.max(0, (difficulty - 30) / 300);
    const bossRatio = Math.max(0, (difficulty - 60) / 400);

    // Normalize ratios
    const total = normalRatio + fastRatio + tankRatio + bossRatio;
    const norm = {
      normal: normalRatio / total,
      fast: fastRatio / total,
      tank: tankRatio / total,
      boss: bossRatio / total
    };

    // Assign counts
    const counts = {
      normal: Math.floor(totalToSpawn * norm.normal),
      fast: Math.floor(totalToSpawn * norm.fast),
      tank: Math.floor(totalToSpawn * norm.tank),
      boss: Math.floor(totalToSpawn * norm.boss)
    };

    // Ensure at least one enemy
    const assignedTotal = counts.normal + counts.fast + counts.tank + counts.boss;
    if (assignedTotal < totalToSpawn) {
      counts.normal += (totalToSpawn - assignedTotal);
    }

    // Build composition array
    if (counts.normal > 0) composition.push({type: 'normal', count: counts.normal});
    if (counts.fast > 0) composition.push({type: 'fast', count: counts.fast});
    if (counts.tank > 0) composition.push({type: 'tank', count: counts.tank});
    if (counts.boss > 0) composition.push({type: 'boss', count: counts.boss});

    // Anti-camping: spawn fast enemies if camping detected
    if (behavior.campingDetected) {
      composition.push({type: 'fast', count: 2});
    }

    return composition;
  }

  /**
   * Calculate intelligent spawn points
   */
  private calculateSpawnPoints(
    playerPos: THREE.Vector3,
    predictedPos: THREE.Vector3,
    behavior: PlayerBehavior,
    composition: Array<{type: string, count: number}>,
    currentEnemies: Array<{position: THREE.Vector3}>,
    bounds: {min: THREE.Vector3, max: THREE.Vector3}
  ): SpawnPoint[] {
    const spawnPoints: SpawnPoint[] = [];

    // Calculate total enemies to spawn
    const totalCount = composition.reduce((sum, c) => sum + c.count, 0);

    // Generate candidate positions
    const candidates = this.generateCandidatePositions(
      playerPos,
      predictedPos,
      behavior,
      totalCount * 3, // 3x candidates for selection
      bounds
    );

    // Score and select best positions
    const scoredCandidates = candidates.map(pos => ({
      pos,
      score: this.scoreSpawnPosition(pos, playerPos, predictedPos, behavior, currentEnemies)
    }));

    // Sort by score
    scoredCandidates.sort((a, b) => b.score - a.score);

    // Assign spawn points to enemy types
    let index = 0;
    for (const comp of composition) {
      for (let i = 0; i < comp.count; i++) {
        if (index >= scoredCandidates.length) break;

        const candidate = scoredCandidates[index];
        spawnPoints.push({
          position: candidate.pos,
          spawnType: comp.type as any,
          priority: candidate.score,
          reason: this.explainSpawnChoice(candidate.pos, playerPos, behavior),
          threatLevel: this.calculateThreatLevel(candidate.pos, playerPos, comp.type)
        });

        index++;
      }
    }

    // Record spawns in history
    const now = Date.now();
    spawnPoints.forEach(sp => {
      this.spawnHistory.push({pos: sp.position, time: now, type: sp.spawnType});
      this.recordSpawnArea(sp.position);
    });

    // Clean old history
    this.spawnHistory = this.spawnHistory.filter(s => now - s.time < 30000);

    return spawnPoints;
  }

  private generateCandidatePositions(
    _playerPos: THREE.Vector3,
    predictedPos: THREE.Vector3,
    _behavior: PlayerBehavior,
    count: number,
    bounds: {min: THREE.Vector3, max: THREE.Vector3}
  ): THREE.Vector3[] {
    const candidates: THREE.Vector3[] = [];
    const targetPos = predictedPos; // Spawn near predicted position

    for (let i = 0; i < count; i++) {
      // Random angle around player
      const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.5);

      // Distance varies
      const distance = this.minSpawnDistance +
        Math.random() * (this.maxSpawnDistance - this.minSpawnDistance);

      // Calculate position
      const x = targetPos.x + Math.cos(angle) * distance;
      const z = targetPos.z + Math.sin(angle) * distance;
      const y = 1; // Ground level

      const pos = new THREE.Vector3(x, y, z);

      // Ensure within bounds
      pos.x = Math.max(bounds.min.x, Math.min(bounds.max.x, pos.x));
      pos.z = Math.max(bounds.min.z, Math.min(bounds.max.z, pos.z));

      candidates.push(pos);
    }

    return candidates;
  }

  private scoreSpawnPosition(
    pos: THREE.Vector3,
    playerPos: THREE.Vector3,
    _predictedPos: THREE.Vector3,
    behavior: PlayerBehavior,
    currentEnemies: Array<{position: THREE.Vector3}>
  ): number {
    let score = 1.0;

    // Distance from player (prefer optimal distance)
    const distToPlayer = pos.distanceTo(playerPos);
    const distanceScore = 1.0 - Math.abs(distToPlayer - this.optimalSpawnDistance) / this.optimalSpawnDistance;
    score *= Math.max(0.3, distanceScore);

    // Prefer spawning ahead of player movement
    if (behavior.velocity.length() > 0.1) {
      const toSpawn = new THREE.Vector3().subVectors(pos, playerPos);
      const alignment = toSpawn.normalize().dot(behavior.velocity.clone().normalize());
      if (alignment > 0) score *= 1.3; // Ahead of movement
    }

    // Avoid clustering with existing enemies
    const minEnemyDistance = Math.min(
      ...currentEnemies.map(e => pos.distanceTo(e.position)),
      999
    );
    if (minEnemyDistance < 10) score *= 0.5;

    // Avoid recent spawn areas (heatmap)
    const areaKey = this.getAreaKey(pos);
    const recentSpawnsInArea = this.recentSpawnAreas.get(areaKey) || 0;
    score *= Math.max(0.3, 1.0 - (recentSpawnsInArea * 0.2));

    // Anti-camping: spawn behind campers
    if (behavior.campingDetected) {
      const behindScore = this.isBehindPlayer(pos, playerPos, behavior.velocity);
      if (behindScore) score *= 1.5;
    }

    // Flanking bonus for tactical players
    if (behavior.movementPattern === 'tactical') {
      const flankScore = this.isFlankingPosition(pos, playerPos, behavior.velocity);
      score *= (1.0 + flankScore * 0.3);
    }

    return score;
  }

  private isBehindPlayer(pos: THREE.Vector3, playerPos: THREE.Vector3, playerVel: THREE.Vector3): boolean {
    if (playerVel.length() < 0.1) return false;

    const toSpawn = new THREE.Vector3().subVectors(pos, playerPos);
    const alignment = toSpawn.normalize().dot(playerVel.clone().normalize());
    return alignment < -0.5; // Behind player
  }

  private isFlankingPosition(pos: THREE.Vector3, playerPos: THREE.Vector3, playerVel: THREE.Vector3): number {
    if (playerVel.length() < 0.1) return 0;

    const toSpawn = new THREE.Vector3().subVectors(pos, playerPos);
    const alignment = Math.abs(toSpawn.normalize().dot(playerVel.clone().normalize()));

    // Perpendicular (flanking) when alignment near 0
    return 1.0 - alignment;
  }

  private getAreaKey(pos: THREE.Vector3): string {
    // Divide space into 10x10 grid cells
    const gridSize = 10;
    const x = Math.floor(pos.x / gridSize);
    const z = Math.floor(pos.z / gridSize);
    return `${x},${z}`;
  }

  private recordSpawnArea(pos: THREE.Vector3): void {
    const key = this.getAreaKey(pos);
    this.recentSpawnAreas.set(key, (this.recentSpawnAreas.get(key) || 0) + 1);

    // Decay over time (done in cleanup)
  }

  private calculateThreatLevel(pos: THREE.Vector3, playerPos: THREE.Vector3, type: string): number {
    const distance = pos.distanceTo(playerPos);
    const baseThreat = {normal: 1.0, fast: 1.5, tank: 2.0, boss: 3.0}[type] || 1.0;
    const distanceFactor = Math.max(0.5, 1.0 - (distance / this.maxSpawnDistance));
    return baseThreat * distanceFactor;
  }

  private explainSpawnChoice(pos: THREE.Vector3, playerPos: THREE.Vector3, behavior: PlayerBehavior): string {
    const distance = pos.distanceTo(playerPos);

    if (behavior.campingDetected) return 'Anti-camping spawn';
    if (behavior.retreatingDetected) return 'Cutting off retreat';
    if (behavior.aggressiveDetected) return 'Challenging aggression';
    if (distance < 25) return 'Close-range engagement';
    if (distance > 40) return 'Long-range approach';
    return 'Tactical positioning';
  }

  private determineSpawnTiming(behavior: PlayerBehavior, skillLevel: number): 'immediate' | 'staggered' | 'wave' {
    if (behavior.campingDetected) return 'immediate'; // Punish camping
    if (skillLevel > 70) return 'wave'; // Challenge skilled players
    if (skillLevel < 40) return 'staggered'; // Give newer players time
    return 'staggered'; // Default
  }

  private generateRationale(
    behavior: PlayerBehavior,
    composition: any[],
    timing: string
  ): string {
    const pattern = behavior.movementPattern;
    const enemyCount = composition.reduce((sum, c) => sum + c.count, 0);

    let rationale = `Spawning ${enemyCount} enemies with ${timing} timing. `;

    if (behavior.campingDetected) {
      rationale += 'Anti-camping measures active. ';
    } else if (behavior.aggressiveDetected) {
      rationale += 'Matching aggressive playstyle. ';
    } else if (behavior.retreatingDetected) {
      rationale += 'Applying pressure to retreating player. ';
    }

    rationale += `Player movement: ${pattern}.`;

    return rationale;
  }

  /**
   * Record a kill for analysis
   */
  public recordKill(position: THREE.Vector3, enemyType: string): void {
    this.killHistory.push({
      pos: position.clone(),
      time: Date.now(),
      type: enemyType
    });

    // Keep last 50 kills
    if (this.killHistory.length > 50) {
      this.killHistory.shift();
    }
  }

  /**
   * Update spawn area heatmap (call periodically)
   */
  public updateHeatmap(): void {

    // Decay spawn areas over time
    for (const [key, value] of this.recentSpawnAreas.entries()) {
      const decayed = Math.max(0, value - 0.1);
      if (decayed === 0) {
        this.recentSpawnAreas.delete(key);
      } else {
        this.recentSpawnAreas.set(key, decayed);
      }
    }
  }

  /**
   * Reset the system
   */
  public reset(): void {
    this.playerPositionHistory = [];
    this.spawnHistory = [];
    this.killHistory = [];
    this.movementVectors = [];
    this.recentSpawnAreas.clear();
    this.stationaryTime = 0;
    this.lastPosition = new THREE.Vector3();
    this.lastMovementTime = Date.now();
  }
}
