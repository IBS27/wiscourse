import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";

const modules = import.meta.glob("../convex/**/*.{ts,js}");
const userId = "student";

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.syncStore.upsertCourses, {
    userId,
    courses: [
      {
        canvasId: 1,
        name: "Operating Systems",
        courseCode: "CS 537",
        enrollmentState: "active" as const,
        termId: 7,
        termStartAt: Date.UTC(2026, 8, 2),
        termEndAt: Date.UTC(2026, 11, 20),
        applyAssignmentGroupWeights: true,
        hideFinalGrades: false,
        currentScore: 92.7,
        currentGrade: "AB",
      },
    ],
  });
  return { t, student: t.withIdentity({ subject: userId }) };
}

describe("meetings", () => {
  it("validates and stores a meeting, and lists it per course", async () => {
    const { student } = await setup();
    await expect(
      student.mutation(api.meetings.create, {
        courseCanvasId: 1,
        kind: "lecture",
        days: [],
        startMinute: 600,
        endMinute: 650,
      }),
    ).rejects.toThrow(/day/);
    await expect(
      student.mutation(api.meetings.create, {
        courseCanvasId: 1,
        kind: "lecture",
        days: [1],
        startMinute: 650,
        endMinute: 600,
      }),
    ).rejects.toThrow(/end/);
    const id = await student.mutation(api.meetings.create, {
      courseCanvasId: 1,
      kind: "discussion",
      label: "  Section 302 ",
      days: [3, 1],
      startMinute: 9 * 60 + 55,
      endMinute: 10 * 60 + 45,
      location: "CS 1240",
    });
    const rows = await student.query(api.meetings.forCourse, { courseCanvasId: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(id);
    expect(rows[0].days).toEqual([1, 3]);
    expect(rows[0].label).toBe("Section 302");
    await student.mutation(api.meetings.remove, { id });
    expect(await student.query(api.meetings.list, {})).toEqual([]);
  });

  it("does not let another user touch it", async () => {
    const { t, student } = await setup();
    const id = await student.mutation(api.meetings.create, {
      courseCanvasId: 1,
      kind: "lab",
      days: [2],
      startMinute: 600,
      endMinute: 700,
    });
    const other = t.withIdentity({ subject: "someone-else" });
    await expect(
      other.mutation(api.meetings.update, {
        id,
        courseCanvasId: 1,
        kind: "lab",
        days: [2],
        startMinute: 600,
        endMinute: 700,
      }),
    ).rejects.toThrow();
    expect(await other.query(api.meetings.list, {})).toEqual([]);
  });
});

describe("local events", () => {
  it("creates, edits and deletes local events but never Canvas ones", async () => {
    const { t, student } = await setup();
    const id = await student.mutation(api.calendar.createEvent, {
      title: " Study group ",
      startAt: Date.UTC(2026, 8, 13, 21),
      endAt: Date.UTC(2026, 8, 13, 23),
      courseCanvasId: 1,
    });
    const rows = await student.query(api.calendar.range, {
      start: Date.UTC(2026, 8, 13),
      end: Date.UTC(2026, 8, 14),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Study group");
    expect(rows[0].source).toBe("local");

    const canvasId = await t.run((ctx) =>
      ctx.db.insert("calendarEvents", {
        userId,
        source: "canvas",
        canvasId: 99,
        contextCode: "course_1",
        title: "Exam 1",
        startAt: Date.UTC(2026, 8, 24, 18),
        syncedAt: 0,
      }),
    );
    await expect(student.mutation(api.calendar.deleteEvent, { id: canvasId })).rejects.toThrow(/read-only/);
    await student.mutation(api.calendar.deleteEvent, { id });
    expect(
      await student.query(api.calendar.range, { start: Date.UTC(2026, 8, 13), end: Date.UTC(2026, 8, 14) }),
    ).toEqual([]);
  });
});

describe("ics feed", () => {
  it("renders meetings, due dates, plans and events for a secret, and honours toggles", async () => {
    const { t, student } = await setup();
    await t.mutation(internal.syncStore.upsertAssignments, {
      userId,
      courseCanvasId: 1,
      logChanges: false,
      assignments: [
        {
          canvasId: 10,
          name: "P2: Web Server",
          htmlUrl: "https://canvas.wisc.edu/courses/1/assignments/10",
          submissionTypes: ["online_upload"],
          dueAt: Date.now() + 3 * 86_400_000,
          pointsPossible: 100,
        },
      ],
    });
    await student.mutation(api.meetings.create, {
      courseCanvasId: 1,
      kind: "lecture",
      days: [0, 1, 2, 3, 4, 5, 6],
      startMinute: 9 * 60 + 55,
      endMinute: 10 * 60 + 45,
      location: "CS 1240",
    });
    await student.mutation(api.todos.setPlannedDay, {
      ref: { kind: "assignment", canvasId: 10 },
      plannedDay: "2026-09-12",
    });
    await student.mutation(api.calendar.createEvent, {
      title: "Study group",
      startAt: Date.now() + 86_400_000,
      endAt: Date.now() + 86_400_000 + 3_600_000,
    });

    expect((await student.query(api.prefs.get, {}))?.icsSecret).toBeUndefined();
    const secret = await student.mutation(api.prefs.regenerateIcs, {});
    expect(secret).toMatch(/^[a-f0-9]{64}$/);

    const text = (await t.query(internal.prefs.icsFeed, { secret }))!;
    expect(text).toContain("BEGIN:VCALENDAR");
    expect(text).toContain("SUMMARY:CS 537 Lecture");
    expect(text).toContain("LOCATION:CS 1240");
    expect(text).toContain("SUMMARY:Due: CS 537: P2: Web Server");
    expect(text).toContain("SUMMARY:Plan: CS 537: P2: Web Server");
    expect(text).toContain("DTSTART;VALUE=DATE:20260912");
    expect(text).toContain("SUMMARY:Study group");

    await student.mutation(api.prefs.setIcsInclude, {
      include: { meetings: false, due: true, planned: false, events: false },
    });
    const dueOnly = (await t.query(internal.prefs.icsFeed, { secret }))!;
    expect(dueOnly).not.toContain("Lecture");
    expect(dueOnly).not.toContain("Plan:");
    expect(dueOnly).not.toContain("Study group");
    expect(dueOnly).toContain("Due:");

    expect(await t.query(internal.prefs.icsFeed, { secret: "nope" })).toBeNull();
    const next = await student.mutation(api.prefs.regenerateIcs, {});
    expect(next).not.toBe(secret);
    expect(await t.query(internal.prefs.icsFeed, { secret })).toBeNull();
    await t.mutation(internal.prefs.recordIcsFetch, { secret: next, userAgent: "Mac OS X/14.5 (23F79) dataaccessd/1.0" });
    expect(await student.query(api.prefs.get, {})).toMatchObject({ icsLastFetchedBy: "Apple Calendar" });
  });

  it("serves the feed over HTTP and 404s bad secrets", async () => {
    const { t, student } = await setup();
    const secret = await student.mutation(api.prefs.regenerateIcs, {});
    const ok = await t.fetch(`/ics/${secret}.ics`, { headers: { "user-agent": "Google-Calendar-Importer" } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toContain("text/calendar");
    expect(await ok.text()).toContain("END:VCALENDAR");
    expect((await t.fetch("/ics/deadbeef.ics")).status).toBe(404);
    expect((await t.fetch(`/ics/${"0".repeat(64)}.ics`)).status).toBe(404);
    expect(await student.query(api.prefs.get, {})).toMatchObject({ icsLastFetchedBy: "Google Calendar" });
  });
});

describe("prefs", () => {
  it("validates the time zone override", async () => {
    const { student } = await setup();
    await expect(student.mutation(api.prefs.setTimeZone, { timeZone: "Mars/Olympus" })).rejects.toThrow();
    await student.mutation(api.prefs.setTimeZone, { timeZone: "America/New_York" });
    expect(await student.query(api.prefs.get, {})).toMatchObject({ timeZone: "America/New_York" });
    await student.mutation(api.prefs.setTimeZone, { timeZone: null });
    expect((await student.query(api.prefs.get, {}))?.timeZone).toBeUndefined();
  });
});

describe("grades query", () => {
  it("withholds unposted scores, flags excused rows, carries medians and cutoffs", async () => {
    const { t, student } = await setup();
    await t.mutation(internal.syncStore.upsertAssignments, {
      userId,
      courseCanvasId: 1,
      logChanges: false,
      assignments: [
        {
          canvasId: 10,
          name: "Posted",
          htmlUrl: "u",
          submissionTypes: [],
          pointsPossible: 20,
          submission: { workflowState: "graded", score: 19, postedAt: 5 },
          scoreStatistics: { min: 1, max: 20, mean: 15, median: 17 },
        },
        {
          canvasId: 11,
          name: "Unposted",
          htmlUrl: "u",
          submissionTypes: [],
          pointsPossible: 20,
          submission: { workflowState: "graded", score: 3, submittedAt: 4 },
        },
        {
          canvasId: 12,
          name: "Excused",
          htmlUrl: "u",
          submissionTypes: [],
          pointsPossible: 20,
          submission: { workflowState: "graded", score: 0, grade: "EX", postedAt: 5 },
        },
      ],
    });
    const book = (await student.query(api.grades.course, { courseCanvasId: 1 }))!;
    const rows = book.groups.flatMap((g) => g.assignments);
    expect(rows.find((r) => r.name === "Posted")).toMatchObject({ score: 19, median: 17 });
    const unposted = rows.find((r) => r.name === "Unposted")!;
    expect(unposted.score).toBeUndefined();
    expect(unposted.submittedAt).toBe(4);
    const excused = rows.find((r) => r.name === "Excused")!;
    expect(excused.excused).toBe(true);
    expect(excused.score).toBeUndefined();

    await student.mutation(api.grades.setCutoffs, {
      courseCanvasId: 1,
      cutoffs: [{ name: "S", value: 0.9 }, { name: "U", value: 0 }],
    });
    expect((await student.query(api.grades.course, { courseCanvasId: 1 }))!.course.gradeCutoffs).toEqual([
      { name: "S", value: 0.9 },
      { name: "U", value: 0 },
    ]);
    const index = await student.query(api.grades.index, {});
    expect(index.map((c) => c.courseCanvasId)).toEqual([1]);
  });
});
