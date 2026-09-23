// Calendar reads and the one local-write surface here: events the student
// makes. Canvas events are a pure mirror (sync owns them); due times and
// planned todos come from `todos.list`; class meetings from `meetings`.

import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUserId } from "./lib/auth";
import { localEventFields } from "./schema";
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


export interface LocalEventFields {
  title: string;
  startAt: number;
  endAt?: number;
  allDay?: boolean;
  location?: string;
  description?: string;
  courseCanvasId?: number;
}

function cleanEvent(args: LocalEventFields) {
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

/** The user's own local event; Canvas events are a read-only mirror. */
export async function ownLocalEvent(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  id: Id<"calendarEvents">,
): Promise<Doc<"calendarEvents">> {
  const existing = await ctx.db.get(id);
  if (existing === null || existing.userId !== userId) throw new Error("Event not found");
  if (existing.source !== "local") throw new Error("Canvas events are read-only");
  return existing;
}

export async function insertLocalEvent(
  ctx: MutationCtx,
  userId: string,
  fields: LocalEventFields,
): Promise<Id<"calendarEvents">> {
  return await ctx.db.insert("calendarEvents", { userId, source: "local", ...cleanEvent(fields) });
}

export async function replaceLocalEvent(
  ctx: MutationCtx,
  userId: string,
  id: Id<"calendarEvents">,
  fields: LocalEventFields,
): Promise<void> {
  await ownLocalEvent(ctx, userId, id);
  await ctx.db.replace(id, { userId, source: "local", ...cleanEvent(fields) });
}

export async function deleteLocalEvent(
  ctx: MutationCtx,
  userId: string,
  id: Id<"calendarEvents">,
): Promise<void> {
  await ownLocalEvent(ctx, userId, id);
  await ctx.db.delete(id);
}

export const createEvent = mutation({
  args: localEventFields,
  returns: v.id("calendarEvents"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await insertLocalEvent(ctx, userId, args);
  },
});

export const updateEvent = mutation({
  args: { id: v.id("calendarEvents"), ...localEventFields },
  returns: v.null(),
  handler: async (ctx, { id, ...args }) => {
    const userId = await requireUserId(ctx);
    await replaceLocalEvent(ctx, userId, id, args);
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
    await deleteLocalEvent(ctx, userId, args.id);
    return null;
  },
});
