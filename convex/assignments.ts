import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

// Respect Canvas grade-posting policies: a submission can be graded while
// the teacher still withholds the score (manual post policy). Never expose
// score/grade unless postedAt is set.
function sanitize(assignment: Doc<"assignments">) {
  const { submission } = assignment;
  if (submission?.postedAt !== undefined) return assignment;
  return {
    ...assignment,
    scoreStatistics: undefined,
    submission: submission && {
      ...submission,
      score: undefined,
      grade: undefined,
      comments: undefined,
    },
  };
}

export const upcoming = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return [];
    const now = Date.now();
    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_user_dueAt", (q) =>
        q.eq("userId", identity.subject).gte("dueAt", now),
      )
      .take(30);

    const courses = await ctx.db
      .query("courses")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
    const courseNames = new Map(courses.map((c) => [c.canvasId, c.name]));

    return assignments.map((assignment) => ({
      ...sanitize(assignment),
      courseName: courseNames.get(assignment.courseCanvasId) ?? "Unknown course",
    }));
  },
});

export const byCourse = query({
  args: { courseCanvasId: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return [];
    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", identity.subject).eq("courseCanvasId", args.courseCanvasId),
      )
      .collect();
    return assignments
      .sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity))
      .map(sanitize);
  },
});
