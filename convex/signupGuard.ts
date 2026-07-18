import { internalMutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { rateLimiter } from "./rateLimiter";

declare const process: { env: Record<string, string | undefined> };

const DEFAULT_MAX_SIGNUPS = 100;
// One account per device. Enforced across EVERY device signal we receive
// (hardware fingerprint + persistent id), so clearing storage doesn't bypass it.
const MAX_ACCOUNTS_PER_DEVICE = 1;
const MAX_FINGERPRINTS = 4;
const MAX_FINGERPRINT_LENGTH = 128;

function normalizeFingerprints(fingerprints: string[]): string[] | null {
  if (fingerprints.length > MAX_FINGERPRINTS) return null;
  const keys = Array.from(new Set(fingerprints.map((fingerprint) => fingerprint.trim())));
  if (keys.some((fingerprint) => fingerprint.length === 0 || fingerprint.length > MAX_FINGERPRINT_LENGTH)) {
    return null;
  }
  return keys;
}

function maxSignups(): number {
  const raw = Number(process.env.MAX_SIGNUPS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_SIGNUPS;
}

/**
 * The global signup counter row, created on first use.
 *
 * Returns a NON-NULL doc: `ctx.db.get` is typed nullable, and the old code
 * threaded that `null` all the way into the cap check (`if (meta && …)`), so a
 * missing row would have silently DISABLED the hard account cap instead of
 * failing closed. A just-inserted row always exists, so throwing here is
 * unreachable in practice and simply makes the guarantee explicit downstream.
 */
async function getOrCreateMeta(ctx: MutationCtx): Promise<Doc<"appMeta">> {
  const existing = await ctx.db
    .query("appMeta")
    .withIndex("by_key", (q) => q.eq("key", "signups"))
    .unique();
  if (existing) return existing;

  const id = await ctx.db.insert("appMeta", {
    key: "signups",
    totalUsers: 0,
    maxUsers: maxSignups(),
  });
  const created = await ctx.db.get(id);
  if (!created) throw new Error("Failed to initialise the signup counter.");
  return created;
}

/**
 * Public availability query for the auth UI — how many account slots remain.
 * Never throws; safe to call before sign-in.
 */
export const signupAvailability = query({
  args: {},
  returns: v.object({
    remaining: v.number(),
    maxUsers: v.number(),
    full: v.boolean(),
  }),
  handler: async (ctx) => {
    const meta = await ctx.db
      .query("appMeta")
      .withIndex("by_key", (q) => q.eq("key", "signups"))
      .unique();
    const max = meta?.maxUsers ?? maxSignups();
    const total = meta?.totalUsers ?? 0;
    const remaining = Math.max(0, max - total);
    return { remaining, maxUsers: max, full: remaining <= 0 };
  },
});

/**
 * Run all anti-abuse gates for a sign-up in one transaction and, if they pass,
 * atomically reserve a slot (increment the global counter + device record).
 * Called from the auth `signUp` flow before `createAccount`.
 */
export const reserveSignup = internalMutation({
  args: {
    // Every independent device signal (hardware fingerprint + persistent id).
    // The cap is enforced against ALL of them.
    fingerprints: v.array(v.string()),
    username: v.string(),
  },
  returns: v.object({
    ok: v.boolean(),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, { fingerprints, username }) => {
    const meta = await getOrCreateMeta(ctx);

    // Always have at least one key to track against, even if the client sent
    // nothing usable (defensive — auth.ts already supplies a fallback).
    const normalized = normalizeFingerprints(fingerprints);
    if (normalized === null) {
      return { ok: false, reason: "Invalid registration device data." };
    }
    const keys = normalized;
    if (keys.length === 0) keys.push(`user:${username}`);

    // 1. Hard global cap (free-plan safety). `meta` is guaranteed non-null now,
    //    so the cap can no longer be skipped by a missing counter row.
    if (meta.totalUsers >= meta.maxUsers) {
      return { ok: false, reason: "Registration is full right now. Please try again later." };
    }

    // 2. Per-device account cap (anti multi-account). Block if ANY signal for
    //    this device already has an account — clearing storage changes the
    //    persistent id but the hardware fingerprint still matches.
    const devices = await Promise.all(
      keys.map((fp) =>
        ctx.db
          .query("deviceAccounts")
          .withIndex("by_fingerprint", (q) => q.eq("fingerprint", fp))
          .unique(),
      ),
    );
    if (devices.some((device) => device && device.accountCount >= MAX_ACCOUNTS_PER_DEVICE)) {
      return {
        ok: false,
        reason: "This device already has an account. Only one account is allowed per device.",
      };
    }

    // 3. Rate limits (per-device burst + global flood protection). Keyed on the
    //    stable hardware fingerprint (index 0) so it can't be reset by clearing
    //    storage.
    const deviceLimit = await rateLimiter.limit(ctx, "signupPerDevice", { key: keys[0] });
    if (!deviceLimit.ok) {
      return { ok: false, reason: "Too many sign-up attempts. Please wait a bit and try again." };
    }
    const globalLimit = await rateLimiter.limit(ctx, "signupGlobal");
    if (!globalLimit.ok) {
      return { ok: false, reason: "Sign-ups are busy right now. Please try again shortly." };
    }

    // 4. Commit the reservation: bump the global counter once and record the
    //    account under every device signal.
    const now = Date.now();
    await ctx.db.patch(meta._id, { totalUsers: meta.totalUsers + 1 });
    for (let i = 0; i < keys.length; i += 1) {
      const device = devices[i];
      if (device) {
        await ctx.db.patch(device._id, {
          accountCount: device.accountCount + 1,
          usernames: [...device.usernames, username].slice(-10),
          lastSeenAt: now,
        });
      } else {
        await ctx.db.insert("deviceAccounts", {
          fingerprint: keys[i],
          accountCount: 1,
          usernames: [username],
          firstSeenAt: now,
          lastSeenAt: now,
        });
      }
    }

    return { ok: true };
  },
});

/**
 * Compensating action if `createAccount` fails after a successful reservation,
 * so a failed creation doesn't permanently burn a slot.
 */
export const rollbackSignup = internalMutation({
  args: {
    fingerprints: v.array(v.string()),
    username: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { fingerprints, username }) => {
    const meta = await ctx.db
      .query("appMeta")
      .withIndex("by_key", (q) => q.eq("key", "signups"))
      .unique();
    if (meta && meta.totalUsers > 0) {
      await ctx.db.patch(meta._id, { totalUsers: meta.totalUsers - 1 });
    }

    const normalized = normalizeFingerprints(fingerprints);
    // This is a compensating cleanup path. The original reservation was
    // bounded, but tolerate malformed data here without broadening the rows
    // this internal mutation can touch.
    const keys = normalized ?? [];
    if (keys.length === 0) keys.push(`user:${username}`);

    for (const fingerprint of keys) {
      const device = await ctx.db
        .query("deviceAccounts")
        .withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint))
        .unique();
      if (!device) continue;
      const idx = device.usernames.lastIndexOf(username);
      const usernames = idx >= 0
        ? [...device.usernames.slice(0, idx), ...device.usernames.slice(idx + 1)]
        : device.usernames;
      await ctx.db.patch(device._id, {
        accountCount: Math.max(0, device.accountCount - 1),
        usernames,
      });
    }
    return null;
  },
});
