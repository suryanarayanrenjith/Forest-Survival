/**
 * Overall account rank + level from a composite XP across solo, multiplayer,
 * achievements and skills.
 *
 * ⚠️ KEEP IN SYNC with convex/rankSystem.ts — Convex compiles separately, so
 * the server keeps its own copy (used by getPublicProfile so a private user's
 * rank can be computed without leaking their stats). Same weights + thresholds.
 */

export interface RankStatsInput {
  solo: { highScore: number; highestWave: number; totalKills: number; totalRuns: number };
  multiplayer: { wins: number; gamesPlayed: number; totalKills: number };
  achievementsCount: number;
  skillsCount: number;
}

export interface RankInfo {
  tierIndex: number;
  tierName: string;
  color: string;
  level: number;
  xp: number;
  xpIntoTier: number;
  xpForNextTier: number | null; // null at the top tier
  nextTierName: string | null;
}

export const RANK_TIERS: { name: string; color: string; minXp: number }[] = [
  { name: 'Bronze', color: '#cd7f32', minXp: 0 },
  { name: 'Silver', color: '#cbd5e1', minXp: 1500 },
  { name: 'Gold', color: '#fbbf24', minXp: 5000 },
  { name: 'Platinum', color: '#5eead4', minXp: 12000 },
  { name: 'Diamond', color: '#67e8f9', minXp: 25000 },
  { name: 'Master', color: '#c084fc', minXp: 50000 },
];

const XP_PER_LEVEL = 400;

export function computeXp(stats: RankStatsInput): number {
  const { solo, multiplayer: mp, achievementsCount, skillsCount } = stats;
  // Performance — kills and wins — is what earns rank. Merely *playing* a match
  // or run is worth only a token amount, so grinding empty (0-kill) games no
  // longer meaningfully ranks a player up. A single kill is worth more than a
  // whole no-kill match.
  const xp =
    // ── Solo ──
    solo.highScore * 0.05 +
    solo.highestWave * 50 +   // surviving deeper waves = skill
    solo.totalKills * 6 +     // kills heavily prioritized (was 2)
    solo.totalRuns * 2 +      // participation only (was 10)
    // ── Multiplayer ──
    mp.wins * 350 +           // winning is the headline achievement (was 200)
    mp.totalKills * 12 +      // kills heavily prioritized (was 3)
    mp.gamesPlayed * 4 +      // participation only (was 25)
    // ── Meta progression ──
    achievementsCount * 120 +
    skillsCount * 30;
  return Math.max(0, Math.floor(xp));
}

export function computeRank(stats: RankStatsInput): RankInfo {
  const xp = computeXp(stats);

  let tierIndex = 0;
  for (let i = RANK_TIERS.length - 1; i >= 0; i -= 1) {
    if (xp >= RANK_TIERS[i].minXp) {
      tierIndex = i;
      break;
    }
  }

  const tier = RANK_TIERS[tierIndex];
  const nextTier = RANK_TIERS[tierIndex + 1] ?? null;
  const xpIntoTier = xp - tier.minXp;
  const xpForNextTier = nextTier ? nextTier.minXp - tier.minXp : null;

  return {
    tierIndex,
    tierName: tier.name,
    color: tier.color,
    level: Math.floor(xp / XP_PER_LEVEL) + 1,
    xp,
    xpIntoTier,
    xpForNextTier,
    nextTierName: nextTier ? nextTier.name : null,
  };
}
