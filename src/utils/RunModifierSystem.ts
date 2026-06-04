// Run Modifiers (per-run mutators).
//
// Before a Classic run starts the player is offered a daily-rotated trio of
// modifiers. The picked modifier applies for the WHOLE run, tweaking stat
// multipliers and the score payout. Modifiers are SINGLE-RUN — they aren't
// persisted; the daily roll is a UTC seed so every player sees the same
// three options on the same day (drives chatter, friendly competition).

export type RunModifierId =
  | 'headshots_only'
  | 'berserker'
  | 'glass_cannon'
  | 'swarm_mode'
  | 'one_in_the_chamber'
  | 'bullet_hell';

export interface RunModifier {
  id: RunModifierId;
  name: string;
  blurb: string;
  /** Score multiplier — the carrot for picking a punishing mutator. */
  scoreMult: number;
  /** Stat tweaks rolled into the per-run snapshot in App.tsx. */
  mods: {
    playerMaxHpMult?: number;     // 1 = no change
    playerDamageMult?: number;    // 1 = no change (multiplies bullet damage)
    enemyHealthMult?: number;     // 1 = no change
    enemyDamageMult?: number;     // 1 = no change
    enemySpawnMult?: number;      // 1 = no change
    enemySpeedMult?: number;      // 1 = no change
    startAmmoMax?: number;        // absolute override on the starting mag size
    /** Body shots deal zero damage — only headshots count. */
    headshotsOnly?: boolean;
  };
}

export const RUN_MODIFIERS: Record<RunModifierId, RunModifier> = {
  headshots_only: {
    id: 'headshots_only',
    name: 'Skull Hunter',
    blurb: 'Body shots tickle. Headshots only.',
    scoreMult: 1.75,
    mods: { headshotsOnly: true },
  },
  berserker: {
    id: 'berserker',
    name: 'Berserker',
    blurb: '2× damage, ½ max HP. Live fast, die loud.',
    scoreMult: 1.6,
    mods: { playerDamageMult: 2.0, playerMaxHpMult: 0.5 },
  },
  glass_cannon: {
    id: 'glass_cannon',
    name: 'Glass Cannon',
    blurb: '3× damage, 25 HP cap. One mistake, one tombstone.',
    scoreMult: 2.2,
    mods: { playerDamageMult: 3.0, playerMaxHpMult: 0.25 },
  },
  swarm_mode: {
    id: 'swarm_mode',
    name: 'Swarm Mode',
    blurb: '+80% enemy spawn rate. ½ enemy HP. Mow them down.',
    scoreMult: 1.5,
    mods: { enemySpawnMult: 1.8, enemyHealthMult: 0.5 },
  },
  one_in_the_chamber: {
    id: 'one_in_the_chamber',
    name: 'One in the Chamber',
    blurb: 'Start with 1 round per weapon. Make it count.',
    scoreMult: 2.0,
    mods: { startAmmoMax: 1 },
  },
  bullet_hell: {
    id: 'bullet_hell',
    name: 'Bullet Hell',
    blurb: 'Enemies hit harder and move faster. Higher score.',
    scoreMult: 1.7,
    mods: { enemyDamageMult: 1.5, enemySpeedMult: 1.35 },
  },
};

/**
 * Deterministic UTC-day seeded roll of three distinct modifiers. The same
 * trio is offered to every player on the same day (drives "did you see
 * today's mutators?" chatter), and rotates fully on UTC midnight.
 */
export function getDailyTrio(utcDay: string = new Date().toISOString().slice(0, 10)): RunModifierId[] {
  // FNV-1a 32-bit hash of the UTC day string seeds a small LCG.
  let h = 0x811c9dc5;
  for (let i = 0; i < utcDay.length; i++) {
    h ^= utcDay.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const rng = () => {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    h ^= h >>> 15;
    return ((h >>> 0) % 1000000) / 1000000;
  };

  const all = Object.keys(RUN_MODIFIERS) as RunModifierId[];
  const trio: RunModifierId[] = [];
  // Fisher-Yates with seeded RNG, take 3.
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  for (let i = 0; i < 3; i++) trio.push(all[i]);
  return trio;
}
