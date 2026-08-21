import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";

// Local + planner tasks only, for the Tasks page. The unified todo list
// (assignments, quizzes, discussions, and these) lives in `todos.list`;
// prefer it anywhere the user is looking at "everything I have to do".
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return [];
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
    return tasks.sort((a, b) => {
      if ((a.completedAt === undefined) !== (b.completedAt === undefined)) {
        return a.completedAt === undefined ? -1 : 1;
      }
      return (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity);
    });
  },
});

export const add = mutation({
  args: {
    title: v.string(),
    details: v.optional(v.string()),
    dueAt: v.optional(v.number()),
    courseCanvasId: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await ctx.db.insert("tasks", {
      userId,
      title: args.title,
      details: args.details,
      dueAt: args.dueAt,
      courseCanvasId: args.courseCanvasId,
      source: "local",
    });
    // Phase 2 of sync work: also create a Canvas planner note
    // (POST /planner_notes) so the task shows in the official apps too.
  },
});

export const toggle = mutation({
  args: { id: v.id("tasks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const task = await ctx.db.get(args.id);
    if (!task || task.userId !== userId) {
      throw new Error("Task not found");
    }
    await ctx.db.patch(args.id, {
      completedAt: task.completedAt === undefined ? Date.now() : undefined,
    });
    // Phase 2 of sync work: push completion to Canvas via
    // POST/PUT /planner/overrides for canvas-sourced tasks.
    return null;
  },
});
