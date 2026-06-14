// Run Modifiers (per-run "Raise the Stakes" mutators).
//
// Before a Classic run starts the player is offered a trio of mutators on the
// "Raise the Stakes" screen. The picked modifier applies for the WHOLE run,
// tweaking stat multipliers and the score payout. Modifiers are SINGLE-RUN —
// they aren't persisted.
//
// PROCEDURAL GENERATION (this rewrite):
//   The trio is no longer drawn from six hand-authored presets. Instead each
//   card is GENERATED on the fly from a distinct "archetype" (offense,
//   fragility, horde, scarcity, precision, chaos). Magnitudes are rolled
//   randomly within each archetype's safe band, the flavour name + blurb are
//   assembled from the archetype's word pools, and the score multiplier is
//   DERIVED from the actual danger of the rolled stat tweaks (riskier roll →
//   bigger payout). Because every card in a trio comes from a different
//   archetype AND rolls its own magnitudes, the three options are always
//   "unique in a different way" — a different stat axis, a different name, a
//   different accent colour and a different score curve every single time.

export type RunModifierCategory =
  | 'offense'
  | 'fragility'
  | 'horde'
  | 'scarcity'
  | 'precision'
  | 'chaos';

export interface RunModifierMods {
  playerMaxHpMult?: number;   // 1 = no change
  playerDamageMult?: number;  // 1 = no change (multiplies bullet damage)
  enemyHealthMult?: number;   // 1 = no change
  enemyDamageMult?: number;   // 1 = no change
  enemySpawnMult?: number;    // 1 = no change
  enemySpeedMult?: number;    // 1 = no change
  startAmmoMax?: number;      // absolute override on the starting mag size
  /** Body shots deal zero damage — only headshots count. */
  headshotsOnly?: boolean;
}

export interface RunModifier {
  /** Generated, unique within a trio. Used as a React key + active-run id. */
  id: string;
  /** Archetype this card was rolled from — drives the icon + accent colour. */
  category: RunModifierCategory;
  name: string;
  blurb: string;
  /** Short stat chips shown on the card, e.g. ["×2.5 DMG", "25% HP"]. */
  effects: string[];
  /** Score multiplier — the carrot for picking a punishing mutator. */
  scoreMult: number;
  /** Stat tweaks rolled into the per-run snapshot in App.tsx. */
  mods: RunModifierMods;
}

// ── seedable RNG ───────────────────────────────────────────────────────────
type Rng = () => number;

function makeSeededRng(seedStr: string): Rng {
  // FNV-1a 32-bit hash of the seed string feeds a small xorshift-style LCG.
  let h = 0x811c9dc5;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    h ^= h >>> 15;
    return ((h >>> 0) % 1_000_000) / 1_000_000;
  };
}

const pick = <T,>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length) % arr.length];

/** Round to the nearest 0.05 so payouts read as clean ×1.85 / ×2.20 values. */
const round05 = (v: number): number => Math.round(v * 20) / 20;

const pct = (mult: number): string => `${Math.round(mult * 100)}% HP`;

// ── archetype builders ──────────────────────────────────────────────────────
// Each builder rolls a fresh modifier of its archetype and returns the stat
// mods, the human-readable effect chips, the accumulated risk (which the score
// multiplier is derived from) and the word pools for the name.

interface BuildResult {
  mods: RunModifierMods;
  effects: string[];
  risk: number;
  names: readonly string[];
  taglines: readonly string[];
}

type Builder = (rng: Rng) => BuildResult;

const BUILDERS: Record<RunModifierCategory, Builder> = {
  // ── OFFENSE: hit like a truck, made of glass ──────────────────────────────
  offense: (rng) => {
    const dmg = pick(rng, [2.0, 2.5, 3.0, 3.5]);
    const hp = dmg >= 3.5 ? 0.2 : dmg >= 3.0 ? 0.25 : dmg >= 2.5 ? 0.35 : 0.5;
    return {
      mods: { playerDamageMult: dmg, playerMaxHpMult: hp },
      effects: [`×${dmg.toFixed(1)} DMG`, pct(hp)],
      risk: (1 - hp) * 1.7 - (dmg - 1) * 0.1,
      names: ['Glass Cannon', 'Powder Keg', 'Hair Trigger', 'All or Nothing', 'Live Wire'],
      taglines: [
        'Devastating output, paper-thin frame.',
        'One mistake, one tombstone.',
        'Live fast, die loud.',
      ],
    };
  },

  // ── FRAGILITY: barely any health, nothing else changes ────────────────────
  fragility: (rng) => {
    const hp = pick(rng, [0.15, 0.2, 0.3]);
    const dmg = pick(rng, [1.0, 1.25]);
    const effects = [pct(hp)];
    if (dmg > 1) effects.push(`×${dmg.toFixed(2)} DMG`);
    else effects.push('No buffs');
    return {
      mods: { playerMaxHpMult: hp, ...(dmg > 1 ? { playerDamageMult: dmg } : {}) },
      effects,
      risk: (1 - hp) * 1.6 - (dmg - 1) * 0.12,
      names: ['Paper Skin', 'Porcelain', 'Featherweight', 'One-Hit Wonder', 'Brittle'],
      taglines: [
        'Every hit could be the last.',
        'A breeze could finish you.',
        'Survive on reflexes alone.',
      ],
    };
  },

  // ── HORDE: more, faster, sometimes squishier enemies ──────────────────────
  horde: (rng) => {
    const spawn = pick(rng, [1.5, 1.8, 2.1]);
    const speed = pick(rng, [1.0, 1.2, 1.35]);
    const ehp = pick(rng, [0.5, 0.7, 1.0]);
    const effects = [`+${Math.round((spawn - 1) * 100)}% SPAWN`];
    if (speed > 1) effects.push(`+${Math.round((speed - 1) * 100)}% SPEED`);
    if (ehp < 1) effects.push(`${Math.round(ehp * 100)}% ENEMY HP`);
    return {
      mods: {
        enemySpawnMult: spawn,
        ...(speed > 1 ? { enemySpeedMult: speed } : {}),
        enemyHealthMult: ehp,
      },
      effects,
      risk: (spawn - 1) * 0.72 + (speed - 1) * 1.05 - (1 - ehp) * 0.28,
      names: ['Swarm Mode', 'Rising Tide', 'Locust Bloom', 'Overrun', 'Endless Wave'],
      taglines: [
        'Mow them down before they bury you.',
        'They just keep coming.',
        'The forest is full of teeth.',
      ],
    };
  },

  // ── SCARCITY: brutal ammo economy ─────────────────────────────────────────
  scarcity: (rng) => {
    const ammo = pick(rng, [1, 2, 3]);
    const dmg = ammo === 1 ? 1.5 : 1.25;
    const ammoRisk: Record<number, number> = { 1: 1.0, 2: 0.72, 3: 0.55 };
    return {
      mods: { startAmmoMax: ammo, playerDamageMult: dmg },
      effects: [`${ammo} ROUND${ammo > 1 ? 'S' : ''}`, `×${dmg.toFixed(2)} DMG`],
      risk: ammoRisk[ammo] - (dmg - 1) * 0.2,
      names: ['One in the Chamber', 'Rationed', 'Dry Powder', 'Last Round', 'Scavenger'],
      taglines: [
        'Make every shot count.',
        'Pick up or perish.',
        'Reloading is a luxury you cannot afford.',
      ],
    };
  },

  // ── PRECISION: headshots only, with a damage sweetener ────────────────────
  precision: (rng) => {
    const dmg = pick(rng, [1.5, 1.75, 2.0]);
    return {
      mods: { headshotsOnly: true, playerDamageMult: dmg },
      effects: ['HEADSHOTS ONLY', `×${dmg.toFixed(2)} DMG`],
      risk: 0.95 - (dmg - 1) * 0.22,
      names: ['Skull Hunter', "Marksman's Pact", 'Cranial', 'Deadeye Doctrine', 'Surgeon'],
      taglines: [
        'Body shots tickle. Aim higher.',
        'Only the head counts.',
        'A test of pure aim.',
      ],
    };
  },

  // ── CHAOS: a wild cocktail of two-to-three smaller effects ────────────────
  chaos: (rng) => {
    const enemyDmg = pick(rng, [1.3, 1.5]);
    const enemySpeed = pick(rng, [1.2, 1.35]);
    const hp = pick(rng, [0.5, 0.65]);
    return {
      mods: {
        enemyDamageMult: enemyDmg,
        enemySpeedMult: enemySpeed,
        playerMaxHpMult: hp,
      },
      effects: [
        `+${Math.round((enemyDmg - 1) * 100)}% ENEMY DMG`,
        `+${Math.round((enemySpeed - 1) * 100)}% SPEED`,
        pct(hp),
      ],
      risk: (enemyDmg - 1) * 0.95 + (enemySpeed - 1) * 1.0 + (1 - hp) * 1.1,
      names: ['Bedlam', 'Pandemonium', 'Wildcard', 'Maelstrom', 'Hell Unleashed'],
      taglines: [
        'Everything that can go wrong, will.',
        'No rules. No mercy.',
        'Pure, unfiltered carnage.',
      ],
    };
  },
};

const ALL_CATEGORIES: readonly RunModifierCategory[] = [
  'offense',
  'fragility',
  'horde',
  'scarcity',
  'precision',
  'chaos',
];

/** Risk → score multiplier. Clamped + quantised so payouts read cleanly. */
function riskToScore(risk: number): number {
  const raw = 1.0 + Math.max(0, risk);
  return Math.min(2.75, Math.max(1.25, round05(raw)));
}

function buildModifier(category: RunModifierCategory, rng: Rng, idSalt: string): RunModifier {
  const r = BUILDERS[category](rng);
  return {
    id: `${category}_${idSalt}_${Math.floor(rng() * 1e6).toString(36)}`,
    category,
    name: pick(rng, r.names),
    blurb: pick(rng, r.taglines),
    effects: r.effects,
    scoreMult: riskToScore(r.risk),
    mods: r.mods,
  };
}

/**
 * Generate a trio of stake options. Each card is rolled from a DISTINCT
 * archetype, so the three options are always unique along different stat axes.
 *
 * @param count   how many options to produce (defaults to 3)
 * @param rng     optional RNG (pass a seeded one for deterministic rolls)
 */
export function generateStakeOptions(count = 3, rng: Rng = Math.random): RunModifier[] {
  // Fisher–Yates shuffle of the archetypes, then take `count` distinct ones so
  // no two cards share a stat axis.
  const cats = [...ALL_CATEGORIES];
  for (let i = cats.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cats[i], cats[j]] = [cats[j], cats[i]];
  }
  const chosen = cats.slice(0, Math.min(count, cats.length));
  return chosen.map((cat, idx) => buildModifier(cat, rng, idx.toString(36)));
}

/**
 * Deterministic UTC-day-seeded trio — every player sees the same three rolls
 * on the same day (kept for any "today's stakes" framing / shareable chatter).
 */
export function getDailyStakeOptions(
  utcDay: string = new Date().toISOString().slice(0, 10),
): RunModifier[] {
  return generateStakeOptions(3, makeSeededRng(`stakes-${utcDay}`));
}
