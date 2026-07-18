import { query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { computeRank } from "./rankSystem";
import { legacySoloRankXp } from "./gameLimits";

/**
 * Global leaderboard — ranked by composite account XP (difficulty-weighted solo
 * rank XP + multiplayer + meta progression; see convex/rankSystem.ts).
 *
 * The app is hard-capped at ~100 accounts (signupGuard / MAX_SIGNUPS), so a
 * full `playerStats` scan + in-memory sort is cheap AND always correct — no
 * denormalized sort column or migration job needed. Players are included
 * unless they explicitly opted OUT (`leaderboardOptIn === false`).
 */

function popcount(value: number): number {
  let count = 0;
  let bits = value >>> 0;
  while (bits) {
    bits &= bits - 1;
    count += 1;
  }
  return count;
}

const entryValidator = v.object({
  position: v.number(), // 1-based rank on the board
  username: v.string(),
  displayName: v.string(),
  avatarIndex: v.number(),
  tierName: v.string(),
  color: v.string(),
  level: v.number(),
  xp: v.number(),
  highScore: v.number(),
  highestWave: v.number(),
  isViewer: v.boolean(),
});

export const getLeaderboard = query({
  args: { limit: v.optional(v.number()) },
  returns: v.object({
    entries: v.array(entryValidator),
    total: v.number(),
    // The viewer's own entry + position when they're signed in (even if they
    // fall outside the returned top-N slice). Null when signed out / opted out.
    viewer: v.union(entryValidator, v.null()),
    viewerOptedOut: v.boolean(),
  }),
  handler: async (ctx, { limit }) => {
    // A non-finite `limit` used to propagate NaN through the clamp into
    // `rows.slice(0, NaN)`, which silently returns an EMPTY board rather than
    // erroring. Fall back to the default for anything that isn't a real number.
    const requested = Number.isFinite(limit) ? Math.floor(limit as number) : 50;
    const topN = Math.min(Math.max(requested, 1), 100);
    const viewerId = await getAuthUserId(ctx);

    const allStats = await ctx.db.query("playerStats").collect();

    // Build a ranked row per opted-in player (joining the user doc for identity).
    const rows = [] as {
      userId: string;
      username: string;
      displayName: string;
      avatarIndex: number;
      tierName: string;
      color: string;
      level: number;
      xp: number;
      highScore: number;
      highestWave: number;
    }[];

    for (const s of allStats) {
      if (s.leaderboardOptIn === false) continue; // explicit opt-out only
      const user = await ctx.db.get(s.userId);
      if (!user) continue;
      const rank = computeRank({
        soloRankXp: s.rankXp ?? legacySoloRankXp(s.solo),
        multiplayer: {
          wins: s.multiplayer.wins,
          gamesPlayed: s.multiplayer.gamesPlayed,
          totalKills: s.multiplayer.totalKills,
        },
        achievementsCount: popcount(s.achievements),
        skillsCount: Object.keys(s.skills).length,
      });
      rows.push({
        userId: s.userId,
        username: user.username,
        displayName: user.name,
        avatarIndex: s.avatarIndex ?? 0,
        tierName: rank.tierName,
        color: rank.color,
        level: rank.level,
        xp: rank.xp,
        highScore: s.solo.highScore,
        highestWave: s.solo.highestWave,
      });
    }

    // Highest XP first; ties broken by deeper wave then higher score.
    rows.sort((a, b) => b.xp - a.xp || b.highestWave - a.highestWave || b.highScore - a.highScore);

    const toEntry = (r: (typeof rows)[number], idx: number) => ({
      position: idx + 1,
      username: r.username,
      displayName: r.displayName,
      avatarIndex: r.avatarIndex,
      tierName: r.tierName,
      color: r.color,
      level: r.level,
      xp: r.xp,
      highScore: r.highScore,
      highestWave: r.highestWave,
      isViewer: viewerId !== null && r.userId === viewerId,
    });

    const entries = rows.slice(0, topN).map(toEntry);

    let viewer: ReturnType<typeof toEntry> | null = null;
    let viewerOptedOut = false;
    if (viewerId !== null) {
      const selfIdx = rows.findIndex((r) => r.userId === viewerId);
      if (selfIdx >= 0) {
        viewer = toEntry(rows[selfIdx], selfIdx);
      } else {
        // Signed in but not in the ranked rows → they opted out (or have no doc).
        const selfStats = allStats.find((s) => s.userId === viewerId);
        viewerOptedOut = selfStats?.leaderboardOptIn === false;
      }
    }

    return { entries, total: rows.length, viewer, viewerOptedOut };
  },
});
