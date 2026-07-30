import * as THREE from 'three';

/**
 * ENEMY PERCEPTION SYSTEM
 *
 * Handles enemy sensory input including:
 * - Vision (cone-based line-of-sight with obstacle detection)
 * - Hearing (sound-based awareness)
 * - Threat assessment
 */

export interface TerrainShape {
  x: number;
  z: number;
  radius: number;
  height?: number;
  collidable?: boolean;
}

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

  // Reused outputs/scratch so the per-enemy perceive() tick never allocates.
  // perceive() runs for every nearby enemy several times a second; the old
  // version allocated a fresh result object + several Vector3s per call (and
  // two Vector3s PER terrain object inside the line-of-sight scan), which was
  // the dominant source of gameplay GC churn. These reused members make the
  // whole perception pass allocation-free with byte-identical results.
  private readonly _playerDirection = new THREE.Vector3();
  private readonly _result: PerceptionResult = {
    canSeePlayer: false,
    canHearPlayer: false,
    playerDistance: 0,
    playerDirection: this._playerDirection,
    threatLevel: 0,
    lastSeenPosition: null,
    timeSinceLastSeen: Infinity,
  };

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
    terrainObjects: TerrainShape[],
    isNight: boolean = false
  ): PerceptionResult {
    const currentTime = Date.now();

    // Calculate player direction and distance (reused vector — no allocation).
    this._playerDirection
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

    // Update last seen tracking — copy into the persistent vector instead of
    // cloning a fresh one every sighting.
    if (canSee) {
      if (this.lastSeenPosition) this.lastSeenPosition.copy(playerPosition);
      else this.lastSeenPosition = playerPosition.clone();
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

    // Clean up old hearing memories IN PLACE (only when there's anything to
    // prune) so a perceive tick never allocates a replacement array.
    if (this.hearingMemory.length > 0) {
      let w = 0;
      for (let r = 0; r < this.hearingMemory.length; r++) {
        const mem = this.hearingMemory[r];
        if (currentTime - mem.time < this.memoryDuration) this.hearingMemory[w++] = mem;
      }
      this.hearingMemory.length = w;
    }

    // THREAT ASSESSMENT
    const threatLevel = this.assessThreat(
      canSee,
      canHear,
      playerDistance,
      timeSinceLastSeen,
      playerVelocity
    );

    const result = this._result;
    result.canSeePlayer = canSee;
    result.canHearPlayer = canHear;
    result.playerDistance = playerDistance;
    result.threatLevel = threatLevel;
    result.lastSeenPosition = this.lastSeenPosition;
    result.timeSinceLastSeen = timeSinceLastSeen;
    return result;
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
    terrainObjects: TerrainShape[],
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

    // Vision cone check — scalar dot product, no temp vectors. Matches the old
    // result exactly: the forward vector is (sin, 0, cos) so only the X/Z of the
    // 3D-normalized to-player direction contribute to the dot.
    const dx = playerPosition.x - enemyPosition.x;
    const dy = playerPosition.y - enemyPosition.y;
    const dz = playerPosition.z - enemyPosition.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const dot = Math.sin(enemyRotation) * (dx / len) + Math.cos(enemyRotation) * (dz / len);
    const angleToPlayer = Math.acos(dot);

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
    terrainObjects: TerrainShape[]
  ): boolean {
    // Allocation-free segment scan. This runs over EVERY terrain object for
    // every enemy that can see the player, several times a second — the old
    // version allocated two Vector3s per object here, which dominated combat GC.
    // The maths below are identical (3D-normalised X/Z direction, scalar
    // projection, XZ closest-point distance) but allocate nothing; the final
    // test uses a squared compare instead of a sqrt.
    const ex = end.x - start.x;
    const ey = end.y - start.y;
    const ez = end.z - start.z;
    const distance = Math.sqrt(ex * ex + ey * ey + ez * ez);
    if (distance < 1e-6) return false;
    const inv = 1 / distance;
    const dirX = ex * inv;
    const dirZ = ez * inv;

    for (let i = 0; i < terrainObjects.length; i++) {
      const obj = terrainObjects[i];
      if (!obj.collidable) continue;

      const ox = obj.x - start.x;
      const oz = obj.z - start.z;
      const projection = ox * dirX + oz * dirZ;

      // Object is behind or beyond target
      if (projection < 0 || projection > distance) continue;

      const cpDX = (start.x + dirX * projection) - obj.x;
      const cpDZ = (start.z + dirZ * projection) - obj.z;
      if (cpDX * cpDX + cpDZ * cpDZ < obj.radius * obj.radius) {
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

    // Check recent sounds (gunshots, etc.) — plain loop avoids allocating a
    // closure on every hearing check.
    let recentSounds = false;
    for (let i = 0; i < this.hearingMemory.length; i++) {
      if (this.hearingMemory[i].position.distanceTo(enemyPosition) < this.hearingRange) {
        recentSounds = true;
        break;
      }
    }

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
   * Reset perception (useful for respawning)
   */
  public reset() {
    this.lastSeenPosition = null;
    this.lastSeenTime = 0;
    this.hearingMemory = [];
    this.hearingSensitivity = 1.0;
  }

  }
