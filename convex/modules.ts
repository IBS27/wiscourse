import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/**
 * The modules page of a course: modules in Canvas order, each with its
 * items nested. Two indexed reads, no per-module fan-out — moduleItems
 * carry `courseCanvasId` precisely so this stays one query.
 */
export const listByCourse = query({
  args: { courseCanvasId: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return [];

    const [modules, items] = [
      await ctx.db
        .query("modules")
        .withIndex("by_user_course", (q) =>
          q.eq("userId", identity.subject).eq("courseCanvasId", args.courseCanvasId),
        )
        .collect(),
      await ctx.db
        .query("moduleItems")
        .withIndex("by_user_course", (q) =>
          q.eq("userId", identity.subject).eq("courseCanvasId", args.courseCanvasId),
        )
        .collect(),
    ];

    const byModule = new Map<number, Doc<"moduleItems">[]>();
    for (const item of items) {
      const bucket = byModule.get(item.moduleCanvasId);
      if (bucket) bucket.push(item);
      else byModule.set(item.moduleCanvasId, [item]);
    }
    for (const bucket of byModule.values()) {
      bucket.sort((a, b) => a.position - b.position);
    }

    return modules
      .sort((a, b) => a.position - b.position)
      .map((module) => ({
        ...module,
        items: byModule.get(module.canvasId) ?? [],
      }));
  },
});
