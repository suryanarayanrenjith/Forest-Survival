import { query, internalQuery, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  MAX_USERNAME_LENGTH,
  checkDisplayName,
  normalizeDisplayName,
  normalizeUsername,
} from "./authValidation";
import { rateLimiter } from "./rateLimiter";

export const currentUser = query({
  args: {},
  returns: v.union(
    v.object({
      userId: v.id("users"),
      name: v.string(),
      username: v.string(),
      image: v.union(v.string(), v.null()),
      createdAt: v.union(v.number(), v.null()),
      lastLoginAt: v.union(v.number(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }

    const user = await ctx.db.get(userId);
    if (user === null) {
      return null;
    }

    return {
      userId: user._id,
      name: user.name,
      username: user.username,
      image: user.image ?? null,
      createdAt: user.createdAt ?? null,
      lastLoginAt: user.lastLoginAt ?? null,
    };
  },
});

/**
 * Internal-only: the signed-in user's username + stored DOB. Used by the
 * password-change flow to verify identity. DOB is never exposed to public
 * queries.
 */
export const getAuthRecord = internalQuery({
  args: {},
  returns: v.union(
    v.object({ username: v.string(), dob: v.union(v.string(), v.null()) }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (user === null) return null;
    return { username: user.username, dob: user.dob ?? null };
  },
});

/**
 * Update the signed-in player's DISPLAY NAME (not the username — the username is
 * the permanent account handle and is never editable). Validated with the same
 * shared rules used at sign-up so a renamed account can't bypass the filters.
 */
export const updateDisplayName = mutation({
  args: { name: v.string() },
  returns: v.null(),
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new ConvexError("Sign in to change your name.");
    const normalized = normalizeDisplayName(name);
    const error = checkDisplayName(normalized);
    if (error) throw new ConvexError(error);
    // The display name is rendered on other players' screens (lobby, kill feed,
    // leaderboard), so cap how fast it can be churned. Checked after validation
    // so a rejected name never costs a token.
    const { ok } = await rateLimiter.limit(ctx, "profileWrite", { key: userId });
    if (!ok) throw new ConvexError("Slow down a moment, then try again.");
    await ctx.db.patch(userId, { name: normalized });
    return null;
  },
});

export const usernameExists = query({
  args: {
    username: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, { username }) => {
    const normalizedUsername = normalizeUsername(username);
    // No account id can exceed MAX_USERNAME_LENGTH (checkUsername enforces it at
    // sign-up), so anything longer is a miss by definition — bound it before it
    // reaches the index rather than passing an unbounded key to the engine.
    if (!normalizedUsername || normalizedUsername.length > MAX_USERNAME_LENGTH) {
      return false;
    }

    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", normalizedUsername),
      )
      .unique();

    return account !== null;
  },
});