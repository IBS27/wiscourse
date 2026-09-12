import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import type { WorkId } from "@convex-dev/workpool";
import { syncPool } from "../convex/sync";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { enableCompactLists } from "./list-migration";

const modules = import.meta.glob("../convex/**/*.{ts,js}");
const userId = "student";
const now = Date.UTC(2026, 8, 12, 17);
const day = 86_400_000;
const course = { canvasId: 1, name: "Course", courseCode: "CS", enrollmentState: "active" as const };
const assignment = { canvasId: 10, name: "Homework", submissionTypes: ["online_upload"], htmlUrl: "/assignment" };
async function setup() {
  vi.useFakeTimers(); vi.setSystemTime(now);
  const t = convexTest(schema, modules);
  await t.mutation(internal.syncStore.upsertCourses, { userId, courses: [course] });
  const upsert = (rows: Array<typeof assignment & { dueAt?: number; pointsPossible?: number; description?: string; canvasCreatedAt?: number; submission?: { workflowState: string; score?: number; postedAt?: number; submittedAt?: number; comments?: { authorName: string; comment: string; createdAt: number }[] } }>, prune = false) =>
    t.mutation(internal.syncStore.upsertAssignments, { userId, courseCanvasId: 1, assignments: rows, logChanges: true, prune });
  return { t, student: t.withIdentity({ subject: userId }), upsert };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("keeps content and projections untouched on replay while sync success advances", async () => {
  const { t, upsert } = await setup();
  await upsert([{ ...assignment, dueAt: now }]);
  const before = await t.run(async (ctx) => ({
    assignments: await ctx.db.query("assignments").collect(),
    summaries: await ctx.db.query("assignmentSummaries").collect(),
  }));
  vi.setSystemTime(now + 60_000);
  const metrics = await t.mutation(async (ctx) => {
    await ctx.runMutation(internal.syncStore.upsertAssignments, {
      userId, courseCanvasId: 1, assignments: [{ ...assignment, dueAt: now }], logChanges: true,
    });
    return ctx.meta.getTransactionMetrics();
  });
  expect(metrics.documentsWritten.used).toBe(0);
  expect(await t.run(async (ctx) => ({ assignments: await ctx.db.query("assignments").collect(),
    summaries: await ctx.db.query("assignmentSummaries").collect() }))).toEqual(before);
  await t.mutation(internal.syncStore.recordSyncResult, { userId, kind: "full" });
  expect((await t.query(internal.syncStore.getSyncState, { userId }))?.lastFullSyncAt).toBe(now + 60_000);
});

it("clears removed due dates and points once, preserving locally verified instructors", async () => {
  const { t, upsert } = await setup();
  await upsert([{ ...assignment, dueAt: now, pointsPossible: 10, description: "Old" }]);
  await upsert([assignment]);
  await upsert([assignment]);
  const row = await t.run((ctx) => ctx.db.query("assignments").first());
  expect(row).not.toHaveProperty("dueAt");
  expect(row).not.toHaveProperty("pointsPossible");
  expect(row).not.toHaveProperty("description");
  expect(await t.run((ctx) => ctx.db.query("assignmentChanges").collect())).toHaveLength(2);
  const instructors = [{ name: "Verified Teacher", role: "teacher" as const }];
  await t.run(async (ctx) => {
    const c = await ctx.db.query("courses").first();
    await ctx.db.patch(c!._id, { verifiedInstructors: instructors });
  });
  await t.mutation(internal.syncStore.upsertCourses, { userId, courses: [course] });
  expect((await t.run((ctx) => ctx.db.query("courseSummaries").first()))?.verifiedInstructors).toEqual(instructors);
});

it("preserves omitted comments, clears explicit empty comments and withdrawn grades, and skips repeated submissions", async () => {
  const { t, upsert, student } = await setup();
  const comments = [{ authorName: "Teacher", comment: "Full feedback", createdAt: now }];
  await upsert([{ ...assignment, submission: { workflowState: "graded", score: 9, postedAt: now, comments } }]);
  await enableCompactLists(t);
  const update = { assignmentCanvasId: 10, submission: { workflowState: "submitted", submittedAt: now } };
  await t.mutation(internal.syncStore.applySubmissionUpdates, { userId, updates: [update] });
  let row = await t.run((ctx) => ctx.db.query("assignments").first());
  expect(row?.submission?.comments).toEqual(comments);
  expect(row?.submission?.score).toBeUndefined();
  expect(row?.submission?.postedAt).toBeUndefined();
  expect((await student.query(api.inbox.gradeDetail, { assignmentCanvasId: 10 }))?.comments).toEqual([]);
  await student.mutation(api.todos.setDone, { ref: { kind: "assignment", canvasId: 10 }, done: false });
  const metrics = await t.mutation(async (ctx) => {
    await ctx.runMutation(internal.syncStore.applySubmissionUpdates, { userId, updates: [update] });
    return ctx.meta.getTransactionMetrics();
  });
  expect(metrics.documentsWritten.used).toBe(0);
  expect((await student.query(api.todos.get, { ref: { kind: "assignment", canvasId: 10 } }))?.doneAt).toBeUndefined();
  await upsert([{ ...assignment, submission: { workflowState: "submitted", submittedAt: now, comments: [] } }]);
  row = await t.run((ctx) => ctx.db.query("assignments").first());
  expect(row?.submission?.comments).toEqual([]);
});

it("preserves feed and todo output through migration, concurrent edits, deletion, and rollback", async () => {
  const { t, student, upsert } = await setup();
  await upsert(Array.from({ length: 55 }, (_, i) => ({ ...assignment, canvasId: i,
    dueAt: now + day, description: "Full body ".repeat(1000), canvasCreatedAt: now - day })));
  // Simulate existing pre-migration data without projections.
  await t.run(async (ctx) => {
    for (const row of await ctx.db.query("assignmentSummaries").collect()) await ctx.db.delete(row._id);
  });
  await expect(t.mutation(internal.listMigration.setReaderMode, { compact: true })).rejects.toThrow("Verify");
  await t.mutation(internal.listMigration.advance, { table: "assignments" });
  await upsert([{ ...assignment, canvasId: 0, name: "Updated during backfill", dueAt: now }]);
  await upsert(Array.from({ length: 54 }, (_, i) => ({ ...assignment, canvasId: i, dueAt: now + day,
    description: "Full body ".repeat(1000), canvasCreatedAt: now - day })), true);
  const before = { feed: await student.query(api.inbox.feed, { now }), todos: await student.query(api.todos.list, { now }), courses: await student.query(api.courses.list, {}) };
  await enableCompactLists(t);
  expect({ feed: await student.query(api.inbox.feed, { now }), todos: await student.query(api.todos.list, { now }), courses: await student.query(api.courses.list, {}) }).toEqual(before);
  expect(await student.query(api.todos.description, { kind: "assignment", canvasId: 1 })).toBe("Full body ".repeat(1000));
  expect(await t.withIdentity({ subject: "other" }).query(api.todos.description, { kind: "assignment", canvasId: 1 })).toBeNull();
  expect(await t.withIdentity({ subject: "other" }).query(api.inbox.feed, { now })).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("assignmentSummaries").collect())).toHaveLength(54);
  await t.mutation(internal.listMigration.setReaderMode, { compact: false });
  expect(await student.query(api.inbox.feed, { now })).toEqual(before.feed);
});

it("keeps notifications for older changed assignments and expires windows without writes", async () => {
  const { t, student, upsert } = await setup();
  await upsert([{ ...assignment, canvasCreatedAt: now - 100 * day, dueAt: now }]);
  await upsert([{ ...assignment, canvasCreatedAt: now - 100 * day, dueAt: now + day }]);
  await enableCompactLists(t);
  expect(await student.query(api.inbox.feed, { now })).toMatchObject([{ type: "change", canvasId: 10, seen: false }]);
  await student.mutation(api.inbox.markAllSeen, {});
  expect(await student.query(api.inbox.feed, { now })).toMatchObject([{ type: "change", seen: true }]);
  expect(await student.query(api.inbox.feed, { now: now + 31 * day })).toEqual([]);
  await upsert([{ ...assignment, dueAt: now + 121 * day }]);
  expect(await student.query(api.todos.list, { now })).toEqual([]);
  expect(await student.query(api.todos.list, { now: now + 2 * day })).toHaveLength(1);
});

it("list reads stay small when only description, comments, and syllabus grow", async () => {
  const { t, student, upsert } = await setup();
  const submission = { workflowState: "graded", score: 8, postedAt: now };
  await upsert([{ ...assignment, dueAt: now, canvasCreatedAt: now, submission }]);
  await enableCompactLists(t);
  const read = () => student.query(async (ctx) => {
    await ctx.runQuery(api.inbox.feed, { now });
    await ctx.runQuery(api.todos.list, { now });
    await ctx.runQuery(api.courses.list, {});
    return ctx.meta.getTransactionMetrics();
  });
  const before = await read();
  await upsert([{ ...assignment, dueAt: now, canvasCreatedAt: now, description: "x".repeat(400_000),
    submission: { ...submission, comments: [{ authorName: "Teacher", createdAt: now, comment: "c".repeat(200_000) }] } }]);
  await t.mutation(internal.syncStore.upsertCourses, { userId, courses: [{ ...course, syllabusBody: "y".repeat(400_000) }] });
  expect((await read()).bytesRead.used).toBe(before.bytesRead.used);
  expect(await student.query(api.todos.description, { kind: "assignment", canvasId: 10 })).toHaveLength(400_000);
  expect((await student.query(api.inbox.gradeDetail, { assignmentCanvasId: 10 }))?.comments[0].comment).toHaveLength(200_000);
});

it("preserves annotations, plans, personal tasks, quiz deduplication and course visibility", async () => {
  const { t, student, upsert } = await setup();
  await upsert([
    { ...assignment, dueAt: now + 500 * day },
    { ...assignment, canvasId: 11 },
    { ...assignment, canvasId: 12, dueAt: now - 10 * day },
  ]);
  await student.mutation(api.todos.setNotes, { ref: { kind: "assignment", canvasId: 10 }, notes: "Keep annotated item" });
  await student.mutation(api.todos.setPlannedDay, { ref: { kind: "assignment", canvasId: 11 }, plannedDay: "2026-09-12" });
  await student.mutation(api.todos.createLocal, { title: "Personal task", courseCanvasId: 99 });
  await t.mutation(internal.storeCourseMeta.upsertQuizzes, { userId, courseCanvasId: 1,
    quizzes: [{ canvasId: 1, title: "Wrapped quiz", quizType: "assignment", htmlUrl: "/quiz", dueAt: now, assignmentCanvasId: 12 }] });
  const before = await student.query(api.todos.list, { now });
  expect(before).toHaveLength(4);
  await enableCompactLists(t);
  expect(await student.query(api.todos.list, { now })).toEqual(before);
  await t.mutation(internal.syncStore.upsertCourses, { userId, courses: [{ ...course, enrollmentState: "completed" }] });
  expect(await student.query(api.todos.list, { now })).toMatchObject([{ kind: "local", title: "Personal task" }]);
  await t.mutation(internal.syncStore.upsertCourses, { userId, courses: [course] });
  expect(await student.query(api.todos.list, { now })).toEqual(before);
});

it("retains independent assignment/grade seen state and regrade privacy after reader switching", async () => {
  const { t, student, upsert } = await setup();
  await upsert([{ ...assignment, canvasCreatedAt: now, submission: { workflowState: "graded", score: 8, postedAt: now } }]);
  await enableCompactLists(t);
  await student.mutation(api.inbox.markAllSeen, {});
  await student.mutation(api.seenState.markUnseen, { kind: "assignment", canvasId: 10 });
  let feed = await student.query(api.inbox.feed, { now });
  expect(feed.find((item) => item.type === "assignment")?.seen).toBe(false);
  expect(feed.find((item) => item.type === "grade")?.seen).toBe(true);
  await t.mutation(internal.syncStore.applySubmissionUpdates, { userId, updates: [{ assignmentCanvasId: 10,
    submission: { workflowState: "graded", score: 9, postedAt: now + 1 } }] });
  feed = await student.query(api.inbox.feed, { now });
  expect(feed.find((item) => item.type === "grade")?.seen).toBe(false);
  await t.mutation(internal.syncStore.applySubmissionUpdates, { userId, updates: [{ assignmentCanvasId: 10,
    submission: { workflowState: "graded", score: 9 } }] });
  expect((await student.query(api.inbox.feed, { now })).some((item) => item.type === "grade")).toBe(false);
  expect((await student.query(api.inbox.gradeDetail, { assignmentCanvasId: 10 }))?.score).toBeUndefined();
});

it("prunes removed discussions and courses without dropping retained announcement history", async () => {
  const { t, student } = await setup();
  await t.mutation(internal.storeCourseMeta.upsertDiscussions, { userId, discussions: [
    { canvasId: 1, courseCanvasId: 1, title: "Announcement", message: "Full text ".repeat(100), isAnnouncement: true, postedAt: now, htmlUrl: "/a" },
    { canvasId: 2, courseCanvasId: 1, title: "Discussion", isAnnouncement: false, dueAt: now, htmlUrl: "/d" },
  ] });
  await enableCompactLists(t);
  await t.mutation(internal.storeCourseMeta.upsertDiscussions, { userId, discussions: [], pruneCourseCanvasId: 1 });
  expect(await student.query(api.inbox.feed, { now })).toHaveLength(1);
  expect(await student.query(api.todos.list, { now })).toEqual([]);
  expect((await t.run((ctx) => ctx.db.query("discussionSummaries").collect())).map((row) => row.canvasId)).toEqual([1]);
  await t.mutation(internal.syncStore.upsertCourses, { userId, courses: [], prune: true });
  expect(await student.query(api.inbox.feed, { now })).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("courseSummaries").collect())).toEqual([]);
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());
});

it("rejects divergent migration records and can resume after repair", async () => {
  const { t, upsert } = await setup();
  await upsert([assignment]);
  expect((await t.mutation(internal.listMigration.advance, { table: "assignments" })).stage).toBe("verify");
  await t.run(async (ctx) => {
    const row = await ctx.db.query("assignmentSummaries").first();
    await ctx.db.patch(row!._id, { name: "Diverged" });
  });
  await expect(t.mutation(internal.listMigration.advance, { table: "assignments" })).rejects.toThrow("divergent");
  await upsert([assignment]);
  await enableCompactLists(t);
});

it("skips cron dispatch when configured without disabling the manual enqueue function", async () => {
  const { t, student } = await setup();
  vi.stubEnv("WISCOURSE_BACKGROUND_SYNC", "false");
  const metrics = await t.mutation(async (ctx) => {
    await ctx.runMutation(internal.sync.dispatchTripwire, {});
    await ctx.runMutation(internal.sync.dispatchFullSync, {});
    return ctx.meta.getTransactionMetrics();
  });
  expect(metrics.documentsRead.used).toBe(0);
  expect(metrics.functionsScheduled.used).toBe(0);
  const enqueue = vi.spyOn(syncPool, "enqueueAction").mockResolvedValue("work" as WorkId);
  await student.mutation(api.sync.requestSync, {});
  expect(enqueue).toHaveBeenCalledOnce();
  expect(enqueue.mock.calls[0][2]).toEqual({ userId });
});
