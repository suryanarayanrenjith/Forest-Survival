/**
 * THROWABLES — the catalog every system reads.
 * ============================================
 *
 * One table drives the pouch (counts / caps / starting kit), the flight
 * physics (GrenadeSystem), the first-person choreography (AbilityViewmodel
 * 'grenade'), the HUD + quick-select wheel and the drop roll, so adding or
 * retuning a throwable is a one-line change here.
 *
 *   LETHAL     frag      M67 fragmentation — big radius, cooks the thrower too
 *              thermite  AN-M14 TH3 — field of burning ground, ignites robots
 *              sticky    C4 sticky charge — clings to the first robot / surface
 *                        it touches, heavy blast after a short timer
 *              knife     balanced throwing knife — fast, silent, single target
 *   TACTICAL   emp       M84E pulse — stuns robots, breaks Revenant shields
 *              hijack    HJK-7 intrusion spike — drives into a robot and
 *                        rewrites its memory: it fights for you until it is
 *                        destroyed (bosses, mini-bosses and the Revenant reject
 *                        it). Replaced the smoke screen, which only duplicated
 *                        the Phantom module's cloak.
 *              decoy     noise beacon — pulls nearby robots onto itself
 */

export type ThrowableKind = 'frag' | 'emp' | 'thermite' | 'hijack' | 'sticky' | 'decoy' | 'knife';

/** Display / cycle order (the wheel lays them out clockwise from the top). */
export const THROWABLE_KINDS: ThrowableKind[] = ['frag', 'sticky', 'thermite', 'knife', 'hijack', 'emp', 'decoy'];

/**
 * How a throwable leaves the hand. Each style is its own first-person arc:
 *   overhand  — cocked back over the shoulder, whipped forward over the top
 *   underhand — dropped to the hip, swung up and released low into a lob
 *   roll      — crouched low like a bowler, rolled out along the ground
 *   sidearm   — drawn back at waist height, slung flat across the body
 *   flick     — a short, explosive wrist-and-forearm snap (the knife)
 */
export type ThrowStyle = 'overhand' | 'underhand' | 'roll' | 'sidearm' | 'flick';
/** What the hand does to arm it before the throw. */
export type ThrowPrep = 'pin' | 'twist' | 'button' | 'switch' | 'flip';
/** How it behaves once it lands / touches something. */
export type ThrowImpact = 'fuse' | 'stick' | 'blade';

export interface ThrowableSpec {
  label: string;
  /** One-line description (tutorial + wheel). */
  blurb: string;
  lethal: boolean;
  /** Pouch cap and the count every run starts with. */
  max: number;
  start: number;
  /** Seconds from release (or from sticking, for 'stick') to the effect. */
  fuse: number;
  /** Release speed (u/s) and lob (fraction of the speed added upward). */
  speed: number;
  loft: number;
  /** Gravity on the projectile (u/s²) — a knife flies flat, a canister lobs. */
  gravity: number;
  restitution: number;
  friction: number;
  impact: ThrowImpact;
  style: ThrowStyle;
  prep: ThrowPrep;
  /** Total choreography length (s). */
  animSeconds: number;
  /** Relative weight in the rare drop roll. */
  dropWeight: number;
  /** HUD accent. */
  color: string;
}

export const THROWABLES: Record<ThrowableKind, ThrowableSpec> = {
  frag: {
    label: 'Frag', blurb: 'Fragmentation grenade — wide lethal blast. Stand clear.', lethal: true,
    max: 6, start: 3, fuse: 2.4, speed: 31, loft: 0.3, gravity: 30, restitution: 0.34, friction: 0.62,
    impact: 'fuse', style: 'overhand', prep: 'pin', animSeconds: 1.0, dropWeight: 34, color: '#d9c27a',
  },
  sticky: {
    label: 'Sticky', blurb: 'C4 sticky charge — clings to the first robot it hits, then a heavy blast.', lethal: true,
    max: 3, start: 0, fuse: 1.7, speed: 30, loft: 0.22, gravity: 28, restitution: 0, friction: 0,
    impact: 'stick', style: 'overhand', prep: 'button', animSeconds: 0.95, dropWeight: 12, color: '#e8e0c8',
  },
  thermite: {
    label: 'Thermite', blurb: 'Thermite canister — rolls in and floods the ground with fire.', lethal: true,
    max: 3, start: 0, fuse: 1.6, speed: 24, loft: 0.16, gravity: 30, restitution: 0.22, friction: 0.82,
    impact: 'fuse', style: 'roll', prep: 'pin', animSeconds: 1.05, dropWeight: 14, color: '#ff8a3d',
  },
  knife: {
    label: 'Knife', blurb: 'Throwing knife — fast, silent, lethal on a single target.', lethal: true,
    max: 5, start: 0, fuse: 0, speed: 58, loft: 0.04, gravity: 9, restitution: 0, friction: 0,
    impact: 'blade', style: 'flick', prep: 'flip', animSeconds: 0.62, dropWeight: 16, color: '#cfd6dc',
  },
  hijack: {
    // A dart: thrown flat and fast so it can be put ON a robot. Sticks on
    // contact; `fuse` is the drive-in — the spike sinking through the armour
    // before the takeover lands. Landed short, it leaps to a robot nearby.
    label: 'Hijack', blurb: 'Hijack spike — embeds in a robot and turns it to your side until destroyed. Bosses and the Revenant reject it.', lethal: false,
    max: 2, start: 0, fuse: 0.7, speed: 40, loft: 0.08, gravity: 16, restitution: 0, friction: 0,
    impact: 'stick', style: 'flick', prep: 'button', animSeconds: 0.66, dropWeight: 8, color: '#4c9dff',
  },
  emp: {
    label: 'EMP', blurb: 'EMP pulse — stuns every robot nearby and shreds energy shields.', lethal: false,
    max: 3, start: 0, fuse: 1.8, speed: 31, loft: 0.28, gravity: 30, restitution: 0.3, friction: 0.58,
    impact: 'fuse', style: 'overhand', prep: 'twist', animSeconds: 1.0, dropWeight: 10, color: '#6cc4ff',
  },
  decoy: {
    label: 'Decoy', blurb: 'Noise decoy — pulls nearby robots onto itself for a few seconds.', lethal: false,
    max: 2, start: 0, fuse: 9, speed: 27, loft: 0.26, gravity: 30, restitution: 0.3, friction: 0.55,
    impact: 'fuse', style: 'sidearm', prep: 'switch', animSeconds: 0.9, dropWeight: 8, color: '#9be56a',
  },
};

/**
 * The kit a run starts with. The tutorial carries a FULL pouch of every kind —
 * and never spends it (App's throw path skips the decrement there), so each
 * throwable can be practised as often as the player likes.
 */
export function startingThrowables(tutorial: boolean): Record<ThrowableKind, number> {
  const out = {} as Record<ThrowableKind, number>;
  for (const k of THROWABLE_KINDS) out[k] = tutorial ? THROWABLES[k].max : THROWABLES[k].start;
  return out;
}

/**
 * How often robots drop throwables — set ENTIRELY by the difficulty mode.
 * Every kill rolls `chance`; drops are capped per wave and spaced in time, and
 * a pity counter guarantees one after `pityKills` kills without a drop (still
 * inside the cap + spacing), so a long dry spell can't happen on any mode.
 * Easier modes are more generous; Hard keeps throwables a rare prize.
 */
export interface ThrowableDropRules {
  chance: number;
  perWave: number;
  spacingMs: number;
  pityKills: number;
}

export const THROWABLE_DROPS: Record<'easy' | 'medium' | 'hard', ThrowableDropRules> = {
  easy: { chance: 0.07, perWave: 3, spacingMs: 20000, pityKills: 24 },
  medium: { chance: 0.05, perWave: 2, spacingMs: 28000, pityKills: 34 },
  hard: { chance: 0.04, perWave: 1, spacingMs: 36000, pityKills: 48 },
};

/**
 * The live rules for a mode. Adaptive slides from Easy's generosity (a
 * struggling player, `adaptiveT` 0) to Hard's scarcity (dominating, 1).
 */
export function throwableDropRules(mode: 'easy' | 'medium' | 'hard' | 'adaptive', adaptiveT = 0.5): ThrowableDropRules {
  if (mode !== 'adaptive') return THROWABLE_DROPS[mode];
  const t = Math.max(0, Math.min(1, adaptiveT));
  const a = THROWABLE_DROPS.easy, b = THROWABLE_DROPS.hard;
  return {
    chance: a.chance + (b.chance - a.chance) * t,
    perWave: Math.round(a.perWave + (b.perWave - a.perWave) * t),
    spacingMs: a.spacingMs + (b.spacingMs - a.spacingMs) * t,
    pityKills: Math.round(a.pityKills + (b.pityKills - a.pityKills) * t),
  };
}

/** Weighted roll for a rare throwable drop. */
export function rollThrowableDrop(): ThrowableKind {
  let total = 0;
  for (const k of THROWABLE_KINDS) total += THROWABLES[k].dropWeight;
  let r = Math.random() * total;
  for (const k of THROWABLE_KINDS) {
    r -= THROWABLES[k].dropWeight;
    if (r <= 0) return k;
  }
  return 'frag';
}
