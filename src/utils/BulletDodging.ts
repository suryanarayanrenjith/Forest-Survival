import * as THREE from 'three';

/**
 * BULLET DODGING SYSTEM
 *
 * Provides intelligent bullet detection and evasion for enemies
 * Features:
 * - Predictive bullet trajectory analysis
 * - Dodge timing based on difficulty
 * - Varied dodge patterns
 * - Cooldown management
 */

export interface DodgeResult {
  shouldDodge: boolean;
  dodgeDirection: THREE.Vector3;
  dodgeUrgency: number; // 0-1, how urgent the dodge is
  detectedBullet: any | null;
}

export class BulletDodging {
  private lastDodgeTime: number = 0;
  private dodgeCooldown: number = 2000; // 2 seconds between dodges
  private detectionRange: number = 15; // How far to detect bullets
  private reactionTime: number = 300; // Milliseconds to react
  private dodgeSkill: number = 0.5; // 0-1, probability of successful dodge
  private lastReactionCheck: number = 0;

  constructor(dodgeSkill: number = 0.5, reactionTime: number = 300) {
    this.dodgeSkill = Math.max(0, Math.min(1, dodgeSkill));
    this.reactionTime = reactionTime;
  }

  /**
   * Main dodge calculation - determines if and how to dodge bullets
   */
  public calculateDodge(
    enemyPosition: THREE.Vector3,
    bullets: any[],
    currentTime: number
  ): DodgeResult {
    // Check cooldown
    if (currentTime - this.lastDodgeTime < this.dodgeCooldown) {
      return {
        shouldDodge: false,
        dodgeDirection: new THREE.Vector3(0, 0, 0),
        dodgeUrgency: 0,
        detectedBullet: null
      };
    }

    // Find threatening bullets
    const threats = this.detectThreateningBullets(enemyPosition, bullets);

    if (threats.length === 0) {
      return {
        shouldDodge: false,
        dodgeDirection: new THREE.Vector3(0, 0, 0),
        dodgeUrgency: 0,
        detectedBullet: null
      };
    }

    // Pick most threatening bullet
    const mostThreatening = threats[0];

    // Reaction time check - don't react instantly (more realistic)
    if (currentTime - this.lastReactionCheck < this.reactionTime) {
      // Still in reaction delay
      return {
        shouldDodge: false,
        dodgeDirection: new THREE.Vector3(0, 0, 0),
        dodgeUrgency: mostThreatening.urgency,
        detectedBullet: mostThreatening.bullet
      };
    }

    this.lastReactionCheck = currentTime;

    // Skill check - higher skill = more likely to dodge
    const dodgeRoll = Math.random();
    if (dodgeRoll > this.dodgeSkill) {
      // Failed to dodge
      return {
        shouldDodge: false,
        dodgeDirection: new THREE.Vector3(0, 0, 0),
        dodgeUrgency: mostThreatening.urgency,
        detectedBullet: mostThreatening.bullet
      };
    }

    // Calculate dodge direction (perpendicular to bullet trajectory)
    const dodgeDirection = this.calculateDodgeDirection(
      enemyPosition,
      mostThreatening.bullet
    );

    this.lastDodgeTime = currentTime;

    return {
      shouldDodge: true,
      dodgeDirection,
      dodgeUrgency: mostThreatening.urgency,
      detectedBullet: mostThreatening.bullet
    };
  }

  /**
   * Detect bullets that pose a threat to the enemy
   */
  private detectThreateningBullets(
    enemyPosition: THREE.Vector3,
    bullets: any[]
  ): Array<{ bullet: any; distance: number; urgency: number }> {
    const threats: Array<{ bullet: any; distance: number; urgency: number }> = [];

    for (const bullet of bullets) {
      const bulletPosition = bullet.mesh.position;
      const distance = bulletPosition.distanceTo(enemyPosition);

      // Only consider bullets within detection range
      if (distance > this.detectionRange) continue;

      // Calculate if bullet is heading toward enemy
      const bulletDirection = bullet.velocity.clone().normalize();
      const toEnemy = new THREE.Vector3()
        .subVectors(enemyPosition, bulletPosition)
        .normalize();

      // Dot product > 0.5 means bullet is roughly aimed at enemy
      const alignment = bulletDirection.dot(toEnemy);

      if (alignment > 0.5) {
        // Calculate closest approach distance
        const timeToClosest = this.calculateTimeToClosestApproach(
          bulletPosition,
          bullet.velocity,
          enemyPosition
        );

        if (timeToClosest > 0 && timeToClosest < 2.0) {
          const closestPoint = bulletPosition.clone().add(
            bullet.velocity.clone().multiplyScalar(timeToClosest)
          );
          const closestDistance = closestPoint.distanceTo(enemyPosition);

          // Bullet will pass within 3 units - threat!
          if (closestDistance < 3.0) {
            const urgency = 1.0 - (closestDistance / 3.0);
            threats.push({ bullet, distance, urgency });
          }
        }
      }
    }

    // Sort by urgency (most urgent first)
    threats.sort((a, b) => b.urgency - a.urgency);

    return threats;
  }

  /**
   * Calculate time until bullet reaches closest point to enemy
   */
  private calculateTimeToClosestApproach(
    bulletPosition: THREE.Vector3,
    bulletVelocity: THREE.Vector3,
    enemyPosition: THREE.Vector3
  ): number {
    const toEnemy = new THREE.Vector3().subVectors(enemyPosition, bulletPosition);
    const velocityMagnitude = bulletVelocity.length();

    if (velocityMagnitude < 0.01) return -1; // Stationary bullet

    const t = toEnemy.dot(bulletVelocity) / (velocityMagnitude * velocityMagnitude);
    return t;
  }

  /**
   * Calculate the best direction to dodge
   */
  private calculateDodgeDirection(
    _enemyPosition: THREE.Vector3,
    bullet: any
  ): THREE.Vector3 {
    const bulletDirection = bullet.velocity.clone().normalize();

    // Create perpendicular vector (sideways dodge)
    const perpendicular1 = new THREE.Vector3(
      -bulletDirection.z,
      0,
      bulletDirection.x
    );
    const perpendicular2 = new THREE.Vector3(
      bulletDirection.z,
      0,
      -bulletDirection.x
    );

    // Randomly choose left or right dodge (50/50)
    const chosenDirection = Math.random() > 0.5 ? perpendicular1 : perpendicular2;

    // Sometimes add a bit of backward movement (tactical retreat)
    if (Math.random() > 0.7) {
      const backward = bulletDirection.clone().multiplyScalar(-0.5);
      chosenDirection.add(backward);
    }

    return chosenDirection.normalize();
  }

  /**
   * Update dodge parameters (useful for different enemy types)
   */
  public setDodgeParameters(skill: number, reactionTime: number, cooldown: number) {
    this.dodgeSkill = Math.max(0, Math.min(1, skill));
    this.reactionTime = reactionTime;
    this.dodgeCooldown = cooldown;
  }

  /**
   * Set detection range
   */
  public setDetectionRange(range: number) {
    this.detectionRange = range;
  }

  /**
   * Reset dodge cooldown (useful for state changes)
   */
  public resetCooldown() {
    this.lastDodgeTime = 0;
  }
}
