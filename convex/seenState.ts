// "Have I looked at this yet." One row per (user, kind, canvasId).
//
// For grades, seenVersion is the postedAt last seen. For assignment changes,
// it is the newest changedAt acknowledged.

import { v, type Infer } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { entityKind } from "./schema";
import { requireUserId } from "./lib/auth";

type EntityKind = Infer<typeof entityKind>;

const seenSummary = v.object({
  canvasId: v.number(),
  seenAt: v.number(),
  seenVersion: v.optional(v.string()),
});

export const list = query({
  args: { kind: entityKind },
  returns: v.array(seenSummary),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return [];
    const rows = await ctx.db
      .query("seenState")
      .withIndex("by_user_kind", (q) =>
        q.eq("userId", identity.subject).eq("kind", args.kind),
      )
      .collect();
    return rows.map((row) => ({
      canvasId: row.canvasId,
      seenAt: row.seenAt,
      seenVersion: row.seenVersion,
    }));
  },
});

/** The most recently seen rows, newest first. */
export const recent = query({
  args: { limit: v.number() },
  returns: v.array(
    v.object({
      kind: entityKind,
      canvasId: v.number(),
      seenAt: v.number(),
      seenVersion: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const limit = Math.floor(args.limit);
    if (identity === null || limit <= 0) return [];
    const rows = await ctx.db
      .query("seenState")
      .withIndex("by_user_seenAt", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .take(limit);
    return rows.map((row) => ({
      kind: row.kind,
      canvasId: row.canvasId,
      seenAt: row.seenAt,
      seenVersion: row.seenVersion,
    }));
  },
});

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
  // Preserve legacy grade versions on assignment rows until they are split.
  const row = { userId, kind, canvasId, seenAt: Date.now() };
  if (existing === null) {
    await ctx.db.insert("seenState", { ...row, seenVersion });
  } else {
    const nextVersion =
      kind === "assignmentChange"
        ? String(
            Math.max(
              Number(existing.seenVersion ?? 0),
              Number(seenVersion ?? 0),
            ),
          )
        : seenVersion;
    await ctx.db.patch(
      existing._id,
      nextVersion === undefined ? row : { ...row, seenVersion: nextVersion },
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

export const markUnseen = mutation({
  args: { kind: entityKind, canvasId: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("seenState")
      .withIndex("by_user_kind_canvasId", (q) =>
        q.eq("userId", userId).eq("kind", args.kind).eq("canvasId", args.canvasId),
      )
      .unique();
    if (args.kind === "grade") {
      // Clear the legacy grade version without changing the assignment's recency.
      const assignment = await ctx.db
        .query("seenState")
        .withIndex("by_user_kind_canvasId", (q) =>
          q.eq("userId", userId).eq("kind", "assignment").eq("canvasId", args.canvasId),
        )
        .unique();
      if (assignment?.seenVersion !== undefined) {
        await ctx.db.patch(assignment._id, { seenVersion: undefined });
      }
    } else if (args.kind === "assignment" && existing?.seenVersion !== undefined) {
      const grade = await ctx.db
        .query("seenState")
        .withIndex("by_user_kind_canvasId", (q) =>
          q.eq("userId", userId).eq("kind", "grade").eq("canvasId", args.canvasId),
        )
        .unique();
      if (!grade) {
        await ctx.db.insert("seenState", {
          userId,
          kind: "grade",
          canvasId: args.canvasId,
          seenAt: existing.seenAt,
          seenVersion: existing.seenVersion,
        });
      }
    }
    if (existing) await ctx.db.delete(existing._id);
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
