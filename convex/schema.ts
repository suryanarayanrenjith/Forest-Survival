import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.string(),
    username: v.string(),
    email: v.string(),
    image: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    createdAt: v.optional(v.number()),
    lastLoginAt: v.optional(v.number()),
    // Date of birth (YYYY-MM-DD), collected at sign-up onboarding. Used as a
    // second factor when changing the password. Optional for legacy accounts.
    dob: v.optional(v.string()),
  }).index("by_username", ["username"]),

  // One record per device fingerprint. Caps how many accounts a single
  // device can register, the core anti-multi-account lever (Convex can't
  // see client IPs inside mutations, so the fingerprint is our best signal).
  deviceAccounts: defineTable({
    fingerprint: v.string(),
    accountCount: v.number(),
    usernames: v.array(v.string()),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
  }).index("by_fingerprint", ["fingerprint"]),

  // Single counter row keyed "signups" — atomic global signup cap so we stay
  // within the Convex free plan.
  appMeta: defineTable({
    key: v.string(),
    totalUsers: v.number(),
    maxUsers: v.number(),
  }).index("by_key", ["key"]),

  // One document per user holds ALL persistent progression. Storage-efficient:
  //  - skills: only unlocked skills present (skillId -> level)
  //  - achievements: a single bitmask integer over an ordered registry
  //  - solo / multiplayer: nested stat objects (one read, one write per update)
  playerStats: defineTable({
    userId: v.id("users"),
    skillPoints: v.number(),
    skills: v.record(v.string(), v.number()),
    achievements: v.number(),
    // Identity + preferences (optional so pre-existing docs stay valid).
    avatarIndex: v.optional(v.number()),
    statsPublic: v.optional(v.boolean()),
    // Whether this player appears on the global leaderboard. Visible unless
    // explicitly set to false (opt-out), so existing accounts show by default.
    leaderboardOptIn: v.optional(v.boolean()),
    // Difficulty-weighted SOLO rank accumulator (the headline progression
    // value). Grows per finished run by an amount scaled by difficulty +
    // anti-grind variety. Absent on legacy docs → derived from `solo` aggregates
    // via legacySoloRankXp() until the next run writes it (lazy migration).
    rankXp: v.optional(v.number()),
    // Rolling window (max 8) of recent solo-run difficulty codes
    // (0=easy,1=medium,2=hard,3=adaptive). Drives the diminishing-returns /
    // variety math so grinding one difficulty (esp. easy) decays its payout.
    recentDiffs: v.optional(v.array(v.number())),
    // DEPRECATED legacy graphics pref. Superseded by the `graphics` section
    // inside the `settings` blob below. New docs never write it, and
    // `setSettings` actively STRIPS it from any doc it touches (patch →
    // undefined). Kept declared `v.optional` ONLY so untouched legacy docs still
    // validate — do NOT remove this line until every doc is confirmed migrated
    // (Convex validates the whole document on write, so a premature removal
    // would break patches on docs that still carry the field).
    graphicsQuality: v.optional(v.string()),
    // Full user settings synced for cross-device use, stored as ONE compact,
    // SPARSE JSON string (only non-default values; includes a `graphics`
    // section). One field instead of per-setting columns — storage-efficient.
    settings: v.optional(v.string()),
    // Per-weapon cumulative XP (weaponId → xp). Levels are derived client-side
    // from XP via WeaponMasterySystem. Optional so legacy docs still validate.
    weaponMastery: v.optional(v.record(v.string(), v.number())),
    // Cosmetic title displayed in the kill feed. Equipped automatically the
    // first time the player unlocks a title-granting achievement, or chosen
    // explicitly via Profile in a future iteration.
    equippedTitle: v.optional(v.string()),
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
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Photo Mode captures. Storage-efficient: each row holds only a pointer to
  // the file in Convex storage + a timestamp. A hard per-user cap (enforced in
  // photos.ts) keeps total file storage bounded on the free plan.
  playerPhotos: defineTable({
    userId: v.id("users"),
    storageId: v.id("_storage"),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  // Daily Challenges — one row per (user, utcDay). Tracks progress against the
  // day's auto-rolled challenge and whether the +1 skill point reward has been
  // claimed yet. Rows older than 7 days are safe to GC (no read flows depend
  // on history; the "today" lookup uses `by_user_day`).
  dailyProgress: defineTable({
    userId: v.id("users"),
    /** UTC calendar day in "YYYY-MM-DD" form (deterministic seed for the day's roll). */
    utcDay: v.string(),
    /** Rolled challenge id (matches DailyChallengeRegistry on the client). */
    challengeId: v.string(),
    progress: v.number(),
    claimed: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_day", ["userId", "utcDay"]),
});
