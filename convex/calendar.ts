import { v } from "convex/values";
import { query } from "./_generated/server";

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
