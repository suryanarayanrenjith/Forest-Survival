/**
 * AMMUNITION — finite reserves for every gun, and the drops that refill them.
 * ============================================================================
 *
 * Every weapon carries a MAGAZINE (what is loaded, sized by WEAPONS[k].maxAmmo
 * plus perks/mastery) and a RESERVE (the spare rounds a reload draws from, up
 * to a carry cap). Reloads move rounds reserve → magazine; nothing refills by
 * itself. Robots drop ammunition for the guns the player owns, and the drops
 * are deliberately LUCK, not a safety net:
 *
 *   • DIFFICULTY SETS THE ODDS — each kill has one flat chance of an ammo box,
 *     fixed by the difficulty (Easy most, Hard least; Adaptive slides between
 *     the two with the live adaptive level). Running low does NOT raise it and
 *     there is no pity / guaranteed drop: an empty gun is the player's problem
 *     to solve (switch, melee, the Ammo power-up).
 *   • WHICH GUN IS RANDOM — any owned gun with room under its carry cap, with
 *     no favouritism toward the gun in hand, the newest unlock or the oldest.
 *     Only rockets and intrusion chips are rarer (they're the strongest rounds),
 *     and the robot type tilts the odds slightly (a sniper robot is a bit more
 *     likely to carry marksman rounds). A gun at its cap never gets a box it
 *     can't take.
 *   • HOW MUCH IS RANDOM — a box holds ±30% around the gun's drop size, scaled
 *     by the difficulty, and heavies (tank / boss / mini-boss) carry 1.5×.
 *
 * Pure logic + tables: App owns the state, the pickups and the UI.
 */

export type GunKey = 'pistol' | 'rifle' | 'shotgun' | 'smg' | 'sniper' | 'minigun' | 'launcher' | 'subverter';
export const GUN_KEYS: GunKey[] = ['pistol', 'rifle', 'shotgun', 'smg', 'sniper', 'minigun', 'launcher', 'subverter'];

export interface AmmoSpec {
  /** Spare rounds a weapon comes with when it's unlocked (before the difficulty multiplier). */
  reserveStart: number;
  /** Most spare rounds the player can carry for it. */
  reserveCap: number;
  /** Rounds in one drop (before the difficulty multiplier). */
  dropRounds: number;
  /** What the pickup is called, and its short calibre tag. */
  label: string;
  caliber: string;
  /** Identity hue of the pickup (glow, tag, radar). */
  color: number;
  /** Relative weight in the "which gun is this drop for" choice (1 = even odds). */
  weight: number;
}

export const AMMO: Record<GunKey, AmmoSpec> = {
  pistol: { reserveStart: 48, reserveCap: 120, dropRounds: 24, label: '9mm Magazines', caliber: '9mm', color: 0xffc861, weight: 1 },
  rifle: { reserveStart: 90, reserveCap: 240, dropRounds: 30, label: '5.56 Magazine', caliber: '5.56', color: 0xffa53d, weight: 1 },
  shotgun: { reserveStart: 24, reserveCap: 56, dropRounds: 8, label: '12-Gauge Shells', caliber: '12ga', color: 0xff6a4a, weight: 1 },
  smg: { reserveStart: 120, reserveCap: 280, dropRounds: 40, label: 'SMG Magazines', caliber: '.45', color: 0xffd27a, weight: 1 },
  sniper: { reserveStart: 15, reserveCap: 40, dropRounds: 5, label: '.338 Rounds', caliber: '.338', color: 0x9fe870, weight: 1 },
  minigun: { reserveStart: 200, reserveCap: 600, dropRounds: 100, label: 'Belt Box', caliber: '7.62 belt', color: 0xffb13d, weight: 1 },
  launcher: { reserveStart: 3, reserveCap: 8, dropRounds: 2, label: 'Rockets', caliber: 'HEAT', color: 0xff7a3d, weight: 0.45 },
  subverter: { reserveStart: 4, reserveCap: 12, dropRounds: 2, label: 'Intrusion Chips', caliber: 'chip', color: 0x39ff14, weight: 0.4 },
};

export const isGunKey = (k: string): k is GunKey => (GUN_KEYS as string[]).includes(k);

export interface AmmoDropRules {
  /** Flat chance per kill that the robot drops an ammo box (fixed by difficulty). */
  chance: number;
  /** Multiplier on rounds per drop. */
  amountMult: number;
  /** Multiplier on a newly unlocked gun's starting reserve. */
  startMult: number;
  /** Most uncollected ammo pickups on the map (the oldest is retired). */
  liveCap: number;
}

export const AMMO_DROP_RULES: Record<'easy' | 'medium' | 'hard', AmmoDropRules> = {
  easy: { chance: 0.22, amountMult: 1.35, startMult: 1.4, liveCap: 6 },
  medium: { chance: 0.16, amountMult: 1, startMult: 1, liveCap: 5 },
  hard: { chance: 0.11, amountMult: 0.75, startMult: 0.75, liveCap: 4 },
};

/** The live rules for a mode; Adaptive slides Easy (t 0, struggling) → Hard (t 1, dominating). */
export function ammoDropRules(mode: 'easy' | 'medium' | 'hard' | 'adaptive', adaptiveT = 0.5): AmmoDropRules {
  if (mode !== 'adaptive') return AMMO_DROP_RULES[mode];
  const t = Math.max(0, Math.min(1, adaptiveT));
  const a = AMMO_DROP_RULES.easy, b = AMMO_DROP_RULES.hard;
  const lerp = (x: number, y: number) => x + (y - x) * t;
  return {
    chance: lerp(a.chance, b.chance),
    amountMult: lerp(a.amountMult, b.amountMult),
    startMult: lerp(a.startMult, b.startMult),
    liveCap: Math.round(lerp(a.liveCap, b.liveCap)),
  };
}

/** Starting reserve for a gun under these rules. */
export function startingReserve(w: GunKey, rules: AmmoDropRules, capMult = 1): number {
  return Math.min(Math.round(AMMO[w].reserveCap * capMult), Math.round(AMMO[w].reserveStart * rules.startMult));
}

/** A light tilt toward the ammunition a robot's fight suggests — never a lock. */
const ENEMY_BIAS: Record<string, Partial<Record<GunKey, number>>> = {
  normal: { rifle: 1.2, pistol: 1.2 },
  fast: { smg: 1.3, pistol: 1.2 },
  ranged: { sniper: 1.4, rifle: 1.2 },
  tank: { minigun: 1.3, launcher: 1.3, shotgun: 1.2 },
  boss: { launcher: 1.4, minigun: 1.3 },
  bulwark: { shotgun: 1.3, launcher: 1.2 },
  leaper: { shotgun: 1.3, smg: 1.2 },
  howler: { rifle: 1.2, subverter: 1.3 },
  splitter: { smg: 1.2, shotgun: 1.2 },
  revenant: { sniper: 1.3, launcher: 1.3 },
};

export interface AmmoDropContext {
  /** Guns the player owns. */
  owned: GunKey[];
  /** Whether a gun's reserve is below its carry cap. */
  hasRoom: (w: GunKey) => boolean;
  enemyType: string;
  /** Tank / boss / mini-boss: a bigger drop. */
  heavy: boolean;
  rules: AmmoDropRules;
  rng?: () => number;
}

export interface AmmoDrop { weapon: GunKey; rounds: number }

/** Decide whether this kill drops ammunition, for which gun, and how much. */
export function rollAmmoDrop(ctx: AmmoDropContext): AmmoDrop | null {
  const rng = ctx.rng ?? Math.random;
  // One flat roll, set by the difficulty — no need scaling, no pity.
  if (rng() >= ctx.rules.chance) return null;

  // Which gun: luck among the owned guns that can take more rounds.
  const cands = ctx.owned.filter((w) => ctx.hasRoom(w));
  if (cands.length === 0) return null;
  const bias = ENEMY_BIAS[ctx.enemyType] ?? {};
  let total = 0;
  const weights = cands.map((w) => {
    const wgt = AMMO[w].weight * (bias[w] ?? 1);
    total += wgt;
    return wgt;
  });
  let pick = cands[cands.length - 1];
  let r = rng() * total;
  for (let i = 0; i < cands.length; i++) {
    r -= weights[i];
    if (r <= 0) { pick = cands[i]; break; }
  }

  const spec = AMMO[pick];
  const rounds = Math.max(1, Math.round(
    spec.dropRounds * ctx.rules.amountMult * (ctx.heavy ? 1.5 : 1) * (0.7 + rng() * 0.6),
  ));
  return { weapon: pick, rounds };
}
