// The unified todo list.
//
// Canvas items (assignments, quizzes, graded discussions) stay pure
// mirrors in their own tables. The student's plan for one — planned day,
// subtasks, notes, done — is a `todos` row keyed by (canvasKind, canvasId),
// created lazily on first write. Personal tasks are `todos` rows with
// `source: "local"` and carry their own title / due date / course.
//
// `list` returns a flat window of items; the agenda bucketing (Overdue /
// Today / Tomorrow / This week / Later) is done on the client, which knows
// the real time zone. Day-keyed fields (`plannedDay`) are "YYYY-MM-DD".
//
// Dedup rule: a graded quiz or graded discussion is *also* an assignment
// in Canvas and already appears via `assignments`. From `quizzes` we take
// only rows without an `assignmentCanvasId`, and from `discussions` only
// non-announcement rows with a due date and no `assignmentCanvasId`.

import { v, type Infer } from "convex/values";
import type { IndexRange } from "convex/server";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { subtask, todoCanvasKind } from "./schema";
import { requireUserId } from "./lib/auth";
import { DAY_MS } from "./lib/time";
import { activeCourseIds } from "./lib/courses";

const DEFAULT_PAST_MS = 30 * DAY_MS;
const DEFAULT_FUTURE_MS = 120 * DAY_MS;

type TodoCanvasKind = Infer<typeof todoCanvasKind>;

export const submissionState = v.union(
  v.literal("none"), // nothing to submit, or not a Canvas item
  v.literal("unsubmitted"),
  v.literal("submitted"),
  v.literal("graded"),
  v.literal("missing"),
  v.literal("late"),
);
export type SubmissionState = Infer<typeof submissionState>;

export const todoItem = v.object({
  // Stable list key: `${kind}:${canvasId}` or `local:${todoId}`.
  key: v.string(),
  kind: v.union(todoCanvasKind, v.literal("local")),
  canvasId: v.optional(v.number()),
  todoId: v.optional(v.id("todos")),
  courseCanvasId: v.optional(v.number()),
  title: v.string(),
  dueAt: v.optional(v.number()),
  pointsPossible: v.optional(v.number()),
  htmlUrl: v.optional(v.string()),
  // Set on assignment items that wrap a graded quiz or discussion, so a
  // module row keyed by the quiz/discussion id can find its todo.
  quizCanvasId: v.optional(v.number()),
  discussionCanvasId: v.optional(v.number()),
  submission: submissionState,
  submittedAt: v.optional(v.number()),
  // Only present when posted; the UI never sees an unposted score.
  score: v.optional(v.number()),
  // Plan (from the todos row; defaults when no row exists yet).
  plannedDay: v.optional(v.string()),
  subtasks: v.array(subtask),
  notes: v.optional(v.string()),
  doneAt: v.optional(v.number()),
  doneBySubmission: v.optional(v.boolean()),
});
export type TodoItem = Infer<typeof todoItem>;

/** Parse a list key back into its lookup. */
export const todoRef = v.union(
  v.object({ kind: todoCanvasKind, canvasId: v.number() }),
  v.object({ kind: v.literal("local"), todoId: v.id("todos") }),
);
type TodoRef = Infer<typeof todoRef>;

// ---------------------------------------------------------------------------
// Reads

// Canvas submission_types that never produce a submission object: on-paper
// work, ungraded items, and "no submission" assignments.
const NO_SUBMISSION_TYPES = new Set(["none", "on_paper", "not_graded"]);

function hasNothingToSubmit(assignment: Doc<"assignments">): boolean {
  return assignment.submissionTypes.every((t) => NO_SUBMISSION_TYPES.has(t));
}

function submissionOf(assignment: Doc<"assignments">): {
  state: SubmissionState;
  submittedAt?: number;
  score?: number;
} {
  const s = assignment.submission;
  if (s === undefined) {
    return { state: hasNothingToSubmit(assignment) ? "none" : "unsubmitted" };
  }
  if (s.workflowState === "graded" && s.postedAt !== undefined) {
    return { state: "graded", submittedAt: s.submittedAt, score: s.score };
  }
  if (s.submittedAt !== undefined) {
    return { state: "submitted", submittedAt: s.submittedAt };
  }
  if (s.missing === true) return { state: "missing" };
  if (s.late === true) return { state: "late" };
  return { state: "unsubmitted" };
}

function planFields(todo: Doc<"todos"> | undefined) {
  return {
    todoId: todo?._id,
    plannedDay: todo?.plannedDay,
    subtasks: todo?.subtasks ?? [],
    notes: todo?.notes,
    doneAt: todo?.doneAt,
    doneBySubmission: todo?.doneBySubmission,
  };
}

export async function findCanvasTodo(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  kind: TodoCanvasKind,
  canvasId: number,
): Promise<Doc<"todos"> | null> {
  return await ctx.db
    .query("todos")
    .withIndex("by_user_canvas", (q) =>
      q.eq("userId", userId).eq("canvasKind", kind).eq("canvasId", canvasId),
    )
    .unique();
}

type CanvasRow =
  | { kind: "assignment"; row: Doc<"assignments"> }
  | { kind: "quiz"; row: Doc<"quizzes"> }
  | { kind: "discussion"; row: Doc<"discussions"> };

async function findCanvasRow(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  kind: TodoCanvasKind,
  canvasId: number,
): Promise<CanvasRow | null> {
  const byId = (q: { eq(f: "userId", v: string): { eq(f: "canvasId", v: number): IndexRange } }) =>
    q.eq("userId", userId).eq("canvasId", canvasId);
  switch (kind) {
    case "assignment": {
      const row = await ctx.db.query("assignments").withIndex("by_user_canvasId", byId).unique();
      return row && { kind, row };
    }
    case "quiz": {
      const row = await ctx.db.query("quizzes").withIndex("by_user_canvasId", byId).unique();
      return row && { kind, row };
    }
    case "discussion": {
      const row = await ctx.db.query("discussions").withIndex("by_user_canvasId", byId).unique();
      return row && { kind, row };
    }
  }
}

/**
 * Quizzes and discussions that Canvas also exposes as an assignment are
 * listed once, under the assignment; announcements are not todos.
 */
function isTodo(r: CanvasRow): boolean {
  switch (r.kind) {
    case "assignment":
      return true;
    case "quiz":
      return r.row.assignmentCanvasId === undefined;
    case "discussion":
      return !r.row.isAnnouncement && r.row.assignmentCanvasId === undefined;
  }
}

function toCanvasItem(r: CanvasRow, todo: Doc<"todos"> | undefined): TodoItem {
  const key = `${r.kind}:${r.row.canvasId}`;
  const base = {
    key,
    kind: r.kind,
    canvasId: r.row.canvasId,
    courseCanvasId: r.row.courseCanvasId,
    dueAt: r.row.dueAt,
    htmlUrl: r.row.htmlUrl,
    ...planFields(todo),
  };
  switch (r.kind) {
    case "assignment": {
      const sub = submissionOf(r.row);
      return {
        ...base,
        title: r.row.name,
        pointsPossible: r.row.pointsPossible,
        quizCanvasId: r.row.quizCanvasId,
        discussionCanvasId: r.row.discussionCanvasId,
        submission: sub.state,
        submittedAt: sub.submittedAt,
        score: sub.score,
      };
    }
    case "quiz":
      return {
        ...base,
        title: r.row.title,
        pointsPossible: r.row.pointsPossible,
        submission: "none",
      };
    case "discussion":
      return { ...base, title: r.row.title, submission: "none" };
  }
}

function toLocalItem(t: Doc<"todos">): TodoItem {
  return {
    key: `local:${t._id}`,
    kind: "local",
    courseCanvasId: t.courseCanvasId,
    title: t.title ?? "",
    dueAt: t.dueAt,
    submission: "none",
    ...planFields(t),
  };
}

async function todoMap(
  ctx: QueryCtx,
  userId: string,
): Promise<{ canvas: Map<string, Doc<"todos">>; local: Doc<"todos">[] }> {
  const rows = await ctx.db
    .query("todos")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const canvas = new Map<string, Doc<"todos">>();
  const local: Doc<"todos">[] = [];
  for (const row of rows) {
    if (row.source === "local") local.push(row);
    else canvas.set(`${row.canvasKind}:${row.canvasId}`, row);
  }
  return { canvas, local };
}

/**
 * Every todo whose due date falls in [from, to], plus every item that has
 * a plan row (planned, annotated, or done) and every local task. Items
 * without a due date and without a plan only come from local tasks.
 */
export async function buildList(
  ctx: QueryCtx,
  userId: string,
  args: { from?: number; to?: number },
): Promise<TodoItem[]> {
  const now = Date.now();
  const from = args.from ?? now - DEFAULT_PAST_MS;
  const to = args.to ?? now + DEFAULT_FUTURE_MS;
  const todos = await todoMap(ctx, userId);
  const items: TodoItem[] = [];
  const seen = new Set<string>();

  const activeIds = await activeCourseIds(ctx, userId);

  const push = (r: CanvasRow) => {
    const key = `${r.kind}:${r.row.canvasId}`;
    if (seen.has(key) || !isTodo(r)) return;
    if (!activeIds.has(r.row.courseCanvasId)) return;
    seen.add(key);
    items.push(toCanvasItem(r, todos.canvas.get(key)));
  };

  const dueWindow = (q: { eq(f: "userId", v: string): { gte(f: "dueAt", v: number): { lte(f: "dueAt", v: number): IndexRange } } }) =>
    q.eq("userId", userId).gte("dueAt", from).lte("dueAt", to);
  for (const row of await ctx.db.query("assignments").withIndex("by_user_dueAt", dueWindow).collect()) {
    push({ kind: "assignment", row });
  }
  for (const row of await ctx.db.query("quizzes").withIndex("by_user_dueAt", dueWindow).collect()) {
    push({ kind: "quiz", row });
  }
  for (const row of await ctx.db.query("discussions").withIndex("by_user_dueAt", dueWindow).collect()) {
    push({ kind: "discussion", row });
  }

  // Planned / annotated Canvas items outside the due window still belong
  // on the list (a plan for something due months out, or with no due date).
  // Items done before the window are dropped by the client anyway.
  for (const [key, todo] of todos.canvas) {
    if (seen.has(key) || todo.canvasKind === undefined || todo.canvasId === undefined) continue;
    if (todo.doneAt !== undefined && todo.doneAt < from) continue;
    const r = await findCanvasRow(ctx, userId, todo.canvasKind, todo.canvasId);
    if (r) push(r);
  }

  for (const t of todos.local) items.push(toLocalItem(t));

  return items.sort((a, b) => {
    if (a.dueAt !== b.dueAt) {
      if (a.dueAt === undefined) return 1;
      if (b.dueAt === undefined) return -1;
      return a.dueAt - b.dueAt;
    }
    return a.title.localeCompare(b.title);
  });
}

export const list = query({
  args: { from: v.optional(v.number()), to: v.optional(v.number()) },
  returns: v.array(todoItem),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return [];
    return await buildList(ctx, identity.subject, args);
  },
});

/** One item by key, for the detail view. Canvas items need no plan row. */
export const get = query({
  args: { ref: todoRef },
  returns: v.union(todoItem, v.null()),
  handler: async (ctx, { ref }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const userId = identity.subject;
    if (ref.kind === "local") {
      const t = await ctx.db.get(ref.todoId);
      if (!t || t.userId !== userId || t.source !== "local") return null;
      return toLocalItem(t);
    }
    let r = await findCanvasRow(ctx, userId, ref.kind, ref.canvasId);
    if (r !== null && r.kind !== "assignment" && r.row.assignmentCanvasId !== undefined) {
      r = await findCanvasRow(ctx, userId, "assignment", r.row.assignmentCanvasId);
    }
    if (r === null || !isTodo(r)) return null;
    const todo = (await findCanvasTodo(ctx, userId, r.kind, r.row.canvasId)) ?? undefined;
    return toCanvasItem(r, todo);
  },
});

/** Description HTML for a Canvas assignment / quiz / discussion. */
export const description = query({
  args: { kind: todoCanvasKind, canvasId: v.number() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const userId = identity.subject;
    const r = await findCanvasRow(ctx, userId, args.kind, args.canvasId);
    if (r === null) return null;
    return (r.kind === "discussion" ? r.row.message : r.row.description) ?? null;
  },
});

// ---------------------------------------------------------------------------
// Writes

/** Resolve a ref to its plan row, creating one for Canvas items. */
async function ensureTodo(
  ctx: MutationCtx,
  userId: string,
  ref: TodoRef,
): Promise<Doc<"todos">> {
  if (ref.kind === "local") {
    const t = await ctx.db.get(ref.todoId);
    if (!t || t.userId !== userId || t.source !== "local") throw new Error("Todo not found");
    return t;
  }
  const existing = await findCanvasTodo(ctx, userId, ref.kind, ref.canvasId);
  if (existing) return existing;
  const courseCanvasId = await canvasCourseOf(ctx, userId, ref.kind, ref.canvasId);
  const id = await ctx.db.insert("todos", {
    userId,
    source: "canvas",
    canvasKind: ref.kind,
    canvasId: ref.canvasId,
    courseCanvasId,
    subtasks: [],
  });
  const created = await ctx.db.get(id);
  if (!created) throw new Error("Failed to create todo");
  return created;
}

async function canvasCourseOf(
  ctx: MutationCtx,
  userId: string,
  kind: TodoCanvasKind,
  canvasId: number,
): Promise<number> {
  const r = await findCanvasRow(ctx, userId, kind, canvasId);
  if (r === null) throw new Error("Canvas item not found");
  return r.row.courseCanvasId;
}

/**
 * A Canvas plan row carrying no local state is deleted rather than kept
 * as a tombstone; local tasks always stay.
 */
async function compact(ctx: MutationCtx, id: Id<"todos">): Promise<void> {
  const t = await ctx.db.get(id);
  if (!t || t.source === "local") return;
  if (
    t.plannedDay === undefined &&
    t.subtasks.length === 0 &&
    t.notes === undefined &&
    t.doneAt === undefined
  ) {
    await ctx.db.delete(id);
  }
}

const dayKey = v.string(); // "YYYY-MM-DD"

export const createLocal = mutation({
  args: {
    title: v.string(),
    plannedDay: v.optional(dayKey),
    dueAt: v.optional(v.number()),
    courseCanvasId: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  returns: v.id("todos"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const title = args.title.trim();
    if (title.length === 0) throw new Error("Title is required");
    return await ctx.db.insert("todos", {
      userId,
      source: "local",
      title,
      plannedDay: args.plannedDay,
      dueAt: args.dueAt,
      courseCanvasId: args.courseCanvasId,
      notes: args.notes,
      subtasks: [],
    });
  },
});

export const updateLocal = mutation({
  args: {
    todoId: v.id("todos"),
    title: v.optional(v.string()),
    dueAt: v.optional(v.union(v.number(), v.null())),
    courseCanvasId: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const t = await ctx.db.get(args.todoId);
    if (!t || t.userId !== userId || t.source !== "local") {
      throw new Error("Todo not found");
    }
    const patch: Partial<Doc<"todos">> = {};
    if (args.title !== undefined) {
      const title = args.title.trim();
      if (title.length === 0) throw new Error("Title is required");
      patch.title = title;
    }
    if (args.dueAt !== undefined) patch.dueAt = args.dueAt ?? undefined;
    if (args.courseCanvasId !== undefined) {
      patch.courseCanvasId = args.courseCanvasId ?? undefined;
    }
    await ctx.db.patch(args.todoId, patch);
    return null;
  },
});

export const deleteLocal = mutation({
  args: { todoId: v.id("todos") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const t = await ctx.db.get(args.todoId);
    if (!t || t.userId !== userId) throw new Error("Todo not found");
    if (t.source !== "local") throw new Error("Canvas todos cannot be deleted");
    await ctx.db.delete(args.todoId);
    return null;
  },
});

export const setPlannedDay = mutation({
  args: { ref: todoRef, plannedDay: v.union(dayKey, v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const t = await ensureTodo(ctx, userId, args.ref);
    await ctx.db.patch(t._id, { plannedDay: args.plannedDay ?? undefined });
    await compact(ctx, t._id);
    return null;
  },
});

export const setDone = mutation({
  args: { ref: todoRef, done: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const t = await ensureTodo(ctx, userId, args.ref);
    await ctx.db.patch(t._id, {
      doneAt: args.done ? Date.now() : undefined,
      doneBySubmission: undefined,
    });
    await compact(ctx, t._id);
    return null;
  },
});

export const setNotes = mutation({
  args: { ref: todoRef, notes: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const t = await ensureTodo(ctx, userId, args.ref);
    const notes = args.notes.trim();
    await ctx.db.patch(t._id, { notes: notes.length === 0 ? undefined : notes });
    await compact(ctx, t._id);
    return null;
  },
});

export const addSubtask = mutation({
  args: { ref: todoRef, title: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const title = args.title.trim();
    if (title.length === 0) return null;
    const t = await ensureTodo(ctx, userId, args.ref);
    await ctx.db.patch(t._id, {
      subtasks: [...t.subtasks, { id: crypto.randomUUID(), title, done: false }],
    });
    return null;
  },
});

export const setSubtaskDone = mutation({
  args: { ref: todoRef, subtaskId: v.string(), done: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const t = await ensureTodo(ctx, userId, args.ref);
    await ctx.db.patch(t._id, {
      subtasks: t.subtasks.map((s) =>
        s.id === args.subtaskId ? { ...s, done: args.done } : s,
      ),
    });
    return null;
  },
});

export const removeSubtask = mutation({
  args: { ref: todoRef, subtaskId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const t = await ensureTodo(ctx, userId, args.ref);
    await ctx.db.patch(t._id, {
      subtasks: t.subtasks.filter((s) => s.id !== args.subtaskId),
    });
    await compact(ctx, t._id);
    return null;
  },
});
