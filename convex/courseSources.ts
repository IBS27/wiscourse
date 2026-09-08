import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { resourceValidator, type CourseResource } from "./lib/courseMap";
import { courseText, sourceFingerprint } from "./lib/courseSource";

const tables = v.union(
  v.literal("pages"),
  v.literal("modules"),
  v.literal("moduleItems"),
  v.literal("files"),
  v.literal("assignments"),
);
type Table = typeof tables.type;
function normalize(
  table: Table,
  row: Doc<Table>,
  courseId: number,
): CourseResource {
  const base = `/courses/${courseId}`;
  const shared = {
    fingerprint: sourceFingerprint(table, row)!,
    text: "",
    available: true,
  };
  switch (table) {
    case "pages": {
      const r = row as Doc<"pages">;
      return {
        ...shared,
        id: `page:${r.url}`,
        kind: "page",
        title: r.title,
        href: `${base}/pages/${encodeURIComponent(r.url)}`,
        available:
          r.published &&
          !r.lockedForUser &&
          !r.contentUnavailable &&
          r.body !== undefined,
        text: courseText(r.body ?? "", courseId),
        priority: r.isFrontPage,
      };
    }
    case "modules": {
      const r = row as Doc<"modules">;
      return {
        ...shared,
        id: `module:${r.canvasId}`,
        kind: "module",
        title: r.name,
        href: `${base}/modules#module-${r.canvasId}`,
        position: r.position,
        available: r.state !== "locked" && r.published !== false,
      };
    }
    case "moduleItems": {
      const r = row as Doc<"moduleItems">;
      const targetId =
        r.type === "Page" && r.pageUrl
          ? `page:${r.pageUrl}`
          : r.type === "File"
            ? `file:${r.contentCanvasId}`
            : r.type === "Assignment"
              ? `assignment:${r.contentCanvasId}`
              : undefined;
      return {
        ...shared,
        id: `item:${r.canvasId}`,
        kind: "item",
        title: r.title,
        href: `${base}/modules#item-${r.canvasId}`,
        parentId: `module:${r.moduleCanvasId}`,
        position: r.position,
        targetId,
        available: r.published !== false,
      };
    }
    case "files": {
      const r = row as Doc<"files">;
      return {
        ...shared,
        id: `file:${r.canvasId}`,
        kind: "file",
        title: r.displayName,
        href: `${base}/files?file=${r.canvasId}`,
        available: !r.hidden && !r.lockedForUser,
        file: {
          canvasId: r.canvasId,
          contentType: r.contentType,
          size: r.size,
          downloadUrl: r.url,
          updatedAt: r.updatedAt,
          modifiedAt: r.modifiedAt,
        },
      };
    }
    case "assignments": {
      const r = row as Doc<"assignments">;
      return {
        ...shared,
        id: `assignment:${r.canvasId}`,
        kind: "assignment",
        title: r.name,
        href: `/todo/assignment:${r.canvasId}`,
        text: courseText(r.description ?? "", courseId),
        available: !r.lockedForUser,
      };
    }
  }
}
export const batch = internalQuery({
  args: {
    interpretationId: v.id("courseInterpretations"),
    table: tables,
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.object({
    resources: v.array(resourceValidator),
    cursor: v.string(),
    done: v.boolean(),
    revision: v.number(),
  }),
  handler: async (ctx, args) => {
    const state = await ctx.db.get(args.interpretationId);
    if (!state?.enabled) throw new Error("Interpretation cancelled");
    const page = await ctx.db
      .query(args.table)
      .withIndex("by_user_course", (q) =>
        q.eq("userId", state.userId).eq("courseCanvasId", state.courseCanvasId),
      )
      .paginate({
        cursor: args.cursor,
        numItems: 40,
        maximumBytesRead: 1_000_000,
      });
    return {
      resources: page.page.map((row) =>
        normalize(args.table, row, state.courseCanvasId),
      ),
      cursor: page.continueCursor,
      done: page.isDone,
      revision: state.sourceRevision,
    };
  },
});
export const course = internalQuery({
  args: { interpretationId: v.id("courseInterpretations") },
  returns: v.object({ resource: resourceValidator, year: v.number() }),
  handler: async (ctx, args) => {
    const state = await ctx.db.get(args.interpretationId);
    if (!state?.enabled) throw new Error("Interpretation cancelled");
    const r = await ctx.db
      .query("courses")
      .withIndex("by_user_canvasId", (q) =>
        q.eq("userId", state.userId).eq("canvasId", state.courseCanvasId),
      )
      .unique();
    if (!r || r.enrollmentState === "completed")
      throw new Error("Active course not found");
    return {
      year: new Date(
        r.startAt ?? r.termStartAt ?? state.requestedAt,
      ).getUTCFullYear(),
      resource: {
        id: "course:syllabus",
        kind: "course" as const,
        title: r.name,
        href: `/courses/${r.canvasId}/syllabus`,
        text: courseText(r.syllabusBody ?? "", r.canvasId),
        fingerprint: sourceFingerprint("courses", r)!,
        available: true,
        priority: true,
      },
    };
  },
});
export const document = internalQuery({
  args: {
    interpretationId: v.id("courseInterpretations"),
    fileCanvasId: v.number(),
    fingerprint: v.string(),
  },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const state = await ctx.db.get(args.interpretationId);
    if (!state?.enabled) return null;
    const cached = await ctx.db
      .query("courseDocuments")
      .withIndex("by_user_course_file", (q) =>
        q
          .eq("userId", state.userId)
          .eq("courseCanvasId", state.courseCanvasId)
          .eq("fileCanvasId", args.fileCanvasId),
      )
      .unique();
    return cached?.fingerprint === args.fingerprint ? cached.text : null;
  },
});
export const cacheDocument = internalMutation({
  args: {
    interpretationId: v.id("courseInterpretations"),
    fileCanvasId: v.number(),
    fingerprint: v.string(),
    text: v.string(),
    pages: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.db.get(args.interpretationId);
    if (!state?.enabled || args.text.length > 150_000) return null;
    const file = await ctx.db
      .query("files")
      .withIndex("by_user_canvasId", (q) =>
        q.eq("userId", state.userId).eq("canvasId", args.fileCanvasId),
      )
      .unique();
    if (
      !file ||
      file.courseCanvasId !== state.courseCanvasId ||
      file.lockedForUser ||
      file.hidden ||
      sourceFingerprint("files", file) !== args.fingerprint
    )
      return null;
    const existing = await ctx.db
      .query("courseDocuments")
      .withIndex("by_user_course_file", (q) =>
        q
          .eq("userId", state.userId)
          .eq("courseCanvasId", state.courseCanvasId)
          .eq("fileCanvasId", args.fileCanvasId),
      )
      .unique();
    const value = {
      userId: state.userId,
      courseCanvasId: state.courseCanvasId,
      fileCanvasId: args.fileCanvasId,
      fingerprint: args.fingerprint,
      text: args.text,
      pages: args.pages,
      extractedAt: Date.now(),
    };
    if (existing) await ctx.db.replace(existing._id, value);
    else await ctx.db.insert("courseDocuments", value);
    return null;
  },
});
