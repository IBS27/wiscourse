import { v, type Infer } from "convex/values";
import {
  action,
  query,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireUserId } from "./lib/auth";
import { getCanvasClient, type CredentialIdentity } from "./credentials";
import { CanvasApiError, CanvasRateLimitError } from "./canvas/client";
import type { CanvasFile } from "./canvas/types";
import { toMillis } from "./canvas/types";
import { DAY_MS } from "./lib/time";

interface FileTree {
  folders: Doc<"folders">[];
  files: Doc<"files">[];
}

/**
 * Everything the Files tab needs, as two flat arrays. The nesting is a
 * presentation concern (folders link to parents by `parentFolderCanvasId`,
 * files by `folderCanvasId`), so the UI builds the tree and we avoid a
 * recursive read here.
 */
export const tree = query({
  args: { courseCanvasId: v.number() },
  handler: async (ctx, args): Promise<FileTree> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return { folders: [], files: [] };
    const [folders, files] = [
      await ctx.db
        .query("folders")
        .withIndex("by_user_course", (q) =>
          q
            .eq("userId", identity.subject)
            .eq("courseCanvasId", args.courseCanvasId),
        )
        .collect(),
      await ctx.db
        .query("files")
        .withIndex("by_user_course", (q) =>
          q
            .eq("userId", identity.subject)
            .eq("courseCanvasId", args.courseCanvasId),
        )
        .collect(),
    ];
    return {
      folders: folders.sort((a, b) => a.fullName.localeCompare(b.fullName)),
      files: files.sort((a, b) => a.displayName.localeCompare(b.displayName)),
    };
  },
});

const FRESH_WINDOW_MS = 14 * DAY_MS;

/** IDs of files added or changed in the last two weeks. */
export const fresh = query({
  args: { courseCanvasId: v.number() },
  returns: v.array(
    v.object({
      canvasId: v.number(),
      folderCanvasId: v.optional(v.number()),
      at: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return [];
    const since = Date.now() - FRESH_WINDOW_MS;
    const files = await ctx.db
      .query("files")
      .withIndex("by_user_course", (q) =>
        q
          .eq("userId", identity.subject)
          .eq("courseCanvasId", args.courseCanvasId),
      )
      .collect();
    return files.flatMap((file) => {
      const at = file.updatedAt ?? file.modifiedAt;
      if (file.hidden === true || at === undefined || at < since) return [];
      return [
        { canvasId: file.canvasId, folderCanvasId: file.folderCanvasId, at },
      ];
    });
  },
});

const fileMetadata = v.object({
  url: v.string(),
  contentType: v.string(),
  size: v.number(),
  filename: v.string(),
  displayName: v.string(),
  updatedAt: v.optional(v.number()),
});
export type FileMetadata = Infer<typeof fileMetadata>;

export type ResolvedFile =
  | { status: "live"; file: FileMetadata; credential: CredentialIdentity }
  | { status: "busy"; synced: FileMetadata | null };

/**
 * The file as Canvas reports it now, with the stored token that read it.
 * While a sync holds the user's Canvas lease this makes no request and
 * returns the synced listing instead, which may be stale or predate a
 * reconnect: fine to show, never fit to cache under.
 */
export async function resolveFile(
  ctx: ActionCtx,
  userId: string,
  fileCanvasId: number,
): Promise<ResolvedFile> {
  const owned = await ctx.runQuery(internal.files.owned, {
    userId,
    fileCanvasId,
  });
  if (owned?.locked) throw new Error("File not available");
  const lease = await ctx.runMutation(internal.syncStore.claimSync, {
    userId,
    full: false,
  });
  if (lease === null) return { status: "busy", synced: owned?.cached ?? null };
  try {
    const { client, identity } = await getCanvasClient(ctx, userId);
    const file = await client.get<CanvasFile>(`/files/${fileCanvasId}`);
    if (file.locked_for_user || file.hidden)
      throw new Error("File not available");
    return {
      status: "live",
      credential: identity,
      file: {
        url: file.url,
        contentType: file["content-type"],
        size: file.size,
        filename: file.filename,
        displayName: file.display_name,
        updatedAt: toMillis(file.updated_at),
      },
    };
  } catch (error) {
    if (error instanceof CanvasRateLimitError) throw error;
    if (
      error instanceof CanvasApiError &&
      (error.status === 401 || error.status === 403 || error.status === 404)
    ) {
      throw new Error("File not available", { cause: error });
    }
    throw error;
  } finally {
    await ctx.runMutation(internal.syncStore.releaseSync, { userId, lease });
  }
}

export const freshUrl = action({
  args: { fileCanvasId: v.number() },
  returns: fileMetadata,
  handler: async (ctx, args): Promise<FileMetadata> => {
    const userId = await requireUserId(ctx);
    const resolved = await resolveFile(ctx, userId, args.fileCanvasId);
    if (resolved.status === "live") return resolved.file;
    if (resolved.synced !== null) return resolved.synced;
    throw new Error("Canvas is syncing. Please retry shortly.");
  },
});

export const owned = internalQuery({
  args: { userId: v.string(), fileCanvasId: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      courseCanvasId: v.number(),
      locked: v.boolean(),
      cached: fileMetadata,
    }),
  ),
  handler: async (ctx, a) => {
    const f = await ctx.db
      .query("files")
      .withIndex("by_user_canvasId", (q) =>
        q.eq("userId", a.userId).eq("canvasId", a.fileCanvasId),
      )
      .unique();
    return f
      ? {
          courseCanvasId: f.courseCanvasId,
          locked: !!f.lockedForUser || !!f.hidden,
          cached: {
            url: f.url,
            contentType: f.contentType,
            size: f.size,
            filename: f.filename,
            displayName: f.displayName,
            updatedAt: f.updatedAt,
          },
        }
      : null;
  },
});
