import { v } from "convex/values";

export const searchKind = v.union(
  v.literal("course"),
  v.literal("assignment"),
  v.literal("page"),
  v.literal("file"),
  v.literal("announcement"),
  v.literal("module"),
);

// Kept apart from source documents so search never reads their HTML bodies.
export const searchFields = {
  kind: searchKind,
  active: v.optional(v.boolean()), // Course entries only.
  canvasId: v.number(),
  courseCanvasId: v.number(),
  title: v.string(),
  htmlUrl: v.string(),
  pageSlug: v.optional(v.string()),
  folderCanvasId: v.optional(v.number()),
  size: v.optional(v.number()),
  dueAt: v.optional(v.number()),
  score: v.optional(v.number()),
  pointsPossible: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
  postedAt: v.optional(v.number()),
  itemCount: v.optional(v.number()),
  courseCode: v.optional(v.string()),
};
