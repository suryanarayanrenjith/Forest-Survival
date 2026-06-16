// Weapon Mastery — per-weapon XP and level bonuses.
//
// Each kill grants XP to the currently-equipped weapon. XP rolls up to a
// level (1–10) which feeds a small, additive bonus snapshot (recoil
// reduction + reload speedup). The XP total is persisted via
// convex/playerStats.ts::addWeaponMasteryXp; the level bonus snapshot is
// computed client-side and refreshed once per weapon switch.

export const WEAPON_IDS = ['pistol', 'rifle', 'shotgun', 'smg', 'sniper', 'minigun', 'launcher', 'subverter'] as const;
export type WeaponId = typeof WEAPON_IDS[number];

/** XP thresholds — index = level achieved (0 = unranked, 10 = max). */
export const MASTERY_LEVEL_XP: readonly number[] = [
  0,     // L0
  50,    // L1
  130,   // L2
  260,   // L3
  450,   // L4
  720,   // L5
  1080,  // L6
  1540,  // L7
  2120,  // L8
  2840,  // L9
  3720,  // L10
] as const;
export const MAX_MASTERY_LEVEL = MASTERY_LEVEL_XP.length - 1;

/** Per-level bonus snapshot consumed by the game loop. */
export interface MasteryBonus {
  /** -X% reload time. 0 = no change. */
  reloadSpeedup: number;
  /** -X% recoil. 0 = no change. */
  recoilReduction: number;
  /** +X% magazine size. 0 = no change. */
  magazineBonus: number;
}

const NEUTRAL: MasteryBonus = {
  reloadSpeedup: 0,
  recoilReduction: 0,
  magazineBonus: 0,
};

/** Compute the cumulative level for a given XP value. */
export function levelFromXp(xp: number): number {
  for (let lvl = MAX_MASTERY_LEVEL; lvl >= 0; lvl--) {
    if (xp >= MASTERY_LEVEL_XP[lvl]) return lvl;
  }
  return 0;
}

/** XP earned at a given level, and the XP needed for the next. */
export function xpProgressAtLevel(xp: number): { level: number; intoLevel: number; nextLevelXp: number } {
  const level = levelFromXp(xp);
  if (level >= MAX_MASTERY_LEVEL) {
    return { level, intoLevel: 0, nextLevelXp: 0 };
  }
  const base = MASTERY_LEVEL_XP[level];
  const next = MASTERY_LEVEL_XP[level + 1];
  return { level, intoLevel: xp - base, nextLevelXp: next - base };
}

/** Bonus snapshot for the given weapon at the given XP. Linear ramp per level. */
export function bonusForLevel(level: number): MasteryBonus {
  if (level <= 0) return NEUTRAL;
  return {
    // L1 baseline. L3 +5% reload, L5 +10%, L7 +15%, L10 +25%.
    reloadSpeedup: level >= 3 ? 0.05 + Math.max(0, level - 3) * 0.025 : 0,
    // L5 +5% recoil reduction, L10 +15%.
    recoilReduction: level >= 5 ? 0.05 + Math.max(0, level - 5) * 0.02 : 0,
    // L10 +25% magazine size.
    magazineBonus: level >= 10 ? 0.25 : 0,
  };
}

/** XP granted per kill — modest so reaching L10 is a meaningful grind. */
export function xpPerKill(enemyType: 'normal' | 'fast' | 'tank' | 'boss' | 'ranged', isMiniBoss?: boolean): number {
  let base: number;
  switch (enemyType) {
    case 'fast':   base = 4;  break;
    case 'tank':   base = 12; break;
    case 'boss':   base = 60; break;
    // Sniper kills feel meaningful — they pressure the player from afar
    // and are tougher to land than a charging stalker.
    case 'ranged': base = 9;  break;
    case 'normal':
    default:       base = 5;
  }
  if (isMiniBoss) base *= 4;
  return base;
}

/** Display label for the weapon (used by the small HUD chip + Profile panel). */
export const WEAPON_DISPLAY_NAMES: Record<WeaponId, string> = {
  pistol:   'Pistol',
  rifle:    'Rifle',
  shotgun:  'Shotgun',
  smg:      'SMG',
  sniper:   'Sniper',
  minigun:  'Minigun',
  launcher: 'Launcher',
  subverter: 'Subverter',
};
