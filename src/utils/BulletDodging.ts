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

/** Shape of every bullet the dodger inspects. Avoids importing Bullet
 *  from `types/game.ts` (which would create a circular dependency). */
export interface DodgeableBullet {
  mesh: { position: THREE.Vector3 };
  velocity: THREE.Vector3;
}

export interface DodgeResult {
  shouldDodge: boolean;
  dodgeDirection: THREE.Vector3;
  dodgeUrgency: number; // 0-1, how urgent the dodge is
  detectedBullet: DodgeableBullet | null;
}

export class BulletDodging {
  private lastDodgeTime: number = 0;
  private dodgeCooldown: number = 2000; // 2 seconds between dodges
  private detectionRange: number = 15; // How far to detect bullets
  private reactionTime: number = 300; // Milliseconds to react
  private dodgeSkill: number = 0.5; // 0-1, probability of successful dodge
  private lastReactionCheck: number = 0;

  // Reused output/scratch so the dodge tick never allocates. The old version
  // allocated a fresh result object every call plus several Vector3s PER bullet
  // inspected (clones for direction/closest-point) and built+sorted a throwaway
  // threats array — all of which churned the GC hard during sustained fire.
  // These members make the whole scan allocation-free with identical results.
  private readonly _dodgeDir = new THREE.Vector3();
  private readonly _result: DodgeResult = {
    shouldDodge: false,
    dodgeDirection: this._dodgeDir,
    dodgeUrgency: 0,
    detectedBullet: null,
  };

  constructor(dodgeSkill: number = 0.5, reactionTime: number = 300) {
    this.dodgeSkill = Math.max(0, Math.min(1, dodgeSkill));
    this.reactionTime = reactionTime;
  }

  /**
   * Main dodge calculation - determines if and how to dodge bullets
   */
  public calculateDodge(
    enemyPosition: THREE.Vector3,
    bullets: DodgeableBullet[],
    currentTime: number
  ): DodgeResult {
    const result = this._result;

    // Check cooldown
    if (currentTime - this.lastDodgeTime < this.dodgeCooldown) {
      this._dodgeDir.set(0, 0, 0);
      result.shouldDodge = false;
      result.dodgeUrgency = 0;
      result.detectedBullet = null;
      return result;
    }

    // Find the single most-threatening bullet in one allocation-free pass.
    // (Identical to the old detect → sort → threats[0]: strict `>` keeps the
    // first-seen bullet on a tie, matching the stable sort's tie-break.)
    let bestBullet: DodgeableBullet | null = null;
    let bestUrgency = -1;
    const rangeSq = this.detectionRange * this.detectionRange;
    for (let b = 0; b < bullets.length; b++) {
      const bullet = bullets[b];
      const bp = bullet.mesh.position;
      const toEnemyX = enemyPosition.x - bp.x;
      const toEnemyY = enemyPosition.y - bp.y;
      const toEnemyZ = enemyPosition.z - bp.z;
      const distSq = toEnemyX * toEnemyX + toEnemyY * toEnemyY + toEnemyZ * toEnemyZ;

      // Only consider bullets within detection range
      if (distSq > rangeSq) continue;

      const v = bullet.velocity;
      const vLenSq = v.x * v.x + v.y * v.y + v.z * v.z;
      const vLen = Math.sqrt(vLenSq);
      if (vLen < 0.01) continue; // stationary bullet (old code returned t = -1 → skipped)

      // Alignment: normalised bullet direction · normalised to-enemy direction.
      const dist = Math.sqrt(distSq);
      if (dist < 1e-6) continue;
      const alignment = (v.x * toEnemyX + v.y * toEnemyY + v.z * toEnemyZ) / (vLen * dist);
      if (alignment <= 0.5) continue;

      // Time to closest approach: toEnemy · velocity / |velocity|².
      const t = (toEnemyX * v.x + toEnemyY * v.y + toEnemyZ * v.z) / vLenSq;
      if (t <= 0 || t >= 2.0) continue;

      // Closest point on the bullet's path → 3D distance to the enemy.
      const cpDX = (bp.x + v.x * t) - enemyPosition.x;
      const cpDY = (bp.y + v.y * t) - enemyPosition.y;
      const cpDZ = (bp.z + v.z * t) - enemyPosition.z;
      const closestDistance = Math.sqrt(cpDX * cpDX + cpDY * cpDY + cpDZ * cpDZ);
      if (closestDistance >= 3.0) continue;

      const urgency = 1.0 - (closestDistance / 3.0);
      if (urgency > bestUrgency) {
        bestUrgency = urgency;
        bestBullet = bullet;
      }
    }

    if (!bestBullet) {
      this._dodgeDir.set(0, 0, 0);
      result.shouldDodge = false;
      result.dodgeUrgency = 0;
      result.detectedBullet = null;
      return result;
    }

    // Reaction time check - don't react instantly (more realistic)
    if (currentTime - this.lastReactionCheck < this.reactionTime) {
      this._dodgeDir.set(0, 0, 0);
      result.shouldDodge = false;
      result.dodgeUrgency = bestUrgency;
      result.detectedBullet = bestBullet;
      return result;
    }

    this.lastReactionCheck = currentTime;

    // Skill check - higher skill = more likely to dodge
    const dodgeRoll = Math.random();
    if (dodgeRoll > this.dodgeSkill) {
      // Failed to dodge
      this._dodgeDir.set(0, 0, 0);
      result.shouldDodge = false;
      result.dodgeUrgency = bestUrgency;
      result.detectedBullet = bestBullet;
      return result;
    }

    // Calculate dodge direction (perpendicular to bullet trajectory) into the
    // reused vector.
    this.writeDodgeDirection(bestBullet, this._dodgeDir);

    this.lastDodgeTime = currentTime;

    result.shouldDodge = true;
    result.dodgeUrgency = bestUrgency;
    result.detectedBullet = bestBullet;
    return result;
  }

  /**
   * Calculate the best direction to dodge — writes into `out` (no allocation).
   */
  private writeDodgeDirection(bullet: DodgeableBullet, out: THREE.Vector3): void {
    const v = bullet.velocity;
    const vLen = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1;
    const dirX = v.x / vLen;
    const dirY = v.y / vLen;
    const dirZ = v.z / vLen;

    // Perpendicular (sideways dodge) — randomly left or right (50/50).
    let outX: number, outZ: number;
    if (Math.random() > 0.5) { outX = -dirZ; outZ = dirX; }
    else { outX = dirZ; outZ = -dirX; }
    let outY = 0;

    // Sometimes add a bit of backward movement (tactical retreat).
    if (Math.random() > 0.7) {
      outX += dirX * -0.5;
      outY += dirY * -0.5;
      outZ += dirZ * -0.5;
    }

    out.set(outX, outY, outZ).normalize();
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

  }
