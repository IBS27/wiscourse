// Persistence for per-course Canvas content (modules, module items, pages,
// folders, files). Actions in canvas/syncContent.ts only talk to Canvas;
// every write lands here, where Convex gives us exactly-once semantics.
//
// Each mutation takes the *complete* set of rows it was given for one
// course. `prune: true` means "this payload is authoritative" (a full
// sync fetched everything), so rows Canvas no longer returns are deleted.

import { touchInterpretation } from "./lib/interpretationRevision";
import { v, type Infer } from "convex/values";
import { internalMutation } from "./_generated/server";
import { completionRequirement, moduleItemType, moduleState } from "./schema";
import { removeSearchEntry, updateSearchEntry } from "./lib/searchEntries";
import { pruneCourseRows, upsertByCanvasId } from "./lib/upsert";

// Row validators mirror the schema tables minus the columns this layer
// fills in itself (userId, courseCanvasId, syncedAt).

const moduleRow = v.object({
  canvasId: v.number(),
  name: v.string(),
  position: v.number(),
  unlockAt: v.optional(v.number()),
  state: v.optional(moduleState),
  prerequisiteModuleCanvasIds: v.array(v.number()),
  requireSequentialProgress: v.boolean(),
  published: v.optional(v.boolean()),
  itemCount: v.optional(v.number()),
});

const moduleItemRow = v.object({
  canvasId: v.number(),
  moduleCanvasId: v.number(),
  position: v.number(),
  indent: v.number(),
  type: moduleItemType,
  title: v.string(),
  contentCanvasId: v.optional(v.number()),
  pageUrl: v.optional(v.string()),
  externalUrl: v.optional(v.string()),
  htmlUrl: v.optional(v.string()),
  published: v.optional(v.boolean()),
  completionRequirement: v.optional(completionRequirement),
});

const pageRow = v.object({
  canvasId: v.number(),
  url: v.string(),
  title: v.string(),
  body: v.optional(v.string()),
  isFrontPage: v.boolean(),
  contentUnavailable: v.optional(v.boolean()),
  published: v.boolean(),
  updatedAt: v.optional(v.number()),
  htmlUrl: v.string(),
  lockedForUser: v.optional(v.boolean()),
});

const folderRow = v.object({
  canvasId: v.number(),
  parentFolderCanvasId: v.optional(v.number()),
  name: v.string(),
  fullName: v.string(),
  position: v.optional(v.number()),
  filesCount: v.optional(v.number()),
  foldersCount: v.optional(v.number()),
  lockedForUser: v.optional(v.boolean()),
});

const fileRow = v.object({
  canvasId: v.number(),
  folderCanvasId: v.optional(v.number()),
  displayName: v.string(),
  filename: v.string(),
  contentType: v.string(),
  size: v.number(),
  url: v.string(),
  thumbnailUrl: v.optional(v.string()),
  updatedAt: v.optional(v.number()),
  modifiedAt: v.optional(v.number()),
  lockedForUser: v.optional(v.boolean()),
  hidden: v.optional(v.boolean()),
});

export type ModuleRow = Infer<typeof moduleRow>;
export type ModuleItemRow = Infer<typeof moduleItemRow>;
export type PageRow = Infer<typeof pageRow>;
export type FolderRow = Infer<typeof folderRow>;
export type FileRow = Infer<typeof fileRow>;

export const upsertModules = internalMutation({
  args: {
    userId: v.string(),
    courseCanvasId: v.number(),
    rows: v.array(moduleRow),
    prune: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = args.rows.map((row) => ({
      ...row,
      courseCanvasId: args.courseCanvasId,
    }));
    await upsertByCanvasId(ctx, "modules", args.userId, rows);
    if (args.prune) {
      await pruneCourseRows(
        ctx,
        "modules",
        args.userId,
        args.courseCanvasId,
        rows.map((row) => row.canvasId),
      );
    }
    return null;
  },
});

export const upsertModuleItems = internalMutation({
  args: {
    userId: v.string(),
    courseCanvasId: v.number(),
    rows: v.array(moduleItemRow),
    prune: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = args.rows.map((row) => ({
      ...row,
      courseCanvasId: args.courseCanvasId,
    }));
    await upsertByCanvasId(ctx, "moduleItems", args.userId, rows);
    if (args.prune) {
      await pruneCourseRows(
        ctx,
        "moduleItems",
        args.userId,
        args.courseCanvasId,
        rows.map((row) => row.canvasId),
      );
    }
    return null;
  },
});

export const upsertPages = internalMutation({
  args: {
    userId: v.string(),
    courseCanvasId: v.number(),
    rows: v.array(pageRow),
    prune: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = args.rows.map((row) => ({
      ...row,
      courseCanvasId: args.courseCanvasId,
    }));
    await upsertByCanvasId(ctx, "pages", args.userId, rows);
    if (args.prune) {
      await pruneCourseRows(
        ctx,
        "pages",
        args.userId,
        args.courseCanvasId,
        rows.map((row) => row.canvasId),
      );
    }
    return null;
  },
});

export const upsertFolders = internalMutation({
  args: {
    userId: v.string(),
    courseCanvasId: v.number(),
    rows: v.array(folderRow),
    prune: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = args.rows.map((row) => ({
      ...row,
      courseCanvasId: args.courseCanvasId,
    }));
    await upsertByCanvasId(ctx, "folders", args.userId, rows);
    if (args.prune) {
      await pruneCourseRows(
        ctx,
        "folders",
        args.userId,
        args.courseCanvasId,
        rows.map((row) => row.canvasId),
      );
    }
    return null;
  },
});

export const upsertFiles = internalMutation({
  args: {
    userId: v.string(),
    courseCanvasId: v.number(),
    rows: v.array(fileRow),
    prune: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = args.rows.map((row) => ({
      ...row,
      courseCanvasId: args.courseCanvasId,
    }));
    await upsertByCanvasId(ctx, "files", args.userId, rows);
    if (args.prune) {
      await pruneCourseRows(
        ctx,
        "files",
        args.userId,
        args.courseCanvasId,
        rows.map((row) => row.canvasId),
      );
    }
    return null;
  },
});

// These finish a paged content fetch without sending all HTML in one mutation.
export const prunePages = internalMutation({
  args: {
    userId: v.string(),
    courseCanvasId: v.number(),
    keepCanvasIds: v.array(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const pages = await ctx.db
      .query("pages")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", args.userId).eq("courseCanvasId", args.courseCanvasId),
      )
      .take(2001);
    if (pages.length > 2000)
      throw new Error("Course page snapshot exceeds 2000 pages");
    const keep = new Set(args.keepCanvasIds);
    if (pages.some((page) => !keep.has(page.canvasId))) await touchInterpretation(ctx, args.userId, args.courseCanvasId);
    for (const page of pages) {
      if (keep.has(page.canvasId)) continue;
      await ctx.db.delete(page._id);
      await removeSearchEntry(ctx, "pages", args.userId, page.canvasId);
    }
    return null;
  },
});

export const markPageUnavailable = internalMutation({
  args: { userId: v.string(), courseCanvasId: v.number(), url: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("pages")
      .withIndex("by_user_course_url", (q) =>
        q
          .eq("userId", args.userId)
          .eq("courseCanvasId", args.courseCanvasId)
          .eq("url", args.url),
      )
      .unique();
    if (page && (!page.contentUnavailable || page.body)) {
      await touchInterpretation(ctx, args.userId, args.courseCanvasId);
      await ctx.db.patch(page._id, { body: "", contentUnavailable: true, syncedAt: Date.now() });
      await updateSearchEntry(ctx, "pages", {
        ...page,
        body: "",
        contentUnavailable: true,
      });
    }
    return null;
  },
});

export const setFrontPage = internalMutation({
  args: {
    userId: v.string(),
    courseCanvasId: v.number(),
    canvasId: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const previous = await ctx.db
      .query("pages")
      .withIndex("by_user_course_front", (q) =>
        q
          .eq("userId", args.userId)
          .eq("courseCanvasId", args.courseCanvasId)
          .eq("isFrontPage", true),
      )
      .take(100);
    if (previous.length === 100)
      throw new Error("Too many front pages for one course");
    for (const page of previous) {
      if (page.canvasId !== args.canvasId) {
        await touchInterpretation(ctx, args.userId, args.courseCanvasId);
        await ctx.db.patch(page._id, { isFrontPage: false, syncedAt: Date.now() });
      }
    }
    return null;
  },
});
