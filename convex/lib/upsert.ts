// Generic upsert/prune for synced tables. Every synced table has the
// `by_user_canvasId` index on ["userId", "canvasId"] and a `syncedAt`
// column; this keeps the per-table store mutations to a one-liner.

import type { TableNames } from "../_generated/dataModel";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { IndexRange, WithoutSystemFields } from "convex/server";
import { sourceChanged } from "./courseSource";
import { touchInterpretation } from "./interpretationRevision";
import { removeSearchEntry, updateSearchEntry } from "./searchEntries";
import schema from "../schema";
import { sameValue } from "./equality";
import { isListSource, syncListSummary, removeListSummary, type ListSource } from "./listSummaries";

// Convex's index-builder types don't distribute over a union of table
// names, so the two shared indexes are typed structurally here. Every
// SyncedTable declares both indexes in schema.ts with exactly these fields.
type UserCanvasIdRange = {
  eq(field: "userId", value: string): {
    eq(field: "canvasId", value: number): IndexRange;
  };
};
type UserCourseRange = {
  eq(field: "userId", value: string): {
    eq(field: "courseCanvasId", value: number): IndexRange;
  };
};
type SyncedDoc = { _id: unknown; canvasId: number };

type SyncedTableNames = {
  [T in TableNames]: Doc<T> extends { syncedAt: number } ? T : T extends "calendarEvents" ? T : never;
}[TableNames];

/** Fields the caller supplies: the row minus what we fill in. */
export type UpsertRow<T extends SyncedTableNames> = Omit<
  WithoutSystemFields<Doc<T>>,
  "userId" | "syncedAt"
>;

/**
 * Rows are normalized snapshots: omitted optional source fields are cleared.
 * Locally derived fields survive. Submission comments are the exception:
 * Canvas omits them in partial responses; an explicit [] clears them.
 * syncedAt records the last persisted content change, not a sync attempt.
 */
export async function upsertByCanvasId<T extends SyncedTableNames>(
  ctx: MutationCtx,
  table: T,
  userId: string,
  rows: ReadonlyArray<UpsertRow<T>>,
  beforeWrite?: (existing: Doc<T> | null, next: UpsertRow<T>) => Promise<void>,
): Promise<void> {
  const now = Date.now();
  const courseActivity = new Map<string, boolean>();
  const changedCourses = new Set<number>();
  for (const row of rows) {
    const canvasId = (row as unknown as SyncedDoc).canvasId;
    const existing = (await ctx.db
      .query(table)
      .withIndex("by_user_canvasId", (q) =>
        (q as unknown as UserCanvasIdRange)
          .eq("userId", userId)
          .eq("canvasId", canvasId),
      )
      .unique()) as Doc<T> | null;
    const fields: Record<string, unknown> = {};
    const incoming = row as Record<string, unknown>;
    for (const key of Object.keys(schema.tables[table].validator.fields)) {
      if (key === "syncedAt" || key === "userId" ||
        (table === "courses" && key === "verifiedInstructors")) continue;
      fields[key] = incoming[key];
    }
    if (table === "pages" && incoming.body === undefined) {
      const previous = existing as Doc<"pages"> | null;
      // Page metadata responses may omit the body. Explicit unavailable or
      // locked responses must still remove previously accessible content.
      fields.body = incoming.contentUnavailable === true || incoming.lockedForUser === true
        ? "" : previous?.body;
      fields.contentUnavailable = incoming.contentUnavailable ?? previous?.contentUnavailable;
    }
    if (table === "assignments") {
      const previous = existing as Doc<"assignments"> | null;
      const submission = incoming.submission as Doc<"assignments">["submission"];
      // No submission object means the endpoint did not include one. Clearing
      // a grade is represented by a submission without postedAt/score/grade.
      fields.submission = submission === undefined ? previous?.submission : {
        ...submission, comments: submission.comments ?? previous?.submission?.comments,
      };
    }
    const doc = { ...fields, userId } as unknown as WithoutSystemFields<Doc<T>>;
    await beforeWrite?.(existing, doc as UpsertRow<T>);
    if (sourceChanged(table, existing, { ...existing, ...doc })) {
      const source = doc as { courseCanvasId?: number; canvasId?: number };
      const courseId = table === "courses" ? source.canvasId : source.courseCanvasId;
      if (courseId !== undefined) changedCourses.add(courseId);
    }
    const changed = existing === null || Object.entries(fields).some(([key, value]) =>
      !sameValue((existing as Record<string, unknown>)[key], value));
    let saved = existing;
    if (changed) {
      if (existing) await ctx.db.patch(existing._id, { ...doc, syncedAt: now });
      else {
        const id = await ctx.db.insert(table, { ...doc, syncedAt: now });
        if (isListSource(table)) saved = await ctx.db.get(id) as Doc<T>;
      }
    }
    if (isListSource(table) && saved) {
      await syncListSummary(ctx, table, { ...saved, ...doc } as unknown as Doc<ListSource>);
    }
    // Reconcile the small search projection even on a replay: a course may
    // have become active again since its child search entries were pruned.
    await updateSearchEntry(ctx, table, doc, courseActivity);
  }
  for (const courseId of changedCourses) await touchInterpretation(ctx, userId, courseId);
}

/**
 * Delete rows for a course that are no longer in `keepCanvasIds`. Only
 * call from a *full* sync, where the caller has fetched the complete set.
 */
export async function pruneCourseRows<T extends SyncedTableNames>(
  ctx: MutationCtx,
  table: T,
  userId: string,
  courseCanvasId: number,
  keepCanvasIds: ReadonlyArray<number>,
): Promise<number[]> {
  const keep = new Set(keepCanvasIds);
  const deleted: number[] = [];
  const rows = (await ctx.db
    .query(table)
    .withIndex("by_user_course", (q) =>
      (q as unknown as UserCourseRange)
        .eq("userId", userId)
        .eq("courseCanvasId", courseCanvasId),
    )
    .collect()) as Doc<T>[];
  for (const row of rows) {
    const canvasId = (row as unknown as SyncedDoc).canvasId;
    if (!keep.has(canvasId)) {
      await removeListSummary(ctx, table, userId, canvasId);
      await ctx.db.delete(row._id);
      await removeSearchEntry(ctx, table, userId, canvasId);
      deleted.push(canvasId);
    }
  }
  if (deleted.length > 0 && sourceChanged(table, null, {})) await touchInterpretation(ctx, userId, courseCanvasId);
  return deleted;
}
