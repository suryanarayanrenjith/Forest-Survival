/**
 * SINGLE source of truth for the achievement bit order and the cosmetic titles
 * they grant. Imported by BOTH the Convex server (gameLimits / playerStats) and
 * the client (src/utils/AchievementSystem.ts, src/utils/CosmeticTitles.ts) —
 * same pattern as `convex/gameLimits.ts` and `convex/authValidation.ts`.
 *
 * Why it lives here: the server has to validate an achievement bitmask AND an
 * equipped cosmetic title, and both are derived from this order. Keeping the
 * list in one place means ACHIEVEMENT_COUNT, the multiplayer achievement bits,
 * and the title whitelist can never drift apart from the client's list.
 *
 * The index of each ID is its bit position in the persisted `achievements`
 * bitmask. APPEND-ONLY — never reorder or remove entries, or existing players'
 * unlocks will shift.
 */

export const ACHIEVEMENT_ORDER = [
  'first_blood', 'slayer', 'massacre', 'legend',
  'hot_streak', 'unstoppable',
  'survivor', 'veteran', 'invincible',
  'sharpshooter', 'deadeye',
  'close_call', 'resourceful', 'arsenal', 'speed_demon', 'no_damage',
  'team_player', 'champion',
  // ── APPENDED (indices 18+) — never reorder the entries above ──
  'goliath', 'boss_slayer',
  'frenzy', 'berserker',
  'centurion', 'high_roller',
  'blitz', 'flawless_master',
  'annihilator', 'immortal',
  // ── MOBILE / TOUCH-DEVICE achievements (indices 28-30) ──
  // Only ever unlocked in SOLO play on a touch device (see App.tsx — each
  // is gated on `touchControls.enabled`). Appended last, taking bits 28/29/30.
  // ⚠️ The persisted `achievements` field is a single 32-bit-safe integer, so
  // bit 30 is the LAST safe slot (`1 << 31` overflows to negative in JS). Do
  // NOT append a 32nd achievement without widening the storage representation —
  // convex/gameLimits.ts throws at deploy time if this list exceeds 31 entries.
  'touch_trooper', 'pocket_operator', 'thumb_warrior',
] as const;

export type AchievementId = (typeof ACHIEVEMENT_ORDER)[number];

/** Bit position of an achievement id, or -1 when unknown. */
export function achievementBitIndex(id: string): number {
  return (ACHIEVEMENT_ORDER as readonly string[]).indexOf(id);
}

/**
 * Achievement-id → short cosmetic title shown in the kill feed when equipped.
 * Only achievements we want to grant cosmetics for appear here.
 *
 * ⚠️ This map is the WHITELIST the server validates `equipTitle` against — a
 * title that isn't a value here can never be persisted, so a crafted client
 * cannot inject arbitrary text into other players' kill feeds.
 */
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
  touch_trooper: 'Touch Trooper',
  pocket_operator: 'Pocket Operator',
  thumb_warrior: 'Thumb Warrior',
};

/** title → the achievement bit that unlocks it. Built once from the map above. */
const TITLE_TO_BIT: ReadonlyMap<string, number> = new Map(
  ACHIEVEMENT_ORDER.flatMap((id, index) => {
    const title = TITLE_FOR_ACHIEVEMENT[id];
    return title ? ([[title, index]] as [string, number][]) : [];
  }),
);

/** True when `title` is a real cosmetic AND `mask` has the achievement that grants it. */
export function isTitleEarned(title: string, mask: number): boolean {
  const bit = TITLE_TO_BIT.get(title);
  if (bit === undefined) return false;
  return (mask & (1 << bit)) !== 0;
}

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
  for (let index = 0; index < ACHIEVEMENT_ORDER.length; index += 1) {
    if (!(mask & (1 << index))) continue;
    const title = TITLE_FOR_ACHIEVEMENT[ACHIEVEMENT_ORDER[index]];
    if (!title) continue;
    if (title !== currentlyEquipped) return title;
  }
  return null;
}
