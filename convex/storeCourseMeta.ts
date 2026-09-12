// Persistence for per-course Canvas metadata: assignment groups, grading
// periods, quizzes and discussions/announcements. The matching Canvas
// fetches live in canvas/syncCourseMeta.ts; as everywhere in the sync
// layer, actions talk to Canvas and mutations touch the database.
//
// `prune` is only ever set by a full sync, where the caller holds the
// complete set for the course and rows Canvas dropped should disappear.

import { v, type Infer } from "convex/values";
import { internalMutation } from "./_generated/server";
import { pruneCourseRows, upsertByCanvasId } from "./lib/upsert";
import { removeListSummary } from "./lib/listSummaries";

const assignmentGroupUpsert = v.object({
  canvasId: v.number(),
  name: v.string(),
  position: v.number(),
  groupWeight: v.optional(v.number()),
  dropLowest: v.optional(v.number()),
  dropHighest: v.optional(v.number()),
  neverDrop: v.optional(v.array(v.number())),
});

const gradingPeriodUpsert = v.object({
  canvasId: v.number(),
  title: v.string(),
  startAt: v.number(),
  endAt: v.number(),
  weight: v.optional(v.number()),
});

const quizUpsert = v.object({
  canvasId: v.number(),
  title: v.string(),
  description: v.optional(v.string()),
  quizType: v.string(),
  dueAt: v.optional(v.number()),
  unlockAt: v.optional(v.number()),
  lockAt: v.optional(v.number()),
  pointsPossible: v.optional(v.number()),
  timeLimitMinutes: v.optional(v.number()),
  allowedAttempts: v.optional(v.number()),
  questionCount: v.optional(v.number()),
  assignmentCanvasId: v.optional(v.number()),
  htmlUrl: v.string(),
  lockedForUser: v.optional(v.boolean()),
});

// Unlike the others this carries `courseCanvasId` per row: the cheap
// cross-course /announcements endpoint returns topics from many courses in
// one response.
const discussionUpsert = v.object({
  courseCanvasId: v.number(),
  canvasId: v.number(),
  title: v.string(),
  message: v.optional(v.string()),
  isAnnouncement: v.boolean(),
  postedAt: v.optional(v.number()),
  lastReplyAt: v.optional(v.number()),
  dueAt: v.optional(v.number()),
  assignmentCanvasId: v.optional(v.number()),
  authorName: v.optional(v.string()),
  unreadCount: v.optional(v.number()),
  readState: v.optional(v.string()),
  locked: v.optional(v.boolean()),
  pinned: v.optional(v.boolean()),
  htmlUrl: v.string(),
});

export type AssignmentGroupUpsert = Infer<typeof assignmentGroupUpsert>;
export type GradingPeriodUpsert = Infer<typeof gradingPeriodUpsert>;
export type QuizUpsert = Infer<typeof quizUpsert>;
export type DiscussionUpsert = Infer<typeof discussionUpsert>;

export const upsertAssignmentGroups = internalMutation({
  args: {
    userId: v.string(),
    courseCanvasId: v.number(),
    groups: v.array(assignmentGroupUpsert),
    prune: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = args.groups.map((group) => ({
      ...group,
      courseCanvasId: args.courseCanvasId,
    }));
    await upsertByCanvasId(ctx, "assignmentGroups", args.userId, rows);
    if (args.prune) {
      await pruneCourseRows(
        ctx,
        "assignmentGroups",
        args.userId,
        args.courseCanvasId,
        rows.map((row) => row.canvasId),
      );
    }
    return null;
  },
});

export const upsertGradingPeriods = internalMutation({
  args: {
    userId: v.string(),
    courseCanvasId: v.number(),
    periods: v.array(gradingPeriodUpsert),
    prune: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = args.periods.map((period) => ({
      ...period,
      courseCanvasId: args.courseCanvasId,
    }));
    await upsertByCanvasId(ctx, "gradingPeriods", args.userId, rows);
    if (args.prune) {
      await pruneCourseRows(
        ctx,
        "gradingPeriods",
        args.userId,
        args.courseCanvasId,
        rows.map((row) => row.canvasId),
      );
    }
    return null;
  },
});

export const upsertQuizzes = internalMutation({
  args: {
    userId: v.string(),
    courseCanvasId: v.number(),
    quizzes: v.array(quizUpsert),
    prune: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = args.quizzes.map((quiz) => ({
      ...quiz,
      courseCanvasId: args.courseCanvasId,
    }));
    await upsertByCanvasId(ctx, "quizzes", args.userId, rows);
    if (args.prune) {
      await pruneCourseRows(
        ctx,
        "quizzes",
        args.userId,
        args.courseCanvasId,
        rows.map((row) => row.canvasId),
      );
    }
    return null;
  },
});

export const upsertDiscussions = internalMutation({
  args: {
    userId: v.string(),
    discussions: v.array(discussionUpsert),
    // Full sync only, and only ever for one course at a time. Announcements
    // are deliberately exempt: Canvas hides old ones from the listing
    // endpoints, so pruning them would delete history we already have.
    pruneCourseCanvasId: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await upsertByCanvasId(ctx, "discussions", args.userId, args.discussions);
    const courseCanvasId = args.pruneCourseCanvasId;
    if (courseCanvasId === undefined) return null;

    const keep = new Set(
      args.discussions
        .filter((discussion) => !discussion.isAnnouncement)
        .map((discussion) => discussion.canvasId),
    );
    const existing = await ctx.db
      .query("discussions")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", args.userId).eq("courseCanvasId", courseCanvasId),
      )
      .collect();
    for (const row of existing) {
      if (!row.isAnnouncement && !keep.has(row.canvasId)) {
        await removeListSummary(ctx, "discussions", args.userId, row.canvasId);
        await ctx.db.delete(row._id);
      }
    }
    return null;
  },
});
