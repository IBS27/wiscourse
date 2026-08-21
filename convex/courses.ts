import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { COURSE_COLORS, courseColor } from "./schema";
import { requireUserId } from "./lib/auth";

/**
 * Courses with their local-only presentation (colour, nickname, order,
 * hidden) folded in. A course with no saved colour gets one from the
 * palette by its position in the canvasId order, so colours are stable
 * across syncs without a write.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return [];
    const userId = identity.subject;
    const courses = await ctx.db
      .query("courses")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const prefs = await ctx.db
      .query("coursePrefs")
      .withIndex("by_user_course", (q) => q.eq("userId", userId))
      .collect();
    const prefByCourse = new Map(prefs.map((p) => [p.courseCanvasId, p]));

    // `syllabusBody` is unbounded instructor HTML; keep it out of the list
    // payload and let `get` fetch it for the one course being viewed.
    return courses
      .sort((a, b) => a.canvasId - b.canvasId)
      .map((course, index) => {
        const pref = prefByCourse.get(course.canvasId);
        return {
          ...course,
          syllabusBody: undefined,
          color: pref?.color ?? COURSE_COLORS[index % COURSE_COLORS.length],
          nickname: pref?.nickname,
          position: pref?.position,
          hidden: pref?.hidden ?? false,
        };
      })
      .sort((a, b) => {
        if (a.position !== b.position) {
          return (a.position ?? Infinity) - (b.position ?? Infinity);
        }
        return a.name.localeCompare(b.name);
      });
  },
});

/** The single course, syllabus included. Fetched only when one is opened. */
export const get = query({
  args: { canvasId: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    return await ctx.db
      .query("courses")
      .withIndex("by_user_canvasId", (q) =>
        q.eq("userId", identity.subject).eq("canvasId", args.canvasId),
      )
      .unique();
  },
});

export const setPrefs = mutation({
  args: {
    courseCanvasId: v.number(),
    color: v.optional(courseColor),
    nickname: v.optional(v.union(v.string(), v.null())),
    hidden: v.optional(v.boolean()),
    position: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { courseCanvasId, ...rest } = args;
    const patch = {
      ...(rest.color !== undefined && { color: rest.color }),
      ...(rest.nickname !== undefined && { nickname: rest.nickname ?? undefined }),
      ...(rest.hidden !== undefined && { hidden: rest.hidden }),
      ...(rest.position !== undefined && { position: rest.position ?? undefined }),
    };
    const existing = await ctx.db
      .query("coursePrefs")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", userId).eq("courseCanvasId", courseCanvasId),
      )
      .unique();
    if (existing) await ctx.db.patch(existing._id, patch);
    else await ctx.db.insert("coursePrefs", { userId, courseCanvasId, ...patch });
    return null;
  },
});
