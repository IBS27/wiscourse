// Local state layered over synced Canvas rows: "I marked this done" and
// "hide this from my list". Kept separate from the synced tables so a
// resync never clobbers it.
//
// Phase 2 of sync work: mirror these to Canvas planner overrides
// (POST /planner/overrides, PUT /planner/overrides/:id) so marking an item
// complete here also marks it complete in the official Canvas apps. Store
// the returned override id in `canvasPlannerOverrideId` and use it to
// choose POST vs PUT on the next push.

import { v, type Infer } from "convex/values";
import { mutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { entityKind } from "./schema";
import { requireUserId } from "./lib/auth";

type EntityKind = Infer<typeof entityKind>;

/** Map key for an override / the todo list's override lookup. */
export function overrideKey(kind: EntityKind, canvasId: number): string {
  return `${kind}:${canvasId}`;
}

async function find(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  kind: EntityKind,
  canvasId: number,
): Promise<Doc<"overrides"> | null> {
  return await ctx.db
    .query("overrides")
    .withIndex("by_user_kind_canvasId", (q) =>
      q.eq("userId", userId).eq("kind", kind).eq("canvasId", canvasId),
    )
    .unique();
}

/**
 * Upsert one field of an override. Rows that end up carrying no local
 * state and no Canvas override id are deleted rather than left as tombstones.
 */
async function patchOverride(
  ctx: MutationCtx,
  userId: string,
  kind: EntityKind,
  canvasId: number,
  fields: Partial<Pick<Doc<"overrides">, "completedAt" | "dismissedAt">>,
): Promise<null> {
  const existing = await find(ctx, userId, kind, canvasId);
  if (existing === null) {
    if (fields.completedAt === undefined && fields.dismissedAt === undefined) {
      return null; // nothing to clear
    }
    await ctx.db.insert("overrides", { userId, kind, canvasId, ...fields });
    return null;
  }
  const next = { ...existing, ...fields };
  if (
    next.completedAt === undefined &&
    next.dismissedAt === undefined &&
    next.canvasPlannerOverrideId === undefined
  ) {
    await ctx.db.delete(existing._id);
    return null;
  }
  await ctx.db.patch(existing._id, fields);
  return null;
}

export const setCompleted = mutation({
  args: { kind: entityKind, canvasId: v.number(), completed: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await patchOverride(ctx, userId, args.kind, args.canvasId, {
      completedAt: args.completed ? Date.now() : undefined,
    });
  },
});

export const setDismissed = mutation({
  args: { kind: entityKind, canvasId: v.number(), dismissed: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await patchOverride(ctx, userId, args.kind, args.canvasId, {
      dismissedAt: args.dismissed ? Date.now() : undefined,
    });
  },
});

/**
 * All of a user's overrides, keyed `${kind}:${canvasId}`. The todo list
 * reads every source table anyway, so one collect beats a lookup per item.
 */
export async function getOverrideMap(
  ctx: QueryCtx | MutationCtx,
  userId: string,
): Promise<Map<string, Doc<"overrides">>> {
  const rows = await ctx.db
    .query("overrides")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return new Map(rows.map((row) => [overrideKey(row.kind, row.canvasId), row]));
}
