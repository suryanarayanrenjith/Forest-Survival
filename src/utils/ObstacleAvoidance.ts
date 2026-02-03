import * as THREE from 'three';

/**
 * OBSTACLE AVOIDANCE AND PATHFINDING SYSTEM
 *
 * Provides intelligent navigation around obstacles for enemies
 * Features:
 * - Dynamic obstacle detection
 * - Alternative path finding
 * - Stuck detection and recovery
 * - Personal space management
 */

export interface ObstacleAvoidanceResult {
  canMoveDirectly: boolean;
  alternativePath: THREE.Vector3 | null;
  isStuck: boolean;
  avoidanceVector: THREE.Vector3;
}

export class ObstacleAvoidance {
  private stuckTimer: number = 0;
  private lastPosition: THREE.Vector3 = new THREE.Vector3();
  private stuckThreshold: number = 0.1; // Minimum movement to not be considered stuck
  private stuckTimeLimit: number = 1.0; // Seconds before triggering stuck recovery
  private avoidanceRays: number = 8; // Number of rays to cast for obstacle detection
  private personalSpaceRadius: number = 3.0; // Minimum distance from other enemies

  constructor() {}

  /**
   * Main obstacle avoidance calculation
   * Returns the best movement direction considering obstacles
   */
  public calculatePath(
    currentPosition: THREE.Vector3,
    targetPosition: THREE.Vector3,
    terrainObjects: any[],
    otherEnemies: any[],
    enemyId: any,
    deltaTime: number
  ): ObstacleAvoidanceResult {
    // Check if stuck
    const distanceMoved = currentPosition.distanceTo(this.lastPosition);
    if (distanceMoved < this.stuckThreshold) {
      this.stuckTimer += deltaTime;
    } else {
      this.stuckTimer = 0;
    }
    this.lastPosition.copy(currentPosition);

    const isStuck = this.stuckTimer > this.stuckTimeLimit;

    // Check for obstacles in direct path
    const hasObstacle = this.checkPathForObstacles(
      currentPosition,
      targetPosition,
      terrainObjects
    );

    // Calculate personal space avoidance (avoid other enemies)
    const personalSpaceVector = this.calculatePersonalSpace(
      currentPosition,
      otherEnemies,
      enemyId
    );

    // If direct path is clear and not stuck, use it
    if (!hasObstacle && !isStuck) {
      return {
        canMoveDirectly: true,
        alternativePath: null,
        isStuck: false,
        avoidanceVector: personalSpaceVector
      };
    }

    // Find alternative path using raycast avoidance
    const alternativePath = this.findAlternativePath(
      currentPosition,
      targetPosition,
      terrainObjects,
      isStuck
    );

    return {
      canMoveDirectly: false,
      alternativePath,
      isStuck,
      avoidanceVector: personalSpaceVector
    };
  }

  /**
   * Check if there are obstacles between current position and target
   */
  private checkPathForObstacles(
    start: THREE.Vector3,
    end: THREE.Vector3,
    terrainObjects: any[]
  ): boolean {
    const direction = new THREE.Vector3().subVectors(end, start);
    const distance = direction.length();
    direction.normalize();

    // Check terrain objects
    for (const obj of terrainObjects) {
      if (!obj.collidable) continue;

      // Calculate closest point on line to object
      const toObject = new THREE.Vector3(obj.x - start.x, 0, obj.z - start.z);
      const projection = toObject.dot(direction);

      // Object is behind or beyond target
      if (projection < 0 || projection > distance) continue;

      const closestPoint = direction.clone().multiplyScalar(projection).add(start);
      const distanceToObject = Math.sqrt(
        Math.pow(closestPoint.x - obj.x, 2) +
        Math.pow(closestPoint.z - obj.z, 2)
      );

      // Add buffer for safe navigation
      if (distanceToObject < obj.radius + 1.5) {
        return true; // Obstacle detected
      }
    }

    return false;
  }

  /**
   * Find alternative path around obstacles using multiple raycasts
   */
  private findAlternativePath(
    currentPosition: THREE.Vector3,
    targetPosition: THREE.Vector3,
    terrainObjects: any[],
    forceRandom: boolean = false
  ): THREE.Vector3 | null {
    const baseDirection = new THREE.Vector3()
      .subVectors(targetPosition, currentPosition)
      .normalize();

    const baseAngle = Math.atan2(baseDirection.x, baseDirection.z);
    const rayDistance = 10; // Distance to test for each ray

    let bestPath: THREE.Vector3 | null = null;
    let bestScore = -Infinity;

    // If stuck, try random directions first
    if (forceRandom) {
      const randomAngle = baseAngle + (Math.random() - 0.5) * Math.PI;
      const randomDirection = new THREE.Vector3(
        Math.sin(randomAngle),
        0,
        Math.cos(randomAngle)
      );
      const testPoint = currentPosition.clone().add(
        randomDirection.multiplyScalar(rayDistance)
      );

      if (!this.checkPathForObstacles(currentPosition, testPoint, terrainObjects)) {
        return testPoint;
      }
    }

    // Cast rays in a circle around the enemy
    for (let i = 0; i < this.avoidanceRays; i++) {
      const angle = baseAngle + ((i / this.avoidanceRays) * Math.PI * 2);
      const direction = new THREE.Vector3(
        Math.sin(angle),
        0,
        Math.cos(angle)
      );

      const testPoint = currentPosition.clone().add(
        direction.multiplyScalar(rayDistance)
      );

      // Check if this path is clear
      const hasObstacle = this.checkPathForObstacles(
        currentPosition,
        testPoint,
        terrainObjects
      );

      if (!hasObstacle) {
        // Score this path based on alignment with target direction
        const toTest = new THREE.Vector3()
          .subVectors(testPoint, currentPosition)
          .normalize();
        const alignment = toTest.dot(baseDirection);

        // Distance to target from this point
        const distanceToTarget = testPoint.distanceTo(targetPosition);

        // Prefer paths that align with target and get closer
        const score = alignment * 2 - (distanceToTarget * 0.01);

        if (score > bestScore) {
          bestScore = score;
          bestPath = testPoint;
        }
      }
    }

    return bestPath;
  }

  /**
   * Calculate avoidance vector to maintain personal space from other enemies
   */
  private calculatePersonalSpace(
    currentPosition: THREE.Vector3,
    otherEnemies: any[],
    currentEnemyId: any
  ): THREE.Vector3 {
    const avoidanceVector = new THREE.Vector3(0, 0, 0);
    let nearbyCount = 0;

    for (const other of otherEnemies) {
      // Skip self and dead enemies
      if (other === currentEnemyId || other.dead) continue;

      const toOther = new THREE.Vector3()
        .subVectors(other.mesh.position, currentPosition);
      const distance = toOther.length();

      // If too close, add avoidance force
      if (distance < this.personalSpaceRadius && distance > 0.1) {
        const avoidanceStrength = (this.personalSpaceRadius - distance) / this.personalSpaceRadius;
        const awayDirection = toOther.clone().normalize().multiplyScalar(-1);
        avoidanceVector.add(awayDirection.multiplyScalar(avoidanceStrength));
        nearbyCount++;
      }
    }

    // Normalize if we found nearby enemies
    if (nearbyCount > 0) {
      avoidanceVector.divideScalar(nearbyCount);
    }

    return avoidanceVector;
  }

  /**
   * Reset stuck detection (useful when reaching target or changing behavior)
   */
  public resetStuckDetection() {
    this.stuckTimer = 0;
    this.lastPosition = new THREE.Vector3();
  }

  /**
   * Set personal space radius
   */
  public setPersonalSpace(radius: number) {
    this.personalSpaceRadius = radius;
  }
}
