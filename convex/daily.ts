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
import { rateLimiter } from "./rateLimiter";

// The challenge catalogue + the day-rotation now live in the SHARED registry
// (convex/dailyChallengeRegistry.ts) — one list, one picker, imported by both
// this server module and the client, so the two can never disagree about which
// challenge a day rolls or what its goal is. `getDailyChallenge` is the
// prototype-safe lookup (an id like "constructor" resolves to null, never to
// an inherited truthy value).
import { challengeIdForDay, getDailyChallenge } from "./dailyChallengeRegistry";

/** Today's UTC day string in the same format the client uses. */
function utcDayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Per-challenge completion goal, or null for an unknown/malformed id. */
function goalFor(challengeId: string): number | null {
  return getDailyChallenge(challengeId)?.goal ?? null;
}

/**
 * Activity calendar source for the Profile (GitHub-style heatmap). Every day the
 * player actually plays writes/updates a `dailyProgress` row (the daily
 * challenge advances as they play), so those rows ARE the activity log — no
 * extra storage or write path needed. Returns one entry per active day in the
 * last ~53 weeks, with an intensity `level` (1–4) derived from how far they got
 * on that day's challenge. `day` is the UTC "YYYY-MM-DD" string.
 */
export const getActivity = query({
  args: {},
  returns: v.object({
    days: v.array(v.object({ day: v.string(), level: v.number() })),
  }),
  handler: async (ctx: QueryCtx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { days: [] };

    // 53 weeks + a few days of slack so the oldest visible column is covered.
    const cutoff = new Date(Date.now() - 372 * 86_400_000).toISOString().slice(0, 10);
    const rows = await ctx.db
      .query("dailyProgress")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const days = rows
      .filter((r) => r.utcDay >= cutoff)
      .map((r) => {
        const goal = goalFor(r.challengeId);
        const frac = goal ? Math.min(1, r.progress / goal) : r.progress > 0 ? 0.5 : 0;
        // Any active day is at least level 1; completion (claimed or goal met) is 4.
        const level = r.claimed || frac >= 1 ? 4 : frac >= 0.6 ? 3 : frac >= 0.3 ? 2 : 1;
        return { day: r.utcDay, level };
      });

    return { days };
  },
});

/** Read the caller's daily row for today. Returns null when not signed in. */
export const getDaily = query({
  args: {},
  returns: v.union(
    v.object({
      utcDay: v.string(),
      challengeId: v.string(),
      progress: v.number(),
      claimed: v.boolean(),
    }),
    v.null(),
  ),
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
      challengeId: existing?.challengeId ?? challengeIdForDay(utcDay),
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
  returns: v.object({ progress: v.number(), throttled: v.boolean() }),
  handler: async (ctx: MutationCtx, { challengeId, progress }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Not authenticated");
    if (!Number.isFinite(progress) || progress < 0) {
      throw new ConvexError("Invalid progress");
    }
    const utcDay = utcDayString();
    const expectedId = challengeIdForDay(utcDay);
    if (challengeId !== expectedId) {
      // Wrong day's challenge — ignore silently rather than throw so a
      // straggling client write doesn't surface as an error in the UI.
      return { progress: 0, throttled: false };
    }
    const goal = goalFor(expectedId);
    if (goal === null) {
      // Registry drift (a rolled id with no goal) — report it as a normal,
      // readable failure instead of letting `Math.min(undefined, …)` produce a
      // NaN that fails schema validation as an opaque "Server Error".
      throw new ConvexError("Today's challenge is unavailable. Please try again later.");
    }
    // The browser is not authoritative, but it must never be able to store
    // arbitrary-sized values or exceed a challenge's actual completion goal.
    const boundedProgress = Math.min(goal, Math.floor(progress));

    const existing = await ctx.db
      .query("dailyProgress")
      .withIndex("by_user_day", (q) =>
        q.eq("userId", userId).eq("utcDay", utcDay),
      )
      .unique();
    const { ok } = await rateLimiter.limit(ctx, "dailyProgress", { key: userId });
    if (!ok) return { progress: existing?.progress ?? 0, throttled: true };

    // Self-heal a stale row: if the row was created under a DIFFERENT
    // challenge id for the same day (only possible when a deploy changes the
    // rotation mid-day), its progress belongs to another metric entirely —
    // rebind the row to today's real challenge and start its progress from
    // this write instead of max()ing incompatible numbers together.
    if (existing && existing.challengeId !== expectedId) {
      await ctx.db.patch(existing._id, {
        challengeId: expectedId,
        progress: boundedProgress,
        updatedAt: Date.now(),
      });
      return { progress: boundedProgress, throttled: false };
    }

    const nextProgress = Math.max(existing?.progress ?? 0, boundedProgress);
    if (existing) {
      if (nextProgress === existing.progress) {
        return { progress: existing.progress, throttled: false };
      }
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
    return { progress: nextProgress, throttled: false };
  },
});

/** Grant the +1 skill-point reward for completing today's challenge. */
export const claim = mutation({
  args: {},
  returns: v.object({ granted: v.number() }),
  handler: async (ctx: MutationCtx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Not authenticated");

    // Claiming grants a skill point. It is idempotent (the `claimed` flag is the
    // real guard) but was the only unthrottled write in this file, so a script
    // could still hammer it; the reward path deserves the same ceiling as the
    // progress path.
    const { ok } = await rateLimiter.limit(ctx, "dailyClaim", { key: userId });
    if (!ok) throw new ConvexError("Please wait a moment before claiming again.");

    const utcDay = utcDayString();
    const row = await ctx.db
      .query("dailyProgress")
      .withIndex("by_user_day", (q) =>
        q.eq("userId", userId).eq("utcDay", utcDay),
      )
      .unique();
    if (!row) throw new ConvexError("No daily progress yet");
    if (row.claimed) return { granted: 0 };

    // Goal for the rolled challenge — resolved through the SHARED registry
    // (convex/dailyChallengeRegistry.ts), the same source the client uses.
    const goal = goalFor(row.challengeId);
    if (goal === null || row.progress < goal) {
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
