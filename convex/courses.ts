import { v } from "convex/values";
import { query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return [];
    const courses = await ctx.db
      .query("courses")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
    // `syllabusBody` is unbounded instructor HTML; keep it out of the list
    // payload and let `get` fetch it for the one course being viewed.
    return courses
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((course) => ({ ...course, syllabusBody: undefined }));
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
