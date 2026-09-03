// Generic upsert/prune for synced tables. Every synced table has the
// `by_user_canvasId` index on ["userId", "canvasId"] and a `syncedAt`
// column; this keeps the per-table store mutations to a one-liner.

import type { TableNames } from "../_generated/dataModel";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { IndexRange, WithoutSystemFields } from "convex/server";

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
  [T in TableNames]: Doc<T> extends { canvasId?: number; syncedAt?: number }
    ? T
    : never;
}[TableNames];

/** Fields the caller supplies: the row minus what we fill in. */
export type UpsertRow<T extends SyncedTableNames> = Omit<
  WithoutSystemFields<Doc<T>>,
  "userId" | "syncedAt"
>;

/**
 * Insert or patch rows keyed by (userId, canvasId). Patches replace the
 * provided fields only, so columns that live outside the sync payload
 * (none today, by design — local state lives in `todos`/`seenState`)
 * survive untouched.
 */
export async function upsertByCanvasId<T extends SyncedTableNames>(
  ctx: MutationCtx,
  table: T,
  userId: string,
  rows: ReadonlyArray<UpsertRow<T>>,
): Promise<void> {
  const now = Date.now();
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
    const doc = { ...row, userId, syncedAt: now } as unknown as WithoutSystemFields<
      Doc<T>
    >;
    if (existing) {
      await ctx.db.patch(existing._id, doc);
    } else {
      await ctx.db.insert(table, doc);
    }
  }
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
      await ctx.db.delete(row._id);
      deleted.push(canvasId);
    }
  }
  return deleted;
}
