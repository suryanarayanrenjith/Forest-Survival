/**
 * Plausibility caps + clamp helpers for anti-cheat.
 *
 * The game runs client-side, so submitted results are inherently untrusted.
 * These caps reject impossible/unbounded values (the realistic threat: calling
 * mutations directly from the console) and bound the blast radius of the rest.
 * Caps are set FAR above legitimate play so real runs are never affected.
 *
 * Keep ACHIEVEMENT_COUNT in sync with src/utils/AchievementSystem.ts
 * (ACHIEVEMENT_ORDER) and AVATAR_COUNT with src/utils/avatars.ts (AVATARS).
 */

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

// ── Multiplayer match caps ──────────────────────────────────────────────────
export const MAX_MP_SCORE = 150_000;
export const MAX_MP_KILLS = 300;
export const MAX_MP_DEATHS = 100;

// ── Registry sizes (range validation) ───────────────────────────────────────
export const ACHIEVEMENT_COUNT = 28;
export const ACHIEVEMENT_MASK = (1 << ACHIEVEMENT_COUNT) - 1;
export const AVATAR_COUNT = 12;

// Bit positions within ACHIEVEMENT_ORDER (src/utils/AchievementSystem.ts) for
// the two multiplayer achievements. These are awarded server-side from the
// player's career totals because the client achievement system runs only in
// solo play. KEEP IN SYNC with the order of those two IDs.
export const ACHIEVEMENT_BIT = {
  teamPlayer: 1 << 16, // 'team_player' — play 10 multiplayer matches
  champion: 1 << 17, // 'champion' — win 5 multiplayer matches
} as const;

/**
 * Clamp a solo run to plausible bounds. Returns the sanitized values plus the
 * skill points that may be awarded (already capped).
 */
export function sanitizeSoloRun(rawScore: number, rawWave: number, rawKills: number) {
  const wave = clamp(rawWave, 0, MAX_WAVE);
  // Kills can't exceed what the waves could have spawned, or the absolute cap.
  const kills = clamp(rawKills, 0, Math.min(MAX_KILLS_PER_RUN, wave * MAX_KILLS_PER_WAVE));
  // Score can't exceed what those kills could plausibly produce, or the cap.
  const scoreCeiling = Math.min(MAX_SCORE, kills * SCORE_PER_KILL_CEILING + SCORE_BASE_ALLOWANCE);
  const score = clamp(rawScore, 0, scoreCeiling);

  const earned = clamp(
    Math.floor(wave / 2) + Math.floor(score / 10000),
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
