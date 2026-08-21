import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

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
