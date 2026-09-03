import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";

const DEFAULT_ANNOUNCEMENT_LIMIT = 30;
const announcementItem = v.object({
  _id: v.id("discussions"),
  _creationTime: v.number(),
  ...schema.tables.discussions.validator.fields,
  courseName: v.string(),
});

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
  args: {
    limit: v.optional(v.number()),
    courseCanvasId: v.optional(v.number()),
  },
  returns: v.array(announcementItem),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return [];
    const limit = args.limit ?? DEFAULT_ANNOUNCEMENT_LIMIT;
    const courseCanvasId = args.courseCanvasId;
    const rows =
      courseCanvasId === undefined
        ? await ctx.db
            .query("discussions")
            .withIndex("by_user_announcement_postedAt", (q) =>
              q.eq("userId", identity.subject).eq("isAnnouncement", true),
            )
            .order("desc")
            .take(limit)
        : (
            await ctx.db
              .query("discussions")
              .withIndex("by_user_course_announcement_postedAt", (q) =>
                q
                  .eq("userId", identity.subject)
                  .eq("courseCanvasId", courseCanvasId)
                  .eq("isAnnouncement", true),
              )
              .order("desc")
              .take(limit)
          );

    const courses =
      courseCanvasId === undefined
        ? await ctx.db
            .query("courses")
            .withIndex("by_user", (q) => q.eq("userId", identity.subject))
            .collect()
        : [
            await ctx.db
              .query("courses")
              .withIndex("by_user_canvasId", (q) =>
                q
                  .eq("userId", identity.subject)
                  .eq("canvasId", courseCanvasId),
              )
              .unique(),
          ].filter((course) => course !== null);
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

/** One topic (announcement or discussion) by Canvas id, body included. */
export const get = query({
  args: { canvasId: v.number() },
  returns: v.union(announcementItem, v.null()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const row = await ctx.db
      .query("discussions")
      .withIndex("by_user_canvasId", (q) =>
        q.eq("userId", identity.subject).eq("canvasId", args.canvasId),
      )
      .unique();
    if (row === null) return null;
    const course = await ctx.db
      .query("courses")
      .withIndex("by_user_canvasId", (q) =>
        q.eq("userId", identity.subject).eq("canvasId", row.courseCanvasId),
      )
      .unique();
    return { ...row, courseName: course?.name ?? "Unknown course" };
  },
});
