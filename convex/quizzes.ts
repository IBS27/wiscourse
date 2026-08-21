import { v } from "convex/values";
import { query } from "./_generated/server";

export const listByCourse = query({
  args: { courseCanvasId: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return [];
    const quizzes = await ctx.db
      .query("quizzes")
      .withIndex("by_user_course", (q) =>
        q
          .eq("userId", identity.subject)
          .eq("courseCanvasId", args.courseCanvasId),
      )
      .collect();
    // Undated quizzes (practice, surveys) sort after the dated ones.
    return quizzes.sort(
      (a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity),
    );
  },
});
