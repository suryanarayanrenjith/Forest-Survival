// Cosmetic Titles unlocked by achievements.
//
// The registry itself lives in `convex/achievementRegistry.ts` so the SERVER can
// validate an equipped title against the same whitelist the client renders from
// (`playerStats.equipTitle` rejects any title the player hasn't actually
// earned). This module is a thin client-side re-export of that shared source —
// keep it as a pass-through so the two can never drift.

export {
  TITLE_FOR_ACHIEVEMENT,
  availableTitlesFromMask,
  firstNewTitleFromMask,
} from '../../convex/achievementRegistry';
