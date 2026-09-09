import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { searchFields } from "./lib/searchFields";
import { SEARCH_TABLES, updateSearchEntry } from "./lib/searchEntries";

export const index = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(
      v.object({ ...searchFields, folderPath: v.optional(v.string()) }),
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { page: [], isDone: true, continueCursor: "" };
    const userId = identity.subject;
    const courses = await ctx.db
      .query("searchEntries")
      .withIndex("by_user_kind_canvasId", (q) =>
        q.eq("userId", userId).eq("kind", "course"),
      )
      .take(5000);
    const activeIds = new Set(
      courses
        .filter((course) => course.active)
        .map((course) => course.canvasId),
    );
    const result = await ctx.db
      .query("searchEntries")
      .withIndex("by_user_course", (q) => q.eq("userId", userId))
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(args.paginationOpts.numItems, 200),
      });
    const credential = await ctx.db
      .query("canvasCredentials")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const host = credential?.instance ?? "canvas.wisc.edu";
    const visibleRows = result.page.filter((row) => activeIds.has(row.courseCanvasId));
    const folderIds = new Set<number>();
    for (const row of visibleRows) {
      if (row.kind === "file" && row.folderCanvasId !== undefined) folderIds.add(row.folderCanvasId);
    }
    // Files often share a folder. Read each folder once per query execution,
    // so names still update live and nothing is cached across users or pages.
    const folderPaths = new Map(
      await Promise.all([...folderIds].map(async (canvasId) => {
        const folder = await ctx.db
          .query("folders")
          .withIndex("by_user_canvasId", (q) => q.eq("userId", userId).eq("canvasId", canvasId))
          .unique();
        return [canvasId, folder?.fullName] as const;
      })),
    );
    const page = visibleRows.map((row) => {
      const { _id, _creationTime, userId: owner, ...entry } = row;
      void _id;
      void _creationTime;
      void owner;
      const path = `courses/${entry.courseCanvasId}`;
      return {
        ...entry,
        folderPath: entry.kind === "file" && entry.folderCanvasId !== undefined
          ? folderPaths.get(entry.folderCanvasId)
          : undefined,
        htmlUrl:
          entry.htmlUrl ||
          `https://${host}/${path}${
            entry.kind === "course"
              ? ""
              : `/${entry.kind === "module" ? "modules" : "files"}/${entry.canvasId}`
          }`,
      };
    });
    return {
      page,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

// Run once after deploying: bunx convex run search:backfill '{}'.
// Normal sync writes maintain the same records transactionally afterward.
export const backfill = internalMutation({
  args: {
    tableIndex: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const tableIndex = args.tableIndex ?? 0;
    const table = SEARCH_TABLES[tableIndex];
    if (!table) return null;
    const batch = await ctx.db.query(table).paginate({
      cursor: args.cursor ?? null,
      numItems: 50,
      maximumBytesRead: 1_000_000,
    });
    const courseActivity = new Map<string, boolean>();
    for (const row of batch.page)
      await updateSearchEntry(ctx, table, row, courseActivity);
    if (!batch.isDone || tableIndex + 1 < SEARCH_TABLES.length) {
      await ctx.scheduler.runAfter(0, internal.search.backfill, {
        tableIndex: batch.isDone ? tableIndex + 1 : tableIndex,
        cursor: batch.isDone ? null : batch.continueCursor,
      });
    }
    return null;
  },
});

export const pruneCourse = internalMutation({
  args: {
    userId: v.string(),
    courseCanvasId: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const course = await ctx.db
      .query("searchEntries")
      .withIndex("by_user_kind_canvasId", (q) =>
        q
          .eq("userId", args.userId)
          .eq("kind", "course")
          .eq("canvasId", args.courseCanvasId),
      )
      .unique();
    if (course?.active) return null;
    const batch = await ctx.db
      .query("searchEntries")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", args.userId).eq("courseCanvasId", args.courseCanvasId),
      )
      .paginate({ cursor: args.cursor ?? null, numItems: 200 });
    for (const row of batch.page) {
      if (row.kind !== "course") await ctx.db.delete(row._id);
    }
    if (!batch.isDone)
      await ctx.scheduler.runAfter(0, internal.search.pruneCourse, {
        ...args,
        cursor: batch.continueCursor,
      });
    return null;
  },
});
