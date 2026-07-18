// Daily Challenges — rotating "do X today, earn +1 skill point" goals.
//
// The catalogue, the event-channel definitions and the deterministic day
// rotation all live in `convex/dailyChallengeRegistry.ts` so the SERVER can
// validate ids/goals/claims against the exact same source the client tracks
// and renders from (same shared-module pattern as `convex/achievementRegistry`
// and `convex/authValidation`). This module is a thin client-side re-export —
// keep it a pass-through so the two sides can never drift.
//
// Mid-run the App.tsx loop ticks the relevant event channel (kills, headshots,
// waves, melee strikes, power-ups, score, minutes survived, …) on the local
// tracker, which flushes throttled writes to convex/daily.ts. When the player
// returns to the main menu the daily card shows progress/claim state.

export {
  DAILY_CHALLENGES,
  DAILY_CHALLENGE_IDS,
  DAILY_CHANNEL_MODE,
  getDailyChallenge,
  getTodayChallengeId,
  todayUtcDay,
  type DailyChallenge,
  type DailyChallengeId,
  type DailyChannelMode,
  type DailyEventChannel,
} from '../../convex/dailyChallengeRegistry';
