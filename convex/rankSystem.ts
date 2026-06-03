/**
 * Server copy of the rank logic. Used by playerStats.getPublicProfile so a
 * private user's rank can be returned without exposing their detailed stats.
 *
 * ⚠️ KEEP IN SYNC with src/utils/rankSystem.ts — same weights + thresholds.
 */

export interface RankStatsInput {
  /** Difficulty-weighted SOLO rank accumulator (playerStats.rankXp, or the
   *  legacySoloRankXp() fallback for accounts predating it). */
  soloRankXp: number;
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
  xpForNextTier: number | null;
  nextTierName: string | null;
}

export const RANK_TIERS: { name: string; color: string; minXp: number }[] = [
  { name: 'Bronze', color: '#cd7f32', minXp: 0 },
  { name: 'Silver', color: '#cbd5e1', minXp: 1500 },
  { name: 'Gold', color: '#fbbf24', minXp: 5000 },
  { name: 'Platinum', color: '#5eead4', minXp: 12000 },
  { name: 'Diamond', color: '#67e8f9', minXp: 25000 },
  { name: 'Master', color: '#c084fc', minXp: 50000 },
  { name: 'Grandmaster', color: '#fb7185', minXp: 90000 },
  { name: 'Legend', color: '#f59e0b', minXp: 160000 },
];

const XP_PER_LEVEL = 400;

export function computeXp(stats: RankStatsInput): number {
  const { soloRankXp, multiplayer: mp, achievementsCount, skillsCount } = stats;
  // Solo rank is now a difficulty-weighted accumulator (rewards harder modes +
  // variety, decays for grinding easy — see convex/gameLimits.ts). Multiplayer
  // and meta progression add on top: performance (kills/wins) is what earns
  // rank, while merely *playing* a match is worth only a token amount.
  const xp =
    soloRankXp +
    // ── Multiplayer ──
    mp.wins * 350 +           // winning is the headline achievement
    mp.totalKills * 12 +      // kills heavily prioritized
    mp.gamesPlayed * 4 +      // participation only
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
