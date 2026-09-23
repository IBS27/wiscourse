// Every write the assistant makes goes through here, as one change.
//
// The model drafts ops; `record` checks each against the database (the
// student owns it, Canvas-owned fields stay read-only) and snapshots what
// it will touch. Small additive changes apply at once and show a receipt
// with Undo. Anything that deletes, or touches more than two things, waits
// as a proposal until the student confirms it in the chat. All writes use
// the same helpers as the UI's own mutations, so the rules are identical.

import { ConvexError, v, type Infer } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assistantOp,
  coursePrefsSet,
  eventSet,
  localEventFields,
  meetingFields,
  taskSet,
  type taskState,
} from "./schema";
import { requireUserId } from "./lib/auth";
import { requireCourse, requireThread, threadOf } from "./lib/assistant";
import { assertDayKey } from "./lib/assistantTime";
import { CAMPUS_TIME_ZONE, dayKeyIn, zonedToUtc } from "./lib/zones";
import {
  deleteLocalTask,
  insertLocalTask,
  patchLocalTask,
  patchPlan,
  todoItemOf,
  type TodoItem,
  type TodoRef,
} from "./todos";
import {
  deleteLocalEvent,
  insertLocalEvent,
  replaceLocalEvent,
  type LocalEventFields,
} from "./calendar";
import { deleteMeeting, insertMeeting, validateMeeting, type MeetingFields } from "./meetings";
import { patchCoursePrefs } from "./courses";

type Op = Infer<typeof assistantOp>;
type TaskState = Infer<typeof taskState>;
type EventSet = Infer<typeof eventSet>;
type PrefsSet = Infer<typeof coursePrefsSet>;

const MAX_OPS = 25;
const MAX_SUBTASKS = 20;

/** What the model may ask for. Ids arrive as strings and are checked here. */
export const draftOp = v.union(
  v.object({
    type: v.literal("createTask"),
    title: v.string(),
    plannedDay: v.optional(v.string()),
    dueAt: v.optional(v.number()),
    courseCanvasId: v.optional(v.number()),
    notes: v.optional(v.string()),
    subtasks: v.optional(v.array(v.string())),
  }),
  v.object({ type: v.literal("updateTask"), ref: v.string(), set: taskSet }),
  v.object({ type: v.literal("deleteTask"), ref: v.string() }),
  v.object({ type: v.literal("createEvent"), event: v.object(localEventFields) }),
  v.object({ type: v.literal("updateEvent"), eventId: v.string(), set: eventSet }),
  v.object({ type: v.literal("deleteEvent"), eventId: v.string() }),
  v.object({ type: v.literal("createMeeting"), meeting: v.object(meetingFields) }),
  v.object({ type: v.literal("deleteMeeting"), meetingId: v.string() }),
  v.object({ type: v.literal("setCoursePrefs"), courseCanvasId: v.number(), set: coursePrefsSet }),
);
export type DraftOp = Infer<typeof draftOp>;

function fail(message: string): never {
  throw new ConvexError(message);
}

// ── Lookups ───────────────────────────────────────────────────────────────

function parseRef(ctx: MutationCtx, ref: string): TodoRef {
  const [kind, id] = ref.split(":", 2);
  if (kind === "local") {
    const todoId = id === undefined ? null : ctx.db.normalizeId("todos", id);
    if (todoId === null) fail(`Unknown task "${ref}"`);
    return { kind, todoId };
  }
  if ((kind === "assignment" || kind === "quiz" || kind === "discussion") && /^\d+$/.test(id ?? "")) {
    return { kind, canvasId: Number(id) };
  }
  fail(`Unknown task "${ref}"; use the ref from a tool result`);
}

async function taskOf(ctx: MutationCtx, userId: string, ref: TodoRef): Promise<TodoItem> {
  const item = await todoItemOf(ctx, userId, ref);
  if (item === null) fail("That task no longer exists");
  return item;
}

function stateOf(item: TodoItem): TaskState {
  return {
    title: item.title,
    dueAt: item.dueAt,
    courseCanvasId: item.courseCanvasId,
    plannedDay: item.plannedDay,
    notes: item.notes,
    doneAt: item.doneAt,
    doneBySubmission: item.doneBySubmission,
    subtasks: item.subtasks,
  };
}

async function eventOf(ctx: MutationCtx, userId: string, eventId: string): Promise<Doc<"calendarEvents">> {
  const id = ctx.db.normalizeId("calendarEvents", eventId);
  if (id === null) fail(`Unknown event "${eventId}"`);
  const event = await ctx.db.get(id);
  if (event === null || event.userId !== userId) fail("That event no longer exists");
  if (event.source !== "local") fail("Canvas events are read-only; only your own events can change");
  return event;
}

function eventFieldsOf(e: Doc<"calendarEvents">): LocalEventFields {
  return {
    title: e.title,
    startAt: e.startAt,
    endAt: e.endAt,
    allDay: e.allDay,
    location: e.location,
    description: e.description,
    courseCanvasId: e.courseCanvasId,
  };
}

function checkEvent(e: LocalEventFields): void {
  if (e.title.trim() === "") fail("Give the event a title");
  if (e.endAt !== undefined && e.endAt < e.startAt) fail("An event can't end before it starts");
}

function mergeEvent(before: LocalEventFields, set: EventSet): LocalEventFields {
  const pick = <T,>(next: T | null | undefined, prev: T | undefined): T | undefined =>
    next === undefined ? prev : (next ?? undefined);
  return {
    title: set.title ?? before.title,
    startAt: set.startAt ?? before.startAt,
    endAt: pick(set.endAt, before.endAt),
    allDay: set.allDay ?? before.allDay,
    location: pick(set.location, before.location),
    description: pick(set.description, before.description),
    courseCanvasId: pick(set.courseCanvasId, before.courseCanvasId),
  };
}

/**
 * All-day events start at midnight on the campus clock, like the calendar
 * and ICS feed key them. `startAt` arrives as midnight in the student's zone.
 */
function pinAllDay(startAt: number, timeZone: string): number {
  return zonedToUtc(dayKeyIn(startAt, timeZone), 0, CAMPUS_TIME_ZONE);
}

async function meetingOf(ctx: MutationCtx, userId: string, meetingId: string): Promise<Doc<"courseMeetings">> {
  const id = ctx.db.normalizeId("courseMeetings", meetingId);
  if (id === null) fail(`Unknown class meeting "${meetingId}"`);
  const meeting = await ctx.db.get(id);
  if (meeting === null || meeting.userId !== userId) fail("That class meeting no longer exists");
  return meeting;
}

function meetingFieldsOf(m: Doc<"courseMeetings">): MeetingFields {
  return {
    courseCanvasId: m.courseCanvasId,
    kind: m.kind,
    label: m.label,
    days: m.days,
    startMinute: m.startMinute,
    endMinute: m.endMinute,
    location: m.location,
    startsOn: m.startsOn,
    endsOn: m.endsOn,
  };
}

async function prefsOf(ctx: MutationCtx, userId: string, courseCanvasId: number) {
  return await ctx.db
    .query("coursePrefs")
    .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseCanvasId", courseCanvasId))
    .unique();
}

function prefsState(pref: Doc<"coursePrefs"> | null): PrefsSet {
  return { nickname: pref?.nickname ?? null, color: pref?.color, hidden: pref?.hidden ?? false };
}

function cleanSubtasks(titles: string[] | undefined): string[] {
  const out = (titles ?? []).map((t) => t.trim()).filter((t) => t !== "");
  if (out.length > MAX_SUBTASKS) fail(`At most ${MAX_SUBTASKS} subtasks at once`);
  return out;
}

// ── Draft → op ────────────────────────────────────────────────────────────

async function resolve(ctx: MutationCtx, userId: string, draft: DraftOp, timeZone: string): Promise<Op> {
  switch (draft.type) {
    case "createTask": {
      const title = draft.title.trim();
      if (title === "") fail("A task needs a title");
      if (draft.plannedDay !== undefined) assertDayKey(draft.plannedDay);
      if (draft.courseCanvasId !== undefined) await requireCourse(ctx, userId, draft.courseCanvasId);
      const subtasks = cleanSubtasks(draft.subtasks);
      return { ...draft, title, subtasks: subtasks.length > 0 ? subtasks : undefined };
    }
    case "updateTask": {
      const ref = parseRef(ctx, draft.ref);
      const item = await taskOf(ctx, userId, ref);
      const local = ref.kind === "local";
      const { set } = draft;
      if (!local && (set.title !== undefined || set.dueAt !== undefined || set.courseCanvasId !== undefined)) {
        fail("Canvas items keep their title, due date and course. Only the plan, notes, done and subtasks can change.");
      }
      if (set.title !== undefined && set.title.trim() === "") fail("A task needs a title");
      if (typeof set.plannedDay === "string") assertDayKey(set.plannedDay);
      if (typeof set.courseCanvasId === "number") await requireCourse(ctx, userId, set.courseCanvasId);
      const addSubtasks = cleanSubtasks(set.addSubtasks);
      const clean = { ...set, addSubtasks: addSubtasks.length > 0 ? addSubtasks : undefined };
      if (Object.values(clean).every((value) => value === undefined)) fail("Nothing to change on that task");
      return { type: "updateTask", ref, local, set: clean, before: stateOf(item) };
    }
    case "deleteTask": {
      const ref = parseRef(ctx, draft.ref);
      if (ref.kind !== "local") fail("Canvas items can't be deleted; mark them done instead");
      const item = await taskOf(ctx, userId, ref);
      return { type: "deleteTask", todoId: ref.todoId, before: stateOf(item) };
    }
    case "createEvent": {
      const event = draft.event.allDay
        ? { ...draft.event, startAt: pinAllDay(draft.event.startAt, timeZone), endAt: undefined }
        : draft.event;
      checkEvent(event);
      if (event.courseCanvasId !== undefined) await requireCourse(ctx, userId, event.courseCanvasId);
      return { type: "createEvent", event: { ...event, title: event.title.trim() } };
    }
    case "updateEvent": {
      const existing = await eventOf(ctx, userId, draft.eventId);
      const before = eventFieldsOf(existing);
      let set = draft.set;
      const allDay = set.allDay ?? before.allDay;
      if (allDay && (set.startAt !== undefined || (set.allDay === true && !before.allDay))) {
        const from = set.startAt ?? zonedToUtc(dayKeyIn(before.startAt, timeZone), 0, timeZone);
        set = { ...set, startAt: pinAllDay(from, timeZone), endAt: null };
      }
      const event = mergeEvent(before, set);
      checkEvent(event);
      if (typeof set.courseCanvasId === "number") await requireCourse(ctx, userId, set.courseCanvasId);
      return { type: "updateEvent", eventId: existing._id, set, event, before };
    }
    case "deleteEvent": {
      const existing = await eventOf(ctx, userId, draft.eventId);
      return { type: "deleteEvent", eventId: existing._id, before: eventFieldsOf(existing) };
    }
    case "createMeeting": {
      try {
        validateMeeting(draft.meeting);
      } catch (error) {
        fail(error instanceof Error ? error.message : "Invalid class meeting");
      }
      await requireCourse(ctx, userId, draft.meeting.courseCanvasId);
      return { type: "createMeeting", meeting: draft.meeting };
    }
    case "deleteMeeting": {
      const existing = await meetingOf(ctx, userId, draft.meetingId);
      return { type: "deleteMeeting", meetingId: existing._id, before: meetingFieldsOf(existing) };
    }
    case "setCoursePrefs": {
      await requireCourse(ctx, userId, draft.courseCanvasId);
      const set = { ...draft.set, nickname: typeof draft.set.nickname === "string" ? draft.set.nickname.trim() || null : draft.set.nickname };
      if (Object.values(set).every((value) => value === undefined)) fail("Nothing to change on that course");
      const before = prefsState(await prefsOf(ctx, userId, draft.courseCanvasId));
      return { type: "setCoursePrefs", courseCanvasId: draft.courseCanvasId, set, before };
    }
  }
}

/**
 * Deletes, and anything that takes this reply past two edits in total, wait
 * for the student. Counting per reply stops a turn from splitting a large
 * change into many small calls.
 */
function needsConfirmation(ops: Op[], appliedThisTurn: number): boolean {
  return appliedThisTurn + ops.length > 2 || ops.some((op) => op.type.startsWith("delete"));
}

// ── Apply / undo ──────────────────────────────────────────────────────────

/** Applies in order and returns the ops with fresh snapshots and new ids. */
async function applyOps(ctx: MutationCtx, userId: string, ops: Op[]): Promise<Op[]> {
  const applied: Op[] = [];
  for (const op of ops) {
    switch (op.type) {
      case "createTask": {
        const createdId = await insertLocalTask(ctx, userId, op);
        if (op.subtasks !== undefined) {
          await patchPlan(ctx, userId, { kind: "local", todoId: createdId }, {
            subtasks: op.subtasks.map((title) => ({ id: crypto.randomUUID(), title, done: false })),
          });
        }
        applied.push({ ...op, createdId });
        break;
      }
      case "updateTask": {
        const item = await taskOf(ctx, userId, op.ref);
        const { set } = op;
        if (op.ref.kind === "local" && (set.title !== undefined || set.dueAt !== undefined || set.courseCanvasId !== undefined)) {
          await patchLocalTask(ctx, userId, op.ref.todoId, {
            title: set.title,
            dueAt: set.dueAt,
            courseCanvasId: set.courseCanvasId,
          });
        }
        const added = (set.addSubtasks ?? []).map((title) => ({ id: crypto.randomUUID(), title, done: false }));
        await patchPlan(ctx, userId, op.ref, {
          plannedDay: set.plannedDay,
          notes: set.notes,
          doneAt: set.done === undefined ? undefined : set.done ? (item.doneAt ?? Date.now()) : null,
          subtasks: added.length === 0 ? undefined : [...item.subtasks, ...added],
        });
        applied.push({
          ...op,
          before: stateOf(item),
          addedSubtaskIds: added.length === 0 ? undefined : added.map((sub) => sub.id),
        });
        break;
      }
      case "deleteTask": {
        const item = await taskOf(ctx, userId, { kind: "local", todoId: op.todoId });
        await deleteLocalTask(ctx, userId, op.todoId);
        applied.push({ ...op, before: stateOf(item) });
        break;
      }
      case "createEvent": {
        const createdId = await insertLocalEvent(ctx, userId, op.event);
        applied.push({ ...op, createdId });
        break;
      }
      case "updateEvent": {
        const before = eventFieldsOf(await eventOf(ctx, userId, op.eventId));
        const event = mergeEvent(before, op.set);
        await replaceLocalEvent(ctx, userId, op.eventId, event);
        applied.push({ ...op, event, before });
        break;
      }
      case "deleteEvent": {
        const before = eventFieldsOf(await eventOf(ctx, userId, op.eventId));
        await deleteLocalEvent(ctx, userId, op.eventId);
        applied.push({ ...op, before });
        break;
      }
      case "createMeeting": {
        const createdId = await insertMeeting(ctx, userId, op.meeting);
        applied.push({ ...op, createdId });
        break;
      }
      case "deleteMeeting": {
        const before = meetingFieldsOf(await meetingOf(ctx, userId, op.meetingId));
        await deleteMeeting(ctx, userId, op.meetingId);
        applied.push({ ...op, before });
        break;
      }
      case "setCoursePrefs": {
        const before = prefsState(await prefsOf(ctx, userId, op.courseCanvasId));
        await patchCoursePrefs(ctx, userId, op.courseCanvasId, op.set);
        applied.push({ ...op, before });
        break;
      }
    }
  }
  return applied;
}

/** Reverses applied ops, newest first. Things since removed are skipped. */
async function undoOps(ctx: MutationCtx, userId: string, ops: Op[]): Promise<void> {
  for (const op of [...ops].reverse()) {
    switch (op.type) {
      case "createTask": {
        const t = op.createdId === undefined ? null : await ctx.db.get(op.createdId);
        if (t !== null && t.userId === userId) await ctx.db.delete(t._id);
        break;
      }
      case "updateTask": {
        // Only the fields this op set go back; later edits to others stay.
        const item = await todoItemOf(ctx, userId, op.ref);
        if (item === null) break;
        const { set, before: b } = op;
        if (op.ref.kind === "local" && (set.title !== undefined || set.dueAt !== undefined || set.courseCanvasId !== undefined)) {
          await patchLocalTask(ctx, userId, op.ref.todoId, {
            title: set.title === undefined ? undefined : b.title,
            dueAt: set.dueAt === undefined ? undefined : (b.dueAt ?? null),
            courseCanvasId: set.courseCanvasId === undefined ? undefined : (b.courseCanvasId ?? null),
          });
        }
        const added = new Set(op.addedSubtaskIds ?? []);
        await patchPlan(ctx, userId, op.ref, {
          plannedDay: set.plannedDay === undefined ? undefined : (b.plannedDay ?? null),
          notes: set.notes === undefined ? undefined : (b.notes ?? null),
          doneAt: set.done === undefined ? undefined : (b.doneAt ?? null),
          doneBySubmission: set.done === undefined ? undefined : b.doneBySubmission,
          subtasks: added.size === 0 ? undefined : item.subtasks.filter((sub) => !added.has(sub.id)),
        });
        break;
      }
      case "deleteTask": {
        const b = op.before;
        await ctx.db.insert("todos", {
          userId,
          source: "local",
          title: b.title,
          dueAt: b.dueAt,
          courseCanvasId: b.courseCanvasId,
          plannedDay: b.plannedDay,
          notes: b.notes,
          doneAt: b.doneAt,
          subtasks: b.subtasks,
        });
        break;
      }
      case "createEvent": {
        const e = op.createdId === undefined ? null : await ctx.db.get(op.createdId);
        if (e !== null && e.userId === userId && e.source === "local") await ctx.db.delete(e._id);
        break;
      }
      case "updateEvent": {
        const e = await ctx.db.get(op.eventId);
        if (e === null || e.userId !== userId || e.source !== "local") break;
        const b = op.before;
        const had = (key: keyof EventSet) => op.set[key] !== undefined;
        const restore: EventSet = {
          title: had("title") ? b.title : undefined,
          startAt: had("startAt") ? b.startAt : undefined,
          endAt: had("endAt") ? (b.endAt ?? null) : undefined,
          allDay: had("allDay") ? (b.allDay ?? false) : undefined,
          location: had("location") ? (b.location ?? null) : undefined,
          description: had("description") ? (b.description ?? null) : undefined,
          courseCanvasId: had("courseCanvasId") ? (b.courseCanvasId ?? null) : undefined,
        };
        await replaceLocalEvent(ctx, userId, op.eventId, mergeEvent(eventFieldsOf(e), restore));
        break;
      }
      case "deleteEvent":
        await insertLocalEvent(ctx, userId, op.before);
        break;
      case "createMeeting":
        if (op.createdId !== undefined) await deleteMeeting(ctx, userId, op.createdId);
        break;
      case "deleteMeeting":
        await insertMeeting(ctx, userId, op.before);
        break;
      case "setCoursePrefs": {
        const pref = await prefsOf(ctx, userId, op.courseCanvasId);
        const { set, before: b } = op;
        const restore = {
          ...(set.nickname !== undefined && { nickname: b.nickname ?? undefined }),
          ...(set.color !== undefined && { color: b.color }),
          ...(set.hidden !== undefined && { hidden: b.hidden }),
        };
        if (pref !== null) await ctx.db.patch(pref._id, restore);
        else await ctx.db.insert("coursePrefs", { userId, courseCanvasId: op.courseCanvasId, ...restore });
        break;
      }
    }
  }
}

async function ownChange(ctx: MutationCtx, changeId: Id<"assistantChanges">) {
  const userId = await requireUserId(ctx);
  const change = await ctx.db.get(changeId);
  if (change === null || change.userId !== userId) fail("Change not found");
  return { userId, change };
}

// ── API ───────────────────────────────────────────────────────────────────

/** Called by the assistant's `makeChanges` tool. Errors go back to the model. */
export const record = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    promptMessageId: v.string(),
    timeZone: v.string(),
    summary: v.string(),
    ops: v.array(draftOp),
  },
  returns: v.object({
    changeId: v.id("assistantChanges"),
    status: v.union(v.literal("applied"), v.literal("proposed")),
  }),
  handler: async (ctx, args) => {
    await requireThread(ctx, args.userId, args.threadId);
    if (args.ops.length === 0) fail("No changes given");
    if (args.ops.length > MAX_OPS) fail(`At most ${MAX_OPS} changes at once`);
    const ops: Op[] = [];
    for (const draft of args.ops) ops.push(await resolve(ctx, args.userId, draft, args.timeZone));
    const summary = args.summary.trim().slice(0, 140) || "Changes";
    const earlier = await ctx.db
      .query("assistantChanges")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .filter((q) => q.eq(q.field("promptMessageId"), args.promptMessageId))
      .collect();
    const appliedThisTurn = earlier
      .filter((c) => c.status === "applied")
      .reduce((n, c) => n + c.ops.length, 0);
    if (needsConfirmation(ops, appliedThisTurn)) {
      const changeId = await ctx.db.insert("assistantChanges", {
        userId: args.userId,
        threadId: args.threadId,
        promptMessageId: args.promptMessageId,
        status: "proposed",
        summary,
        ops,
      });
      return { changeId, status: "proposed" as const };
    }
    const applied = await applyOps(ctx, args.userId, ops);
    const changeId = await ctx.db.insert("assistantChanges", {
      userId: args.userId,
      threadId: args.threadId,
      promptMessageId: args.promptMessageId,
      status: "applied",
      summary,
      ops: applied,
      settledAt: Date.now(),
    });
    return { changeId, status: "applied" as const };
  },
});

/** The student confirms a proposal. All of it applies, or none of it. */
export const confirm = mutation({
  args: { changeId: v.id("assistantChanges") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, change } = await ownChange(ctx, args.changeId);
    if (change.status !== "proposed") fail("This change was already handled");
    const ops = await applyOps(ctx, userId, change.ops);
    await ctx.db.patch(change._id, { status: "applied", ops, settledAt: Date.now() });
    return null;
  },
});

export const dismiss = mutation({
  args: { changeId: v.id("assistantChanges") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { change } = await ownChange(ctx, args.changeId);
    if (change.status !== "proposed") fail("This change was already handled");
    await ctx.db.patch(change._id, { status: "dismissed", settledAt: Date.now() });
    return null;
  },
});

export const undo = mutation({
  args: { changeId: v.id("assistantChanges") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, change } = await ownChange(ctx, args.changeId);
    if (change.status !== "applied") fail("Only applied changes can be undone");
    await undoOps(ctx, userId, change.ops);
    await ctx.db.patch(change._id, { status: "undone", settledAt: Date.now() });
    return null;
  },
});

/** Every change in a chat; the UI renders each where its tool call sits. */
export const forThread = query({
  args: { threadId: v.string() },
  handler: async (ctx, args): Promise<Doc<"assistantChanges">[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null || (await threadOf(ctx, identity.subject, args.threadId)) === null) return [];
    return await ctx.db
      .query("assistantChanges")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();
  },
});

/** Recent outcomes, so the model knows which of its proposals landed. */
export const outcomes = internalQuery({
  args: { threadId: v.string() },
  returns: v.array(v.object({ changeId: v.string(), status: v.string(), summary: v.string() })),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("assistantChanges")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(20);
    return rows.reverse().map((row) => ({ changeId: row._id, status: row.status, summary: row.summary }));
  },
});
