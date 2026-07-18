/**
 * Plausibility caps + clamp helpers for anti-cheat.
 *
 * The game runs client-side, so submitted results are inherently untrusted.
 * These caps reject impossible/unbounded values (the realistic threat: calling
 * mutations directly from the console) and bound the blast radius of the rest.
 * Caps are set FAR above legitimate play so real runs are never affected.
 *
 * Achievement sizing is DERIVED from `convex/achievementRegistry.ts` (the shared
 * source of truth), so only AVATAR_COUNT still has to track a client list
 * (src/utils/avatars.ts — AVATARS).
 */

import { ACHIEVEMENT_ORDER, achievementBitIndex } from "./achievementRegistry";

export function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

// ── Solo run caps ──────────────────────────────────────────────────────────
export const MAX_WAVE = 100;
export const MAX_KILLS_PER_RUN = 5000;
export const MAX_SCORE = 2_000_000;
// Internal consistency ceilings (a run can't have more kills than waves could
// spawn, nor more score than kills could plausibly produce).
export const MAX_KILLS_PER_WAVE = 60;
export const SCORE_PER_KILL_CEILING = 1000;
export const SCORE_BASE_ALLOWANCE = 50_000;

// ── Skill-point economy caps ────────────────────────────────────────────────
export const MAX_SKILL_POINTS_PER_RUN = 60;
export const MAX_TOTAL_SKILL_POINTS = 100_000; // defense-in-depth ceiling

// ── Difficulty-weighted rank economy ─────────────────────────────────────────
// Difficulty is the core lever of progression: harder modes pay out far more,
// and the on-screen score itself is scaled by the SAME multiplier so the two
// never disagree. 'adaptive' starts gentle but ramps, so it sits between
// medium and hard. KEEP IN SYNC with the client (App.tsx live score, rankSystem
// previews) — these are the single source of truth.
export type DifficultyName = 'easy' | 'medium' | 'hard' | 'adaptive';
export const DIFFICULTY_MULT: Record<DifficultyName, number> = {
  easy: 0.6,
  medium: 1.0,
  hard: 1.7,
  adaptive: 1.3,
};
export const DIFFICULTY_CODE: Record<DifficultyName, number> = {
  easy: 0,
  medium: 1,
  hard: 2,
  adaptive: 3,
};
/** Map a difficulty code (0..3) back to its "hardness" for variety math.
 *  adaptive(3) is treated as ~hard(2)-ish so switching to it still rewards. */
const CODE_HARDNESS: Record<number, number> = { 0: 0, 1: 1, 2: 2, 3: 1.7 };

export const MAX_RANK_XP_PER_RUN = 3000; // bounds a single run's rank payout
export const MAX_TOTAL_RANK_XP = 5_000_000; // defense-in-depth ceiling

/** Resolve a (possibly untrusted) difficulty string to a known name. */
export function normalizeDifficulty(d: string): DifficultyName {
  return d === 'easy' || d === 'medium' || d === 'hard' || d === 'adaptive' ? d : 'medium';
}

/**
 * Legacy fallback rank XP from career SOLO aggregates — the OLD rank formula.
 * Used so accounts created before the difficulty-weighted accumulator existed
 * keep their earned rank until their next run writes a real `rankXp`.
 */
export function legacySoloRankXp(solo: {
  highScore: number;
  highestWave: number;
  totalKills: number;
  totalRuns: number;
}): number {
  const xp =
    solo.highScore * 0.05 +
    solo.highestWave * 50 +
    solo.totalKills * 6 +
    solo.totalRuns * 2;
  return Math.max(0, Math.floor(xp));
}

/** Append a difficulty code to the rolling window, trimmed to the last 8. */
export function pushRecentDiff(recent: number[] | undefined, code: number): number[] {
  const next = [...(recent ?? []), code];
  return next.slice(-8);
}

/**
 * Difficulty-weighted, anti-grind rank XP earned by ONE finished solo run.
 * Inputs are already sanitized/clamped (see sanitizeSoloRun).
 *
 *  earned = runValue × difficultyMult × monotonyFactor × varietyBonus
 *
 *  • runValue rewards depth + kills + score.
 *  • monotonyFactor decays when you keep replaying the SAME difficulty — hard
 *    on easy (you can grind it into the ground), gentle on hard.
 *  • varietyBonus rewards stepping UP from your recent average difficulty.
 *
 * `recentDiffs` is the window of runs BEFORE this one.
 */
export function computeRunRankXp(
  safeScore: number,
  safeWave: number,
  safeKills: number,
  diffCode: number,
  recentDiffs: number[] | undefined,
): number {
  const diffName = (Object.keys(DIFFICULTY_CODE) as DifficultyName[]).find(
    (k) => DIFFICULTY_CODE[k] === diffCode,
  ) ?? 'medium';
  const mult = DIFFICULTY_MULT[diffName];

  const runValue = safeWave * 8 + safeKills * 4 + Math.floor(safeScore / 120);

  const recent = recentDiffs ?? [];

  // ── Monotony: trailing runs at this exact difficulty → diminishing returns ──
  let streak = 0;
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    if (recent[i] === diffCode) streak += 1;
    else break;
  }
  // Easy decays fastest & deepest; hard barely budges. adaptive sits between.
  const perRepeat = diffName === 'easy' ? 0.12 : diffName === 'medium' ? 0.07 : diffName === 'adaptive' ? 0.05 : 0.03;
  const floorFactor = diffName === 'easy' ? 0.35 : diffName === 'medium' ? 0.55 : diffName === 'adaptive' ? 0.75 : 0.85;
  const monotonyFactor = Math.max(floorFactor, 1 - perRepeat * streak);

  // ── Variety: stepping up from your recent average hardness boosts payout ──
  let varietyBonus = 1;
  if (recent.length > 0) {
    const avgHardness =
      recent.reduce((s, c) => s + (CODE_HARDNESS[c] ?? 1), 0) / recent.length;
    const step = (CODE_HARDNESS[diffCode] ?? 1) - avgHardness;
    varietyBonus = 1 + Math.min(0.25, Math.max(0, step * 0.12));
  }

  const earned = Math.round(runValue * mult * monotonyFactor * varietyBonus);
  return clamp(earned, 0, MAX_RANK_XP_PER_RUN);
}

// ── Multiplayer match caps ──────────────────────────────────────────────────
export const MAX_MP_SCORE = 150_000;
export const MAX_MP_KILLS = 300;
export const MAX_MP_DEATHS = 100;

// ── Registry sizes (range validation) ───────────────────────────────────────
// DERIVED from the shared achievement registry, so appending an achievement can
// never leave the server mask stale (a stale mask would silently drop the new
// achievement's bit in mergeAchievements).
export const ACHIEVEMENT_COUNT = ACHIEVEMENT_ORDER.length;
export const ACHIEVEMENT_MASK = (1 << ACHIEVEMENT_COUNT) - 1;
export const AVATAR_COUNT = 12;

// Bit positions for the two multiplayer achievements. These are awarded
// server-side from the player's career totals because the client achievement
// system runs only in solo play. Looked up by ID (not hardcoded) so reordering
// or appending entries can't silently point them at the wrong achievement —
// and an id that ever goes missing fails the DEPLOY (module load) instead of
// silently minting a bogus negative-shift bitmask.
function requiredAchievementBit(id: string): number {
  const index = achievementBitIndex(id);
  if (index < 0) {
    throw new Error(`ACHIEVEMENT_BIT references unknown achievement id "${id}"`);
  }
  return 1 << index;
}
export const ACHIEVEMENT_BIT = {
  teamPlayer: requiredAchievementBit('team_player'), // play 10 multiplayer matches
  champion: requiredAchievementBit('champion'), // win 5 multiplayer matches
} as const;

/**
 * Clamp a solo run to plausible bounds. Returns the sanitized values plus the
 * skill points that may be awarded (already capped).
 */
export function sanitizeSoloRun(
  rawScore: number,
  rawWave: number,
  rawKills: number,
  difficulty: DifficultyName = 'medium',
) {
  const wave = clamp(rawWave, 0, MAX_WAVE);
  // Kills can't exceed what the waves could have spawned, or the absolute cap.
  const kills = clamp(rawKills, 0, Math.min(MAX_KILLS_PER_RUN, wave * MAX_KILLS_PER_WAVE));
  // Score can't exceed what those kills could plausibly produce, or the cap.
  const scoreCeiling = Math.min(MAX_SCORE, kills * SCORE_PER_KILL_CEILING + SCORE_BASE_ALLOWANCE);
  const score = clamp(rawScore, 0, scoreCeiling);

  // Skill points are difficulty-weighted too: harder runs grow the tree faster.
  const earned = clamp(
    Math.round((Math.floor(wave / 2) + Math.floor(score / 10000)) * DIFFICULTY_MULT[difficulty]),
    0,
    MAX_SKILL_POINTS_PER_RUN,
  );

  return { score, wave, kills, earned };
}

/** Clamp a multiplayer match result to plausible bounds. */
export function sanitizeMultiplayerResult(rawScore: number, rawKills: number, rawDeaths: number) {
  return {
    score: clamp(rawScore, 0, MAX_MP_SCORE),
    kills: clamp(rawKills, 0, MAX_MP_KILLS),
    deaths: clamp(rawDeaths, 0, MAX_MP_DEATHS),
  };
}
