import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import agentTest from "@convex-dev/agent/test";
import { createThread } from "@convex-dev/agent";
import schema from "../convex/schema";
import { api, components, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { DAILY_TOKEN_LIMIT, usageDay } from "../convex/lib/assistant";
import { isDayKey, localIso, parseClock, parseLocal } from "../convex/lib/assistantTime";

const modules = import.meta.glob("../convex/**/*.{ts,js}");
const userId = "student";
const CHICAGO = "America/Chicago";
const turn = { promptMessageId: "prompt-1", timeZone: CHICAGO };

async function setup() {
  const t = convexTest(schema, modules);
  agentTest.register(t);
  const threadId = await t.run(async (ctx) => {
    const threadId = await createThread(ctx, components.agent, { userId });
    await ctx.db.insert("courses", {
      userId,
      canvasId: 1,
      name: "Operating Systems",
      courseCode: "CS 537",
      enrollmentState: "active",
      syncedAt: 0,
    });
    await ctx.db.insert("assignments", {
      userId,
      courseCanvasId: 1,
      canvasId: 10,
      syncedAt: 0,
      name: "P3: xv6 scheduler",
      htmlUrl: "https://canvas.wisc.edu/courses/1/assignments/10",
      submissionTypes: ["online_upload"],
      dueAt: Date.UTC(2026, 8, 26, 4, 59),
      pointsPossible: 100,
      submission: { workflowState: "graded", score: 91, postedAt: undefined },
    });
    await ctx.db.insert("assistantThreads", {
      userId,
      threadId,
      title: "Plans",
      titled: true,
      lastMessageAt: 0,
    });
    return threadId;
  });
  return { t, threadId, student: t.withIdentity({ subject: userId }), other: t.withIdentity({ subject: "other" }) };
}

afterEach(() => vi.useRealTimers());

describe("assistant time", () => {
  it("round-trips wall-clock times across DST", () => {
    for (const local of ["2026-03-08T01:30", "2026-03-08T03:30", "2026-11-01T12:00", "2026-09-23T23:59"]) {
      expect(localIso(parseLocal(local, CHICAGO), CHICAGO)).toBe(local);
    }
    expect(localIso(parseLocal("2026-09-23", CHICAGO), CHICAGO)).toBe("2026-09-23T00:00");
  });

  it("rejects malformed dates and times", () => {
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(() => parseLocal("tomorrow 5pm", CHICAGO)).toThrow(/YYYY-MM-DDTHH:mm/);
    expect(() => parseClock("25:00")).toThrow();
    expect(() => parseClock("9:75")).toThrow();
    expect(parseClock("09:05")).toBe(545);
  });
});

describe("assistant changes", () => {
  it("applies a small change at once and undoes it", async () => {
    const { t, threadId, student } = await setup();
    const { changeId, status } = await t.mutation(internal.assistantChanges.record, {
      ...turn,
      userId,
      threadId,
      summary: "Add a study task",
      ops: [{ type: "createTask", title: "  Study for quiz ", plannedDay: "2026-09-24", subtasks: ["Ch. 4", " "] }],
    });
    expect(status).toBe("applied");
    const task = await t.run(async (ctx) => (await ctx.db.query("todos").collect())[0]);
    expect(task).toMatchObject({ title: "Study for quiz", plannedDay: "2026-09-24", source: "local" });
    expect(task.subtasks.map((s) => s.title)).toEqual(["Ch. 4"]);

    await student.mutation(api.assistantChanges.undo, { changeId });
    expect(await t.run((ctx) => ctx.db.query("todos").collect())).toEqual([]);
    const change = await t.run((ctx) => ctx.db.get(changeId));
    expect(change?.status).toBe("undone");
  });

  it("holds deletes and larger sets for confirmation", async () => {
    const { t, threadId, student } = await setup();
    const eventId = await t.run((ctx) =>
      ctx.db.insert("calendarEvents", { userId, source: "local", title: "Study group", startAt: 1_000, endAt: 2_000 }),
    );
    const { changeId, status } = await t.mutation(internal.assistantChanges.record, {
      ...turn,
      userId,
      threadId,
      summary: "Clear study blocks",
      ops: [{ type: "deleteEvent", eventId }],
    });
    expect(status).toBe("proposed");
    expect(await t.run((ctx) => ctx.db.get(eventId))).not.toBeNull();

    await student.mutation(api.assistantChanges.confirm, { changeId });
    expect(await t.run((ctx) => ctx.db.get(eventId))).toBeNull();
    await expect(student.mutation(api.assistantChanges.confirm, { changeId })).rejects.toThrow(/already handled/);

    // Undo recreates the deleted event from its snapshot.
    await student.mutation(api.assistantChanges.undo, { changeId });
    const events = await t.run((ctx) => ctx.db.query("calendarEvents").collect());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ title: "Study group", startAt: 1_000, endAt: 2_000 });

    const three = await t.mutation(internal.assistantChanges.record, {
      ...turn,
      userId,
      threadId,
      summary: "Plan the week",
      ops: ["A", "B", "C"].map((title) => ({ type: "createTask" as const, title })),
    });
    expect(three.status).toBe("proposed");
    await student.mutation(api.assistantChanges.dismiss, { changeId: three.changeId });
    expect(await t.run((ctx) => ctx.db.query("todos").collect())).toEqual([]);
  });

  it("keeps Canvas-owned fields and Canvas events read-only", async () => {
    const { t, threadId } = await setup();
    await expect(
      t.mutation(internal.assistantChanges.record, {
      ...turn,
        userId,
        threadId,
        summary: "Rename",
        ops: [{ type: "updateTask", ref: "assignment:10", set: { title: "Mine now" } }],
      }),
    ).rejects.toThrow(/Canvas items keep their title/);

    const canvasEvent = await t.run((ctx) =>
      ctx.db.insert("calendarEvents", { userId, source: "canvas", canvasId: 5, title: "Exam", startAt: 0 }),
    );
    await expect(
      t.mutation(internal.assistantChanges.record, {
      ...turn,
        userId,
        threadId,
        summary: "Move exam",
        ops: [{ type: "updateEvent", eventId: canvasEvent, set: { startAt: 10 } }],
      }),
    ).rejects.toThrow(/read-only/);
    await expect(
      t.mutation(internal.assistantChanges.record, {
      ...turn,
        userId,
        threadId,
        summary: "Unknown",
        ops: [{ type: "updateTask", ref: "local:nope", set: { done: true } }],
      }),
    ).rejects.toThrow(/Unknown task/);
  });

  it("plans a Canvas item and undo drops the empty plan row", async () => {
    const { t, threadId, student } = await setup();
    const { changeId } = await t.mutation(internal.assistantChanges.record, {
      ...turn,
      userId,
      threadId,
      summary: "Plan P3",
      ops: [{ type: "updateTask", ref: "assignment:10", set: { plannedDay: "2026-09-24" } }],
    });
    expect(await t.run((ctx) => ctx.db.query("todos").collect())).toMatchObject([
      { source: "canvas", canvasKind: "assignment", canvasId: 10, plannedDay: "2026-09-24" },
    ]);
    await student.mutation(api.assistantChanges.undo, { changeId });
    expect(await t.run((ctx) => ctx.db.query("todos").collect())).toEqual([]);
  });

  it("scopes changes to their owner", async () => {
    const { t, threadId, other } = await setup();
    const { changeId } = await t.mutation(internal.assistantChanges.record, {
      ...turn,
      userId,
      threadId,
      summary: "Add",
      ops: [{ type: "createTask", title: "Mine" }],
    });
    await expect(other.mutation(api.assistantChanges.undo, { changeId })).rejects.toThrow(/not found/);
    expect(await other.query(api.assistantChanges.forThread, { threadId })).toEqual([]);
    await expect(
      t.mutation(internal.assistantChanges.record, { ...turn, userId: "other", threadId, summary: "x", ops: [{ type: "createTask", title: "x" }] }),
    ).rejects.toThrow(/Chat not found/);
  });
});

describe("assistant changes, per turn and per field", () => {
  it("counts auto-applied edits across a reply before asking to confirm", async () => {
    const { t, threadId } = await setup();
    const first = await t.mutation(internal.assistantChanges.record, {
      ...turn, userId, threadId, summary: "Two", ops: [{ type: "createTask", title: "A" }, { type: "createTask", title: "B" }],
    });
    expect(first.status).toBe("applied");
    const second = await t.mutation(internal.assistantChanges.record, {
      ...turn, userId, threadId, summary: "One more", ops: [{ type: "createTask", title: "C" }],
    });
    expect(second.status).toBe("proposed");
    const nextTurn = await t.mutation(internal.assistantChanges.record, {
      ...turn, promptMessageId: "prompt-2", userId, threadId, summary: "New turn", ops: [{ type: "createTask", title: "D" }],
    });
    expect(nextTurn.status).toBe("applied");
  });

  it("undo restores only what the change set", async () => {
    const { t, threadId, student } = await setup();
    const todoId = await t.run((ctx) =>
      ctx.db.insert("todos", { userId, source: "local", title: "Essay", notes: "outline", subtasks: [] }),
    );
    const { changeId } = await t.mutation(internal.assistantChanges.record, {
      ...turn, userId, threadId, summary: "Plan essay",
      ops: [{ type: "updateTask", ref: `local:${todoId}`, set: { plannedDay: "2026-09-24", addSubtasks: ["Draft"] } }],
    });
    // The student edits other fields afterwards.
    await t.run(async (ctx) => {
      const todo = (await ctx.db.get(todoId))!;
      await ctx.db.patch(todoId, {
        notes: "outline + sources",
        subtasks: [...todo.subtasks, { id: "mine", title: "Cite", done: false }],
      });
    });
    await student.mutation(api.assistantChanges.undo, { changeId });
    const todo = await t.run((ctx) => ctx.db.get(todoId));
    expect(todo?.plannedDay).toBeUndefined();
    expect(todo?.notes).toBe("outline + sources");
    expect(todo?.subtasks.map((sub) => sub.title)).toEqual(["Cite"]);
  });

  it("pins all-day events to the campus day", async () => {
    const { t, threadId } = await setup();
    const la = "America/Los_Angeles";
    await t.mutation(internal.assistantChanges.record, {
      ...turn, timeZone: la, userId, threadId, summary: "Day off",
      ops: [{ type: "createEvent", event: { title: "Fall break", startAt: parseLocal("2026-09-25", la), allDay: true } }],
    });
    const [event] = await t.run((ctx) => ctx.db.query("calendarEvents").collect());
    expect(localIso(event.startAt, CHICAGO)).toBe("2026-09-25T00:00");
    expect(event.endAt).toBeUndefined();
  });
});

describe("assistant reads", () => {
  it("never exposes an unposted score", async () => {
    const { t } = await setup();
    const book = await t.query(internal.assistantData.grades, { userId, courseCanvasId: 1 });
    const row = book.courses[0] as { assignments: Array<{ score?: unknown; status?: string }> };
    expect(row.assignments[0].score).toBeUndefined();
    const assignments = (await t.query(internal.assistantData.course, {
      userId,
      timeZone: CHICAGO,
      courseCanvasId: 1,
      part: "assignments",
    })) as { assignments: Array<{ score?: number; graded?: string; due?: string }> };
    expect(assignments.assignments[0]).toMatchObject({ graded: "not posted yet", due: "2026-09-25T23:59" });
    expect(assignments.assignments[0].score).toBeUndefined();
  });
});

describe("assistant search", () => {
  it("finds exam dates inside page bodies and syllabus files, with snippets", async () => {
    const { t } = await setup();
    await t.run(async (ctx) => {
      // convex-test's search fake throws on documents missing the search
      // field (real Convex skips them), so give the fixtures empty bodies.
      for (const course of await ctx.db.query("courses").collect()) await ctx.db.patch(course._id, { syllabusBody: "" });
      for (const a of await ctx.db.query("assignments").collect()) await ctx.db.patch(a._id, { description: "" });
      await ctx.db.insert("pages", {
        userId,
        courseCanvasId: 1,
        canvasId: 50,
        syncedAt: 0,
        url: "exam-information",
        title: "Exam Information",
        // Spaces around tags: the convex-test search fake splits on whitespace only.
        body: "<h2> Exams </h2><p> Exam 1: Wednesday October 7, 7:40-9:00 pm, room TBA </p>",
        isFrontPage: false,
        published: true,
        htmlUrl: "https://canvas.wisc.edu/courses/1/pages/exam-information",
      });
      await ctx.db.insert("files", {
        userId,
        courseCanvasId: 1,
        canvasId: 60,
        syncedAt: 0,
        displayName: "CS 537 Syllabus.pdf",
        filename: "syllabus.pdf",
        contentType: "application/pdf",
        size: 1000,
        url: "https://canvas.wisc.edu/files/60/download",
      });
      await ctx.db.insert("courseDocuments", {
        userId,
        courseCanvasId: 1,
        fileCanvasId: 60,
        fingerprint: "fp",
        text: "Grading. The midterm exam is on October 6 at 7:30 PM in MH 1570.",
        pages: 1,
        extractedAt: 0,
      });
    });
    const found = (await t.query(internal.assistantData.search, { userId, timeZone: CHICAGO, query: "exam" })) as {
      results: Array<{ kind: string; title: string; read?: { kind: string; id?: string }; href?: string; snippet?: string }>;
    };
    const page = found.results.find((r) => r.kind === "page");
    expect(page).toMatchObject({ title: "Exam Information", read: { kind: "page", id: "exam-information" }, href: "/courses/1/pages/exam-information" });
    expect(page?.snippet).toContain("October 7");
    const file = found.results.find((r) => r.kind === "file");
    expect(file).toMatchObject({ title: "CS 537 Syllabus.pdf", read: { kind: "file", id: "60" } });
    expect(file?.snippet).toContain("October 6");
    const scoped = (await t.query(internal.assistantData.search, { userId, timeZone: CHICAGO, query: "exam", courseCanvasId: 2 })) as { results: unknown[]; note?: string };
    expect(scoped.results).toEqual([]);
    expect(scoped.note).toBeDefined();
  });

  it("queues only syllabus PDFs whose text isn't extracted yet", async () => {
    const { t } = await setup();
    await t.run(async (ctx) => {
      const base = { userId, courseCanvasId: 1, syncedAt: 0, filename: "f", contentType: "application/pdf", size: 1000, url: "https://x/f" };
      await ctx.db.insert("files", { ...base, canvasId: 61, displayName: "Fall 2026 Syllabus.pdf" });
      await ctx.db.insert("files", { ...base, canvasId: 62, displayName: "Lecture 1.pdf" });
      await ctx.db.insert("files", { ...base, canvasId: 63, displayName: "Syllabus.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    });
    const pending = await t.query(internal.courseSources.pendingSyllabusFiles, { userId, courseCanvasId: 1 });
    expect(pending.map((f) => f.canvasId)).toEqual([61]);
    await t.mutation(internal.courseSources.storeDocument, {
      userId,
      courseCanvasId: 1,
      fileCanvasId: 61,
      fingerprint: pending[0].fingerprint,
      text: "Syllabus text",
      pages: 1,
    });
    expect(await t.query(internal.courseSources.pendingSyllabusFiles, { userId, courseCanvasId: 1 })).toEqual([]);
  });
});

describe("assistant chats", () => {
  it("starts a chat, blocks a second send while replying, and enforces the daily limit", async () => {
    vi.useFakeTimers();
    const { t, student } = await setup();
    const id = await student.mutation(api.assistant.send, { prompt: "What's due this week?", timeZone: CHICAGO });
    const row = await student.query(api.assistant.thread, { threadId: id });
    expect(row).toMatchObject({ title: "What's due this week?" });
    expect(row?.runningSince).toBeTypeOf("number");
    await expect(student.mutation(api.assistant.send, { threadId: id, prompt: "And next week?" })).rejects.toThrow(
      /still replying/,
    );

    await t.run((ctx) => ctx.db.insert("assistantUsage", { userId, day: usageDay(Date.now()), tokens: DAILY_TOKEN_LIMIT }));
    await expect(student.mutation(api.assistant.send, { prompt: "Hi" })).rejects.toThrow(/today's Ask limit/);
  });

  it("archives, lists and deletes chats per user", async () => {
    const { t, threadId, student, other } = await setup();
    await student.mutation(api.assistant.setArchived, { threadId, archived: true });
    expect((await student.query(api.assistant.threads, {}))[0].archivedAt).toBeTypeOf("number");
    expect(await other.query(api.assistant.threads, {})).toEqual([]);
    await expect(other.mutation(api.assistant.setArchived, { threadId, archived: false })).rejects.toThrow(/Chat not found/);

    const changeId: Id<"assistantChanges"> = (
      await t.mutation(internal.assistantChanges.record, { ...turn, userId, threadId, summary: "Add", ops: [{ type: "createTask", title: "Keep me" }] })
    ).changeId;
    await student.mutation(api.assistant.remove, { threadId });
    expect(await student.query(api.assistant.threads, {})).toEqual([]);
    expect(await t.run((ctx) => ctx.db.get(changeId))).toBeNull();
    // Applied changes outlive the chat.
    expect(await t.run((ctx) => ctx.db.query("todos").collect())).toHaveLength(1);
  });
});
