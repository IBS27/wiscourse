// The unified todo list. Nothing here is stored: it is a query that fans
// out over the synced tables (assignments, quizzes, discussions) plus the
// one local-write table (`tasks`), then layers `overrides` on top.
//
// Dedup rule: a graded quiz or graded discussion is *also* an assignment
// in Canvas, so those already appear via `assignments`. From `quizzes` we
// therefore take only rows without an `assignmentCanvasId` (practice
// quizzes and ungraded surveys), and from `discussions` only non-
// announcement rows with a due date and no `assignmentCanvasId`.

import { v, type Infer } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getOverrideMap, overrideKey } from "./overrides";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PAST_MS = 7 * DAY_MS;
const DEFAULT_FUTURE_MS = 30 * DAY_MS;
// Overdue work that was never submitted keeps showing up for this long,
// even when it fell out the bottom of the requested window.
const OVERDUE_GRACE_MS = 30 * DAY_MS;

export const todoStatus = v.union(
  v.literal("todo"),
  v.literal("submitted"),
  v.literal("graded"),
  v.literal("missing"),
  v.literal("late"),
  v.literal("done"),
);

export const todoItem = v.object({
  // Stable list key: `${kind}:${canvasId | taskId}`.
  key: v.string(),
  kind: v.union(
    v.literal("assignment"),
    v.literal("quiz"),
    v.literal("discussion"),
    v.literal("task"),
  ),
  canvasId: v.optional(v.number()),
  taskId: v.optional(v.id("tasks")),
  courseCanvasId: v.optional(v.number()),
  title: v.string(),
  dueAt: v.optional(v.number()),
  pointsPossible: v.optional(v.number()),
  htmlUrl: v.optional(v.string()),
  status: todoStatus,
  completed: v.boolean(),
  dismissed: v.boolean(),
});

export type TodoItem = Infer<typeof todoItem>;
export type TodoStatus = Infer<typeof todoStatus>;

/** An item plus the bookkeeping needed to fold in its override. */
type Candidate = {
  item: Omit<TodoItem, "completed" | "dismissed">;
  /** Key into the override map, or undefined for purely local tasks. */
  overrideKey?: string;
  /** Locally completed (only `tasks` carry their own completion). */
  locallyCompleted: boolean;
};

/**
 * Submission-derived status. A "graded" submission whose score is still
 * withheld (no `postedAt`) is deliberately reported as merely submitted —
 * the UI must not hint at a grade the teacher has not posted.
 */
function assignmentStatus(assignment: Doc<"assignments">): TodoStatus {
  const submission = assignment.submission;
  if (submission === undefined) return "todo";
  if (submission.workflowState === "graded" && submission.postedAt !== undefined) {
    return "graded";
  }
  if (submission.submittedAt !== undefined) return "submitted";
  if (submission.missing === true) return "missing";
  if (submission.late === true) return "late";
  return "todo";
}

/** Statuses that mean "no action left", used for the overdue carve-out. */
function isSettled(status: TodoStatus): boolean {
  return status === "graded" || status === "submitted" || status === "done";
}

type Window = { from: number; to: number; now: number };

function inWindow(window: Window, dueAt: number, status: TodoStatus): boolean {
  if (dueAt >= window.from && dueAt <= window.to) return true;
  return (
    !isSettled(status) &&
    dueAt < window.now &&
    dueAt >= window.now - OVERDUE_GRACE_MS
  );
}

async function collectCandidates(
  ctx: QueryCtx,
  userId: string,
  window: Window,
): Promise<Candidate[]> {
  const candidates: Candidate[] = [];

  // All three synced sources share the same (userId, dueAt) range read.
  const scanFrom = Math.min(window.from, window.now - OVERDUE_GRACE_MS);
  const assignments = await ctx.db
    .query("assignments")
    .withIndex("by_user_dueAt", (q) =>
      q.eq("userId", userId).gte("dueAt", scanFrom).lte("dueAt", window.to),
    )
    .collect();
  for (const assignment of assignments) {
    if (assignment.dueAt === undefined) continue;
    const status = assignmentStatus(assignment);
    if (!inWindow(window, assignment.dueAt, status)) continue;
    candidates.push({
      item: {
        key: `assignment:${assignment.canvasId}`,
        kind: "assignment",
        canvasId: assignment.canvasId,
        courseCanvasId: assignment.courseCanvasId,
        title: assignment.name,
        dueAt: assignment.dueAt,
        pointsPossible: assignment.pointsPossible,
        htmlUrl: assignment.htmlUrl,
        status,
      },
      overrideKey: overrideKey("assignment", assignment.canvasId),
      locallyCompleted: false,
    });
  }

  // Quizzes and discussions that Canvas also models as assignments are
  // skipped: that copy is already in the loop above.
  const quizzes = await ctx.db
    .query("quizzes")
    .withIndex("by_user_dueAt", (q) =>
      q.eq("userId", userId).gte("dueAt", scanFrom).lte("dueAt", window.to),
    )
    .collect();
  for (const quiz of quizzes) {
    if (quiz.dueAt === undefined) continue;
    if (quiz.assignmentCanvasId !== undefined) continue;
    if (!inWindow(window, quiz.dueAt, "todo")) continue;
    candidates.push({
      item: {
        key: `quiz:${quiz.canvasId}`,
        kind: "quiz",
        canvasId: quiz.canvasId,
        courseCanvasId: quiz.courseCanvasId,
        title: quiz.title,
        dueAt: quiz.dueAt,
        pointsPossible: quiz.pointsPossible,
        htmlUrl: quiz.htmlUrl,
        status: "todo",
      },
      overrideKey: overrideKey("quiz", quiz.canvasId),
      locallyCompleted: false,
    });
  }

  const discussions = await ctx.db
    .query("discussions")
    .withIndex("by_user_dueAt", (q) =>
      q.eq("userId", userId).gte("dueAt", scanFrom).lte("dueAt", window.to),
    )
    .collect();
  for (const discussion of discussions) {
    if (discussion.dueAt === undefined) continue;
    if (discussion.isAnnouncement) continue;
    if (discussion.assignmentCanvasId !== undefined) continue;
    if (!inWindow(window, discussion.dueAt, "todo")) continue;
    candidates.push({
      item: {
        key: `discussion:${discussion.canvasId}`,
        kind: "discussion",
        canvasId: discussion.canvasId,
        courseCanvasId: discussion.courseCanvasId,
        title: discussion.title,
        dueAt: discussion.dueAt,
        htmlUrl: discussion.htmlUrl,
        status: "todo",
      },
      overrideKey: overrideKey("discussion", discussion.canvasId),
      locallyCompleted: false,
    });
  }

  // Local + planner tasks. These are the only source allowed on the list
  // without a due date.
  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const task of tasks) {
    const status: TodoStatus = task.completedAt === undefined ? "todo" : "done";
    if (task.dueAt !== undefined && !inWindow(window, task.dueAt, status)) {
      continue;
    }
    candidates.push({
      item: {
        key: `task:${task._id}`,
        kind: "task",
        taskId: task._id,
        courseCanvasId: task.courseCanvasId,
        title: task.title,
        dueAt: task.dueAt,
        status,
      },
      // Only Canvas planner notes have a numeric id an override can key on;
      // a purely local task carries its completion on the row itself.
      overrideKey:
        task.canvasPlannerNoteId === undefined
          ? undefined
          : overrideKey("task", task.canvasPlannerNoteId),
      locallyCompleted: task.completedAt !== undefined,
    });
  }

  return candidates;
}

function compare(a: TodoItem, b: TodoItem): number {
  if (a.dueAt !== b.dueAt) {
    if (a.dueAt === undefined) return 1;
    if (b.dueAt === undefined) return -1;
    return a.dueAt - b.dueAt;
  }
  return a.title.localeCompare(b.title);
}

/** Shared by `list` and `counts`. */
async function buildList(
  ctx: QueryCtx,
  userId: string,
  args: { from?: number; to?: number; includeCompleted?: boolean },
): Promise<TodoItem[]> {
  const now = Date.now();
  const window: Window = {
    now,
    from: args.from ?? now - DEFAULT_PAST_MS,
    to: args.to ?? now + DEFAULT_FUTURE_MS,
  };
  const candidates = await collectCandidates(ctx, userId, window);
  const overrides = await getOverrideMap(ctx, userId);

  const items: TodoItem[] = [];
  for (const candidate of candidates) {
    const override =
      candidate.overrideKey === undefined
        ? undefined
        : overrides.get(candidate.overrideKey);
    const dismissed = override?.dismissedAt !== undefined;
    if (dismissed) continue; // dismissed items are never listed
    const completed =
      override?.completedAt !== undefined ||
      candidate.locallyCompleted ||
      isSettled(candidate.item.status);
    if (completed && args.includeCompleted !== true) continue;
    items.push({ ...candidate.item, completed, dismissed: false });
  }
  return items.sort(compare);
}

export const list = query({
  args: {
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    includeCompleted: v.optional(v.boolean()),
  },
  returns: v.array(todoItem),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return [];
    return await buildList(ctx, identity.subject, args);
  },
});

/**
 * Headline counts over the same default list.
 *
 * `tzOffsetMinutes` is the client's offset from UTC in minutes
 * (`-new Date().getTimezoneOffset()`, so -300 for America/Chicago on CDT).
 * The server never guesses a time zone: with no argument, day boundaries
 * are UTC.
 */
export const counts = query({
  args: { tzOffsetMinutes: v.optional(v.number()) },
  returns: v.object({
    overdue: v.number(),
    dueToday: v.number(),
    dueThisWeek: v.number(),
  }),
  handler: async (ctx, args) => {
    const empty = { overdue: 0, dueToday: 0, dueThisWeek: 0 };
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return empty;

    const items = await buildList(ctx, identity.subject, {});
    const now = Date.now();
    const offsetMs = (args.tzOffsetMinutes ?? 0) * 60_000;
    const dayStart = Math.floor((now + offsetMs) / DAY_MS) * DAY_MS - offsetMs;

    let overdue = 0;
    let dueToday = 0;
    let dueThisWeek = 0;
    for (const item of items) {
      const dueAt = item.dueAt;
      if (dueAt === undefined) continue;
      if (dueAt < now) overdue += 1;
      if (dueAt >= dayStart && dueAt < dayStart + DAY_MS) dueToday += 1;
      if (dueAt >= dayStart && dueAt < dayStart + 7 * DAY_MS) dueThisWeek += 1;
    }
    return { overdue, dueToday, dueThisWeek };
  },
});
