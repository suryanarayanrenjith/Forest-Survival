import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { rateLimiter } from "./rateLimiter";

/**
 * Photo Mode storage — every player can keep up to MAX_PHOTOS captures in their
 * account. We store only a storage pointer + timestamp per photo (the image
 * itself lives in Convex file storage), so the table stays tiny.
 *
 * ── Anti-abuse / anti-spoof guarantees ───────────────────────────────────────
 * The hard cap is impossible for a crafted client to exceed because:
 *  1. `userId` is derived server-side from the auth session (getAuthUserId) — it
 *     can never be supplied or forged by the client.
 *  2. The ONLY code path that inserts a `playerPhotos` row is `savePhoto`, and
 *     it re-counts the user's rows inside the SAME transaction as the insert.
 *     Convex runs mutations with serializable isolation (OCC): two concurrent
 *     saves both read the user's `by_user` range, so the second to commit
 *     conflicts with the first's insert and is retried — re-reading the now-full
 *     count and being rejected. Parallel/scripted floods therefore cannot race
 *     past the cap.
 *  3. The uploaded blob is validated (exists, is an image, within the size
 *     ceiling) and de-duplicated, and any rejected/orphaned blob is deleted so
 *     storage can't be inflated either.
 */
export const MAX_PHOTOS = 5;

// Hard ceiling per capture. A photoshoot JPEG is well under 2 MB; 8 MB leaves
// generous headroom while blocking someone POSTing a huge file to the upload
// URL to burn storage.
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

async function countPhotos(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<number> {
  const rows = await ctx.db
    .query("playerPhotos")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return rows.length;
}

/** How many photos the player has + the cap (drives the in-game capture gate). */
export const getPhotoCount = query({
  args: {},
  returns: v.object({ count: v.number(), max: v.number() }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { count: 0, max: MAX_PHOTOS };
    return { count: await countPhotos(ctx, userId), max: MAX_PHOTOS };
  },
});

/** The player's saved photos (newest first) with resolved download URLs. */
export const listPhotos = query({
  args: {},
  returns: v.object({
    max: v.number(),
    photos: v.array(
      v.object({
        id: v.id("playerPhotos"),
        url: v.union(v.string(), v.null()),
        createdAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { max: MAX_PHOTOS, photos: [] };

    const rows = await ctx.db
      .query("playerPhotos")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    const photos = await Promise.all(
      rows.map(async (r) => ({
        id: r._id,
        url: await ctx.storage.getUrl(r.storageId),
        createdAt: r.createdAt,
      })),
    );
    return { max: MAX_PHOTOS, photos };
  },
});

/**
 * Short-lived upload URL for a new capture. Rejects up front when the player is
 * already at the cap so the client never wastes an upload (the save mutation
 * re-checks atomically as the real guard).
 */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new ConvexError("Sign in to save photos.");

    const { ok } = await rateLimiter.limit(ctx, "photoUpload", { key: userId });
    if (!ok) throw new ConvexError("Too many uploads — please wait a moment.");

    if ((await countPhotos(ctx, userId)) >= MAX_PHOTOS) {
      throw new ConvexError(`Photo limit reached (${MAX_PHOTOS}). Delete one to free a slot.`);
    }
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Commit an uploaded blob to the player's gallery. This is the single
 * authoritative gate for the 5-photo cap (see the file header for why it can't
 * be raced or spoofed). It validates the blob, de-dupes, enforces the cap
 * transactionally, and deletes any rejected/orphaned blob so storage never
 * leaks.
 */
export const savePhoto = mutation({
  args: { storageId: v.id("_storage") },
  returns: v.object({ id: v.id("playerPhotos"), count: v.number() }),
  handler: async (ctx, { storageId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      await ctx.storage.delete(storageId);
      throw new ConvexError("Sign in to save photos.");
    }

    // ── Validate the uploaded blob ──────────────────────────────────────────
    // A crafted client can POST anything to the upload URL, so trust nothing:
    // the blob must exist, be an image, and be within the size ceiling.
    const meta = await ctx.db.system.get(storageId);
    if (meta === null) {
      throw new ConvexError("Upload not found — please retake the photo.");
    }
    if (meta.size > MAX_PHOTO_BYTES || !meta.contentType?.startsWith("image/")) {
      await ctx.storage.delete(storageId);
      throw new ConvexError("Invalid image. Please retake the photo.");
    }

    // ── Cap + de-dup (transactional) ────────────────────────────────────────
    // Reading the whole by_user range here is what makes a concurrent save
    // conflict with our insert under Convex OCC — so the cap holds even against
    // parallel requests (see the file header).
    const existing = await ctx.db
      .query("playerPhotos")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // A replayed storageId already belongs to a saved photo — reject WITHOUT
    // deleting the blob (that would orphan the existing gallery entry).
    if (existing.some((row) => row.storageId === storageId)) {
      throw new ConvexError("That photo is already saved.");
    }

    if (existing.length >= MAX_PHOTOS) {
      await ctx.storage.delete(storageId);
      throw new ConvexError(`Photo limit reached (${MAX_PHOTOS}). Delete one to free a slot.`);
    }

    const id = await ctx.db.insert("playerPhotos", {
      userId,
      storageId,
      createdAt: Date.now(),
    });
    return { id, count: existing.length + 1 };
  },
});

/** Remove a photo from the gallery and its backing blob from storage. */
export const deletePhoto = mutation({
  args: { id: v.id("playerPhotos") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new ConvexError("Sign in to manage photos.");

    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) throw new ConvexError("Photo not found.");

    await ctx.storage.delete(row.storageId);
    await ctx.db.delete(id);
    return null;
  },
});
