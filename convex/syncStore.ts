// Internal db reads/writes used by the sync actions. Mutations are
// exactly-once in Convex, so all persistence happens here while the
// at-most-once actions in sync.ts only talk to Canvas.

import { v, type Infer } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { submissionFields } from "./schema";

const courseUpsert = v.object({
  canvasId: v.number(),
  name: v.string(),
  courseCode: v.string(),
  term: v.optional(v.string()),
  startAt: v.optional(v.number()),
  endAt: v.optional(v.number()),
  isFavorite: v.optional(v.boolean()),
});

const assignmentUpsert = v.object({
  courseCanvasId: v.number(),
  canvasId: v.number(),
  name: v.string(),
  dueAt: v.optional(v.number()),
  pointsPossible: v.optional(v.number()),
  htmlUrl: v.string(),
  submissionTypes: v.array(v.string()),
  submission: v.optional(submissionFields),
});

const announcementUpsert = v.object({
  courseCanvasId: v.number(),
  canvasId: v.number(),
  title: v.string(),
  message: v.string(),
  postedAt: v.optional(v.number()),
  htmlUrl: v.string(),
});

const calendarEventUpsert = v.object({
  canvasId: v.number(),
  contextCode: v.optional(v.string()),
  title: v.string(),
  description: v.optional(v.string()),
  startAt: v.number(),
  endAt: v.optional(v.number()),
  allDay: v.optional(v.boolean()),
  location: v.optional(v.string()),
});

const plannerNoteUpsert = v.object({
  canvasPlannerNoteId: v.number(),
  title: v.string(),
  details: v.optional(v.string()),
  dueAt: v.optional(v.number()),
  courseCanvasId: v.optional(v.number()),
});

export type CourseUpsert = Infer<typeof courseUpsert>;
export type AssignmentUpsert = Infer<typeof assignmentUpsert>;
export type AnnouncementUpsert = Infer<typeof announcementUpsert>;
export type CalendarEventUpsert = Infer<typeof calendarEventUpsert>;
export type PlannerNoteUpsert = Infer<typeof plannerNoteUpsert>;

export const getSyncState = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("syncState")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

export const getCourseCanvasIds = internalQuery({
  args: { userId: v.string() },
  returns: v.array(v.number()),
  handler: async (ctx, args) => {
    const courses = await ctx.db
      .query("courses")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    return courses.map((course) => course.canvasId);
  },
});

export const listActiveUserIds = internalQuery({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const credentials = await ctx.db.query("canvasCredentials").collect();
    return credentials
      .filter((credential) => credential.status === "active")
      .map((credential) => credential.userId);
  },
});

export const setSyncStatus = internalMutation({
  args: {
    userId: v.string(),
    status: v.union(v.literal("idle"), v.literal("syncing"), v.literal("error")),
    lastError: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("syncState")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (state) {
      await ctx.db.patch(state._id, {
        status: args.status,
        lastError: args.lastError,
      });
    } else {
      await ctx.db.insert("syncState", {
        userId: args.userId,
        status: args.status,
        lastError: args.lastError,
      });
    }
    return null;
  },
});

export const recordSyncResult = internalMutation({
  args: {
    userId: v.string(),
    kind: v.union(v.literal("tripwire"), v.literal("delta"), v.literal("full")),
    tripwireSnapshot: v.optional(v.string()),
    rateLimitRemaining: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("syncState")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    const now = Date.now();
    const patch: Record<string, unknown> = {
      status: "idle",
      lastError: undefined,
      rateLimitRemaining: args.rateLimitRemaining,
    };
    if (args.kind === "tripwire") patch.lastTripwireAt = now;
    if (args.kind === "delta") patch.lastDeltaSyncAt = now;
    if (args.kind === "full") {
      patch.lastFullSyncAt = now;
      patch.lastDeltaSyncAt = now;
    }
    if (args.tripwireSnapshot !== undefined) {
      patch.tripwireSnapshot = args.tripwireSnapshot;
    }
    if (state) {
      await ctx.db.patch(state._id, patch);
    } else {
      await ctx.db.insert("syncState", {
        userId: args.userId,
        status: "idle",
        ...patch,
      });
    }
    return null;
  },
});

export const upsertCourses = internalMutation({
  args: { userId: v.string(), courses: v.array(courseUpsert) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const course of args.courses) {
      const existing = await ctx.db
        .query("courses")
        .withIndex("by_user_canvasId", (q) =>
          q.eq("userId", args.userId).eq("canvasId", course.canvasId),
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { ...course, syncedAt: now });
      } else {
        await ctx.db.insert("courses", {
          userId: args.userId,
          ...course,
          syncedAt: now,
        });
      }
    }
    return null;
  },
});

export const upsertAssignments = internalMutation({
  args: { userId: v.string(), assignments: v.array(assignmentUpsert) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const assignment of args.assignments) {
      const existing = await ctx.db
        .query("assignments")
        .withIndex("by_user_canvasId", (q) =>
          q.eq("userId", args.userId).eq("canvasId", assignment.canvasId),
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { ...assignment, syncedAt: now });
      } else {
        await ctx.db.insert("assignments", {
          userId: args.userId,
          ...assignment,
          syncedAt: now,
        });
      }
    }
    return null;
  },
});

export const applySubmissionUpdates = internalMutation({
  args: {
    userId: v.string(),
    updates: v.array(
      v.object({
        assignmentCanvasId: v.number(),
        submission: submissionFields,
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const update of args.updates) {
      const existing = await ctx.db
        .query("assignments")
        .withIndex("by_user_canvasId", (q) =>
          q.eq("userId", args.userId).eq("canvasId", update.assignmentCanvasId),
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          submission: update.submission,
          syncedAt: now,
        });
      }
      // An update for an unknown assignment is dropped here; the nightly
      // full sync will pick the assignment itself up.
    }
    return null;
  },
});

export const upsertAnnouncements = internalMutation({
  args: { userId: v.string(), announcements: v.array(announcementUpsert) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const announcement of args.announcements) {
      const existing = await ctx.db
        .query("announcements")
        .withIndex("by_user_canvasId", (q) =>
          q.eq("userId", args.userId).eq("canvasId", announcement.canvasId),
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { ...announcement, syncedAt: now });
      } else {
        await ctx.db.insert("announcements", {
          userId: args.userId,
          ...announcement,
          syncedAt: now,
        });
      }
    }
    return null;
  },
});

export const upsertCalendarEvents = internalMutation({
  args: { userId: v.string(), events: v.array(calendarEventUpsert) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const event of args.events) {
      const existing = await ctx.db
        .query("calendarEvents")
        .withIndex("by_user_canvasId", (q) =>
          q.eq("userId", args.userId).eq("canvasId", event.canvasId),
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { ...event, syncedAt: now });
      } else {
        await ctx.db.insert("calendarEvents", {
          userId: args.userId,
          source: "canvas",
          ...event,
          syncedAt: now,
        });
      }
    }
    return null;
  },
});

export const upsertPlannerTasks = internalMutation({
  args: { userId: v.string(), notes: v.array(plannerNoteUpsert) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const note of args.notes) {
      const existing = await ctx.db
        .query("tasks")
        .withIndex("by_user_plannerNote", (q) =>
          q
            .eq("userId", args.userId)
            .eq("canvasPlannerNoteId", note.canvasPlannerNoteId),
        )
        .unique();
      const { canvasPlannerNoteId, ...fields } = note;
      if (existing) {
        await ctx.db.patch(existing._id, { ...fields, syncedAt: now });
      } else {
        await ctx.db.insert("tasks", {
          userId: args.userId,
          source: "canvas",
          canvasPlannerNoteId,
          ...fields,
          syncedAt: now,
        });
      }
    }
    return null;
  },
});
