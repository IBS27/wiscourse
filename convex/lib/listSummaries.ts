import { omit } from "convex-helpers";
import type { Doc, TableNames } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { sameValue } from "./equality";

export const summaryTables = {
  courses: "courseSummaries", assignments: "assignmentSummaries",
  quizzes: "quizSummaries", discussions: "discussionSummaries",
} as const;
export type ListSource = keyof typeof summaryTables;

export function isListSource(table: TableNames): table is ListSource {
  return table in summaryTables;
}

export function announcementExcerpt(html: string | undefined): string | undefined {
  const text = html?.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 320) : undefined;
}

export function summarizeSource(table: ListSource, source: Doc<ListSource>) {
  switch (table) {
    case "courses": {
      const row = source as Doc<"courses">;
      return { ...omit(row, ["_id", "_creationTime", "syllabusBody", "syncedAt"]),
        sourceId: row._id, sourceCreatedAt: row._creationTime };
    }
    case "assignments": {
      const row = source as Doc<"assignments">;
      return { ...omit(row, ["_id", "_creationTime", "description", "submission", "syncedAt", "canvasUpdatedAt"]),
        submission: row.submission ? omit(row.submission, ["comments"]) : undefined,
        sourceId: row._id, sourceCreatedAt: row._creationTime };
    }
    case "quizzes": {
      const row = source as Doc<"quizzes">;
      return { ...omit(row, ["_id", "_creationTime", "description", "syncedAt"]),
        sourceId: row._id, sourceCreatedAt: row._creationTime };
    }
    case "discussions": {
      const row = source as Doc<"discussions">;
      return { ...omit(row, ["_id", "_creationTime", "message", "syncedAt"]),
        excerpt: announcementExcerpt(row.message), sourceId: row._id, sourceCreatedAt: row._creationTime };
    }
  }
}

/** Called in the same transaction as every source write, including backfill. */
export async function syncListSummary(ctx: MutationCtx, table: ListSource, source: Doc<ListSource>) {
  const target = summaryTables[table];
  const next = summarizeSource(table, source);
  const existing = await ctx.db.query(target).withIndex("by_user_canvasId", (q) =>
    q.eq("userId", source.userId).eq("canvasId", source.canvasId)).unique();
  if (!existing) await ctx.db.insert(target, next);
  else if (!sameValue(omit(existing, ["_id", "_creationTime"]), next))
    await ctx.db.replace(existing._id, next);
}

export async function removeListSummary(ctx: MutationCtx, table: TableNames, userId: string, canvasId: number) {
  if (!isListSource(table)) return;
  const existing = await ctx.db.query(summaryTables[table]).withIndex("by_user_canvasId", (q) =>
    q.eq("userId", userId).eq("canvasId", canvasId)).unique();
  if (existing) await ctx.db.delete(existing._id);
}

/** Only the deliberate reader switch is a list dependency, never sync status
 * or migration progress. A rollback leaves the compatible writers running. */
export async function compactListsEnabled(ctx: QueryCtx | MutationCtx) {
  const state = await ctx.db.query("listRollout").withIndex("by_key", (q) =>
    q.eq("key", "compact-v1")).unique();
  return state?.enabled === true;
}

export function sourceOrder(row: { _creationTime: number; sourceCreatedAt?: number }) {
  return row.sourceCreatedAt ?? row._creationTime;
}
