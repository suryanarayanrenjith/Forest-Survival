// Overall account rank + level from a composite XP across solo, multiplayer,
// achievements and skills.
//
// The tiers, weights and thresholds live in `convex/rankSystem.ts` — the server
// uses them in getPublicProfile so a private user's rank can be shown without
// exposing their detailed stats. This module is a thin client-side re-export of
// that single source (the same shared-module pattern as achievementRegistry and
// dailyChallengeRegistry), so the client and server can never drift. The legacy
// solo fallback likewise comes straight from convex/gameLimits.

export {
  RANK_TIERS,
  computeXp,
  computeRank,
  type RankInfo,
  type RankStatsInput,
} from '../../convex/rankSystem';
export { legacySoloRankXp } from '../../convex/gameLimits';
