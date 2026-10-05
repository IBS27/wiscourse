// Shared cache of PDF previews in Convex storage. The browser loads the
// storage URL directly (HTTP, streamable, cacheable), so a repeat view by
// anyone on the same Canvas instance costs no Canvas call. Entries are keyed
// by (instance, file id) and matched on the file's version (size,
// updatedAt); every read checks the caller's own access first. Misses are
// filled by the `pdf` action in convex/filePreview.ts, only with what Canvas
// just reported to a still-current token on that instance.

import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  canvasInstance,
  credentialIdentity,
  credentialInstance,
} from "./credentials";
import { DAY_MS } from "./lib/time";

const MAX_AGE_MS = 45 * DAY_MS;
const EVICT_BATCH = 100;

interface Version {
  size: number;
  updatedAt?: number;
}

async function entries(
  ctx: QueryCtx,
  instance: string,
  fileCanvasId: number,
): Promise<Doc<"pdfPreviews">[]> {
  return await ctx.db
    .query("pdfPreviews")
    .withIndex("by_file", (q) =>
      q.eq("instance", instance).eq("fileCanvasId", fileCanvasId),
    )
    .collect();
}

const matches = (entry: Doc<"pdfPreviews">, version: Version) =>
  entry.size === version.size && entry.updatedAt === version.updatedAt;

async function cached(
  ctx: QueryCtx,
  instance: string,
  fileCanvasId: number,
  version: Version,
): Promise<Doc<"pdfPreviews"> | undefined> {
  return (await entries(ctx, instance, fileCanvasId)).find((e) =>
    matches(e, version),
  );
}

async function deleteEntry(ctx: MutationCtx, entry: Doc<"pdfPreviews">) {
  await deleteBlob(ctx, entry.storageId);
  await ctx.db.delete(entry._id);
}

async function deleteBlob(ctx: MutationCtx, storageId: Id<"_storage">) {
  if ((await ctx.db.system.get(storageId)) !== null)
    await ctx.storage.delete(storageId);
}

/**
 * Fast path the viewer subscribes to: the cached preview for a file the
 * caller can see in their synced data, at the synced version, or null (not
 * signed in, no access, or not cached). The viewer compares the version
 * with the one Canvas confirms and asks `pdf` when they differ. Never calls
 * Canvas.
 */
export const pdfUrl = query({
  args: { fileCanvasId: v.number() },
  returns: v.union(
    v.object({
      url: v.string(),
      size: v.number(),
      updatedAt: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const file = await ctx.db
      .query("files")
      .withIndex("by_user_canvasId", (q) =>
        q.eq("userId", identity.subject).eq("canvasId", args.fileCanvasId),
      )
      .unique();
    if (file === null || file.lockedForUser === true || file.hidden === true)
      return null;
    const instance = await canvasInstance(ctx, identity.subject);
    if (instance === undefined) return null;
    const entry = await cached(ctx, instance, args.fileCanvasId, file);
    if (entry === undefined) return null;
    const url = await ctx.storage.getUrl(entry.storageId);
    return url === null
      ? null
      : { url, size: entry.size, updatedAt: entry.updatedAt };
  },
});

/** A version Canvas just reported to the stored token `credential`. */
const confirmed = {
  userId: v.string(),
  credential: credentialIdentity,
  fileCanvasId: v.number(),
  size: v.number(),
  updatedAt: v.optional(v.number()),
};

/** Cached URL at a confirmed version; null if absent or the token changed. */
export const lookup = internalQuery({
  args: confirmed,
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const instance = await credentialInstance(ctx, args.userId, args.credential);
    if (instance === undefined) return null;
    const entry = await cached(ctx, instance, args.fileCanvasId, args);
    return entry ? await ctx.storage.getUrl(entry.storageId) : null;
  },
});

/**
 * Store a freshly downloaded preview and return its URL. A concurrent miss
 * that already stored this version wins (the new blob is dropped); older
 * versions of the file are removed. Returns null, storing nothing, when
 * `credential` is no longer the user's active token: the bytes may belong to
 * another instance. The caller then deletes the blob, as it does when this
 * throws (which rolls back any deletion here).
 */
export const record = internalMutation({
  args: { ...confirmed, storageId: v.id("_storage") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const instance = await credentialInstance(ctx, args.userId, args.credential);
    if (instance === undefined) return null;
    let storageId = args.storageId;
    let existing: Doc<"pdfPreviews"> | undefined;
    for (const entry of await entries(ctx, instance, args.fileCanvasId)) {
      if (
        existing === undefined &&
        matches(entry, args) &&
        (await ctx.db.system.get(entry.storageId)) !== null
      )
        existing = entry;
      else await deleteEntry(ctx, entry);
    }
    if (existing !== undefined) {
      await deleteBlob(ctx, args.storageId);
      storageId = existing.storageId;
    } else {
      await ctx.db.insert("pdfPreviews", {
        instance,
        fileCanvasId: args.fileCanvasId,
        size: args.size,
        updatedAt: args.updatedAt,
        storageId,
        storedAt: Date.now(),
      });
    }
    const url = await ctx.storage.getUrl(storageId);
    if (url === null) throw new Error("Stored PDF is missing");
    return url;
  },
});

/** Drop previews stored more than 45 days ago, a batch at a time. */
export const evict = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const stale = await ctx.db
      .query("pdfPreviews")
      .withIndex("by_storedAt", (q) => q.lt("storedAt", Date.now() - MAX_AGE_MS))
      .take(EVICT_BATCH);
    for (const entry of stale) await deleteEntry(ctx, entry);
    if (stale.length === EVICT_BATCH)
      await ctx.scheduler.runAfter(0, internal.pdfCache.evict, {});
    return null;
  },
});
