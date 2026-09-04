import type { WithoutSystemFields } from "convex/server";
import type { Doc, TableNames } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";

export const SEARCH_TABLES = [
  "courses",
  "assignments",
  "pages",
  "files",
  "discussions",
  "modules",
] as const;
type Entry = WithoutSystemFields<Doc<"searchEntries">>;
type Source<T extends TableNames> = WithoutSystemFields<Doc<T>>;

function summarize(
  table: TableNames,
  source: Source<TableNames>,
): Entry | undefined {
  // The caller supplies the table together with the document it writes there.
  switch (table) {
    case "courses": {
      const row = source as Source<"courses">;
      return {
        userId: row.userId,
        canvasId: row.canvasId,
        courseCanvasId: row.canvasId,
        kind: "course",
        active: row.enrollmentState !== "completed",
        title: row.name,
        courseCode: row.courseCode,
        htmlUrl: "",
      };
    }
    case "assignments": {
      const row = source as Source<"assignments">;
      return {
        userId: row.userId,
        canvasId: row.canvasId,
        courseCanvasId: row.courseCanvasId,
        kind: "assignment",
        title: row.name,
        htmlUrl: row.htmlUrl,
        dueAt: row.dueAt,
        pointsPossible: row.pointsPossible,
        score:
          row.submission?.postedAt === undefined
            ? undefined
            : row.submission.score,
      };
    }
    case "pages": {
      const row = source as Source<"pages">;
      return {
        userId: row.userId,
        canvasId: row.canvasId,
        courseCanvasId: row.courseCanvasId,
        kind: "page",
        title: row.title,
        htmlUrl: row.htmlUrl,
        pageSlug: row.url,
        updatedAt: row.updatedAt,
      };
    }
    case "files": {
      const row = source as Source<"files">;
      if (row.hidden) return undefined;
      return {
        userId: row.userId,
        canvasId: row.canvasId,
        courseCanvasId: row.courseCanvasId,
        kind: "file",
        title: row.displayName,
        htmlUrl: "",
        size: row.size,
        folderCanvasId: row.folderCanvasId,
        updatedAt: row.updatedAt,
      };
    }
    case "discussions": {
      const row = source as Source<"discussions">;
      if (!row.isAnnouncement) return undefined;
      return {
        userId: row.userId,
        canvasId: row.canvasId,
        courseCanvasId: row.courseCanvasId,
        kind: "announcement",
        title: row.title,
        htmlUrl: row.htmlUrl,
        postedAt: row.postedAt,
      };
    }
    case "modules": {
      const row = source as Source<"modules">;
      return {
        userId: row.userId,
        canvasId: row.canvasId,
        courseCanvasId: row.courseCanvasId,
        kind: "module",
        title: row.name,
        htmlUrl: "",
        itemCount: row.itemCount,
      };
    }
  }
}

const kinds = {
  courses: "course",
  assignments: "assignment",
  pages: "page",
  files: "file",
  discussions: "announcement",
  modules: "module",
} as const;

export async function removeSearchEntry(
  ctx: MutationCtx,
  table: TableNames,
  userId: string,
  canvasId: number,
): Promise<void> {
  if (!(table in kinds)) return;
  const kind = kinds[table as keyof typeof kinds];
  const existing = await ctx.db
    .query("searchEntries")
    .withIndex("by_user_kind_canvasId", (q) =>
      q.eq("userId", userId).eq("kind", kind).eq("canvasId", canvasId),
    )
    .unique();
  if (existing) await ctx.db.delete(existing._id);
}

export async function updateSearchEntry<T extends TableNames>(
  ctx: MutationCtx,
  table: T,
  source: Source<T>,
  courseActivity = new Map<string, boolean>(),
): Promise<void> {
  if (!(table in kinds)) return;
  const document = source as unknown as Source<TableNames>;
  let entry = summarize(table, document);
  if (entry && entry.kind !== "course") {
    const { userId, courseCanvasId } = entry;
    const key = JSON.stringify([userId, courseCanvasId]);
    if (!courseActivity.has(key)) {
      const course = await ctx.db
        .query("searchEntries")
        .withIndex("by_user_kind_canvasId", (q) =>
          q
            .eq("userId", userId)
            .eq("kind", "course")
            .eq("canvasId", courseCanvasId),
        )
        .unique();
      courseActivity.set(key, course?.active === true);
    }
    if (!courseActivity.get(key)) entry = undefined;
  }
  if (!entry) {
    const row = document as { userId: string; canvasId: number };
    await removeSearchEntry(ctx, table, row.userId, row.canvasId);
    return;
  }
  const existing = await ctx.db
    .query("searchEntries")
    .withIndex("by_user_kind_canvasId", (q) =>
      q
        .eq("userId", entry.userId)
        .eq("kind", entry.kind)
        .eq("canvasId", entry.canvasId),
    )
    .unique();
  if (
    entry.kind === "course" &&
    entry.active === false &&
    existing?.active === true
  ) {
    await ctx.scheduler.runAfter(0, internal.search.pruneCourse, {
      userId: entry.userId,
      courseCanvasId: entry.courseCanvasId,
    });
  }
  if (!existing) await ctx.db.insert("searchEntries", entry);
  else if (
    (Object.keys(entry) as (keyof Entry)[]).some(
      (key) => entry[key] !== existing[key],
    )
  ) {
    await ctx.db.replace(existing._id, entry);
  }
}
