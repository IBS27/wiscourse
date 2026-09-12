// Calendar reads and the one local-write surface here: events the student
// makes. Canvas events are a pure mirror (sync owns them); due times and
// planned todos come from `todos.list`; class meetings from `meetings`.

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { DAY_MS } from "./lib/time";

// The longest event we expect to span into a window (a semester break).
const MAX_EVENT_SPAN_MS = 21 * DAY_MS;

/** Events overlapping [start, end): started inside it, or earlier and still running. */
export const range = query({
  args: { start: v.number(), end: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return [];
    const rows = await ctx.db
      .query("calendarEvents")
      .withIndex("by_user_startAt", (q) =>
        q
          .eq("userId", identity.subject)
          .gte("startAt", args.start - MAX_EVENT_SPAN_MS)
          .lt("startAt", args.end),
      )
      .collect();
    return rows.filter((row) => (row.endAt ?? row.startAt) >= args.start);
  },
});

const localEventFields = {
  title: v.string(),
  startAt: v.number(),
  endAt: v.optional(v.number()),
  allDay: v.optional(v.boolean()),
  location: v.optional(v.string()),
  description: v.optional(v.string()),
  courseCanvasId: v.optional(v.number()),
};

function cleanEvent(args: {
  title: string;
  startAt: number;
  endAt?: number;
  allDay?: boolean;
  location?: string;
  description?: string;
  courseCanvasId?: number;
}) {
  const title = args.title.trim();
  if (title === "") throw new Error("Give the event a title");
  if (args.endAt !== undefined && args.endAt < args.startAt) throw new Error("Event ends before it starts");
  const text = (s: string | undefined) => (s?.trim() === "" ? undefined : s?.trim());
  return {
    title,
    startAt: args.startAt,
    endAt: args.endAt,
    allDay: args.allDay,
    location: text(args.location),
    description: text(args.description),
    courseCanvasId: args.courseCanvasId,
  };
}

export const createEvent = mutation({
  args: localEventFields,
  returns: v.id("calendarEvents"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await ctx.db.insert("calendarEvents", {
      userId,
      source: "local",
      ...cleanEvent(args),
    });
  },
});

export const updateEvent = mutation({
  args: { id: v.id("calendarEvents"), ...localEventFields },
  returns: v.null(),
  handler: async (ctx, { id, ...args }) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db.get(id);
    if (existing === null || existing.userId !== userId) throw new Error("Event not found");
    if (existing.source !== "local") throw new Error("Canvas events are read-only");
    await ctx.db.replace(id, { userId, source: "local", ...cleanEvent(args) });
    return null;
  },
});

export const deleteEvent = mutation({
  args: { id: v.id("calendarEvents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db.get(args.id);
    if (existing === null || existing.userId !== userId) return null;
    if (existing.source !== "local") throw new Error("Canvas events are read-only");
    await ctx.db.delete(args.id);
    return null;
  },
});
