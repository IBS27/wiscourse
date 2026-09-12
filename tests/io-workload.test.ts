import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import type { TransactionMetrics } from "convex/server";
import { writeFileSync } from "node:fs";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { enableCompactLists } from "./list-migration";

const modules = import.meta.glob("../convex/**/*.{ts,js}");
const userId = "io-fixture";
const now = Date.UTC(2026, 8, 12, 17);
const day = 86_400_000;
const courses = [1, 2, 3].map((canvasId) => ({
  canvasId, name: `Course ${canvasId}`, courseCode: `CS ${canvasId}`,
  enrollmentState: "active" as const, syllabusBody: "Syllabus ".repeat(8192),
}));
const assignments = (course: number) => Array.from({ length: 100 }, (_, i) => ({
  canvasId: course * 1000 + i, name: `Assignment ${i}`, htmlUrl: `/assignments/${i}`,
  description: "Assignment text ".repeat(1024), submissionTypes: ["online_upload"],
  dueAt: now + (i < 30 ? i - 5 : -180) * day,
  canvasCreatedAt: now - (i < 5 ? 2 : 200) * day,
  submission: { workflowState: i < 10 ? "graded" : "unsubmitted",
    ...(i < 10 ? { postedAt: now - day, score: 8 } : {}),
    comments: [{ authorName: "Instructor", createdAt: now - day, comment: "Feedback ".repeat(512) }],
  },
}));
const used = (m: TransactionMetrics) => Object.fromEntries(
  Object.entries(m).map(([key, value]) => [key, value.used]),
);

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it("runs a repeatable synthetic database workload", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const t = convexTest(schema, modules);
  const student = t.withIdentity({ subject: userId });
  await t.mutation(internal.syncStore.upsertCourses, { userId, courses });
  for (const course of courses) {
    await t.mutation(internal.syncStore.upsertAssignments, {
      userId, courseCanvasId: course.canvasId, assignments: assignments(course.canvasId), logChanges: false,
    });
    await t.mutation(internal.storeCourseMeta.upsertDiscussions, {
      userId, discussions: Array.from({ length: 10 }, (_, i) => ({
        canvasId: course.canvasId * 100 + i, courseCanvasId: course.canvasId,
        title: `Announcement ${i}`, message: "<p>Course announcement</p>".repeat(512),
        isAnnouncement: true, postedAt: now - i * day, htmlUrl: `/announcements/${i}`,
      })),
    });
    await t.mutation(internal.storeCourseMeta.upsertQuizzes, {
      userId, courseCanvasId: course.canvasId, quizzes: [{
        canvasId: course.canvasId, title: "Practice", description: "Practice ".repeat(2048),
        quizType: "practice_quiz", dueAt: now + day, htmlUrl: "/quiz",
      }],
    });
  }
  if (process.env.IO_COMPACT === "true") await enableCompactLists(t);
  const report: Record<string, Record<string, number>> = {};
  async function lists(label: string) {
    const feed = await student.query(async (ctx) => {
      const result = await ctx.runQuery(api.inbox.feed, {});
      report[`${label}:inbox.feed`] = used(await ctx.meta.getTransactionMetrics());
      return result;
    });
    const todos = await student.query(async (ctx) => {
      const result = await ctx.runQuery(api.todos.list, {});
      report[`${label}:todos.list`] = used(await ctx.meta.getTransactionMetrics());
      return result;
    });
    return { feed, todos };
  }
  const initial = await lists("initial");
  vi.setSystemTime(now + 1000);
  await t.mutation(async (ctx) => {
    await ctx.runMutation(internal.syncStore.upsertAssignments, {
      userId, courseCanvasId: 1, assignments: assignments(1), logChanges: true,
    });
    report["unchanged:upsertAssignments"] = used(await ctx.meta.getTransactionMetrics());
  });
  expect(report["unchanged:upsertAssignments"].documentsWritten).toBe(0);
  expect(await lists("unchanged")).toEqual(initial);
  await t.mutation(async (ctx) => {
    await ctx.runMutation(internal.syncStore.upsertAssignments, {
      userId, courseCanvasId: 1, assignments: [{ ...assignments(1)[0], name: "Changed assignment" }], logChanges: true,
    });
    report["changed:upsertAssignments"] = used(await ctx.meta.getTransactionMetrics());
  });
  await lists("changed");
  await student.mutation(async (ctx) => {
    await ctx.runMutation(api.seenState.markSeen, { kind: "assignment", canvasId: 1000 });
    report["seen:markSeen"] = used(await ctx.meta.getTransactionMetrics());
  });
  await lists("seen");
  await student.mutation(async (ctx) => {
    await ctx.runMutation(api.todos.setDone, { ref: { kind: "assignment", canvasId: 1012 }, done: true });
    report["done:setDone"] = used(await ctx.meta.getTransactionMetrics());
  });
  await lists("done");
  await lists("navigation");
  if (process.env.IO_REPORT) writeFileSync(process.env.IO_REPORT, JSON.stringify(report, null, 2) + "\n");
  expect(initial.feed).toHaveLength(75);
  expect(initial.todos).toHaveLength(93);
});
