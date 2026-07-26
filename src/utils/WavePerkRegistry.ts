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
  | 'streak_keeper'
  | 'move_speed_15'
  | 'reload_30'
  | 'armor_20'
  | 'glass_cannon'
  // ── EXPANDED POOL — bigger, game-changing powers ──
  | 'fire_rate_50'
  | 'damage_50'
  | 'move_speed_30'
  | 'crit_chance_25'
  | 'lifesteal_6'
  | 'max_hp_50'
  | 'regen_3hps'
  | 'frost_rounds'
  | 'executioner'
  | 'berserker_rage'
  | 'thorns'
  | 'second_wind'
  | 'chain_lightning'
  | 'scavenger'
  | 'railgun_rounds';

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
  dash_cd_30:        { id: 'dash_cd_30',       name: 'Adrenal Surge',        blurb: '−30% ability recharge (your class power)', rarity: 'common', weight: 4 },
  max_hp_25:         { id: 'max_hp_25',        name: 'Iron Lung',            blurb: '+25 max HP (and heal that much now)',   rarity: 'rare',   weight: 3 },
  pickup_radius_2x:  { id: 'pickup_radius_2x', name: 'Magnet',               blurb: '2× pickup radius',                      rarity: 'common', weight: 4 },
  explosive_bullets: { id: 'explosive_bullets',name: 'Detonators',           blurb: 'Bullets explode on hit · small AOE',    rarity: 'epic',   weight: 1 },
  vampiric_kill:    { id: 'vampiric_kill',    name: 'Vampiric Edge',        blurb: 'Heal 10 HP on headshot kills',          rarity: 'epic',   weight: 1 },
  streak_keeper:    { id: 'streak_keeper',    name: 'Streak Keeper',        blurb: 'Killstreak survives wave transitions',  rarity: 'epic',   weight: 1 },
  move_speed_15:    { id: 'move_speed_15',    name: 'Fleet Footed',         blurb: '+15% movement speed',                   rarity: 'common', weight: 4 },
  reload_30:        { id: 'reload_30',        name: 'Fast Hands',           blurb: '−30% reload time',                      rarity: 'common', weight: 4 },
  armor_20:         { id: 'armor_20',         name: 'Bulletproof',          blurb: '−20% damage taken',                     rarity: 'rare',   weight: 3 },
  glass_cannon:     { id: 'glass_cannon',     name: 'Glass Cannon',         blurb: '+45% bullet damage · +30% damage taken', rarity: 'epic',   weight: 1 },

  // ── EXPANDED POOL — heavier stat spikes + build-defining game-changers.
  //    The epics are the "chase" cards: one can reshape an entire run.
  fire_rate_50:     { id: 'fire_rate_50',     name: 'Overclocked Trigger',  blurb: '+50% fire rate',                         rarity: 'epic',   weight: 1 },
  damage_50:        { id: 'damage_50',        name: 'Hollow Points',        blurb: '+50% bullet damage',                     rarity: 'epic',   weight: 1 },
  move_speed_30:    { id: 'move_speed_30',    name: 'Track Star',           blurb: '+30% movement speed',                    rarity: 'rare',   weight: 2 },
  crit_chance_25:   { id: 'crit_chance_25',   name: "Marksman's Focus",     blurb: '+25% crit chance on body hits',          rarity: 'rare',   weight: 2 },
  lifesteal_6:      { id: 'lifesteal_6',      name: 'Sanguine',             blurb: 'Heal 6 HP on every kill',                rarity: 'rare',   weight: 2 },
  max_hp_50:        { id: 'max_hp_50',        name: 'Titan Plating',        blurb: '+50 max HP (and heal that much now)',    rarity: 'rare',   weight: 2 },
  regen_3hps:       { id: 'regen_3hps',       name: 'Nanite Cloud',         blurb: 'Regenerate 3 HP per second',             rarity: 'epic',   weight: 1 },
  frost_rounds:     { id: 'frost_rounds',     name: 'Cryo Rounds',          blurb: 'Hits can flash-freeze the target solid',  rarity: 'epic',   weight: 1 },
  executioner:      { id: 'executioner',      name: 'Executioner',          blurb: 'Finish off low-HP enemies instantly',    rarity: 'epic',   weight: 1 },
  berserker_rage:   { id: 'berserker_rage',   name: "Berserker's Rage",     blurb: '+60% damage while below 40% HP',         rarity: 'epic',   weight: 1 },
  thorns:           { id: 'thorns',           name: 'Retribution',          blurb: 'Melee attackers take 60% of the hit back', rarity: 'rare', weight: 2 },
  second_wind:      { id: 'second_wind',      name: 'Second Wind',          blurb: 'Cheat death once — revive at 40% HP',     rarity: 'epic',   weight: 1 },
  chain_lightning:  { id: 'chain_lightning',  name: 'Arc Reactor',          blurb: 'Kills arc lightning to nearby enemies',   rarity: 'epic',   weight: 1 },
  scavenger:        { id: 'scavenger',        name: 'Scavenger',            blurb: 'Far more power-ups drop each wave',        rarity: 'rare',   weight: 2 },
  railgun_rounds:   { id: 'railgun_rounds',   name: 'Railgun Rounds',       blurb: 'Every bullet punches through +2 enemies', rarity: 'epic',   weight: 1 },
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
  moveSpeedMult: number;      // 1.0 baseline (higher = faster on foot)
  reloadTimeMult: number;     // 1.0 baseline (lower = snappier reloads)
  damageTakenMult: number;    // 1.0 baseline (lower = tankier; >1 = glass cannon)
  explosiveBullets: boolean;
  streakKeeper: boolean;
  // ── EXPANDED game-changer effects ──
  /** Cryo Rounds — bullet hits get a chance to flash-freeze the enemy. */
  frostRounds: boolean;
  /** Executioner — non-boss enemies at/below this HP fraction are finished
   *  outright (0 = disabled). */
  executionThreshold: number;
  /** Berserker's Rage — bullet damage multiplier applied while the player is
   *  critically wounded (<40% HP); 1 = disabled. */
  berserkerLowHpMult: number;
  /** Retribution — fraction of a melee blow reflected back to the attacker. */
  thornsReflect: number;
  /** Second Wind — cheat death once per run (revive at 40% HP). */
  secondWind: boolean;
  /** Arc Reactor — a kill arcs chain lightning to nearby enemies. */
  chainLightning: boolean;
  /** Scavenger — multiplies the per-wave power-up budget (1 = baseline). */
  powerupLuckMult: number;
  /** Railgun Rounds — extra over-penetrations granted to every weapon. */
  bulletPierce: number;
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
  moveSpeedMult: 1,
  reloadTimeMult: 1,
  damageTakenMult: 1,
  explosiveBullets: false,
  streakKeeper: false,
  frostRounds: false,
  executionThreshold: 0,
  berserkerLowHpMult: 1,
  thornsReflect: 0,
  secondWind: false,
  chainLightning: false,
  powerupLuckMult: 1,
  bulletPierce: 0,
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
      case 'move_speed_15':     out.moveSpeedMult *= 1.15; break;
      case 'reload_30':         out.reloadTimeMult *= 0.70; break;
      case 'armor_20':          out.damageTakenMult *= 0.80; break;
      case 'glass_cannon':      out.damageMult *= 1.45; out.damageTakenMult *= 1.30; break;
      // ── EXPANDED POOL ──
      case 'fire_rate_50':      out.fireRateMult *= 1.50; break;
      case 'damage_50':         out.damageMult *= 1.50; break;
      case 'move_speed_30':     out.moveSpeedMult *= 1.30; break;
      case 'crit_chance_25':    out.critChanceBonus += 0.25; break;
      case 'lifesteal_6':       out.lifestealPerKill += 6; break;
      case 'max_hp_50':         out.maxHpBonus += 50; break;
      case 'regen_3hps':        out.regenPerSec += 3; break;
      case 'frost_rounds':      out.frostRounds = true; break;
      case 'executioner':       out.executionThreshold = Math.max(out.executionThreshold, 0.15); break;
      case 'berserker_rage':    out.berserkerLowHpMult *= 1.60; break;
      case 'thorns':            out.thornsReflect += 0.60; break;
      case 'second_wind':       out.secondWind = true; break;
      case 'chain_lightning':   out.chainLightning = true; break;
      case 'scavenger':         out.powerupLuckMult *= 1.60; break;
      case 'railgun_rounds':    out.bulletPierce += 2; break;
    }
  }
  return out;
}

/**
 * Mystery-Box roll for the post-wave picker.
 *
 * The player is shown 3 face-down boxes; ONE hides a perk pulled from the
 * weighted pool, the other two are empty. They pick blind — the gamble is
 * the gameplay. Every previously-picked perk is removed from the pool, so each
 * perk can be won at most once per run (the registry is deep enough — 30+
 * entries — that the pool is effectively never exhausted in a normal run).
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
  const prizeSlotIndex = Math.floor(Math.random() * 3);
  const slots: (WavePerkId | null)[] = [null, null, null];
  slots[prizeSlotIndex] = prize;
  return { slots, prizeSlotIndex };
}

/** Convenience — true when every perk has been picked. */
export function isPerkPoolExhausted(currentPicks: WavePerkId[]): boolean {
  return currentPicks.length >= Object.keys(WAVE_PERKS).length;
}
