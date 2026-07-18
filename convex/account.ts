import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  getAuthSessionId,
  getAuthUserId,
  invalidateSessions,
  modifyAccountCredentials,
  retrieveAccount,
} from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { checkPassword, MAX_PASSWORD_LENGTH } from "./authValidation";

function validatePasswordRequirements(password: string) {
  const error = checkPassword(password);
  if (error !== null) {
    throw new ConvexError(error);
  }
}

export const changePassword = action({
  args: {
    currentPassword: v.string(),
    newPassword: v.string(),
    dob: v.string(),
  },
  handler: async (
    ctx,
    { currentPassword, newPassword, dob },
  ): Promise<{ userId: string; username: string }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError("You need to sign in before changing your password.");
    }

    const authRecord = await ctx.runQuery(internal.profile.getAuthRecord, {});
    if (authRecord === null) {
      throw new ConvexError("We could not find your account.");
    }

    // `retrieveAccount` verifies with Scrypt. Reject a deliberately huge
    // current-password value before it can consume expensive KDF work.
    if (currentPassword.length > MAX_PASSWORD_LENGTH) {
      throw new ConvexError(`Password is too long (max ${MAX_PASSWORD_LENGTH} characters).`);
    }

    // Verify date of birth as a second factor (when one is on file — legacy
    // accounts created before DOB collection are allowed through on password).
    if (authRecord.dob) {
      if (dob.trim() !== authRecord.dob) {
        throw new ConvexError("Date of birth does not match our records.");
      }
    }

    validatePasswordRequirements(newPassword);

    if (currentPassword === newPassword) {
      throw new ConvexError("Choose a new password that is different from the current one.");
    }

    try {
      await retrieveAccount(ctx, {
        provider: "password",
        account: {
          id: authRecord.username.toLowerCase(),
          secret: currentPassword,
        },
      });
    } catch {
      throw new ConvexError("Current password is incorrect.");
    }

    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: {
        id: authRecord.username.toLowerCase(),
        secret: newPassword,
      },
    });

    const currentSessionId = await getAuthSessionId(ctx);
    if (currentSessionId !== null) {
      await invalidateSessions(ctx, {
        userId,
        except: [currentSessionId],
      });
    }

    return {
      userId,
      username: authRecord.username,
    };
  },
});

/**
 * Irreversibly erase EVERYTHING tied to a user — leaving no trace of the
 * account, its username, or any of its data anywhere in the database.
 *
 * Internal-only: it takes a trusted `userId` and never re-checks the password
 * (the public `deleteAccount` action verifies the password BEFORE calling this).
 * Runs as a single mutation so the whole purge is atomic — either every row is
 * gone or none are.
 *
 * Tables covered (verified against schema.ts + the @convex-dev/auth authTables):
 *   • playerStats, dailyProgress, playerPhotos (+ their storage blobs)   — game data
 *   • authSessions, authRefreshTokens, authVerifiers                     — sessions
 *   • authAccounts (holds the username), authVerificationCodes,
 *     authRateLimits (keyed by the account id)                           — credentials
 *   • deviceAccounts (username removed, device slot freed)               — anti-abuse
 *   • appMeta "signups" counter (global slot freed)                      — caps
 *   • users (name / username / email / dob)                             — identity
 */
export const purgeUser = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    const username = user?.username ?? null;

    // ── Game data ────────────────────────────────────────────────────────────
    for (const row of await ctx.db
      .query("playerStats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()) {
      await ctx.db.delete(row._id);
    }

    for (const row of await ctx.db
      .query("dailyProgress")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()) {
      await ctx.db.delete(row._id);
    }

    // Photos carry a backing blob in file storage — delete the blob too so we
    // never leak orphaned files.
    for (const row of await ctx.db
      .query("playerPhotos")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()) {
      try {
        await ctx.storage.delete(row.storageId);
      } catch {
        // Blob already gone — keep purging the rest.
      }
      await ctx.db.delete(row._id);
    }

    // ── Sessions (+ their refresh tokens + PKCE verifiers) ────────────────────
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();
    const sessionIds = new Set<string>();
    for (const session of sessions) {
      sessionIds.add(session._id);
      for (const token of await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .collect()) {
        await ctx.db.delete(token._id);
      }
      await ctx.db.delete(session._id);
    }
    // authVerifiers have no by-session index (PKCE/OAuth bookkeeping — empty for
    // a password-only app), so scan and drop any tied to our deleted sessions.
    if (sessionIds.size > 0) {
      for (const verifier of await ctx.db.query("authVerifiers").collect()) {
        if (verifier.sessionId && sessionIds.has(verifier.sessionId)) {
          await ctx.db.delete(verifier._id);
        }
      }
    }

    // ── Credentials (the account row holds the username) ──────────────────────
    for (const account of await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect()) {
      for (const code of await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", account._id))
        .collect()) {
        await ctx.db.delete(code._id);
      }
      // The sign-in rate limiter keys its row on the account id.
      const limit = await ctx.db
        .query("authRateLimits")
        .withIndex("identifier", (q) => q.eq("identifier", account._id))
        .unique();
      if (limit) await ctx.db.delete(limit._id);
      await ctx.db.delete(account._id);
    }

    // ── Anti-abuse counters — scrub the username + free the device/global slot ─
    if (username) {
      for (const device of await ctx.db.query("deviceAccounts").collect()) {
        if (!device.usernames.includes(username)) continue;
        const usernames = device.usernames.filter((u) => u !== username);
        const accountCount = Math.max(0, device.accountCount - 1);
        if (accountCount === 0 && usernames.length === 0) {
          await ctx.db.delete(device._id);
        } else {
          await ctx.db.patch(device._id, { usernames, accountCount });
        }
      }
    }

    const meta = await ctx.db
      .query("appMeta")
      .withIndex("by_key", (q) => q.eq("key", "signups"))
      .unique();
    if (meta && meta.totalUsers > 0) {
      await ctx.db.patch(meta._id, { totalUsers: meta.totalUsers - 1 });
    }

    // ── Identity row last ─────────────────────────────────────────────────────
    if (user) await ctx.db.delete(userId);
    return null;
  },
});

/**
 * Permanently delete the signed-in user's account. Password-gated: the supplied
 * password is verified against the live credential BEFORE any data is touched,
 * then the whole account is purged via `purgeUser`. There is no recovery.
 */
export const deleteAccount = action({
  args: { password: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { password }): Promise<{ ok: boolean }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError("You need to sign in to delete your account.");
    }
    if (!password) {
      throw new ConvexError("Enter your password to confirm.");
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      throw new ConvexError(`Password is too long (max ${MAX_PASSWORD_LENGTH} characters).`);
    }

    const authRecord = await ctx.runQuery(internal.profile.getAuthRecord, {});
    if (authRecord === null) {
      throw new ConvexError("We could not find your account.");
    }

    // Verify the password against the live credential first — a wrong password
    // must never reach the purge.
    try {
      await retrieveAccount(ctx, {
        provider: "password",
        account: { id: authRecord.username.toLowerCase(), secret: password },
      });
    } catch {
      throw new ConvexError("Password is incorrect.");
    }

    await ctx.runMutation(internal.account.purgeUser, { userId });
    return { ok: true };
  },
});
