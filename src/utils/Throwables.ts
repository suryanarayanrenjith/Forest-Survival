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
 *              smoke     HC smoke screen — robots lose sight of anyone in or
 *                        behind the cloud
 *              decoy     noise beacon — pulls nearby robots onto itself
 */

export type ThrowableKind = 'frag' | 'emp' | 'thermite' | 'smoke' | 'sticky' | 'decoy' | 'knife';

/** Display / cycle order (the wheel lays them out clockwise from the top). */
export const THROWABLE_KINDS: ThrowableKind[] = ['frag', 'sticky', 'thermite', 'knife', 'smoke', 'emp', 'decoy'];

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
  smoke: {
    label: 'Smoke', blurb: 'Smoke screen — robots lose sight of anyone in or behind the cloud.', lethal: false,
    max: 3, start: 0, fuse: 1.2, speed: 26, loft: 0.34, gravity: 30, restitution: 0.25, friction: 0.6,
    impact: 'fuse', style: 'underhand', prep: 'pin', animSeconds: 1.0, dropWeight: 10, color: '#c9ced3',
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

/** The kit a run starts with (tutorial gets a little of everything to try). */
export function startingThrowables(tutorial: boolean): Record<ThrowableKind, number> {
  const out = {} as Record<ThrowableKind, number>;
  for (const k of THROWABLE_KINDS) out[k] = tutorial ? Math.max(THROWABLES[k].start, 2) : THROWABLES[k].start;
  return out;
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
