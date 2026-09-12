import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { omit } from "convex-helpers";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import type { TransactionMetrics } from "convex/server";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import inventory from "../docs/convex-io/dev-inventory-before.json";
import baseline from "../docs/convex-io/observed-baseline.json";

const modules = import.meta.glob("../convex/**/*.{ts,js}");
const userId = "synthetic-observed";
const now = Date.UTC(2026, 8, 12, 17);
const at = (offset: number | null) => offset === null ? undefined : now + offset;
const used = (metrics: TransactionMetrics) => Object.fromEntries(
  Object.entries(metrics).map(([name, value]) => [name, value.used]),
);
afterEach(() => vi.useRealTimers());

it("compares an identical workload using observed counts, content sizes, and relative dates", async () => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  const t = convexTest(schema, modules);
  const student = t.withIdentity({ subject: userId });
  const courses = inventory.tables.courses.syntheticShapes.map((shape) => ({
    canvasId: shape.course, name: `Course ${shape.course}`, courseCode: `C${shape.course}`,
    enrollmentState: shape.active ? "active" as const : "completed" as const,
    syllabusBody: "s".repeat(shape.bodyChars),
  }));
  const assignments = inventory.tables.assignments.syntheticShapes.map((shape, i) => ({
    courseCanvasId: shape.course, canvasId: i + 1, name: `Assignment ${i + 1}`,
    htmlUrl: `/assignments/${i + 1}`, description: "a".repeat(shape.bodyChars),
    dueAt: at(shape.dueOffset), canvasCreatedAt: at(shape.createdOffset),
    submissionTypes: ["online_upload"],
    submission: { workflowState: shape.postedOffset === null ? "unsubmitted" : "graded",
      postedAt: at(shape.postedOffset), ...(shape.postedOffset === null ? {} : { score: 8 }),
      comments: shape.commentChars ? [{ authorName: "Teacher", comment: "c".repeat(shape.commentChars), createdAt: now }] : [],
    },
  }));
  await t.mutation(internal.syncStore.upsertCourses, { userId, courses });
  for (const course of courses) {
    await t.mutation(internal.syncStore.upsertAssignments, {
      userId, courseCanvasId: course.canvasId,
      assignments: assignments.filter((a) => a.courseCanvasId === course.canvasId).map((row) => omit(row, ["courseCanvasId"])),
      logChanges: false,
    });
    await t.mutation(internal.storeCourseMeta.upsertQuizzes, {
      userId, courseCanvasId: course.canvasId,
      quizzes: inventory.tables.quizzes.syntheticShapes.flatMap((shape, i) => shape.course !== course.canvasId ? [] : [{
        canvasId: i + 1, title: `Quiz ${i + 1}`, htmlUrl: `/quizzes/${i + 1}`, quizType: "practice_quiz",
        dueAt: at(shape.dueOffset), description: "q".repeat(shape.bodyChars),
        ...(shape.linked ? { assignmentCanvasId: 1 } : {}),
      }]),
    });
  }
  await t.mutation(internal.storeCourseMeta.upsertDiscussions, {
    userId, discussions: inventory.tables.discussions.syntheticShapes.map((shape, i) => ({
      canvasId: i + 1, courseCanvasId: shape.course, title: `Discussion ${i + 1}`,
      htmlUrl: `/discussions/${i + 1}`, message: "d".repeat(shape.bodyChars),
      isAnnouncement: shape.announcement, postedAt: at(shape.postedOffset), dueAt: at(shape.dueOffset),
      ...(shape.linked ? { assignmentCanvasId: 1 } : {}),
    })),
  });
  let migration: Record<string, number> | undefined;
  if (process.env.IO_COMPACT === "true") {
    const { enableCompactLists } = await import("./list-migration");
    // Model upgrading an existing database which has no compact rows yet.
    await t.run(async (ctx) => {
      for (const table of ["courseSummaries", "assignmentSummaries", "quizSummaries", "discussionSummaries"] as const)
        for (const row of await ctx.db.query(table).collect()) await ctx.db.delete(row._id);
    });
    migration = await enableCompactLists(t);
  }
  const report: Record<string, Record<string, number>> = {};
  const digests: Record<string, string> = {};
  const reads = async (label: string) => {
    let started = performance.now();
    await student.query(async (ctx) => {
      const result = await ctx.runQuery(api.inbox.feed, {});
      report[`${label}:inbox.feed`] = used(await ctx.meta.getTransactionMetrics());
      // Excerpts intentionally replace full preview text; all other output
      // fields, ordering, and seen semantics must agree with the baseline.
      digests[`${label}:inbox.feed`] = createHash("sha256").update(JSON.stringify(
        result.map((item) => ({ ...item, subtitle: item.subtitle?.slice(0, 320) })),
      )).digest("hex");
    });
    report[`${label}:inbox.feed`].localElapsedMs = performance.now() - started;
    started = performance.now();
    await student.query(async (ctx) => {
      const result = await ctx.runQuery(api.todos.list, {});
      report[`${label}:todos.list`] = used(await ctx.meta.getTransactionMetrics());
      digests[`${label}:todos.list`] = createHash("sha256").update(JSON.stringify(
        result.map((item) => ({ ...item, todoId: undefined })),
      )).digest("hex");
    });
    report[`${label}:todos.list`].localElapsedMs = performance.now() - started;
  };
  await reads("initial");
  vi.setSystemTime(now + 1000);
  const chosen = assignments.find((a) => courses.find((c) => c.canvasId === a.courseCanvasId)?.enrollmentState === "active")!;
  const courseRows = assignments.filter((a) => a.courseCanvasId === chosen.courseCanvasId).map((row) => omit(row, ["courseCanvasId"]));
  await t.mutation(async (ctx) => {
    await ctx.runMutation(internal.syncStore.upsertAssignments, { userId, courseCanvasId: chosen.courseCanvasId, assignments: courseRows, logChanges: true });
    report["unchanged:upsertAssignments"] = used(await ctx.meta.getTransactionMetrics());
  });
  await reads("unchanged");
  const { courseCanvasId, ...changed } = chosen;
  await t.mutation(async (ctx) => {
    await ctx.runMutation(internal.syncStore.upsertAssignments, { userId, courseCanvasId, assignments: [{ ...changed, name: "Changed", dueAt: now + 100_000 }], logChanges: true });
    report["changed:upsertAssignments"] = used(await ctx.meta.getTransactionMetrics());
  });
  await reads("changed");
  await student.mutation(api.seenState.markSeen, { kind: "assignmentChange", canvasId: chosen.canvasId, seenVersion: String(now + 1000) });
  await reads("seen");
  await student.mutation(api.todos.setDone, { ref: { kind: "assignment", canvasId: chosen.canvasId }, done: true });
  await reads("done");
  await reads("navigation");
  if (process.env.IO_REPORT) writeFileSync(process.env.IO_REPORT, JSON.stringify({ report, digests, migration }, null, 2) + "\n");
  expect(assignments).toHaveLength(899);
  if (process.env.IO_BASELINE !== "true") {
    expect(report["unchanged:upsertAssignments"].documentsWritten).toBe(0);
    expect(digests).toEqual(baseline.digests);
  }
});
