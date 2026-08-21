// Persistence for per-course Canvas content (modules, module items, pages,
// folders, files). Actions in canvas/syncContent.ts only talk to Canvas;
// every write lands here, where Convex gives us exactly-once semantics.
//
// Each mutation takes the *complete* set of rows it was given for one
// course. `prune: true` means "this payload is authoritative" (a full
// sync fetched everything), so rows Canvas no longer returns are deleted.

import { v, type Infer } from "convex/values";
import { internalMutation } from "./_generated/server";
import { completionRequirement, moduleItemType, moduleState } from "./schema";
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
