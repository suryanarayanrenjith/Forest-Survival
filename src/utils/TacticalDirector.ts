import type { TacticalDirective } from './AIBehaviorSystem';

/**
 * ADAPTIVE TACTICAL DIRECTOR
 * ==========================
 * A single, swarm-wide "brain over the brains" that watches HOW the player is
 * playing and re-tunes the whole enemy squad to counter it — so a swarm that
 * was easy to kite becomes one that cuts you off, a swarm you camped becomes
 * one that flanks and surrounds you, and a swarm you out-ranged becomes one
 * that rushes you down. The player never fights the same swarm twice.
 *
 * Design lineage (researched, adapted to a wave-survival FPS):
 *  • Valve's LEFT 4 DEAD "AI Director" — read the player's stress/pace and
 *    steer the encounter to keep it dramatic. We read pace + engagement style.
 *    (https://left4dead.fandom.com/wiki/The_Director)
 *  • F.E.A.R. / GOAP squad tactics — flanking "emerges" from repositioning to
 *    solve a tactical problem rather than scripted flank orders. We bias the
 *    squad's approach lanes so flanking emerges from the existing steering.
 *    (https://www.gamedeveloper.com/design/building-the-ai-of-f-e-a-r-with-goal-oriented-action-planning)
 *  • Tactical INFLUENCE MAPS (Dave Mark) — a choke reads "high threat", a side
 *    route "safe", so the AI naturally flanks. Our directive is the cheap,
 *    grid-free scalar version of that pressure read.
 *    (https://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter30_Modular_Tactical_Influence_Maps.pdf)
 *
 * PERFORMANCE: this is the OPPOSITE of per-enemy planning. The director keeps a
 * handful of exponential-moving-average (EMA) scalars, folds them into ONE
 * TacticalDirective on a slow (~0.5s) tick, and every enemy reads that single
 * shared struct in makeDecision(). Cost is O(1) per tick + one object read per
 * enemy — nothing that scales with crowd size, no allocations in the hot path.
 */

/** How hard the directive is allowed to push, per difficulty. Easy stays gentle
 *  (the swarm barely adapts); Hard/Adaptive go full "god-like". */
const DIFFICULTY_GAIN: Record<string, number> = {
  easy: 0.35,
  medium: 0.7,
  hard: 1.0,
  adaptive: 1.0,
};

// Reference points that map raw player behaviour onto 0..1 "how strongly" reads.
const CAMP_SPEED_REF = 3.6;   // avg speed (u/s) at/below which the player reads as "planted"
const CAMP_SPREAD_REF = 9;    // spatial spread (m) at/below which they read as "holding a spot"
const KITE_SPEED_REF = 5.0;   // avg speed at/above which they read as a full-tilt kiter
const ENGAGE_CLOSE = 8;       // avg kill distance (m) that reads as a brawler
const ENGAGE_FAR = 42;        // avg kill distance that reads as a sniper
const FIRE_RECENCY_MS = 2500; // "firing recently" window for the kite read

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Human-readable label for the squad's current dominant read (for a subtle,
 *  occasional HUD callout so the adaptation is legible to the player). */
export type TacticalStance = 'hunting' | 'flanking' | 'surrounding' | 'closing' | 'intercepting' | 'zoning';

export class TacticalDirector {
  private gain: number;

  // ── Rolling player-behaviour estimates (all EMA-smoothed) ──
  private moveEma = 0;          // avg player speed (u/s)
  private centroidX = 0;        // slow-tracking centre of the player's recent position
  private centroidZ = 0;
  private spreadEma = CAMP_SPREAD_REF; // avg distance from that centroid → camp spread
  private engageEma = 20;       // avg distance at which the player kills things
  private accuracy = 0.4;       // fed from the shared accuracy metric
  private lastFireAt = -1e9;    // ms of the last trigger pull
  private stress = 0;           // 0..1 damage-pressure read (L4D-style intensity)
  private seeded = false;       // first frame seeds the centroid to avoid a huge initial spread

  // ── Output ──
  private readonly directive: TacticalDirective = {
    flankBias: 0,
    encircle: 0,
    rushBias: 0,
    predictionLead: 1,
    holdRange: 0,
  };
  private stance: TacticalStance = 'hunting';

  constructor(difficulty: string = 'medium') {
    this.gain = DIFFICULTY_GAIN[difficulty] ?? 0.7;
  }

  /** Swap the difficulty gain live (used when Adaptive mode ramps). */
  setDifficulty(difficulty: string): void {
    this.gain = DIFFICULTY_GAIN[difficulty] ?? this.gain;
  }

  /**
   * Per-frame player sample. Cheap: two EMAs + a centroid track. `speed` is in
   * world units/second; pass the frame's player displacement / dt.
   */
  noteFrame(px: number, pz: number, speed: number, dt: number): void {
    if (dt <= 0) return;
    // Clamp a wild dt (tab-out, frame hitch) so one bad frame can't spike the EMAs.
    const a = Math.min(0.12, dt * 0.9); // ~1.3s time-constant for movement
    if (!this.seeded) {
      this.centroidX = px;
      this.centroidZ = pz;
      this.moveEma = speed;
      this.seeded = true;
      return;
    }
    this.moveEma += (speed - this.moveEma) * a;
    // Slow centroid track (longer time-constant) → measures where the player
    // has been "living" over the last several seconds.
    const ca = Math.min(0.05, dt * 0.35);
    this.centroidX += (px - this.centroidX) * ca;
    this.centroidZ += (pz - this.centroidZ) * ca;
    const ddx = px - this.centroidX;
    const ddz = pz - this.centroidZ;
    const dispersal = Math.sqrt(ddx * ddx + ddz * ddz);
    this.spreadEma += (dispersal - this.spreadEma) * ca;
  }

  /** The player pulled a trigger — feeds the "actively fighting" recency used
   *  by the kite read. Cheap; call from the existing shot hook. */
  noteShot(nowMs: number): void {
    this.lastFireAt = nowMs;
  }

  /** Distance (m) at which the player just killed something — the core signal
   *  for brawler-vs-sniper playstyle. */
  noteEngagementDistance(distance: number): void {
    if (!Number.isFinite(distance) || distance <= 0) return;
    // Fast-ish EMA so a change of tactics (e.g. picking up the sniper) registers.
    this.engageEma += (distance - this.engageEma) * 0.18;
  }

  /** The player took a hit — raises the stress/intensity read (decays in update). */
  noteDamageTaken(amount: number): void {
    if (amount <= 0) return;
    this.stress = clamp01(this.stress + Math.min(0.25, amount / 60));
  }

  /**
   * Recompute the directive from the current reads. Call on a slow tick
   * (~0.5s). `accuracyRate` is the shared 0..1 hit rate (from the adaptive
   * metrics) — the director doesn't need to track shots itself for that.
   */
  update(nowMs: number, accuracyRate: number, dtSinceLast: number): TacticalDirective {
    if (Number.isFinite(accuracyRate)) {
      this.accuracy += (clamp01(accuracyRate) - this.accuracy) * 0.35;
    }
    // Stress bleeds off over time so the intensity read tracks the LAST few
    // seconds, not the whole run.
    this.stress = Math.max(0, this.stress - dtSinceLast * 0.12);

    // ── Read the player's strategy as 0..1 factors ──
    const campMove = clamp01(1 - this.moveEma / CAMP_SPEED_REF);
    const campSpace = clamp01(1 - this.spreadEma / CAMP_SPREAD_REF);
    const campFactor = campMove * 0.5 + campSpace * 0.5;

    const rangeFactor = clamp01((this.engageEma - ENGAGE_CLOSE) / (ENGAGE_FAR - ENGAGE_CLOSE));

    const firingRecently = nowMs - this.lastFireAt < FIRE_RECENCY_MS;
    const kiteFactor = clamp01(this.moveEma / KITE_SPEED_REF) * (firingRecently ? 1 : 0.3);

    const accuracyFactor = this.accuracy;

    // ── Fold factors into directives, then scale strength by difficulty gain ──
    const g = this.gain;
    this.directive.flankBias = clamp01((campFactor * 0.7 + rangeFactor * 0.6) * g);
    this.directive.encircle = clamp01(campFactor * g);
    // Snipers/campers get rushed; a touch of extra push when the player is
    // deadly-accurate (get in their face to spoil the aim). A high STRESS read
    // (the player is under heavy fire, taking hits) eases the rush a little —
    // an L4D-director-style relax beat that keeps the pressure fair instead of
    // piling on for an unrecoverable death spiral.
    const stressRelief = 1 - this.stress * 0.2;
    this.directive.rushBias = clamp01((rangeFactor * 0.75 + kiteFactor * 0.3 + accuracyFactor * 0.15) * g * stressRelief);
    // Lead a fast kiter more so the squad arrives where they're going.
    this.directive.predictionLead = 1 + kiteFactor * 1.3 * g;
    // When the player fights up close, snipers hold further out and refuse the trade.
    this.directive.holdRange = clamp01((1 - rangeFactor) * g);

    // ── Pick a single dominant stance for the (throttled) HUD callout ──
    this.stance = this.pickStance(campFactor, rangeFactor, kiteFactor);
    return this.directive;
  }

  private pickStance(camp: number, range: number, kite: number): TacticalStance {
    // Priority order chosen so the callout names the most player-legible read.
    if (camp > 0.55 && camp >= range) return 'surrounding';
    if (range > 0.55) return 'closing';
    if (kite > 0.5) return 'intercepting';
    if (this.directive.flankBias > 0.4) return 'flanking';
    if (this.directive.holdRange > 0.45) return 'zoning';
    return 'hunting';
  }

  getDirective(): TacticalDirective {
    return this.directive;
  }

  getStance(): TacticalStance {
    return this.stance;
  }

  /** Extra sprint urge (0..~0.3) for the far-seek path, so distant enemies
   *  close on a camping/sniping player noticeably faster. */
  getRushUrge(): number {
    return this.directive.rushBias;
  }

  /** A short, flavourful line describing the current stance — used for the
   *  occasional "the swarm is adapting" HUD note. */
  getStanceBlurb(): string {
    switch (this.stance) {
      case 'surrounding': return 'The swarm fans out to surround you';
      case 'closing':     return 'The swarm charges to close the distance';
      case 'intercepting':return 'The swarm cuts off your escape';
      case 'flanking':    return 'The swarm swings wide to flank you';
      case 'zoning':      return 'Snipers pull back to zone you out';
      default:            return 'The swarm hunts you down';
    }
  }

  reset(): void {
    this.moveEma = 0;
    this.centroidX = 0;
    this.centroidZ = 0;
    this.spreadEma = CAMP_SPREAD_REF;
    this.engageEma = 20;
    this.accuracy = 0.4;
    this.lastFireAt = -1e9;
    this.stress = 0;
    this.seeded = false;
    this.directive.flankBias = 0;
    this.directive.encircle = 0;
    this.directive.rushBias = 0;
    this.directive.predictionLead = 1;
    this.directive.holdRange = 0;
    this.stance = 'hunting';
  }
}
