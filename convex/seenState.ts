// "Have I looked at this yet." One row per (user, kind, canvasId).
//
// For grades the row also carries `seenVersion` — the submission's
// `postedAt` at the moment the student looked — so a regrade or a late
// post makes the item unseen again.

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

const DAY_MS = 24 * 60 * 60 * 1000;
const ANNOUNCEMENT_WINDOW_MS = 30 * DAY_MS;

/** The grade "version" a student has seen: the posted-at timestamp. */
export function gradeVersion(postedAt: number): string {
  return String(postedAt);
}

async function upsertSeen(
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
  const row = { userId, kind, canvasId, seenAt: Date.now(), seenVersion };
  if (existing === null) {
    await ctx.db.insert("seenState", row);
  } else {
    await ctx.db.patch(existing._id, row);
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

export const unseenCounts = query({
  args: {},
  returns: v.object({ announcements: v.number(), grades: v.number() }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return { announcements: 0, grades: 0 };
    const userId = identity.subject;
    const since = Date.now() - ANNOUNCEMENT_WINDOW_MS;

    const announcementRows = await ctx.db
      .query("discussions")
      .withIndex("by_user_announcement_postedAt", (q) =>
        q.eq("userId", userId).eq("isAnnouncement", true).gte("postedAt", since),
      )
      .collect();
    const seenDiscussions = await getSeenSet(ctx, userId, "discussion");
    const announcements = announcementRows.filter(
      (row) => !seenDiscussions.has(row.canvasId),
    ).length;

    // A grade counts as unseen once it is *posted*; an unposted grade is
    // not shown at all, so it can never be pending.
    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const seenAssignments = await getSeenSet(ctx, userId, "assignment");
    const grades = assignments.filter((assignment) => {
      const postedAt = assignment.submission?.postedAt;
      if (postedAt === undefined) return false;
      const seen = seenAssignments.get(assignment.canvasId);
      return seen === undefined || seen.seenVersion !== gradeVersion(postedAt);
    }).length;

    return { announcements, grades };
  },
});
