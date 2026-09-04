import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import type { FunctionReturnType } from "convex/server";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";

const modules = import.meta.glob("../convex/**/*.{ts,js}");
const userId = "student";
const course = {
  canvasId: 1,
  name: "Course",
  courseCode: "CS",
  enrollmentState: "active" as const,
};
const assignment = {
  canvasId: 10,
  name: "Homework",
  htmlUrl: "https://canvas.wisc.edu/a/10",
  submissionTypes: [],
};

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.syncStore.upsertCourses, {
    userId,
    courses: [course],
  });
  return { t, student: t.withIdentity({ subject: userId }) };
}

afterEach(() => vi.useRealTimers());

describe("search summaries", () => {
  it("removes completed-course summaries and recreates them when the course becomes active", async () => {
    vi.useFakeTimers();
    const { t, student } = await setup();
    await t.mutation(internal.storeContent.upsertPages, {
      userId,
      courseCanvasId: 1,
      prune: true,
      rows: [
        {
          canvasId: 5,
          title: "Page",
          url: "page",
          published: true,
          isFrontPage: false,
          htmlUrl: "/page",
        },
      ],
    });
    await t.mutation(internal.syncStore.upsertCourses, {
      userId,
      courses: [{ ...course, enrollmentState: "completed" }],
    });
    expect(
      (
        await student.query(api.search.index, {
          paginationOpts: { cursor: null, numItems: 200 },
        })
      ).page,
    ).toEqual([]);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(
      await t.run(async (ctx) =>
        (await ctx.db.query("searchEntries").collect()).map((row) => row.kind),
      ),
    ).toEqual(["course"]);
    await t.mutation(internal.syncStore.upsertAssignments, {
      userId,
      courseCanvasId: 1,
      assignments: [assignment],
      logChanges: false,
    });
    expect(
      await t.run(
        async (ctx) => (await ctx.db.query("searchEntries").collect()).length,
      ),
    ).toBe(1);
    await t.mutation(internal.syncStore.upsertCourses, {
      userId,
      courses: [course],
    });
    await t.mutation(internal.syncStore.upsertAssignments, {
      userId,
      courseCanvasId: 1,
      assignments: [assignment],
      logChanges: false,
    });
    expect(
      (
        await student.query(api.search.index, {
          paginationOpts: { cursor: null, numItems: 200 },
        })
      ).page,
    ).toHaveLength(2);
  });
  it("excludes bodies and unposted grades, updates grades on delta, and prunes deleted entries", async () => {
    const { t, student } = await setup();
    await t.mutation(internal.syncStore.upsertAssignments, {
      userId,
      courseCanvasId: 1,
      logChanges: false,
      assignments: [
        {
          ...assignment,
          description: "private body".repeat(1000),
          submission: { workflowState: "graded", score: 80 },
        },
      ],
    });
    const read = () =>
      student.query(api.search.index, {
        paginationOpts: { cursor: null, numItems: 200 },
      });
    const initial = (await read()).page.find(
      (row) => row.kind === "assignment",
    );
    expect(initial?.score).toBeUndefined();
    expect(initial).not.toHaveProperty("description");
    const entryId = await t.run(
      async (ctx) =>
        (await ctx.db
          .query("searchEntries")
          .withIndex("by_user_kind_canvasId", (q) =>
            q.eq("userId", userId).eq("kind", "assignment").eq("canvasId", 10),
          )
          .unique())!._id,
    );

    await t.mutation(internal.syncStore.applySubmissionUpdates, {
      userId,
      updates: [
        {
          assignmentCanvasId: 10,
          submission: {
            workflowState: "graded",
            score: 80,
            postedAt: Date.now(),
          },
        },
      ],
    });
    expect(
      (await read()).page.find((row) => row.kind === "assignment")?.score,
    ).toBe(80);
    await t.mutation(internal.syncStore.applySubmissionUpdates, {
      userId,
      updates: [
        {
          assignmentCanvasId: 10,
          submission: { workflowState: "graded", score: 80 },
        },
      ],
    });
    expect(
      (await read()).page.find((row) => row.kind === "assignment")?.score,
    ).toBeUndefined();
    expect(await t.run(async (ctx) => (await ctx.db.get(entryId))?._id)).toBe(
      entryId,
    );

    await t.mutation(internal.syncStore.upsertAssignments, {
      userId,
      courseCanvasId: 1,
      assignments: [],
      logChanges: false,
      prune: true,
    });
    expect((await read()).page.map((row) => row.kind)).toEqual(["course"]);
  });

  it("paginates and isolates users and completed courses", async () => {
    const { t, student } = await setup();
    await t.mutation(internal.syncStore.upsertCourses, {
      userId,
      courses: [{ ...course, canvasId: 2, enrollmentState: "completed" }],
    });
    await t.mutation(internal.syncStore.upsertCourses, {
      userId: "someone-else",
      courses: [course],
    });
    await t.mutation(internal.syncStore.upsertAssignments, {
      userId,
      courseCanvasId: 1,
      logChanges: false,
      assignments: Array.from({ length: 5 }, (_, i) => ({
        ...assignment,
        canvasId: 10 + i,
      })),
    });
    const titles: string[] = [];
    let cursor: string | null = null;
    for (;;) {
      const result: FunctionReturnType<typeof api.search.index> =
        await student.query(api.search.index, {
          paginationOpts: { cursor, numItems: 2 },
        });
      expect(result.page.length).toBeLessThanOrEqual(2);
      expect(result.page.every((row) => row.courseCanvasId === 1)).toBe(true);
      titles.push(...result.page.map((row) => row.title));
      if (result.isDone) break;
      cursor = result.continueCursor;
    }
    expect(titles).toHaveLength(6);
    expect(
      (
        await t.query(api.search.index, {
          paginationOpts: { cursor: null, numItems: 200 },
        })
      ).page,
    ).toEqual([]);
  });

  it.each(["active", "completed"] as const)(
    "isolates enrollment state during backfill when the first student is %s",
    async (firstState) => {
      vi.useFakeTimers();
      const t = convexTest(schema, modules);
      const students = [
        { userId: "first", enrollmentState: firstState },
        {
          userId: "second",
          enrollmentState: firstState === "active" ? "completed" : "active",
        },
      ] as const;
      for (const student of students) {
        await t.mutation(internal.syncStore.upsertCourses, {
          userId: student.userId,
          courses: [{ ...course, enrollmentState: student.enrollmentState }],
        });
        await t.run((ctx) => ctx.db.insert("pages", {
          userId: student.userId,
          courseCanvasId: 1,
          canvasId: 100,
          title: "Shared course page",
          url: "shared-page",
          published: true,
          isFrontPage: false,
          syncedAt: 0,
          htmlUrl: "/pages/shared-page",
        }));
      }
      // A rerun must preserve the active student's existing summary, too.
      for (let run = 0; run < 2; run++) {
        await t.mutation(internal.search.backfill, {});
        await t.finishAllScheduledFunctions(() => vi.runAllTimers());
        const pages = await t.run(async (ctx) =>
          (await ctx.db.query("searchEntries").collect())
            .filter((row) => row.kind === "page")
            .map((row) => row.userId),
        );
        expect(pages).toEqual([
          students.find((student) => student.enrollmentState === "active")!.userId,
        ]);
      }
    },
  );

  it("backfills existing data in batches and does not rewrite unchanged summaries", async () => {
    vi.useFakeTimers();
    const { t, student } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 55; i++)
        await ctx.db.insert("pages", {
          userId,
          courseCanvasId: 1,
          canvasId: 100 + i,
          title: `Page ${i}`,
          url: `page-${i}`,
          body: "body",
          published: true,
          isFrontPage: false,
          syncedAt: 0,
          htmlUrl: `/pages/${i}`,
        });
    });
    await t.mutation(internal.search.backfill, {});
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const entries = await t.run((ctx) =>
      ctx.db.query("searchEntries").collect(),
    );
    expect(entries).toHaveLength(56);
    expect(JSON.stringify(entries)).not.toContain('"body"');
    await t.mutation(internal.syncStore.upsertCourses, {
      userId,
      courses: [course],
    });
    expect(
      await t.run((ctx) => ctx.db.query("searchEntries").collect()),
    ).toEqual(entries);
    expect(
      (
        await student.query(api.search.index, {
          paginationOpts: { cursor: null, numItems: 200 },
        })
      ).page,
    ).toHaveLength(56);
  });
});

describe("feed read state", () => {
  it.each([false, true])(
    "keeps notifications independent with legacy history=%s",
    async (legacy) => {
      const { t, student } = await setup();
      const postedAt = Date.now();
      await t.mutation(internal.syncStore.upsertAssignments, {
        userId,
        courseCanvasId: 1,
        logChanges: false,
        assignments: [
          {
            ...assignment,
            canvasCreatedAt: postedAt,
            submission: { workflowState: "graded", postedAt, score: 5 },
          },
        ],
      });
      if (legacy)
        await student.mutation(api.seenState.markSeen, {
          kind: "assignment",
          canvasId: 10,
          seenVersion: String(postedAt),
        });
      else await student.mutation(api.inbox.markAllSeen, {});
      const state = async () =>
        Object.fromEntries(
          (await student.query(api.inbox.feed, {})).map((row) => [
            row.type,
            row.seen,
          ]),
        );
      expect(await state()).toEqual({ grade: true, assignment: true });
      await student.mutation(api.seenState.markUnseen, {
        kind: "assignment",
        canvasId: 10,
      });
      expect(await state()).toEqual({ grade: true, assignment: false });
      await student.mutation(api.inbox.markAllSeen, {});
      await student.mutation(api.seenState.markUnseen, {
        kind: "grade",
        canvasId: 10,
      });
      expect(await state()).toEqual({ grade: false, assignment: true });
      await student.mutation(api.seenState.markSeen, {
        kind: "assignment",
        canvasId: 10,
      });
      expect(await state()).toEqual({ grade: false, assignment: true });
      await student.mutation(api.inbox.markAllSeen, {});
      expect(await state()).toEqual({ grade: true, assignment: true });
      await t.mutation(internal.syncStore.applySubmissionUpdates, {
        userId,
        updates: [
          {
            assignmentCanvasId: 10,
            submission: {
              workflowState: "graded",
              postedAt: postedAt + 1,
              score: 6,
            },
          },
        ],
      });
      expect(await state()).toEqual({ grade: false, assignment: true });
    },
  );

  it.each([false, true])(
    "does not promote unread grades in recents with legacy history=%s",
    async (legacy) => {
      vi.useFakeTimers();
      vi.setSystemTime(1000);
      const { student } = await setup();
      await student.mutation(api.seenState.markSeen, {
        kind: legacy ? "assignment" : "grade",
        canvasId: 10,
        seenVersion: "123",
      });
      vi.setSystemTime(2000);
      await student.mutation(api.seenState.markSeen, { kind: "page", canvasId: 20 });
      vi.setSystemTime(3000);
      await student.mutation(api.seenState.markUnseen, { kind: "grade", canvasId: 10 });
      expect(await student.query(api.seenState.list, { kind: "grade" })).toEqual([]);
      expect(await student.query(api.seenState.recent, { limit: 24 })).toEqual([
        { kind: "page", canvasId: 20, seenAt: 2000 },
        ...(legacy ? [{ kind: "assignment", canvasId: 10, seenAt: 1000 }] : []),
      ]);
      // Clearing the legacy version must survive another assignment read.
      if (legacy) {
        await student.mutation(api.seenState.markSeen, { kind: "assignment", canvasId: 10 });
        expect(await student.query(api.seenState.list, { kind: "assignment" })).toEqual([
          { canvasId: 10, seenAt: 3000 },
        ]);
      }
    },
  );

  it("ignores completed courses when listing and marking read", async () => {
    const { t, student } = await setup();
    await t.mutation(internal.syncStore.upsertCourses, {
      userId,
      courses: [{ ...course, canvasId: 2, enrollmentState: "completed" }],
    });
    await t.mutation(internal.syncStore.upsertAssignments, {
      userId,
      courseCanvasId: 2,
      logChanges: false,
      assignments: [{ ...assignment, canvasCreatedAt: Date.now() }],
    });
    expect(await student.query(api.inbox.feed, {})).toEqual([]);
    await student.mutation(api.inbox.markAllSeen, {});
    expect(
      await student.query(api.seenState.list, { kind: "assignment" }),
    ).toEqual([]);
  });
});
