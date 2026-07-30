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

/**
 * How an archetype throws a punch. The swing SHAPE is what tells the player
 * which enemy is on them without looking at its colour.
 *
 *  • `swipe` — a fast lateral backhand across the body. Grunts and runners.
 *  • `slam`  — both arms hauled overhead and driven straight down, with a
 *              heavy forward stomp. Tanks, bosses, bulwarks.
 *  • `flurry`— alternating left-right jabs at double rate. Light, twitchy
 *              archetypes: leapers, howlers, splitters, revenants.
   */
export type MeleeStyle = 'swipe' | 'slam' | 'flurry';

/**
 * One frame of the melee pose. A REUSED object — read it immediately, never
 * retain the reference. Angles are radians, in the enemy rig's convention:
 * NEGATIVE rotation.x on a shoulder pivot swings the arm FORWARD, positive
 * cocks it back.
   */
export interface MeleePose {
  leftArmX: number;  leftArmZ: number;
  rightArmX: number; rightArmZ: number;
  torsoX: number;    torsoY: number;
  leftLegX: number;  rightLegX: number;
}

/** Smooth 0→1 ease with zero derivative at both ends (no visible corners). */
const smooth = (t: number): number => {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
};
/** Fast-out ease — the accelerating part of a strike. */
const whip = (t: number): number => {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c;
};

export class AttackSystem {
  private config: AttackConfig;
  private state: AttackState;
  private style: MeleeStyle = 'swipe';
  // Phase boundaries as fractions of attackProgress, derived ONCE from the
  // config. `update()` and the pose sampler both read these, so the animation
  // and the damage window can never disagree — they used to, because update()
  // hardcoded a 30% strike phase while the pose maths assumed something else.
  private windupEnd = 0.375;
  private strikeEnd = 0.75;

  constructor(config: AttackConfig, style: MeleeStyle = 'swipe') {
    this.config = config;
    this.style = style;
    this.state = {
      isAttacking: false,
      attackPhase: 'idle',
      attackProgress: 0,
      lastAttackTime: 0,
      damageDealt: false,
      targetPosition: null
    };
    this.recomputePhases();
  }

  /**
   * Split the swing into windup / strike / recovery.
   *
   * `attackRecovery` was a config field that nothing read — every archetype
   * declared one and every archetype got the same hardcoded 30% strike window
   * regardless. Honouring it is what gives a tank's slam its long, readable
   * settle and a runner's swipe its snap.
   */
  private recomputePhases(): void {
    const dur = Math.max(0.001, this.config.attackDuration);
    const w = Math.min(0.7, Math.max(0.05, this.config.attackWindup / dur));
    const r = Math.min(0.6, Math.max(0.05, this.config.attackRecovery / dur));
    // The strike is whatever is left, with a floor so the damage window can
    // never close to nothing on an oddly-tuned archetype.
    const s = Math.max(0.18, 1 - w - r);
    this.windupEnd = w;
    this.strikeEnd = Math.min(0.97, w + s);
  }

  /**
   * Update attack system (call every frame)
   */
  public update(delta: number): void {
    if (!this.state.isAttacking) return;

    this.state.attackProgress += delta / this.config.attackDuration;

    if (this.state.attackProgress < this.windupEnd) {
      this.state.attackPhase = 'windup';
    } else if (this.state.attackProgress < this.strikeEnd) {
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
    // Copied into a per-instance vector rather than cloned: this fires for
    // every enemy on every swing, and in a heavy wave that was a fresh Vector3
    // several times a second per enemy, purely to record a value nothing ever
    // reads back.
    this.state.targetPosition = this._targetPos.copy(playerPosition);

    return true;
  }

  /** Backing store for `state.targetPosition` — see tryAttack. */
  private readonly _targetPos = new THREE.Vector3();

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

    // Direction check — is the player inside the swing arc? Done with scalar
    // maths rather than two fresh Vector3s: this runs for every striking enemy
    // on every frame of its strike phase, and the vectors were pure garbage.
    // The arc is a HEADING test, so it is deliberately evaluated on the
    // horizontal plane only (the old version included Y, which meant a tall
    // enemy standing over the player could fall outside its own arc).
    const dx = playerPosition.x - enemyPosition.x;
    const dz = playerPosition.z - enemyPosition.z;
    const flat = Math.hypot(dx, dz);
    if (flat > 1e-4) {
      const fx = Math.sin(enemyRotation);
      const fz = Math.cos(enemyRotation);
      const cos = (fx * dx + fz * dz) / flat;
      const angleToPlayer = Math.acos(cos < -1 ? -1 : cos > 1 ? 1 : cos);
      // Check if within attack arc (more forgiving)
      if (angleToPlayer > this.config.attackArc + 0.3) {
        return false;
      }
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

  /** Allocation-free attack-state probes for the per-enemy animation loop. */
  public isAttacking(): boolean {
    return this.state.isAttacking;
  }
  /**
   * Check if can move during attack
   */
  public canMove(): boolean {
    if (!this.state.isAttacking) return true;
    return this.config.canMoveWhileAttacking;
  }

  // Reused so the per-frame animation read doesn't allocate a fresh object for
  // every attacking enemy each frame.
  private readonly _pose: MeleePose = {
    leftArmX: 0, leftArmZ: 0,
    rightArmX: 0, rightArmZ: 0,
    torsoX: 0, torsoY: 0,
    leftLegX: 0, rightLegX: 0,
  };

  /**
   * Sample the full melee pose for this frame.
   *
   * ── WHY THIS WAS REWRITTEN ────────────────────────────────────────────
   *
   * The old version was three independent formulas, one per phase, that did
   * not meet at the phase boundaries. Windup ended with the arms at −π/3;
   * strike STARTED them at −π/2 — an instant 34° jump. Strike ended at −π/2
   * and recovery began at roughly −0.57 rad — another 57° jump, backwards.
   * So every single swing in the game contained two hard pops, which is what
   * made enemy melee read as "stiff" and "glitchy" no matter how the timings
   * were tuned.
   *
   * This is now ONE continuous curve through keyframes, eased so the velocity
   * is zero at the ends and peaks through the strike. It is also ASYMMETRIC:
   * both arms used to move as one rigid unit, which reads as a zombie shove
   * rather than a creature hitting something. And the legs and torso finally
   * participate, so the swing is thrown from the ground up.
   *
   * Reuses one object — read it immediately, don't retain the reference.
   */
  public getPose(): MeleePose {
    const p = this._pose;
    if (!this.state.isAttacking) {
      p.leftArmX = p.leftArmZ = p.rightArmX = p.rightArmZ = 0;
      p.torsoX = p.torsoY = p.leftLegX = p.rightLegX = 0;
      return p;
    }

    const t = this.state.attackProgress;
    const W = this.windupEnd;
    const S = this.strikeEnd;
    // Normalised progress within each phase (only one is meaningful at a time).
    const wind = t < W ? t / W : 1;                         // 0→1 then held
    const strike = t < W ? 0 : t < S ? (t - W) / (S - W) : 1;
    const rec = t < S ? 0 : (t - S) / Math.max(0.03, 1 - S);

    // `drive` is the master swing scalar: cocks BACK to −1 through the windup,
    // whips through to +1 across the strike, then decays to 0 in recovery.
    // Continuous by construction, so there is nowhere left for a pop to hide.
    //
    // SIGN CONVENTION (matches the rig and the walk cycle): on a shoulder or
    // hip pivot, NEGATIVE rotation.x swings the limb FORWARD and positive cocks
    // it back; on the torso, POSITIVE rotation.x pitches forward. Every line
    // below is written as a single expression in `drive` precisely so both
    // phases share one formula and cannot disagree at the boundary.
    const cocked = -smooth(wind);
    const swung = cocked + (1 - cocked) * whip(strike);
    const drive = t < S ? swung : 1 - smooth(rec);
    const fwd = drive > 0 ? drive : 0; // strike-only weight

    switch (this.style) {
      case 'slam': {
        // Both arms hauled overhead, then driven straight down — the one case
        // where symmetry is right, because that IS the read of a two-handed
        // slam. Weight comes from a deep torso pitch and a planted stomp.
        const a = -drive * 1.55;
        p.rightArmX = a;
        p.leftArmX = a;
        // Elbows flare out on the way up, close on the way down.
        p.rightArmZ = 0.26 * -drive;
        p.leftArmZ = -0.26 * -drive;
        p.torsoX = drive * 0.34;
        p.torsoY = 0;
        p.leftLegX = -0.42 * fwd;   // lead foot stamps forward
        p.rightLegX = 0.30 * fwd;   // trailing foot braces back
        break;
      }
      case 'flurry': {
        // Alternating jabs — the arms run in ANTIPHASE across the strike, so a
        // light archetype reads as fast hands rather than one big commitment.
        // `beat` starts at 0, so it adds nothing at the phase boundary.
        const beat = Math.sin(strike * Math.PI * 2) * fwd;
        p.rightArmX = -drive * 0.80 - beat * 0.72;
        p.leftArmX = -drive * 0.52 + beat * 0.72;
        p.rightArmZ = -0.26 * fwd;
        p.leftArmZ = 0.26 * fwd;
        p.torsoX = drive * 0.16;
        p.torsoY = beat * 0.16;
        p.leftLegX = -0.18 * fwd;
        p.rightLegX = 0.18 * fwd;
        break;
      }
      default: {
        // Backhand swipe: the RIGHT arm carries the blow across the body while
        // the left counter-rotates behind it. The asymmetry is the whole point —
        // both arms moving as one rigid unit is what read as a zombie shove.
        p.rightArmX = -drive * 1.25;
        p.rightArmZ = -drive * 0.62;   // chambered wide, then sweeps across
        p.leftArmX = drive * 0.42;     // counterweight, opposite phase
        p.leftArmZ = -0.28 * fwd;
        p.torsoX = drive * 0.22;
        p.torsoY = -drive * 0.34;      // shoulder turn drives the swipe
        p.leftLegX = -0.28 * fwd;
        p.rightLegX = 0.22 * fwd;
        break;
      }
    }
    return p;
  }

  /** How hard the body should be driven forward this frame (0..1, strike only).
   *  Peaks at the moment of contact rather than being flat across the phase, so
   *  the lunge lands WITH the blow instead of shoving through it. */
  public getLungeDrive(): number {
    if (!this.state.isAttacking || this.state.attackPhase !== 'strike') return 0;
    const t = (this.state.attackProgress - this.windupEnd) / Math.max(0.03, this.strikeEnd - this.windupEnd);
    return Math.sin(Math.min(1, Math.max(0, t)) * Math.PI);
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
        // Runner: slower swings than the old 700ms (so it can't relentlessly
        // chip you) but a GENEROUS arc + reach so its strikes actually CONNECT.
        // It moves WHILE attacking (so it faces its travel heading, not the
        // player) — a narrow arc made its swings whiff entirely (the "blue
        // runner does no damage" bug). ~165° passes for any roughly-forward
        // chase; only a player DIRECTLY behind it is missed.
        return {
          damage: baseDamage * 0.75,
          attackRange: 4.5,
          attackCooldown: 1050,
          attackDuration: 0.35,
          attackWindup: 0.12,
          attackRecovery: 0.12,
          canMoveWhileAttacking: true,
          attackArc: Math.PI * 0.92 // ~165° — reliably lands during a chase
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
