import * as THREE from 'three';

/**
 * ENEMY ATTACK SYSTEM
 *
 * Handles all enemy attack logic including:
 * - Attack animations
 * - Hit detection (sphere-based, not frame-timing dependent)
 * - Damage calculation
 * - Attack patterns for different enemy types
 */

export interface AttackConfig {
  damage: number;
  attackRange: number;
  attackCooldown: number;
  attackDuration: number;
  attackWindup: number; // Time before damage is dealt
  attackRecovery: number; // Time after damage before returning to normal
  canMoveWhileAttacking: boolean;
  attackArc: number; // Attack cone in radians (for frontal attacks)
}

export interface AttackState {
  isAttacking: boolean;
  attackPhase: 'idle' | 'windup' | 'strike' | 'recovery';
  attackProgress: number; // 0-1
  lastAttackTime: number;
  damageDealt: boolean; // Has damage been dealt this attack cycle?
  targetPosition: THREE.Vector3 | null;
}

export class AttackSystem {
  private config: AttackConfig;
  private state: AttackState;

  constructor(config: AttackConfig) {
    this.config = config;
    this.state = {
      isAttacking: false,
      attackPhase: 'idle',
      attackProgress: 0,
      lastAttackTime: 0,
      damageDealt: false,
      targetPosition: null
    };
  }

  /**
   * Update attack system (call every frame)
   */
  public update(delta: number): void {
    if (!this.state.isAttacking) return;

    this.state.attackProgress += delta / this.config.attackDuration;

    // Update attack phase based on progress
    const windupRatio = this.config.attackWindup / this.config.attackDuration;
    const strikeRatio = 0.3; // Strike phase is 30% of duration
    const recoveryStart = windupRatio + strikeRatio;

    if (this.state.attackProgress < windupRatio) {
      this.state.attackPhase = 'windup';
    } else if (this.state.attackProgress < recoveryStart) {
      this.state.attackPhase = 'strike';
    } else {
      this.state.attackPhase = 'recovery';
    }

    // End attack when complete
    if (this.state.attackProgress >= 1.0) {
      this.endAttack();
    }
  }

  /**
   * Attempt to start an attack
   * Returns true if attack was initiated
   */
  public tryAttack(
    enemyPosition: THREE.Vector3,
    playerPosition: THREE.Vector3
  ): boolean {
    const currentTime = Date.now();

    // Check cooldown
    if (currentTime - this.state.lastAttackTime < this.config.attackCooldown) {
      return false;
    }

    // Check range
    const distance = enemyPosition.distanceTo(playerPosition);
    if (distance > this.config.attackRange) {
      return false;
    }

    // Start attack
    this.state.isAttacking = true;
    this.state.attackPhase = 'windup';
    this.state.attackProgress = 0;
    this.state.lastAttackTime = currentTime;
    this.state.damageDealt = false;
    this.state.targetPosition = playerPosition.clone();

    return true;
  }

  /**
   * Check if attack should deal damage this frame
   * Uses sphere-based collision, not frame timing
   */
  public checkHit(
    enemyPosition: THREE.Vector3,
    enemyRotation: number,
    playerPosition: THREE.Vector3
  ): boolean {
    // Only deal damage during strike phase
    if (this.state.attackPhase !== 'strike') {
      return false;
    }

    // Only deal damage once per attack
    if (this.state.damageDealt) {
      return false;
    }

    // Distance check - VERY generous hitbox to prevent clipping through player
    const distance = enemyPosition.distanceTo(playerPosition);
    if (distance > this.config.attackRange + 1.5) {
      return false;
    }

    // Direction check - is player in front of enemy?
    const toPlayer = new THREE.Vector3()
      .subVectors(playerPosition, enemyPosition)
      .normalize();

    const enemyForward = new THREE.Vector3(
      Math.sin(enemyRotation),
      0,
      Math.cos(enemyRotation)
    );

    const angleToPlayer = Math.acos(Math.max(-1, Math.min(1, enemyForward.dot(toPlayer))));

    // Check if within attack arc (more forgiving)
    if (angleToPlayer > this.config.attackArc + 0.3) {
      return false;
    }

    // Mark damage as dealt
    this.state.damageDealt = true;
    return true;
  }

  /**
   * Check if enemy is overlapping with player (emergency damage system)
   * Returns true if enemy is TOO close (clipping through player)
   */
  public checkOverlapDamage(
    enemyPosition: THREE.Vector3,
    playerPosition: THREE.Vector3,
    lastDamageTime: number,
    currentTime: number
  ): boolean {
    const distance = enemyPosition.distanceTo(playerPosition);

    // If enemy is VERY close (overlapping), deal damage
    if (distance < 2.0 && currentTime - lastDamageTime > 800) {
      return true;
    }

    return false;
  }

  /**
   * Get damage value for this attack
   */
  public getDamage(): number {
    return this.config.damage;
  }

  /**
   * End current attack
   */
  private endAttack(): void {
    this.state.isAttacking = false;
    this.state.attackPhase = 'idle';
    this.state.attackProgress = 0;
    this.state.targetPosition = null;
  }

  /**
   * Force cancel current attack
   */
  public cancelAttack(): void {
    this.endAttack();
  }

  /**
   * Get current attack state for animations
   */
  public getAttackState(): AttackState {
    return { ...this.state };
  }

  /**
   * Check if can move during attack
   */
  public canMove(): boolean {
    if (!this.state.isAttacking) return true;
    return this.config.canMoveWhileAttacking;
  }

  /**
   * Get arm rotation for attack animation
   * Returns rotation in radians for left and right arms
   */
  public getArmRotation(): { left: number; right: number } {
    if (!this.state.isAttacking) {
      return { left: 0, right: 0 };
    }

    const progress = this.state.attackProgress;

    switch (this.state.attackPhase) {
      case 'windup':
        // Pull arms back
        const windupAmount = progress / (this.config.attackWindup / this.config.attackDuration);
        return {
          left: -Math.PI / 3 * windupAmount,
          right: -Math.PI / 3 * windupAmount
        };

      case 'strike':
        // Swing arms forward
        const strikeProgress = (progress - (this.config.attackWindup / this.config.attackDuration)) / 0.3;
        const swingAngle = -Math.PI / 2 + Math.sin(strikeProgress * Math.PI) * Math.PI / 3;
        return {
          left: swingAngle,
          right: swingAngle
        };

      case 'recovery':
        // Return to neutral
        const recoveryProgress = 1 - ((1 - progress) / 0.3);
        return {
          left: -Math.PI / 6 * (1 - recoveryProgress),
          right: -Math.PI / 6 * (1 - recoveryProgress)
        };

      default:
        return { left: 0, right: 0 };
    }
  }

  /**
   * Get torso rotation for attack animation
   */
  public getTorsoRotation(): number {
    if (!this.state.isAttacking) return 0;

    const progress = this.state.attackProgress;

    switch (this.state.attackPhase) {
      case 'windup':
        return -0.2 * progress;
      case 'strike':
        return 0.3 * Math.sin(progress * Math.PI);
      case 'recovery':
        return 0.1 * (1 - progress);
      default:
        return 0;
    }
  }

  /**
   * Update attack configuration (for difficulty scaling)
   */
  public updateConfig(newConfig: Partial<AttackConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Reset attack system
   */
  public reset(): void {
    this.state = {
      isAttacking: false,
      attackPhase: 'idle',
      attackProgress: 0,
      lastAttackTime: 0,
      damageDealt: false,
      targetPosition: null
    };
  }

  /**
   * Create attack config for enemy type
   */
  public static createConfigForType(
    type: 'normal' | 'fast' | 'tank' | 'boss',
    baseDamage: number
  ): AttackConfig {
    switch (type) {
      case 'fast':
        return {
          damage: baseDamage * 0.75,
          attackRange: 4.5,
          attackCooldown: 700,
          attackDuration: 0.35,
          attackWindup: 0.1,
          attackRecovery: 0.1,
          canMoveWhileAttacking: true,
          attackArc: Math.PI // 180 degrees - very wide
        };

      case 'tank':
        return {
          damage: baseDamage * 1.5,
          attackRange: 5.0,
          attackCooldown: 1200,
          attackDuration: 0.6,
          attackWindup: 0.25,
          attackRecovery: 0.2,
          canMoveWhileAttacking: false,
          attackArc: Math.PI * 0.75 // 135 degrees
        };

      case 'boss':
        return {
          damage: baseDamage * 2.0,
          attackRange: 5.5,
          attackCooldown: 1000,
          attackDuration: 0.5,
          attackWindup: 0.2,
          attackRecovery: 0.15,
          canMoveWhileAttacking: true,
          attackArc: Math.PI * 1.2 // 216 degrees - very wide
        };

      case 'normal':
      default:
        return {
          damage: baseDamage,
          attackRange: 4.5,
          attackCooldown: 900,
          attackDuration: 0.4,
          attackWindup: 0.15,
          attackRecovery: 0.1,
          canMoveWhileAttacking: false,
          attackArc: Math.PI * 0.8 // 144 degrees
        };
    }
  }
}
