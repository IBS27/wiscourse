// Class meetings the student enters (Canvas has no meeting times). Wall-clock
// in the campus zone; convex/lib/meetings.ts expands them into instants.

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { meetingKind } from "./schema";
import { requireUserId } from "./lib/auth";

const meetingFields = {
  courseCanvasId: v.number(),
  kind: meetingKind,
  label: v.optional(v.string()),
  days: v.array(v.number()),
  startMinute: v.number(),
  endMinute: v.number(),
  location: v.optional(v.string()),
  startsOn: v.optional(v.string()),
  endsOn: v.optional(v.string()),
};

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

function validate(args: {
  days: number[];
  startMinute: number;
  endMinute: number;
  startsOn?: string;
  endsOn?: string;
}): void {
  if (args.days.length === 0) throw new Error("Pick at least one day");
  if (args.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error("Bad weekday");
  if (new Set(args.days).size !== args.days.length) throw new Error("Duplicate weekday");
  const minute = (m: number) => Number.isInteger(m) && m >= 0 && m <= 24 * 60;
  if (!minute(args.startMinute) || !minute(args.endMinute)) throw new Error("Bad time");
  if (args.endMinute <= args.startMinute) throw new Error("Meeting must end after it starts");
  for (const key of [args.startsOn, args.endsOn]) {
    if (key !== undefined && !DAY_KEY.test(key)) throw new Error("Bad date");
  }
  if (args.startsOn !== undefined && args.endsOn !== undefined && args.endsOn < args.startsOn) {
    throw new Error("Meeting must end after it starts");
  }
}

function clean(text: string | undefined): string | undefined {
  const t = text?.trim();
  return t === undefined || t === "" ? undefined : t;
}

/** Every meeting the user has, across courses. The calendar filters. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return [];
    return await ctx.db
      .query("courseMeetings")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
  },
});

export const forCourse = query({
  args: { courseCanvasId: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return [];
    const rows = await ctx.db
      .query("courseMeetings")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", identity.subject).eq("courseCanvasId", args.courseCanvasId),
      )
      .collect();
    return rows.sort(
      (a, b) => Math.min(...a.days) - Math.min(...b.days) || a.startMinute - b.startMinute,
    );
  },
});

export const create = mutation({
  args: meetingFields,
  returns: v.id("courseMeetings"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    validate(args);
    return await ctx.db.insert("courseMeetings", {
      userId,
      ...args,
      days: [...args.days].sort((a, b) => a - b),
      label: clean(args.label),
      location: clean(args.location),
    });
  },
});

export const update = mutation({
  args: { id: v.id("courseMeetings"), ...meetingFields },
  returns: v.null(),
  handler: async (ctx, { id, ...args }) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db.get(id);
    if (existing === null || existing.userId !== userId) throw new Error("Meeting not found");
    validate(args);
    await ctx.db.replace(id, {
      userId,
      ...args,
      days: [...args.days].sort((a, b) => a - b),
      label: clean(args.label),
      location: clean(args.location),
    });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("courseMeetings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db.get(args.id);
    if (existing === null || existing.userId !== userId) return null;
    await ctx.db.delete(args.id);
    return null;
  },
});
