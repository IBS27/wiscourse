import { v } from "convex/values";
import { action, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireUserId } from "./lib/auth";
import { getCanvasClient } from "./credentials";
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
          q.eq("userId", identity.subject).eq("courseCanvasId", args.courseCanvasId),
        )
        .collect(),
      await ctx.db
        .query("files")
        .withIndex("by_user_course", (q) =>
          q.eq("userId", identity.subject).eq("courseCanvasId", args.courseCanvasId),
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
        q.eq("userId", identity.subject).eq("courseCanvasId", args.courseCanvasId),
      )
      .collect();
    return files.flatMap((file) => {
      const at = file.updatedAt ?? file.modifiedAt;
      if (file.hidden === true || at === undefined || at < since) return [];
      return [{ canvasId: file.canvasId, folderCanvasId: file.folderCanvasId, at }];
    });
  },
});

export const freshUrl = action({
  args: { fileCanvasId: v.number() },
  returns: v.object({
    url: v.string(),
    contentType: v.string(),
    size: v.number(),
    filename: v.string(),
    displayName: v.string(),
    updatedAt: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { client } = await getCanvasClient(ctx, userId);
    try {
      const file = await client.get<CanvasFile>(`/files/${args.fileCanvasId}`);
      if (file.locked_for_user) throw new Error("File not available");
      return {
        url: file.url,
        contentType: file["content-type"],
        size: file.size,
        filename: file.filename,
        displayName: file.display_name,
        updatedAt: toMillis(file.updated_at),
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
    }
  },
});
