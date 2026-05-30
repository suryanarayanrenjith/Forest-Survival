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
    // Legacy single-field graphics pref (superseded by `settings` JSON blob;
    // kept optional so existing docs validate).
    graphicsQuality: v.optional(v.string()),
    // Full user settings synced for cross-device use, stored as a compact JSON
    // string (one field instead of ~13 columns — storage-efficient).
    settings: v.optional(v.string()),
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
});
