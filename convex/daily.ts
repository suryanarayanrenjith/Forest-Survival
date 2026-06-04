// Daily Challenge backend.
//
// One row per (user, utcDay). Each row tracks progress against the day's
// auto-rolled challenge id, and a `claimed` flag so the +1 skill point reward
// can only be granted once. The client (App.tsx) writes progress in throttled
// batches; the MainMenu reads `getDaily` to render the card.

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { MAX_TOTAL_SKILL_POINTS } from "./gameLimits";

/** Today's UTC day string in the same format the client uses. */
function utcDayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Deterministic UTC-day-seeded daily-challenge picker. Mirrors
 *  src/utils/DailyChallengeRegistry.ts::getTodayChallengeId so server +
 *  client agree on which challenge today is. */
const DAILY_CHALLENGE_IDS = [
  "kill_100",
  "reach_wave_10",
  "headshot_25",
  "flawless_3_waves",
  "survive_pistol_only",
];

function todayChallengeId(utcDay: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < utcDay.length; i++) {
    h ^= utcDay.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const idx = (h >>> 0) % DAILY_CHALLENGE_IDS.length;
  return DAILY_CHALLENGE_IDS[idx];
}

/** Read the caller's daily row for today. Returns null when not signed in. */
export const getDaily = query({
  args: {},
  handler: async (ctx: QueryCtx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const utcDay = utcDayString();
    const existing = await ctx.db
      .query("dailyProgress")
      .withIndex("by_user_day", (q) =>
        q.eq("userId", userId).eq("utcDay", utcDay),
      )
      .unique();
    return {
      utcDay,
      challengeId: existing?.challengeId ?? todayChallengeId(utcDay),
      progress: existing?.progress ?? 0,
      claimed: existing?.claimed ?? false,
    };
  },
});

/** Tick progress against today's challenge. Idempotent for the bounded
 *  client-side accumulator — the client sends a CUMULATIVE total, not a
 *  delta, so a duplicated network message can't double-count. The mutation
 *  takes the MAX of the existing and incoming value. */
export const recordProgress = mutation({
  args: {
    challengeId: v.string(),
    progress: v.number(),
  },
  handler: async (ctx: MutationCtx, { challengeId, progress }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Not authenticated");
    if (!Number.isFinite(progress) || progress < 0) {
      throw new ConvexError("Invalid progress");
    }
    const utcDay = utcDayString();
    const expectedId = todayChallengeId(utcDay);
    if (challengeId !== expectedId) {
      // Wrong day's challenge — ignore silently rather than throw so a
      // straggling client write doesn't surface as an error in the UI.
      return;
    }
    const existing = await ctx.db
      .query("dailyProgress")
      .withIndex("by_user_day", (q) =>
        q.eq("userId", userId).eq("utcDay", utcDay),
      )
      .unique();
    const nextProgress = Math.max(existing?.progress ?? 0, Math.floor(progress));
    if (existing) {
      if (nextProgress === existing.progress) return;
      await ctx.db.patch(existing._id, {
        progress: nextProgress,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("dailyProgress", {
        userId,
        utcDay,
        challengeId,
        progress: nextProgress,
        claimed: false,
        updatedAt: Date.now(),
      });
    }
  },
});

/** Grant the +1 skill-point reward for completing today's challenge. */
export const claim = mutation({
  args: {},
  handler: async (ctx: MutationCtx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Not authenticated");
    const utcDay = utcDayString();
    const row = await ctx.db
      .query("dailyProgress")
      .withIndex("by_user_day", (q) =>
        q.eq("userId", userId).eq("utcDay", utcDay),
      )
      .unique();
    if (!row) throw new ConvexError("No daily progress yet");
    if (row.claimed) return { granted: 0 };

    // Look up the goal for the rolled challenge — must agree with the
    // client-side registry. Inlining the goals avoids importing a TS file
    // that lives outside /convex.
    const goals: Record<string, number> = {
      kill_100: 100,
      reach_wave_10: 10,
      headshot_25: 25,
      flawless_3_waves: 3,
      survive_pistol_only: 30,
    };
    const goal = goals[row.challengeId];
    if (goal === undefined || row.progress < goal) {
      throw new ConvexError("Not eligible to claim");
    }

    // Grant +1 skill point on playerStats, bounded by the global cap.
    const stats = await ctx.db
      .query("playerStats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!stats) throw new ConvexError("No player stats");
    const nextPoints = Math.min(MAX_TOTAL_SKILL_POINTS, stats.skillPoints + 1);
    if (nextPoints !== stats.skillPoints) {
      await ctx.db.patch(stats._id, {
        skillPoints: nextPoints,
        updatedAt: Date.now(),
      });
    }
    await ctx.db.patch(row._id, { claimed: true, updatedAt: Date.now() });
    return { granted: nextPoints - stats.skillPoints };
  },
});
