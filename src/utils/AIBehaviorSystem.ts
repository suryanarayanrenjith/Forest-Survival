import * as THREE from 'three';

/**
 * ENEMY AI BEHAVIOR SYSTEM — strategic squad approach.
 *
 * The decision core for every enemy. Instead of all enemies trickling at the
 * player in a single straight line, each one commits to its OWN stable approach
 * LANE so the squad fans out into a pincer and SPIRALS in — flankers swing wide
 * around the sides, pressers drive a tighter line, ranged units hang back and
 * kite. The result reads as a coordinated surround that collapses onto the
 * player from every side at once, with no central coordinator to compute.
 *
 * Performance: makeDecision() is ALLOCATION-FREE. It reuses one decision struct
 * + one target vector (no clones / `new` per call) and selects a state with
 * cheap scalar checks, so the ~5–6 Hz behaviour tick stays light even with a
 * full screen of enemies.
 */

export type AIState = 'idle' | 'patrol' | 'hunt' | 'attack' | 'retreat' | 'coordinate' | 'ambush' | 'investigate';
export type AIPersonality = 'aggressive' | 'tactical' | 'defensive' | 'support';

export interface AIBehaviorContext {
  enemyPosition: THREE.Vector3;
  enemyRotation: number;
  playerPosition: THREE.Vector3;
  playerVelocity: THREE.Vector3;
  distanceToPlayer: number;
  health: number;
  maxHealth: number;
  type: 'normal' | 'fast' | 'tank' | 'boss' | 'ranged';
  allEnemies: Array<{ mesh: THREE.Object3D; dead: boolean }>;
  terrainObjects: Array<{ x: number; z: number; radius: number; height?: number; collidable?: boolean }>;
  canSeePlayer: boolean;
  hearPlayerShooting: boolean;
  timeSinceLastSawPlayer: number;
  isInCover: boolean;
}

export interface AIDecision {
  state: AIState;
  targetPosition: THREE.Vector3;
  shouldAttack: boolean;
  moveSpeed: number;
  priority: number;
}

export class AIBehaviorSystem {
  private currentState: AIState = 'idle';
  private personality: AIPersonality;
  private stateTimer: number = 0;
  private alertLevel: number = 0; // 0-100, how aware the enemy is
  private lastKnownPlayerPosition: THREE.Vector3 = new THREE.Vector3();
  private investigatePosition: THREE.Vector3 | null = null;
  private patrolPoints: THREE.Vector3[] = [];
  private currentPatrolIndex: number = 0;

  // ── STABLE PER-ENEMY TACTICS (chosen once at spawn) ──
  // flankSign / flankStrength: this enemy's stable approach BEND. On the way in
  //   it bends to one flank (±) by a per-enemy amount, so the squad fans out and
  //   arrives from different sides — but the bend FADES as it closes (see
  //   buildHunt), so the final few metres are a straight COMMIT onto the player.
  //   That's the whole fix for the old "orbit at a standoff and never connect":
  //   enemies now always converge, face the player and land their attacks.
  // standoff: the ring radius RANGED/support hold while kiting (melee don't use it).
  // speedTrim: a tiny per-enemy speed variance so a pack doesn't move in lockstep.
  private readonly flankSign: number;
  private readonly flankStrength: number;
  private readonly standoff: number;
  private readonly speedTrim: number;

  // Reused outputs — makeDecision() never allocates.
  private readonly _target = new THREE.Vector3();
  private readonly _decision: AIDecision;

  constructor(personality: AIPersonality = 'aggressive') {
    this.personality = personality;
    this.generatePatrolPoints();

    this.flankSign = Math.random() < 0.5 ? -1 : 1;
    switch (personality) {
      case 'tactical':  this.flankStrength = 0.70 + Math.random() * 0.40; break; // wide flankers
      case 'support':   this.flankStrength = 0.40 + Math.random() * 0.30; break; // circling kite
      case 'defensive': this.flankStrength = 0.30 + Math.random() * 0.30; break; // steady arc
      default:          this.flankStrength = 0.35 + Math.random() * 0.45; break; // aggressive
    }
    this.standoff = 14 + Math.random() * 7; // ranged kite ring only
    this.speedTrim = 0.94 + Math.random() * 0.12;

    this._decision = {
      state: 'hunt', targetPosition: this._target,
      shouldAttack: false, moveSpeed: 1, priority: 0,
    };
  }

  /** Generate patrol points around spawn location (used only when unaware). */
  private generatePatrolPoints() {
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const distance = 10 + Math.random() * 15;
      this.patrolPoints.push(new THREE.Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance));
    }
  }

  /**
   * Pick a state by priority (cheap scalar checks) and build its target into
   * the reused decision struct. No allocation.
   */
  public makeDecision(context: AIBehaviorContext, deltaTime: number): AIDecision {
    this.stateTimer += deltaTime;
    this.updateAlertLevel(context, deltaTime);

    if (context.canSeePlayer) {
      this.lastKnownPlayerPosition.copy(context.playerPosition);
      this.investigatePosition = null;
    }

    const aware = context.canSeePlayer || context.hearPlayerShooting || this.alertLevel > 50;

    let state: AIState;
    // NOTE: enemies NEVER flee. The old "retreat a hair from death" branch made
    // a defensive (tank) enemy peel away the moment a hit — most visibly a TNT
    // blast — dropped it to low HP, which read as a bug ("I damage it and it
    // runs off"). Damaged enemies now keep pressing the attack; the only thing
    // that ever moves an enemy away from you is its own kiting standoff (ranged).
    if (context.canSeePlayer && context.distanceToPlayer < 4.5 && this.personality !== 'support') {
      state = 'attack';                                        // melee in the kill pocket (ranged kite instead)
    } else if (aware) {
      state = 'hunt';                                          // strategic surround-and-close
    } else if (this.investigatePosition) {
      state = 'investigate';                                   // check the last disturbance
    } else {
      state = 'patrol';
    }

    this.currentState = state;
    this._decision.state = state;

    switch (state) {
      case 'attack':      this.buildAttack(context); break;
      case 'patrol':      this.buildPatrol(context); break;
      case 'investigate': this.buildInvestigate(context); break;
      default:            this.buildHunt(context); break;
    }
    return this._decision;
  }

  /** Update alert level based on context. */
  private updateAlertLevel(context: AIBehaviorContext, deltaTime: number) {
    if (context.canSeePlayer) {
      this.alertLevel = Math.min(100, this.alertLevel + deltaTime * 50);
    } else if (context.hearPlayerShooting) {
      this.alertLevel = Math.min(100, this.alertLevel + deltaTime * 30);
    } else {
      this.alertLevel = Math.max(0, this.alertLevel - deltaTime * 5);
    }
  }

  /**
   * Clamp a velocity-lead offset so the led aim point can never overshoot PAST
   * the enemy. When the player sprints straight AT an enemy, an unclamped lead
   * (velocity × seconds) lands BEHIND the robot — it would turn around and
   * chase a phantom point away from the player for a beat (the reported
   * "enemy turns its back when I run at it" bug). The lead is capped to stop
   * `margin` metres short of the enemy along the player→enemy line.
   * Returns the clamped lead scale (0..1) to apply to both axes.
   */
  private clampLeadScale(context: AIBehaviorContext, leadSeconds: number, margin: number): number {
    const lx = context.playerVelocity.x * leadSeconds;
    const lz = context.playerVelocity.z * leadSeconds;
    const leadLen = Math.hypot(lx, lz);
    if (leadLen < 1e-4) return 1;
    const maxLead = Math.max(0, context.distanceToPlayer - margin);
    return leadLen > maxLead ? maxLead / leadLen : 1;
  }

  /** ATTACK — close the last few metres onto the (slightly led) player. */
  private buildAttack(context: AIBehaviorContext) {
    const lead = 0.28 * this.clampLeadScale(context, 0.28, 1.4);
    this._target.set(
      context.playerPosition.x + context.playerVelocity.x * lead,
      0,
      context.playerPosition.z + context.playerVelocity.z * lead,
    );
    this._decision.shouldAttack = context.distanceToPlayer <= 3.4;
    this._decision.moveSpeed = (this.personality === 'aggressive' ? 1.5 : 1.28) * this.speedTrim;
    this._decision.priority = 100;
  }

  /**
   * HUNT — the strategic core. Each enemy heads for a slot on a ring around
   * the player at ITS OWN lane angle (bearing-from-player + stable bias). The
   * ring shrinks with distance, so the squad spreads out far away to set up
   * the pincer and collapses onto the player up close — converging from every
   * side at once. Ranged/support hold a big standoff and circle (kite).
   */
  private buildHunt(context: AIBehaviorContext) {
    const dist = context.distanceToPlayer;
    // Lead the runner — but clamped so a player charging AT this enemy can't
    // push the led point past/behind it (see clampLeadScale). At full sprint
    // the raw lead (speed × up-to-2s) easily exceeded the actual gap, which
    // made the enemy briefly turn and walk AWAY from an approaching player.
    const rawLead = Math.min(dist * 0.05, 2.0);
    const lead = rawLead * this.clampLeadScale(context, rawLead, 2.5);
    const px = context.playerPosition.x + context.playerVelocity.x * lead;
    const pz = context.playerPosition.z + context.playerVelocity.z * lead;

    // RANGED / support — kite: hold a big standoff ring and circle it, never
    // diving into melee.
    if (this.personality === 'support') {
      const bearing = Math.atan2(
        context.enemyPosition.z - context.playerPosition.z,
        context.enemyPosition.x - context.playerPosition.x,
      );
      const lane = bearing + this.flankSign * 0.5;
      this._target.set(
        context.playerPosition.x + Math.cos(lane) * this.standoff, 0,
        context.playerPosition.z + Math.sin(lane) * this.standoff,
      );
      this._decision.shouldAttack = false;
      this._decision.moveSpeed = 1.0 * this.speedTrim;
      this._decision.priority = 80;
      return;
    }

    // MELEE — drive at the (led) player, BENT to one flank by a lateral offset
    // that FADES as it closes. Far out it arcs in from the side (the squad fans
    // around the player); inside ~5 m the bend is gone so the final approach is
    // a STRAIGHT COMMIT — the enemy faces the player and the attack lands. The
    // lateral scales with distance (a converging spiral, never a fixed-radius
    // orbit), so it always closes the gap instead of circling forever.
    let dx = px - context.enemyPosition.x;
    let dz = pz - context.enemyPosition.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len; // unit toward the led player
    const flankFade = Math.max(0, Math.min(1, (dist - 5) / 7)); // 0 within 5 m, full past 12 m
    const lateral = this.flankStrength * Math.min(dist * 0.45, 6) * flankFade * this.flankSign;
    // Offset perpendicular to the toward-player direction (left/right per sign).
    this._target.set(px - dz * lateral, 0, pz + dx * lateral);
    this._decision.shouldAttack = dist < 3.6 && context.canSeePlayer;
    this._decision.moveSpeed = (this.personality === 'tactical' ? 1.22
      : this.personality === 'aggressive' ? 1.12
      : 1.04) * this.speedTrim;
    this._decision.priority = 80;
  }

  /** INVESTIGATE — move to the last disturbance; fall back to patrol on arrival. */
  private buildInvestigate(context: AIBehaviorContext) {
    const target = this.investigatePosition ?? this.lastKnownPlayerPosition;
    if (context.enemyPosition.distanceTo(target) < 3) {
      this.investigatePosition = null;
      this.buildPatrol(context);
      return;
    }
    this._target.copy(target);
    this._decision.shouldAttack = false;
    this._decision.moveSpeed = 0.85 * this.speedTrim;
    this._decision.priority = 50;
  }

  /** RETREAT — a short peel-off away from the player, then re-engage. */
  /** PATROL — wander the local patrol ring when totally unaware. */
  private buildPatrol(context: AIBehaviorContext) {
    const currentPoint = this.patrolPoints[this.currentPatrolIndex];
    const tx = currentPoint.x + context.enemyPosition.x;
    const tz = currentPoint.z + context.enemyPosition.z;
    if (Math.hypot(tx - context.enemyPosition.x, tz - context.enemyPosition.z) < 3) {
      this.currentPatrolIndex = (this.currentPatrolIndex + 1) % this.patrolPoints.length;
    }
    this._target.set(tx, 0, tz);
    this._decision.shouldAttack = false;
    this._decision.moveSpeed = 0.5 * this.speedTrim;
    this._decision.priority = 10;
  }

  /** Notify AI of player shooting nearby — drives investigate + raises alert. */
  public notifyPlayerShooting(shotPosition: THREE.Vector3, enemyPosition: THREE.Vector3) {
    const distance = shotPosition.distanceTo(enemyPosition);
    if (distance < 40) {
      this.investigatePosition = shotPosition.clone();
      this.alertLevel = Math.min(100, this.alertLevel + 30);
    }
  }

  public getCurrentState(): AIState {
    return this.currentState;
  }

  public getAlertLevel(): number {
    return this.alertLevel;
  }

  public reset() {
    this.currentState = 'idle';
    this.stateTimer = 0;
    this.alertLevel = 0;
    this.investigatePosition = null;
  }
}
