import * as THREE from 'three';

/**
 * ENEMY PERCEPTION SYSTEM
 *
 * Handles enemy sensory input including:
 * - Vision (cone-based line-of-sight with obstacle detection)
 * - Hearing (sound-based awareness)
 * - Threat assessment
 */

export interface PerceptionResult {
  canSeePlayer: boolean;
  canHearPlayer: boolean;
  playerDistance: number;
  playerDirection: THREE.Vector3;
  threatLevel: number; // 0-100
  lastSeenPosition: THREE.Vector3 | null;
  timeSinceLastSeen: number;
}

export class EnemyPerception {
  private lastSeenPosition: THREE.Vector3 | null = null;
  private lastSeenTime: number = 0;
  private hearingMemory: Array<{ position: THREE.Vector3; time: number }> = [];
  private memoryDuration: number = 5000; // Remember sounds for 5 seconds

  // Vision parameters
  private visionRange: number;
  private visionAngle: number; // In radians
  private nightVisionMultiplier: number = 0.7;

  // Hearing parameters
  private hearingRange: number;
  private hearingSensitivity: number;

  constructor(
    visionRange: number = 50,
    visionAngle: number = Math.PI / 2, // 90 degrees
    hearingRange: number = 40,
    hearingSensitivity: number = 1.0
  ) {
    this.visionRange = visionRange;
    this.visionAngle = visionAngle;
    this.hearingRange = hearingRange;
    this.hearingSensitivity = hearingSensitivity;
  }

  /**
   * Main perception update - analyzes all sensory input
   */
  public perceive(
    enemyPosition: THREE.Vector3,
    enemyRotation: number,
    playerPosition: THREE.Vector3,
    playerVelocity: THREE.Vector3,
    terrainObjects: any[],
    isNight: boolean = false
  ): PerceptionResult {
    const currentTime = Date.now();

    // Calculate player direction and distance
    const playerDirection = new THREE.Vector3()
      .subVectors(playerPosition, enemyPosition)
      .normalize();
    const playerDistance = enemyPosition.distanceTo(playerPosition);

    // VISION CHECK
    const canSee = this.checkVision(
      enemyPosition,
      enemyRotation,
      playerPosition,
      playerDistance,
      terrainObjects,
      isNight
    );

    // Update last seen tracking
    if (canSee) {
      this.lastSeenPosition = playerPosition.clone();
      this.lastSeenTime = currentTime;
    }

    const timeSinceLastSeen = this.lastSeenPosition
      ? (currentTime - this.lastSeenTime) / 1000
      : Infinity;

    // HEARING CHECK
    const canHear = this.checkHearing(
      enemyPosition,
      playerPosition,
      playerVelocity,
      playerDistance
    );

    // Clean up old hearing memories
    this.hearingMemory = this.hearingMemory.filter(
      mem => currentTime - mem.time < this.memoryDuration
    );

    // THREAT ASSESSMENT
    const threatLevel = this.assessThreat(
      canSee,
      canHear,
      playerDistance,
      timeSinceLastSeen,
      playerVelocity
    );

    return {
      canSeePlayer: canSee,
      canHearPlayer: canHear,
      playerDistance,
      playerDirection,
      threatLevel,
      lastSeenPosition: this.lastSeenPosition,
      timeSinceLastSeen
    };
  }

  /**
   * Check if enemy can see player
   * Uses vision cone and line-of-sight raycasting
   */
  private checkVision(
    enemyPosition: THREE.Vector3,
    enemyRotation: number,
    playerPosition: THREE.Vector3,
    playerDistance: number,
    terrainObjects: any[],
    isNight: boolean
  ): boolean {
    // Adjust vision range for night
    const effectiveRange = isNight
      ? this.visionRange * this.nightVisionMultiplier
      : this.visionRange;

    // Distance check
    if (playerDistance > effectiveRange) {
      return false;
    }

    // Vision cone check
    const toPlayer = new THREE.Vector3()
      .subVectors(playerPosition, enemyPosition)
      .normalize();

    const enemyForward = new THREE.Vector3(
      Math.sin(enemyRotation),
      0,
      Math.cos(enemyRotation)
    );

    const angleToPlayer = Math.acos(enemyForward.dot(toPlayer));

    if (angleToPlayer > this.visionAngle) {
      return false;
    }

    // Line-of-sight check (raycast through obstacles)
    return !this.isLineBlocked(enemyPosition, playerPosition, terrainObjects);
  }

  /**
   * Check if line of sight is blocked by terrain
   */
  private isLineBlocked(
    start: THREE.Vector3,
    end: THREE.Vector3,
    terrainObjects: any[]
  ): boolean {
    const direction = new THREE.Vector3().subVectors(end, start);
    const distance = direction.length();
    direction.normalize();

    // Check each terrain object for intersection
    for (const obj of terrainObjects) {
      if (!obj.collidable) continue;

      // Simple sphere intersection test
      const toObject = new THREE.Vector3(obj.x - start.x, 0, obj.z - start.z);
      const projection = toObject.dot(direction);

      // Object is behind or beyond target
      if (projection < 0 || projection > distance) continue;

      const closestPoint = direction.clone().multiplyScalar(projection).add(start);
      const distanceToObject = Math.sqrt(
        Math.pow(closestPoint.x - obj.x, 2) +
        Math.pow(closestPoint.z - obj.z, 2)
      );

      if (distanceToObject < obj.radius) {
        return true; // Line is blocked
      }
    }

    return false; // Clear line of sight
  }

  /**
   * Check if enemy can hear player
   * Based on distance, player movement speed, and recent sounds
   */
  private checkHearing(
    enemyPosition: THREE.Vector3,
    _playerPosition: THREE.Vector3,
    playerVelocity: THREE.Vector3,
    playerDistance: number
  ): boolean {
    // Hearing range check
    if (playerDistance > this.hearingRange) {
      return false;
    }

    // Movement noise - faster movement is louder
    const movementSpeed = playerVelocity.length();
    const movementNoise = movementSpeed * 10; // Scale factor

    // Calculate hearing threshold based on distance
    const hearingThreshold = (playerDistance / this.hearingRange) * 100;
    const adjustedNoise = movementNoise * this.hearingSensitivity;

    // Check recent sounds (gunshots, etc.)
    const recentSounds = this.hearingMemory.some(mem =>
      mem.position.distanceTo(enemyPosition) < this.hearingRange
    );

    return adjustedNoise > hearingThreshold || recentSounds;
  }

  /**
   * Assess threat level based on all sensory input
   */
  private assessThreat(
    canSee: boolean,
    canHear: boolean,
    distance: number,
    timeSinceLastSeen: number,
    playerVelocity: THREE.Vector3
  ): number {
    let threat = 0;

    // Vision contributes most to threat
    if (canSee) {
      threat += 60;
      // Closer = more threatening
      threat += Math.max(0, 30 * (1 - distance / 50));
    } else if (timeSinceLastSeen < 5) {
      // Recently saw player
      threat += 40 * (1 - timeSinceLastSeen / 5);
    }

    // Hearing adds moderate threat
    if (canHear) {
      threat += 20;
    }

    // Player moving fast is more threatening
    const playerSpeed = playerVelocity.length();
    threat += Math.min(10, playerSpeed * 5);

    return Math.min(100, threat);
  }

  /**
   * Register a loud sound (gunshot, explosion, etc.)
   */
  public registerSound(position: THREE.Vector3, volume: number = 1.0) {
    this.hearingMemory.push({
      position: position.clone(),
      time: Date.now()
    });

    // Increase hearing sensitivity temporarily
    this.hearingSensitivity = Math.min(2.0, this.hearingSensitivity + volume * 0.2);
  }

  /**
   * Update vision parameters (useful for different enemy types)
   */
  public setVisionParameters(range: number, angle: number) {
    this.visionRange = range;
    this.visionAngle = angle;
  }

  /**
   * Update hearing parameters
   */
  public setHearingParameters(range: number, sensitivity: number) {
    this.hearingRange = range;
    this.hearingSensitivity = sensitivity;
  }

  /**
   * Get last known player position
   */
  public getLastSeenPosition(): THREE.Vector3 | null {
    return this.lastSeenPosition;
  }

  /**
   * Reset perception (useful for respawning)
   */
  public reset() {
    this.lastSeenPosition = null;
    this.lastSeenTime = 0;
    this.hearingMemory = [];
    this.hearingSensitivity = 1.0;
  }

  /**
   * Check if position is in enemy's field of view
   * (Useful for debugging/visualization)
   */
  public isInFieldOfView(
    enemyPosition: THREE.Vector3,
    enemyRotation: number,
    testPosition: THREE.Vector3
  ): boolean {
    const toTarget = new THREE.Vector3()
      .subVectors(testPosition, enemyPosition)
      .normalize();

    const enemyForward = new THREE.Vector3(
      Math.sin(enemyRotation),
      0,
      Math.cos(enemyRotation)
    );

    const angle = Math.acos(enemyForward.dot(toTarget));
    return angle <= this.visionAngle;
  }
}
