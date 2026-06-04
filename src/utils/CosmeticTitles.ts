// Cosmetic Titles unlocked by achievements.
//
// Each entry pairs an achievement id (matching AchievementSystem.ACHIEVEMENT_ORDER)
// with a short text title shown in the kill feed when equipped. The registry is
// the SOURCE OF TRUTH for which titles a player has earned — the server only
// stores which one is currently equipped. The list of "available" titles is
// derived from the player's achievement bitmask client-side.

import { ACHIEVEMENT_ORDER } from './AchievementSystem';

/** Achievement-id → short cosmetic title. Only the entries we want to grant
 *  titles for need to be present; achievements not in this map don't unlock
 *  any cosmetic. */
export const TITLE_FOR_ACHIEVEMENT: Partial<Record<string, string>> = {
  slayer: 'Slayer',
  massacre: 'Reaper',
  legend: 'Legend',
  annihilator: 'Annihilator',
  hot_streak: 'Hot Streak',
  unstoppable: 'Unstoppable',
  blitz: 'Blitz Master',
  veteran: 'Veteran',
  invincible: 'Invincible',
  immortal: 'Immortal',
  sharpshooter: 'Sharpshooter',
  deadeye: 'Dead Eye',
  centurion: 'Centurion',
  high_roller: 'High Roller',
  boss_slayer: 'Boss Slayer',
  goliath: 'Goliath Hunter',
  flawless_master: 'Untouchable',
  arsenal: 'Arsenal',
  frenzy: 'Frenzied',
  berserker: 'Berserker',
};

/** Returns titles the player has earned, in stable achievement-order. */
export function availableTitlesFromMask(mask: number): string[] {
  const out: string[] = [];
  ACHIEVEMENT_ORDER.forEach((id, index) => {
    if (mask & (1 << index)) {
      const title = TITLE_FOR_ACHIEVEMENT[id];
      if (title) out.push(title);
    }
  });
  return out;
}

/**
 * First title (in stable order) the player has unlocked that they haven't
 * already equipped — used for the auto-equip on first unlock flow.
 */
export function firstNewTitleFromMask(mask: number, currentlyEquipped: string | null): string | null {
  for (const id of ACHIEVEMENT_ORDER) {
    const index = ACHIEVEMENT_ORDER.indexOf(id);
    if (!(mask & (1 << index))) continue;
    const title = TITLE_FOR_ACHIEVEMENT[id];
    if (!title) continue;
    if (title !== currentlyEquipped) return title;
  }
  return null;
}
