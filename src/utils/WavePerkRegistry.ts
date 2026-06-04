// Wave-End Choice Cards (roguelike loop).
//
// At the end of every wave the game freezes and offers the player a choice
// of THREE perks. The picked perk sticks for the rest of the run, stacking
// with itself if the same perk is offered later. Perks are single-run only
// — they're NOT persisted between runs (that's the skill tree's job).
//
// The bonus contract (`PerkBonuses`) is folded into the per-frame stat
// snapshot in App.tsx alongside the existing skill-bonus snapshot, so
// individual call sites (fire rate, damage, etc.) read ONE struct.

export type WavePerkId =
  | 'fire_rate_15'
  | 'fire_rate_30'
  | 'damage_15'
  | 'damage_30'
  | 'regen_1hps'
  | 'lifesteal_3'
  | 'crit_chance_10'
  | 'headshot_dmg_25'
  | 'max_ammo_50'
  | 'dash_cd_30'
  | 'max_hp_25'
  | 'pickup_radius_2x'
  | 'explosive_bullets'
  | 'vampiric_kill'
  | 'streak_keeper';

export interface WavePerk {
  id: WavePerkId;
  name: string;
  blurb: string;
  /** common = white, rare = blue, epic = purple. Drives card colour. */
  rarity: 'common' | 'rare' | 'epic';
  /** Relative roll weight. Higher = shows up more often. */
  weight: number;
}

export const WAVE_PERKS: Record<WavePerkId, WavePerk> = {
  fire_rate_15:      { id: 'fire_rate_15',     name: 'Trigger Discipline',   blurb: '+15% fire rate',                        rarity: 'common', weight: 5 },
  fire_rate_30:      { id: 'fire_rate_30',     name: 'Hair Trigger',         blurb: '+30% fire rate',                        rarity: 'rare',   weight: 2 },
  damage_15:         { id: 'damage_15',        name: 'Sharpened Rounds',     blurb: '+15% bullet damage',                    rarity: 'common', weight: 5 },
  damage_30:         { id: 'damage_30',        name: 'Armour Piercing',      blurb: '+30% bullet damage',                    rarity: 'rare',   weight: 2 },
  regen_1hps:        { id: 'regen_1hps',       name: 'Adrenaline',           blurb: 'Regenerate 1 HP per second',            rarity: 'rare',   weight: 3 },
  lifesteal_3:       { id: 'lifesteal_3',      name: 'Bloodletting',         blurb: 'Heal 3 HP on every kill',               rarity: 'rare',   weight: 3 },
  crit_chance_10:    { id: 'crit_chance_10',   name: 'Eagle Eye',            blurb: '+10% headshot crit chance on body hits', rarity: 'common', weight: 4 },
  headshot_dmg_25:   { id: 'headshot_dmg_25',  name: 'Skull Splitter',       blurb: '+25% headshot damage',                  rarity: 'rare',   weight: 3 },
  max_ammo_50:       { id: 'max_ammo_50',      name: 'Drum Magazine',        blurb: '+50% max ammo per weapon',              rarity: 'common', weight: 4 },
  dash_cd_30:        { id: 'dash_cd_30',       name: 'Quick Step',           blurb: '−30% dash cooldown',                    rarity: 'common', weight: 4 },
  max_hp_25:         { id: 'max_hp_25',        name: 'Iron Lung',            blurb: '+25 max HP (and heal that much now)',   rarity: 'rare',   weight: 3 },
  pickup_radius_2x:  { id: 'pickup_radius_2x', name: 'Magnet',               blurb: '2× pickup radius',                      rarity: 'common', weight: 4 },
  explosive_bullets: { id: 'explosive_bullets',name: 'Detonators',           blurb: 'Bullets explode on hit · small AOE',    rarity: 'epic',   weight: 1 },
  vampiric_kill:    { id: 'vampiric_kill',    name: 'Vampiric Edge',        blurb: 'Heal 10 HP on headshot kills',          rarity: 'epic',   weight: 1 },
  streak_keeper:    { id: 'streak_keeper',    name: 'Streak Keeper',        blurb: 'Killstreak survives wave transitions',  rarity: 'epic',   weight: 1 },
};

/**
 * Aggregated bonuses produced by the player's stack of selected perks.
 * Recomputed whenever a new perk is added; otherwise read once per frame.
 *
 * Stacking rules:
 *   multipliers (fire rate, dmg)  → multiplied together
 *   flat additives (regen, max HP)→ summed
 *   booleans                       → OR (any active = on)
 */
export interface PerkBonuses {
  fireRateMult: number;       // 1.0 baseline; each fire_rate perk multiplies
  damageMult: number;         // 1.0 baseline
  headshotDmgMult: number;    // 1.0 baseline; multiplies the existing crit bonus
  critChanceBonus: number;    // 0.0 baseline; chance a body shot crits anyway
  regenPerSec: number;        // 0 baseline
  lifestealPerKill: number;   // flat HP healed on any kill
  vampiricKillHeal: number;   // flat HP healed on headshot kill (stacks w/ lifesteal)
  maxAmmoMult: number;        // 1.0 baseline
  dashCooldownMult: number;   // 1.0 baseline (lower = faster)
  maxHpBonus: number;         // flat additive
  pickupRadiusMult: number;   // 1.0 baseline
  explosiveBullets: boolean;
  streakKeeper: boolean;
}

export const NEUTRAL_PERK_BONUSES: PerkBonuses = {
  fireRateMult: 1,
  damageMult: 1,
  headshotDmgMult: 1,
  critChanceBonus: 0,
  regenPerSec: 0,
  lifestealPerKill: 0,
  vampiricKillHeal: 0,
  maxAmmoMult: 1,
  dashCooldownMult: 1,
  maxHpBonus: 0,
  pickupRadiusMult: 1,
  explosiveBullets: false,
  streakKeeper: false,
};

/** Recompute the bonus snapshot from a flat list of picked perk IDs. */
export function aggregatePerkBonuses(picks: WavePerkId[]): PerkBonuses {
  const out: PerkBonuses = { ...NEUTRAL_PERK_BONUSES };
  for (const id of picks) {
    switch (id) {
      case 'fire_rate_15':      out.fireRateMult *= 1.15; break;
      case 'fire_rate_30':      out.fireRateMult *= 1.30; break;
      case 'damage_15':         out.damageMult *= 1.15; break;
      case 'damage_30':         out.damageMult *= 1.30; break;
      case 'regen_1hps':        out.regenPerSec += 1; break;
      case 'lifesteal_3':       out.lifestealPerKill += 3; break;
      case 'crit_chance_10':    out.critChanceBonus += 0.10; break;
      case 'headshot_dmg_25':   out.headshotDmgMult *= 1.25; break;
      case 'max_ammo_50':       out.maxAmmoMult *= 1.50; break;
      case 'dash_cd_30':        out.dashCooldownMult *= 0.70; break;
      case 'max_hp_25':         out.maxHpBonus += 25; break;
      case 'pickup_radius_2x':  out.pickupRadiusMult *= 2; break;
      case 'explosive_bullets': out.explosiveBullets = true; break;
      case 'vampiric_kill':     out.vampiricKillHeal += 10; break;
      case 'streak_keeper':     out.streakKeeper = true; break;
    }
  }
  return out;
}

/**
 * Mystery-Box roll for the post-wave picker.
 *
 * The player is shown 3 face-down boxes; ONE hides a perk pulled from the
 * weighted pool, the other two are empty. They pick blind — the gamble is
 * the gameplay. Every previously-picked perk is removed from the pool, so a
 * 15-wave run rolls each perk at most once (the registry has 15 entries).
 *
 * Returns the slot array (3 entries, one non-null) plus the prize index for
 * the picker UI to track.
 */
export interface MysteryBoxRoll {
  /** 3 slots; exactly one holds a perk id, the other two are `null`. */
  slots: (WavePerkId | null)[];
  /** Index 0/1/2 of the slot holding the prize, or -1 if the pool is dry. */
  prizeSlotIndex: number;
}

export function rollMysteryBox(currentPicks: WavePerkId[]): MysteryBoxRoll {
  // No repeats: every previously-picked perk is removed from the pool.
  const pool = (Object.keys(WAVE_PERKS) as WavePerkId[]).filter(
    (id) => !currentPicks.includes(id),
  );
  if (pool.length === 0) {
    // Pool exhausted — the caller should skip the picker entirely.
    return { slots: [null, null, null], prizeSlotIndex: -1 };
  }
  // Weighted random — rarer perks (epics) appear less often.
  const totalWeight = pool.reduce((n, id) => n + WAVE_PERKS[id].weight, 0);
  let roll = Math.random() * totalWeight;
  let prize: WavePerkId = pool[0];
  for (const id of pool) {
    roll -= WAVE_PERKS[id].weight;
    if (roll <= 0) { prize = id; break; }
  }
  // Randomise which box hides the prize.
  const prizeSlotIndex = Math.floor(Math.random() * 3);
  const slots: (WavePerkId | null)[] = [null, null, null];
  slots[prizeSlotIndex] = prize;
  return { slots, prizeSlotIndex };
}

/** Convenience — true when every perk has been picked. */
export function isPerkPoolExhausted(currentPicks: WavePerkId[]): boolean {
  return currentPicks.length >= Object.keys(WAVE_PERKS).length;
}
