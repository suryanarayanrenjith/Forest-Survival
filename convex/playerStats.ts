import { mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { SKILL_REGISTRY } from "./skillRegistry";
import { computeRank } from "./rankSystem";
import { rateLimiter } from "./rateLimiter";
import {
  clamp,
  sanitizeSoloRun,
  sanitizeMultiplayerResult,
  ACHIEVEMENT_MASK,
  ACHIEVEMENT_BIT,
  AVATAR_COUNT,
  MAX_TOTAL_SKILL_POINTS,
  normalizeDifficulty,
  DIFFICULTY_CODE,
  computeRunRankXp,
  pushRecentDiff,
  legacySoloRankXp,
  MAX_TOTAL_RANK_XP,
} from "./gameLimits";

function popcount(value: number): number {
  let count = 0;
  let bits = value >>> 0;
  while (bits) {
    bits &= bits - 1;
    count += 1;
  }
  return count;
}

const rankValidator = v.object({
  tierIndex: v.number(),
  tierName: v.string(),
  color: v.string(),
  level: v.number(),
  xp: v.number(),
  xpIntoTier: v.number(),
  xpForNextTier: v.union(v.number(), v.null()),
  nextTierName: v.union(v.string(), v.null()),
});

const soloValidator = v.object({
  highScore: v.number(),
  highestWave: v.number(),
  totalKills: v.number(),
  totalRuns: v.number(),
});

const multiplayerValidator = v.object({
  highScore: v.number(),
  wins: v.number(),
  gamesPlayed: v.number(),
  totalKills: v.number(),
  totalDeaths: v.number(),
});

function defaultStats(userId: Id<"users">) {
  const now = Date.now();
  return {
    userId,
    skillPoints: 0,
    skills: {} as Record<string, number>,
    achievements: 0,
    avatarIndex: 0,
    statsPublic: true,
    leaderboardOptIn: true,
    rankXp: 0,
    recentDiffs: [] as number[],
    settings: undefined as string | undefined,
    weaponMastery: {} as Record<string, number>,
    equippedTitle: undefined as string | undefined,
    solo: { highScore: 0, highestWave: 0, totalKills: 0, totalRuns: 0 },
    multiplayer: { highScore: 0, wins: 0, gamesPlayed: 0, totalKills: 0, totalDeaths: 0 },
    updatedAt: now,
  };
}

async function findStats(ctx: QueryCtx, userId: Id<"users">): Promise<Doc<"playerStats"> | null> {
  return await ctx.db
    .query("playerStats")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

async function getOrCreateStats(ctx: MutationCtx, userId: Id<"users">): Promise<Doc<"playerStats">> {
  const existing = await findStats(ctx, userId);
  if (existing) return existing;
  const id = await ctx.db.insert("playerStats", defaultStats(userId));
  return (await ctx.db.get(id))!;
}

const statsValidator = v.object({
  skillPoints: v.number(),
  skills: v.record(v.string(), v.number()),
  achievements: v.number(),
  avatarIndex: v.number(),
  statsPublic: v.boolean(),
  leaderboardOptIn: v.boolean(),
  rankXp: v.number(),
  settings: v.union(v.string(), v.null()),
  weaponMastery: v.record(v.string(), v.number()),
  equippedTitle: v.union(v.string(), v.null()),
  solo: v.object({
    highScore: v.number(),
    highestWave: v.number(),
    totalKills: v.number(),
    totalRuns: v.number(),
  }),
  multiplayer: v.object({
    highScore: v.number(),
    wins: v.number(),
    gamesPlayed: v.number(),
    totalKills: v.number(),
    totalDeaths: v.number(),
  }),
});

/** Current user's persistent progression (defaults when no doc exists yet). */
export const getPlayerStats = query({
  args: {},
  returns: v.union(statsValidator, v.null()),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;

    const stats = await findStats(ctx, userId);
    const base = stats ?? defaultStats(userId);
    return {
      skillPoints: base.skillPoints,
      skills: base.skills,
      achievements: base.achievements,
      avatarIndex: base.avatarIndex ?? 0,
      statsPublic: base.statsPublic ?? true,
      leaderboardOptIn: base.leaderboardOptIn ?? true,
      // Lazy migration: legacy docs without a rankXp accumulator fall back to
      // the old aggregate formula so their rank doesn't reset to zero.
      rankXp: base.rankXp ?? legacySoloRankXp(base.solo),
      settings: base.settings ?? null,
      weaponMastery: base.weaponMastery ?? {},
      equippedTitle: base.equippedTitle ?? null,
      solo: base.solo,
      multiplayer: base.multiplayer,
    };
  },
});

/**
 * Record a finished Solo run. Updates bests + totals and awards persistent
 * skill points. Points are deliberately scarce (vs. the old 1-per-kill) so the
 * tree is a real, competitive grind.
 */
export const submitSoloRun = mutation({
  args: {
    score: v.number(),
    wave: v.number(),
    kills: v.number(),
    // Difficulty the run was played on — drives the difficulty-weighted rank XP
    // + skill-point payouts. Optional so older clients still submit cleanly.
    difficulty: v.optional(v.string()),
  },
  returns: v.object({
    skillPointsEarned: v.number(),
    skillPoints: v.number(),
    rankXpEarned: v.number(),
    rankXp: v.number(),
  }),
  handler: async (ctx, { score, wave, kills, difficulty }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new ConvexError("Sign in to save your progress.");

    const stats = await getOrCreateStats(ctx, userId);
    const prevRankXp = stats.rankXp ?? legacySoloRankXp(stats.solo);

    // Throttle scripted farming. On limit, no-op (return current totals) rather
    // than error, so a legit rapid restart never shows a scary message.
    const { ok } = await rateLimiter.limit(ctx, "soloRun", { key: userId });
    if (!ok) {
      return { skillPointsEarned: 0, skillPoints: stats.skillPoints, rankXpEarned: 0, rankXp: prevRankXp };
    }

    const diff = normalizeDifficulty(difficulty ?? "medium");
    const diffCode = DIFFICULTY_CODE[diff];

    // Clamp untrusted client values to plausible bounds before persisting.
    const { score: safeScore, wave: safeWave, kills: safeKills, earned } =
      sanitizeSoloRun(score, wave, kills, diff);

    // Difficulty-weighted, anti-grind rank XP for THIS run (uses the rolling
    // window of prior runs so repeated easy runs decay, switching up boosts).
    const rankXpEarned = computeRunRankXp(safeScore, safeWave, safeKills, diffCode, stats.recentDiffs);
    const rankXp = clamp(prevRankXp + rankXpEarned, 0, MAX_TOTAL_RANK_XP);
    const recentDiffs = pushRecentDiff(stats.recentDiffs, diffCode);

    const solo = {
      highScore: Math.max(stats.solo.highScore, safeScore),
      highestWave: Math.max(stats.solo.highestWave, safeWave),
      totalKills: stats.solo.totalKills + safeKills,
      totalRuns: stats.solo.totalRuns + 1,
    };
    const skillPoints = clamp(stats.skillPoints + earned, 0, MAX_TOTAL_SKILL_POINTS);

    await ctx.db.patch(stats._id, { solo, skillPoints, rankXp, recentDiffs, updatedAt: Date.now() });
    return { skillPointsEarned: earned, skillPoints, rankXpEarned, rankXp };
  },
});

/** Record a finished Multiplayer match. */
export const submitMultiplayerResult = mutation({
  args: {
    score: v.number(),
    kills: v.number(),
    deaths: v.number(),
    won: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { score, kills, deaths, won }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new ConvexError("Sign in to save your progress.");

    const stats = await getOrCreateStats(ctx, userId);

    // Throttle scripted result spamming (no-op on limit).
    const { ok } = await rateLimiter.limit(ctx, "mpResult", { key: userId });
    if (!ok) return null;

    // Clamp untrusted client values (P2P results are reported by the client).
    const { score: safeScore, kills: safeKills, deaths: safeDeaths } =
      sanitizeMultiplayerResult(score, kills, deaths);

    const multiplayer = {
      highScore: Math.max(stats.multiplayer.highScore, safeScore),
      wins: stats.multiplayer.wins + (won ? 1 : 0),
      gamesPlayed: stats.multiplayer.gamesPlayed + 1,
      totalKills: stats.multiplayer.totalKills + safeKills,
      totalDeaths: stats.multiplayer.totalDeaths + safeDeaths,
    };

    // Award the career multiplayer achievements (idempotent bitwise OR). The
    // client achievement system is solo-only, so these are evaluated here.
    let achievements = stats.achievements;
    if (multiplayer.gamesPlayed >= 10) achievements |= ACHIEVEMENT_BIT.teamPlayer;
    if (multiplayer.wins >= 5) achievements |= ACHIEVEMENT_BIT.champion;

    await ctx.db.patch(stats._id, { multiplayer, achievements, updatedAt: Date.now() });
    return null;
  },
});

/**
 * Server-authoritative skill unlock: validates cost + prerequisites against
 * the registry, spends points, and bumps the skill level.
 */
export const unlockSkill = mutation({
  args: { skillId: v.string() },
  returns: v.object({
    skillPoints: v.number(),
    skills: v.record(v.string(), v.number()),
  }),
  handler: async (ctx, { skillId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new ConvexError("Sign in to spend skill points.");

    const def = SKILL_REGISTRY[skillId];
    if (!def) throw new ConvexError("Unknown skill.");

    const stats = await getOrCreateStats(ctx, userId);
    const skills = { ...stats.skills };
    const currentLevel = skills[skillId] ?? 0;

    if (currentLevel >= def.maxLevel) throw new ConvexError("Skill already maxed.");
    if (stats.skillPoints < def.cost) throw new ConvexError("Not enough skill points.");

    for (const required of def.requires) {
      if ((skills[required] ?? 0) < 1) {
        throw new ConvexError("Requirements not met.");
      }
    }

    skills[skillId] = currentLevel + 1;
    const skillPoints = stats.skillPoints - def.cost;

    await ctx.db.patch(stats._id, { skills, skillPoints, updatedAt: Date.now() });
    return { skillPoints, skills };
  },
});

/**
 * Merge newly-unlocked achievements (idempotent bitwise OR over the ordered
 * achievement registry). Returns the merged mask.
 */
export const mergeAchievements = mutation({
  args: { mask: v.number() },
  returns: v.object({ achievements: v.number() }),
  handler: async (ctx, { mask }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new ConvexError("Sign in to save achievements.");

    const stats = await getOrCreateStats(ctx, userId);

    // Drop any bits outside the known achievement set so a crafted mask can't
    // light up phantom achievements (which would inflate rank XP).
    const safeMask = Math.max(0, Math.floor(mask)) & ACHIEVEMENT_MASK;

    // Throttle (no-op on limit) — achievements unlock a few at a time per run.
    const { ok } = await rateLimiter.limit(ctx, "achievementSync", { key: userId });
    if (!ok) return { achievements: stats.achievements };

    const achievements = stats.achievements | safeMask;
    if (achievements !== stats.achievements) {
      await ctx.db.patch(stats._id, { achievements, updatedAt: Date.now() });
    }
    return { achievements };
  },
});

/** Set the player's avatar (stored as an index into the predefined set). */
export const setAvatar = mutation({
  args: { avatarIndex: v.number() },
  returns: v.null(),
  handler: async (ctx, { avatarIndex }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new ConvexError("Sign in to change your avatar.");
    const stats = await getOrCreateStats(ctx, userId);
    await ctx.db.patch(stats._id, {
      avatarIndex: clamp(avatarIndex, 0, AVATAR_COUNT - 1),
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Toggle whether other players can see this player's detailed stats. */
export const setStatsPrivacy = mutation({
  args: { isPublic: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { isPublic }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new ConvexError("Sign in to change privacy.");
    const stats = await getOrCreateStats(ctx, userId);
    await ctx.db.patch(stats._id, { statsPublic: isPublic, updatedAt: Date.now() });
    return null;
  },
});

/** Toggle whether this player appears on the global leaderboard (opt-out). */
export const setLeaderboardOptIn = mutation({
  args: { optIn: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { optIn }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new ConvexError("Sign in to change leaderboard visibility.");
    const stats = await getOrCreateStats(ctx, userId);
    await ctx.db.patch(stats._id, { leaderboardOptIn: optIn, updatedAt: Date.now() });
    return null;
  },
});

const MAX_SETTINGS_BYTES = 4000;

/**
 * Persist the player's full settings (volumes, sensitivity, FOV, graphics
 * quality, crosshair, toggles…) as a compact JSON blob for cross-device sync.
 */
export const setSettings = mutation({
  args: { settings: v.string() },
  returns: v.null(),
  handler: async (ctx, { settings }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null; // preference only — never hard-fail
    if (settings.length > MAX_SETTINGS_BYTES) return null; // guard runaway blobs
    const stats = await getOrCreateStats(ctx, userId);
    await ctx.db.patch(stats._id, { settings, updatedAt: Date.now() });
    return null;
  },
});

// === WEAPON MASTERY ===
// Per-weapon XP grant. Clients send a bounded XP delta with the kill so the
// server can sanity-check (no negative, no jumbo grants). Mastery XP caps at
// the max-level threshold per weapon so the record never bloats.
const VALID_WEAPON_IDS = new Set([
  "pistol", "rifle", "shotgun", "smg", "sniper", "minigun", "launcher", "subverter",
]);
const MASTERY_MAX_XP_PER_WEAPON = 4000;
const MASTERY_MAX_XP_DELTA = 200; // single mutation can grant at most 200 XP

// === COSMETIC TITLES ===
// The actual list of available titles is derived client-side from the
// player's achievement bitmask (kept lean — no per-row server query). The
// server just persists whichever title the player has equipped.
const MAX_TITLE_LENGTH = 40;
export const equipTitle = mutation({
  args: { title: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { title }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    if (title !== null && title.length > MAX_TITLE_LENGTH) return null;
    const stats = await getOrCreateStats(ctx, userId);
    if ((stats.equippedTitle ?? null) === title) return null;
    await ctx.db.patch(stats._id, {
      equippedTitle: title ?? undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const addWeaponMasteryXp = mutation({
  args: {
    weaponId: v.string(),
    xpDelta: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, { weaponId, xpDelta }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return 0; // preference only — never hard-fail
    if (!VALID_WEAPON_IDS.has(weaponId)) return 0;
    if (!Number.isFinite(xpDelta) || xpDelta <= 0) return 0;
    const delta = Math.min(MASTERY_MAX_XP_DELTA, Math.floor(xpDelta));
    const stats = await getOrCreateStats(ctx, userId);
    const current = stats.weaponMastery ?? {};
    const before = current[weaponId] ?? 0;
    const after = Math.min(MASTERY_MAX_XP_PER_WEAPON, before + delta);
    if (after === before) return after;
    await ctx.db.patch(stats._id, {
      weaponMastery: { ...current, [weaponId]: after },
      updatedAt: Date.now(),
    });
    return after;
  },
});

/**
 * Public profile for viewing other players (e.g. in a multiplayer lobby).
 * Rank + avatar are ALWAYS returned (computed server-side). Detailed stats are
 * included only when the target has set their profile to public.
 */
export const getPublicProfile = query({
  args: { username: v.string() },
  returns: v.union(
    v.object({
      username: v.string(),
      displayName: v.string(),
      avatarIndex: v.number(),
      isPrivate: v.boolean(),
      /** True when the viewer is looking at their OWN profile — the client
       *  shows full stats in this case even when isPrivate is set. */
      isOwnProfile: v.boolean(),
      rank: rankValidator,
      skillPoints: v.optional(v.number()),
      skillsCount: v.optional(v.number()),
      achievementsCount: v.optional(v.number()),
      achievements: v.optional(v.number()),
      solo: v.optional(soloValidator),
      multiplayer: v.optional(multiplayerValidator),
    }),
    v.null(),
  ),
  handler: async (ctx, { username }) => {
    const normalized = username.trim().toLowerCase();
    if (!normalized) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", normalized))
      .unique();
    if (!user) return null;

    const stats = await findStats(ctx, user._id);
    const base = stats ?? defaultStats(user._id);
    const achievementsCount = popcount(base.achievements);
    const skillsCount = Object.keys(base.skills).length;
    const rank = computeRank({
      soloRankXp: base.rankXp ?? legacySoloRankXp(base.solo),
      multiplayer: {
        wins: base.multiplayer.wins,
        gamesPlayed: base.multiplayer.gamesPlayed,
        totalKills: base.multiplayer.totalKills,
      },
      achievementsCount,
      skillsCount,
    });

    const isPublic = base.statsPublic ?? true;

    // A player can ALWAYS see their own stats — privacy only hides them from
    // other players. So if the authenticated viewer owns this profile, reveal
    // the detail fields regardless of the privacy toggle.
    const viewerId = await getAuthUserId(ctx);
    const isOwnProfile = viewerId !== null && viewerId === user._id;
    const canSeeDetails = isPublic || isOwnProfile;

    // Always return the same shape (single object type). Detailed fields are
    // omitted (undefined) when the player keeps their stats private AND the
    // viewer isn't the owner — rank and avatar always come through.
    return {
      username: user.username,
      displayName: user.name,
      avatarIndex: base.avatarIndex ?? 0,
      isPrivate: !isPublic,
      isOwnProfile,
      rank,
      skillPoints: canSeeDetails ? base.skillPoints : undefined,
      skillsCount: canSeeDetails ? skillsCount : undefined,
      achievementsCount: canSeeDetails ? achievementsCount : undefined,
      achievements: canSeeDetails ? base.achievements : undefined,
      solo: canSeeDetails ? base.solo : undefined,
      multiplayer: canSeeDetails ? base.multiplayer : undefined,
    };
  },
});
