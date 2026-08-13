import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";

export const range = query({
  args: { start: v.number(), end: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return [];
    return await ctx.db
      .query("calendarEvents")
      .withIndex("by_user_startAt", (q) =>
        q
          .eq("userId", identity.subject)
          .gte("startAt", args.start)
          .lt("startAt", args.end),
      )
      .collect();
  },
});

export const addEvent = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    startAt: v.number(),
    endAt: v.optional(v.number()),
    allDay: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await ctx.db.insert("calendarEvents", {
      userId,
      source: "local",
      ...args,
    });
    // Phase 2 of sync work: optionally mirror to Canvas as a personal
    // event (POST /calendar_events with context_code user_<id>).
  },
});
