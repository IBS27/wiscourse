import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const DEFAULT_ANNOUNCEMENT_LIMIT = 30;

/** Newest activity on a topic: a reply if there is one, else its posting. */
function activityAt(discussion: Doc<"discussions">): number {
  return Math.max(discussion.lastReplyAt ?? 0, discussion.postedAt ?? 0);
}

/**
 * The cross-course announcement feed, newest first. Served straight off
 * `by_user_announcement_postedAt`, so the limit is applied in the index
 * rather than after loading every announcement the user has.
 */
export const announcements = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return [];
    const rows = await ctx.db
      .query("discussions")
      .withIndex("by_user_announcement_postedAt", (q) =>
        q.eq("userId", identity.subject).eq("isAnnouncement", true),
      )
      .order("desc")
      .take(args.limit ?? DEFAULT_ANNOUNCEMENT_LIMIT);

    const courses = await ctx.db
      .query("courses")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
    const courseNames = new Map(courses.map((c) => [c.canvasId, c.name]));

    return rows.map((row) => ({
      ...row,
      courseName: courseNames.get(row.courseCanvasId) ?? "Unknown course",
    }));
  },
});

/**
 * Every topic in one course — announcements included, flagged by
 * `isAnnouncement` — pinned first, then by most recent activity.
 */
export const listByCourse = query({
  args: { courseCanvasId: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return [];
    const rows = await ctx.db
      .query("discussions")
      .withIndex("by_user_course", (q) =>
        q
          .eq("userId", identity.subject)
          .eq("courseCanvasId", args.courseCanvasId),
      )
      .collect();
    return rows.sort((a, b) => {
      const pinned = Number(b.pinned ?? false) - Number(a.pinned ?? false);
      return pinned !== 0 ? pinned : activityAt(b) - activityAt(a);
    });
  },
});
