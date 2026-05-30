import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { rateLimiter } from "./rateLimiter";

/**
 * Photo Mode storage — every player can keep up to MAX_PHOTOS captures in their
 * account. We store only a storage pointer + timestamp per photo (the image
 * itself lives in Convex file storage), so the table stays tiny. The hard cap
 * is enforced on BOTH the upload-url and the save mutations so a crafted client
 * can never exceed it.
 */
export const MAX_PHOTOS = 5;

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
 * Commit an uploaded blob to the player's gallery. Re-checks ownership + the
 * cap transactionally; if the player raced past the limit, the orphaned blob is
 * deleted so storage never leaks.
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

    const count = await countPhotos(ctx, userId);
    if (count >= MAX_PHOTOS) {
      await ctx.storage.delete(storageId);
      throw new ConvexError(`Photo limit reached (${MAX_PHOTOS}). Delete one to free a slot.`);
    }

    const id = await ctx.db.insert("playerPhotos", {
      userId,
      storageId,
      createdAt: Date.now(),
    });
    return { id, count: count + 1 };
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
