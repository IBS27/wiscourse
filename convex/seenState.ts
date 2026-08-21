// "Have I looked at this yet." One row per (user, kind, canvasId).
//
// For grades the row also carries `seenVersion` — the submission's
// `postedAt` at the moment the student looked — so a regrade or a late
// post makes the item unseen again.

import { v, type Infer } from "convex/values";
import {
  mutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { entityKind } from "./schema";
import { requireUserId } from "./lib/auth";

type EntityKind = Infer<typeof entityKind>;

/** The grade "version" a student has seen: the posted-at timestamp. */
export function gradeVersion(postedAt: number): string {
  return String(postedAt);
}

export async function upsertSeen(
  ctx: MutationCtx,
  userId: string,
  kind: EntityKind,
  canvasId: number,
  seenVersion: string | undefined,
): Promise<void> {
  const existing = await ctx.db
    .query("seenState")
    .withIndex("by_user_kind_canvasId", (q) =>
      q.eq("userId", userId).eq("kind", kind).eq("canvasId", canvasId),
    )
    .unique();
  // A grade and a "new assignment" feed item share one row, so an update
  // without a version must not clear the grade version already acknowledged.
  const row = { userId, kind, canvasId, seenAt: Date.now() };
  if (existing === null) {
    await ctx.db.insert("seenState", { ...row, seenVersion });
  } else {
    await ctx.db.patch(
      existing._id,
      seenVersion === undefined ? row : { ...row, seenVersion },
    );
  }
}

export const markSeen = mutation({
  args: {
    kind: entityKind,
    canvasId: v.number(),
    seenVersion: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await upsertSeen(ctx, userId, args.kind, args.canvasId, args.seenVersion);
    return null;
  },
});

export const markManySeen = mutation({
  args: {
    items: v.array(
      v.object({
        kind: entityKind,
        canvasId: v.number(),
        seenVersion: v.optional(v.string()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    for (const item of args.items) {
      await upsertSeen(ctx, userId, item.kind, item.canvasId, item.seenVersion);
    }
    return null;
  },
});

/** Every seen row of one kind, keyed by canvasId. */
export async function getSeenSet(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  kind: EntityKind,
): Promise<Map<number, Doc<"seenState">>> {
  const rows = await ctx.db
    .query("seenState")
    .withIndex("by_user_kind", (q) => q.eq("userId", userId).eq("kind", kind))
    .collect();
  return new Map(rows.map((row) => [row.canvasId, row]));
}

