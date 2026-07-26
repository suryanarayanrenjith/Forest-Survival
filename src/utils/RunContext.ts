// RUN CONTEXT — the read/write boundary between App.tsx and gameplay systems.
//
// WHY THIS EXISTS
//
// The whole engine lives inside a single ~14,000-line useEffect in App.tsx, and
// the run's mutable state (health, ammo, wave, perkBonuses, enemies, bullets…)
// is ~200 closure-scoped `let`s. Nothing outside that closure can assign to
// them, so a system module physically CANNOT own game state — and threading 40
// setter callbacks into every new system is worse than the disease.
//
// The contract instead is:
//
//   • Systems READ a RunContext (a live, mutated-in-place snapshot).
//   • Systems NEVER write game state. They `emit()` a RunEvent describing what
//     they want to happen.
//   • App.tsx drains the queue at ONE well-defined point per frame and applies
//     the effects using the closure state it already owns.
//
// This buys three things that matter here:
//
//   1. New gameplay content (economy, hazards, boss phases, per-archetype
//      behaviour) lands in its own file instead of growing App.tsx, which is
//      already big enough to need a Babel `compact` workaround (vite.config.ts).
//   2. The main enemy loop iterates BACKWARDS and splices as it goes. A system
//      that spawned or removed an enemy mid-iteration would corrupt the walk.
//      Deferring every mutation to the drain point makes that impossible by
//      construction rather than by convention.
//   3. Systems become trivially inert in multiplayer — they check `ctx.solo`
//      and return, matching how perks / Revenant / TacticalDirector already
//      no-op there.
//
// PERF CONTRACT
//
// `RunContext` is allocated ONCE per run and mutated in place every frame
// (see refreshRunContext in App.tsx). Never construct one per frame, and never
// hold a reference to it past the current tick — the fields are overwritten.
// The event queue is a reused array that is emptied, not reallocated.

import type * as THREE from 'three';
import type { Enemy } from '../types/game';
import type { GraphicsPreset } from './GameSettingsManager';

/** Kill-feed categories, mirrored from the KillFeed component's entry type. */
export type KillFeedKind = 'kill' | 'headshot' | 'combo' | 'powerup' | 'wave';

/**
 * Everything a gameplay system is allowed to know about the current run.
 *
 * Fields marked `readonly` are set once at construction. The rest are
 * overwritten in place each frame — read them, never cache them.
 */
export interface RunContext {
  // ── Set once per run ───────────────────────────────────────────────────
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly preset: GraphicsPreset;
  /** `!isMultiplayer`. Solo-only systems early-return on false. */
  readonly solo: boolean;
  readonly difficulty: string;

  // ── Per-frame timing (overwritten every tick) ──────────────────────────
  /** Slow-mo-scaled delta, in seconds. Use for world/enemy motion. */
  dt: number;
  /** Unscaled delta, in seconds. Use for anything that must ignore bullet-time. */
  rawDt: number;
  /** rawDt × 60, clamped to 2. Multiply PER-FRAME step values by this. */
  frameScale: number;
  /** One cached Date.now() for the whole frame — don't call it again yourself. */
  nowMs: number;
  /** Seconds since the run started (for shader/animation phase). */
  tSec: number;

  // ── Live world snapshot (READ ONLY) ────────────────────────────────────
  /** Aliases camera.position — never reassign, never mutate. */
  playerPos: THREE.Vector3;
  playerHp: number;
  playerMaxHp: number;
  wave: number;
  paused: boolean;
  gameOver: boolean;
  /** The live enemy array. Systems must NEVER push/splice it — emit instead. */
  enemies: readonly Enemy[];

  // ── World queries App owns ─────────────────────────────────────────────
  /** Visual terrain height at a world XZ (matches the GPU displacement). */
  groundY: (x: number, z: number) => number;
  /** Indices into terrainObjects within `r` of XZ. Reused buffer — copy if kept. */
  queryObstacles: (x: number, z: number, r: number) => number[];

  // ── The ONLY write channel ─────────────────────────────────────────────
  emit: (e: RunEvent) => void;
}

/**
 * An intent, not an action. Applied by App.tsx at the frame's drain point.
 *
 * Keep this union small and orthogonal — every new variant is a new `case` in
 * drainRunEvents(). If a system needs something exotic, prefer expressing it as
 * a combination of existing events over adding a bespoke one.
 */
// Deliberately NOT here yet: `spawnEnemy` and `grantCredits`. Both need a call
// shape that only becomes unambiguous alongside their first real consumer
// (spawn needs the pool cap + host netId assignment; credits need the economy
// to exist at all), and a variant whose handler is guesswork is worse than no
// variant. They get added by the phase that introduces the consumer.
export type RunEvent =
  /** Full player-damage pipeline: shields, Retribution, Second Wind, MP sync. */
  | { k: 'damagePlayer'; amount: number; source: string; at?: THREE.Vector3 }
  | { k: 'healPlayer'; amount: number }
  | { k: 'damageEnemy'; enemy: Enemy; amount: number }
  | { k: 'sound'; name: string; volume?: number; rate?: number }
  | { k: 'banner'; text: string; ms?: number }
  | { k: 'killFeed'; text: string; kind: KillFeedKind }
  | { k: 'screenShake' };

/**
 * A reused event queue.
 *
 * `take()` hands back the live array and resets the internal one to a second
 * buffer, so the drain loop can iterate without a system's re-entrant emit
 * (an event handler that emits) mutating the array under it. Both buffers are
 * kept for the life of the run — no per-frame allocation.
 */
export class RunEventQueue {
  private a: RunEvent[] = [];
  private b: RunEvent[] = [];
  private useA = true;

  /** Bound so it can be handed straight to RunContext.emit. */
  readonly emit = (e: RunEvent): void => {
    (this.useA ? this.a : this.b).push(e);
  };

  /** Swap buffers and return the filled one. The caller must not retain it. */
  take(): RunEvent[] {
    const filled = this.useA ? this.a : this.b;
    this.useA = !this.useA;
    const next = this.useA ? this.a : this.b;
    next.length = 0;
    return filled;
  }

  clear(): void {
    this.a.length = 0;
    this.b.length = 0;
  }
}
