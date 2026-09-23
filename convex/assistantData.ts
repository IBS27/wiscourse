// What the assistant can read: the synced mirror of Canvas plus the
// student's own wiscourse data. Every query here is internal and scoped by
// the `userId` the action got from the thread owner, never from the model.
// Nothing here talks to Canvas, and posted-grade rules match the gradebook
// (scores only once `postedAt` is set, totals hidden when the course hides them).
//
// Results are compact, model-facing JSON. Times are wall-clock strings in
// the student's zone; `ref`s and ids are what the change tools accept.

import { v } from "convex/values";
import type { IndexRange } from "convex/server";
import { internalQuery, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { buildList, type TodoItem } from "./todos";
import { buildGradebook, gradeRow } from "./grades";
import { classifyCourses } from "./lib/terms";
import { courseText } from "./lib/courseSource";
import { parseSyllabusFacts } from "./lib/syllabusFacts";
import { expandMeetings, MEETING_KIND_LABELS } from "./lib/meetings";
import { CAMPUS_TIME_ZONE, addDaysKey, dayKeyIn, daysBetween, zonedToUtc } from "./lib/zones";
import { WEEKDAYS, assertDayKey, clock, localIso, weekdayName } from "./lib/assistantTime";
import { DAY_MS } from "./lib/time";

const READ_CHUNK = 8000;
const MAX_AGENDA_DAYS = 31;

// ── Shared ────────────────────────────────────────────────────────────────

async function coursesOf(ctx: QueryCtx, userId: string) {
  const [courses, prefs] = await Promise.all([
    ctx.db.query("courses").withIndex("by_user", (q) => q.eq("userId", userId)).collect(),
    ctx.db.query("coursePrefs").withIndex("by_user_course", (q) => q.eq("userId", userId)).collect(),
  ]);
  const prefBy = new Map(prefs.map((p) => [p.courseCanvasId, p]));
  const sets = classifyCourses(courses, Date.now());
  const active = [...sets.current, ...sets.other];
  const label = (c: Doc<"courses">) => prefBy.get(c.canvasId)?.nickname ?? shortCode(c) ?? c.name;
  return { all: courses, active, current: sets.current, prefBy, label };
}

function shortCode(c: { name: string; courseCode: string }): string | undefined {
  const code = c.courseCode.trim();
  return code.length === 0 || code.length > 14 || code === c.name.trim() ? undefined : code;
}

async function courseOf(ctx: QueryCtx, userId: string, courseCanvasId: number): Promise<Doc<"courses">> {
  const course = await ctx.db
    .query("courses")
    .withIndex("by_user_canvasId", (q) => q.eq("userId", userId).eq("canvasId", courseCanvasId))
    .unique();
  if (course === null) throw new Error(`Unknown course ${courseCanvasId}`);
  return course;
}

/** wiscourse routes, so answers link into the app rather than to Canvas. */
const href = {
  course: (c: number) => `/courses/${c}`,
  syllabus: (c: number) => `/courses/${c}/syllabus`,
  page: (c: number, slug: string) => `/courses/${c}/pages/${encodeURIComponent(slug)}`,
  todo: (kind: string, id: number) => `/todo/${kind}:${id}`,
  announcement: (c: number, id: number) => `/courses/${c}/announcements?item=announcement:${id}`,
  file: (c: number, id: number) => `/courses/${c}/files?file=${id}`,
  module: (c: number, id: number) => `/courses/${c}/modules#module-${id}`,
  grades: (c: number) => `/grades/${c}`,
};

function chunk(text: string, offset: number) {
  const start = Math.max(0, Math.min(offset, text.length));
  const end = Math.min(text.length, start + READ_CHUNK);
  return {
    text: text.slice(start, end),
    ...(end < text.length ? { nextOffset: end, totalChars: text.length } : {}),
  };
}

function htmlText(html: string | undefined, courseCanvasId: number): string {
  return html ? courseText(html, courseCanvasId) : "";
}

function taskRef(item: TodoItem): string {
  return item.kind === "local" ? `local:${item.todoId}` : `${item.kind}:${item.canvasId}`;
}

function taskStatus(item: TodoItem): string | undefined {
  if (item.doneAt !== undefined) return "done";
  if (item.submission === "none" || item.submission === "unsubmitted") return undefined;
  return item.submission;
}

function taskLine(item: TodoItem, label: (id: number | undefined) => string | undefined, timeZone: string) {
  return {
    ref: taskRef(item),
    title: item.title,
    course: label(item.courseCanvasId),
    due: item.dueAt === undefined ? undefined : localIso(item.dueAt, timeZone),
    plannedDay: item.plannedDay,
    status: taskStatus(item),
    points: item.pointsPossible,
    score: item.score, // present only when posted
    notes: item.notes,
    subtasks: item.subtasks.length > 0 ? item.subtasks.map((s) => `${s.done ? "[x]" : "[ ]"} ${s.title}`) : undefined,
    personal: item.kind === "local" ? true : undefined,
  };
}

// ── Prompt context ────────────────────────────────────────────────────────

/** Everything a turn needs before the model runs. */
export const turnContext = internalQuery({
  args: { userId: v.string(), threadId: v.string() },
  handler: async (ctx, args) => {
    const [thread, prefs, courses] = await Promise.all([
      ctx.db.query("assistantThreads").withIndex("by_threadId", (q) => q.eq("threadId", args.threadId)).unique(),
      ctx.db.query("userPrefs").withIndex("by_user", (q) => q.eq("userId", args.userId)).unique(),
      coursesOf(ctx, args.userId),
    ]);
    if (thread === null || thread.userId !== args.userId) return null;
    return {
      savedTimeZone: prefs?.timeZone,
      courseCanvasId: thread.courseCanvasId,
      courses: courses.active.map((c) => ({
        id: c.canvasId,
        label: courses.label(c),
        name: c.name,
        hidden: courses.prefBy.get(c.canvasId)?.hidden ? true : undefined,
        current: courses.current.includes(c) ? undefined : false,
      })),
    };
  },
});

// ── Tools ─────────────────────────────────────────────────────────────────

/** Due work, planned tasks, events and class meetings, day by day. */
export const agenda = internalQuery({
  args: { userId: v.string(), timeZone: v.string(), from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    assertDayKey(args.from);
    assertDayKey(args.to);
    const span = daysBetween(args.from, args.to);
    if (span < 0) throw new Error("`to` is before `from`");
    if (span >= MAX_AGENDA_DAYS) throw new Error(`Ask for at most ${MAX_AGENDA_DAYS} days at a time`);
    const tz = args.timeZone;
    const start = zonedToUtc(args.from, 0, tz);
    const end = zonedToUtc(addDaysKey(args.to, 1), 0, tz);
    const courses = await coursesOf(ctx, args.userId);
    const byId = new Map(courses.all.map((c) => [c.canvasId, c]));
    const label = (id: number | undefined) => {
      const c = id === undefined ? undefined : byId.get(id);
      return c === undefined ? undefined : courses.label(c);
    };

    const [items, events, meetings] = await Promise.all([
      buildList(ctx, args.userId, { from: start, to: end }),
      ctx.db
        .query("calendarEvents")
        .withIndex("by_user_startAt", (q) =>
          q.eq("userId", args.userId).gte("startAt", start - 21 * DAY_MS).lt("startAt", end),
        )
        .collect(),
      ctx.db.query("courseMeetings").withIndex("by_user", (q) => q.eq("userId", args.userId)).collect(),
    ]);
    const activeIds = new Set(courses.active.map((c) => c.canvasId));
    const classes = expandMeetings(
      meetings.filter((m) => activeIds.has(m.courseCanvasId)),
      start,
      end,
      (id) => {
        const c = byId.get(id);
        return c === undefined ? undefined : { startAt: c.termStartAt ?? c.startAt, endAt: c.termEndAt ?? c.endAt };
      },
    );

    const days = new Map<string, {
      day: string;
      weekday: string;
      due: unknown[];
      planned: unknown[];
      events: unknown[];
      classes: unknown[];
    }>();
    for (let day = args.from; day <= args.to; day = addDaysKey(day, 1)) {
      days.set(day, { day, weekday: weekdayName(day), due: [], planned: [], events: [], classes: [] });
    }
    const dayOf = (ms: number) => localIso(ms, tz).slice(0, 10);
    for (const item of items) {
      if (item.dueAt !== undefined && item.dueAt >= start && item.dueAt < end) {
        days.get(dayOf(item.dueAt))?.due.push(taskLine(item, label, tz));
      }
      if (item.plannedDay !== undefined && days.has(item.plannedDay)) {
        days.get(item.plannedDay)?.planned.push(taskLine(item, label, tz));
      }
    }
    for (const e of events) {
      // All-day events belong to their campus day, as on the calendar.
      if (e.allDay) {
        const key = dayKeyIn(e.startAt, CAMPUS_TIME_ZONE);
        days.get(key)?.events.push({ eventId: e._id, title: e.title, start: key, allDay: true, location: e.location, course: label(e.courseCanvasId), fromCanvas: e.source === "canvas" ? true : undefined });
        continue;
      }
      if (e.endAt !== undefined ? e.endAt <= start : e.startAt < start) continue;
      const day = days.get(dayOf(Math.max(e.startAt, start)));
      day?.events.push({
        eventId: e._id,
        title: e.title,
        start: localIso(e.startAt, tz),
        end: e.endAt === undefined ? undefined : localIso(e.endAt, tz),
        location: e.location,
        course: label(e.courseCanvasId),
        fromCanvas: e.source === "canvas" ? true : undefined,
      });
    }
    for (const c of classes) {
      days.get(dayOf(c.startAt))?.classes.push({
        meetingId: c.meetingId,
        course: label(c.courseCanvasId),
        kind: c.label ?? MEETING_KIND_LABELS[c.kind],
        time: `${localIso(c.startAt, tz).slice(11)}–${localIso(c.endAt, tz).slice(11)}`,
        location: c.location,
      });
    }
    return {
      timeZone: tz,
      days: [...days.values()].map((d) =>
        Object.fromEntries(Object.entries(d).filter(([, value]) => !Array.isArray(value) || value.length > 0)),
      ),
    };
  },
});

/** The task list: Canvas work and personal tasks, with refs for changes. */
export const tasks = internalQuery({
  args: {
    userId: v.string(),
    timeZone: v.string(),
    status: v.union(v.literal("open"), v.literal("done"), v.literal("all")),
    courseCanvasId: v.optional(v.number()),
    query: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const courses = await coursesOf(ctx, args.userId);
    const byId = new Map(courses.all.map((c) => [c.canvasId, c]));
    const label = (id: number | undefined) => {
      const c = id === undefined ? undefined : byId.get(id);
      return c === undefined ? undefined : courses.label(c);
    };
    const words = (args.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const items = (await buildList(ctx, args.userId, {})).filter((item) => {
      const done = item.doneAt !== undefined || item.submission === "submitted" || item.submission === "graded";
      if (args.status === "open" && done) return false;
      if (args.status === "done" && !done) return false;
      if (args.courseCanvasId !== undefined && item.courseCanvasId !== args.courseCanvasId) return false;
      const title = item.title.toLowerCase();
      return words.every((w) => title.includes(w));
    });
    return {
      count: items.length,
      tasks: items.slice(0, 60).map((item) => taskLine(item, label, args.timeZone)),
      ...(items.length > 60 ? { note: "Showing the first 60; narrow by course or query." } : {}),
    };
  },
});

const coursePart = v.union(
  v.literal("overview"),
  v.literal("assignments"),
  v.literal("announcements"),
  v.literal("modules"),
  v.literal("pages"),
  v.literal("files"),
);

/** One course, one part at a time. */
export const course = internalQuery({
  args: { userId: v.string(), timeZone: v.string(), courseCanvasId: v.number(), part: coursePart },
  handler: async (ctx, args) => {
    const { userId, courseCanvasId: cid, timeZone: tz } = args;
    const c = await courseOf(ctx, userId, cid);
    switch (args.part) {
      case "overview": {
        const meetings = await ctx.db
          .query("courseMeetings")
          .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseCanvasId", cid))
          .collect();
        return {
          id: cid,
          name: c.name,
          code: c.courseCode,
          term: c.term,
          href: href.course(cid),
          instructors: (c.verifiedInstructors ?? c.instructors)?.map((i) => `${i.name} (${i.role === "ta" ? "TA" : "instructor"})${i.email ? ` ${i.email}` : ""}`),
          syllabusFacts: parseSyllabusFacts(c.syllabusBody),
          hasSyllabus: Boolean(c.syllabusBody),
          classMeetingTimesIn: `${CAMPUS_TIME_ZONE} (campus clock)`,
          classMeetings: meetings.map((m) => ({
            meetingId: m._id,
            kind: m.label ?? MEETING_KIND_LABELS[m.kind],
            days: m.days.map((d) => WEEKDAYS[d]),
            time: `${clock(m.startMinute)}–${clock(m.endMinute)}`,
            location: m.location,
          })),
          grade: c.hideFinalGrades ? "hidden by instructor" : (c.currentGrade ?? (c.currentScore === undefined ? undefined : `${c.currentScore}%`)),
        };
      }
      case "assignments": {
        const rows = await ctx.db
          .query("assignments")
          .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseCanvasId", cid))
          .collect();
        const groups = await ctx.db
          .query("assignmentGroups")
          .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseCanvasId", cid))
          .collect();
        const groupName = new Map(groups.map((g) => [g.canvasId, g.groupWeight ? `${g.name} (${g.groupWeight}%)` : g.name]));
        return {
          course: c.name,
          assignments: rows
            .sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || a.name.localeCompare(b.name))
            .map((a) => {
              const g = gradeRow(a);
              return {
                ref: `assignment:${a.canvasId}`,
                title: a.name,
                due: a.dueAt === undefined ? undefined : localIso(a.dueAt, tz),
                points: a.pointsPossible,
                group: a.assignmentGroupCanvasId === undefined ? undefined : groupName.get(a.assignmentGroupCanvasId),
                submitted: g.submittedAt === undefined ? undefined : localIso(g.submittedAt, tz),
                missing: g.missing || undefined,
                score: g.excused ? "excused" : g.score,
                grade: g.grade,
                graded: a.submission?.workflowState === "graded" && g.postedAt === undefined ? "not posted yet" : undefined,
                href: href.todo("assignment", a.canvasId),
              };
            }),
        };
      }
      case "announcements": {
        const rows = await ctx.db
          .query("discussions")
          .withIndex("by_user_course_announcement_postedAt", (q) =>
            q.eq("userId", userId).eq("courseCanvasId", cid).eq("isAnnouncement", true),
          )
          .order("desc")
          .take(20);
        return {
          course: c.name,
          announcements: rows.map((a) => ({
            id: a.canvasId,
            title: a.title,
            posted: a.postedAt === undefined ? undefined : localIso(a.postedAt, tz),
            author: a.authorName,
            excerpt: htmlText(a.message, cid).slice(0, 240),
          })),
        };
      }
      case "modules": {
        const [modules, items] = await Promise.all([
          ctx.db.query("modules").withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseCanvasId", cid)).collect(),
          ctx.db.query("moduleItems").withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseCanvasId", cid)).collect(),
        ]);
        return {
          course: c.name,
          modules: modules
            .sort((a, b) => a.position - b.position)
            .map((m) => ({
              id: m.canvasId,
              name: m.name,
              locked: m.state === "locked" || undefined,
              items: items
                .filter((i) => i.moduleCanvasId === m.canvasId)
                .sort((a, b) => a.position - b.position)
                .map((i) => {
                  const read =
                    i.type === "Page" && i.pageUrl ? { kind: "page", id: i.pageUrl }
                    : i.type === "Assignment" && i.contentCanvasId ? { kind: "assignment", id: String(i.contentCanvasId) }
                    : i.type === "Quiz" && i.contentCanvasId ? { kind: "quiz", id: String(i.contentCanvasId) }
                    : i.type === "Discussion" && i.contentCanvasId ? { kind: "discussion", id: String(i.contentCanvasId) }
                    : i.type === "File" && i.contentCanvasId ? { kind: "file", id: String(i.contentCanvasId) }
                    : undefined;
                  return { title: i.title, type: i.type, read, url: i.type === "ExternalUrl" ? i.externalUrl : undefined };
                }),
            })),
        };
      }
      case "pages": {
        const pages = await ctx.db
          .query("pages")
          .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseCanvasId", cid))
          .collect();
        return {
          course: c.name,
          pages: pages
            .filter((p) => p.published && p.lockedForUser !== true)
            .map((p) => ({ slug: p.url, title: p.title, front: p.isFrontPage || undefined })),
        };
      }
      case "files": {
        const files = await ctx.db
          .query("files")
          .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseCanvasId", cid))
          .collect();
        const visible = files.filter((f) => f.hidden !== true && f.lockedForUser !== true);
        return {
          course: c.name,
          count: visible.length,
          files: visible
            .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
            .slice(0, 100)
            .map((f) => ({ id: f.canvasId, name: f.displayName, type: f.contentType, updated: f.updatedAt === undefined ? undefined : localIso(f.updatedAt, tz).slice(0, 10) })),
        };
      }
    }
  },
});

export const readKind = v.union(
  v.literal("syllabus"),
  v.literal("page"),
  v.literal("assignment"),
  v.literal("quiz"),
  v.literal("discussion"),
  v.literal("announcement"),
  v.literal("file"),
);

/** The text of one item, in chunks. Includes a wiscourse link to cite. */
export const read = internalQuery({
  args: {
    userId: v.string(),
    timeZone: v.string(),
    courseCanvasId: v.number(),
    kind: readKind,
    id: v.optional(v.string()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, courseCanvasId: cid, timeZone: tz } = args;
    const offset = args.offset ?? 0;
    const c = await courseOf(ctx, userId, cid);
    const numericId = () => {
      if (!args.id || !/^\d+$/.test(args.id)) throw new Error(`Give the numeric ${args.kind} id`);
      return Number(args.id);
    };
    const byId = (q: { eq(f: "userId", v: string): { eq(f: "canvasId", v: number): IndexRange } }) =>
      q.eq("userId", userId).eq("canvasId", numericId());
    const source = (title: string, link: string) => ({ source: { title, href: link, courseCanvasId: cid } });

    switch (args.kind) {
      case "syllabus": {
        if (!c.syllabusBody) return { error: "This course has no syllabus in Canvas. Check its pages and files." };
        return { ...source(`Syllabus`, href.syllabus(cid)), ...chunk(htmlText(c.syllabusBody, cid), offset) };
      }
      case "page": {
        if (!args.id) throw new Error("Give the page slug");
        const slug = args.id;
        const page = await ctx.db
          .query("pages")
          .withIndex("by_user_course_url", (q) => q.eq("userId", userId).eq("courseCanvasId", cid).eq("url", slug))
          .unique();
        if (page === null || page.lockedForUser) return { error: "No readable page with that slug" };
        if (page.contentUnavailable || !page.body) return { ...source(page.title, href.page(cid, slug)), error: "This page's content isn't available" };
        return { title: page.title, ...source(page.title, href.page(cid, slug)), ...chunk(htmlText(page.body, cid), offset) };
      }
      case "assignment": {
        const a = await ctx.db.query("assignments").withIndex("by_user_canvasId", byId).unique();
        if (a === null || a.courseCanvasId !== cid) return { error: "No assignment with that id in this course" };
        const g = gradeRow(a);
        const posted = g.postedAt !== undefined;
        return {
          title: a.name,
          due: a.dueAt === undefined ? undefined : localIso(a.dueAt, tz),
          points: a.pointsPossible,
          submissionTypes: a.submissionTypes,
          submitted: g.submittedAt === undefined ? undefined : localIso(g.submittedAt, tz),
          score: g.excused ? "excused" : g.score,
          graded: a.submission?.workflowState === "graded" && !posted ? "not posted yet" : undefined,
          comments: posted ? a.submission?.comments?.map((m) => `${m.authorName}: ${m.comment}`) : undefined,
          ...source(a.name, href.todo("assignment", a.canvasId)),
          ...chunk(htmlText(a.description, cid), offset),
        };
      }
      case "quiz": {
        const q = await ctx.db.query("quizzes").withIndex("by_user_canvasId", byId).unique();
        if (q === null || q.courseCanvasId !== cid) return { error: "No quiz with that id in this course" };
        const link = q.assignmentCanvasId === undefined ? href.todo("quiz", q.canvasId) : href.todo("assignment", q.assignmentCanvasId);
        return {
          title: q.title,
          due: q.dueAt === undefined ? undefined : localIso(q.dueAt, tz),
          points: q.pointsPossible,
          timeLimitMinutes: q.timeLimitMinutes,
          attempts: q.allowedAttempts === -1 ? "unlimited" : q.allowedAttempts,
          questions: q.questionCount,
          ...source(q.title, link),
          ...chunk(htmlText(q.description, cid), offset),
        };
      }
      case "discussion":
      case "announcement": {
        const d = await ctx.db.query("discussions").withIndex("by_user_canvasId", byId).unique();
        if (d === null || d.courseCanvasId !== cid) return { error: `No ${args.kind} with that id in this course` };
        const link = d.isAnnouncement
          ? href.announcement(cid, d.canvasId)
          : d.assignmentCanvasId !== undefined ? href.todo("assignment", d.assignmentCanvasId) : href.todo("discussion", d.canvasId);
        return {
          title: d.title,
          posted: d.postedAt === undefined ? undefined : localIso(d.postedAt, tz),
          author: d.authorName,
          due: d.dueAt === undefined ? undefined : localIso(d.dueAt, tz),
          ...source(d.title, link),
          ...chunk(htmlText(d.message, cid), offset),
        };
      }
      case "file": {
        const f = await ctx.db.query("files").withIndex("by_user_canvasId", byId).unique();
        if (f === null || f.courseCanvasId !== cid || f.hidden || f.lockedForUser) return { error: "No readable file with that id in this course" };
        const doc = await ctx.db
          .query("courseDocuments")
          .withIndex("by_user_course_file", (q) => q.eq("userId", userId).eq("courseCanvasId", cid).eq("fileCanvasId", f.canvasId))
          .unique();
        const base = { title: f.displayName, ...source(f.displayName, href.file(cid, f.canvasId)) };
        if (doc === null) {
          return { ...base, error: "This file's text hasn't been extracted. Point the student to the file instead of guessing its contents." };
        }
        return { ...base, pages: doc.pages, ...chunk(doc.text, offset) };
      }
    }
  },
});

/** Posted grades only. Without a course: one line per active course. */
export const grades = internalQuery({
  args: { userId: v.string(), courseCanvasId: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const courses = await coursesOf(ctx, args.userId);
    const targets = args.courseCanvasId === undefined
      ? courses.current
      : [await courseOf(ctx, args.userId, args.courseCanvasId)];
    const out = [];
    for (const c of targets) {
      const book = await buildGradebook(ctx, args.userId, c, courses.prefBy.get(c.canvasId));
      const rows = book.groups.flatMap((g) => g.assignments.map((a) => ({ ...a, group: g.name })));
      const graded = rows.filter((r) => r.postedAt !== undefined);
      const total = book.course.hideFinalGrades
        ? "hidden by instructor"
        : book.course.currentGrade ?? (book.course.currentScore === undefined ? undefined : `${book.course.currentScore}%`);
      if (args.courseCanvasId === undefined) {
        out.push({ courseId: c.canvasId, course: courses.label(c), current: total, graded: graded.length, total: rows.length, href: href.grades(c.canvasId) });
        continue;
      }
      out.push({
        courseId: c.canvasId,
        course: courses.label(c),
        current: total,
        href: href.grades(c.canvasId),
        weights: book.course.applyAssignmentGroupWeights
          ? book.groups.map((g) => `${g.name}: ${g.groupWeight ?? 0}%${g.dropLowest ? `, drop lowest ${g.dropLowest}` : ""}`)
          : undefined,
        assignments: rows.map((r) => ({
          title: r.name,
          group: r.group,
          points: r.pointsPossible,
          score: r.postedAt === undefined ? undefined : (r.excused ? "excused" : r.score ?? r.grade),
          status: r.postedAt !== undefined ? undefined : r.missing ? "missing" : r.submittedAt !== undefined ? "submitted, not posted" : undefined,
          median: r.postedAt === undefined ? undefined : r.median,
        })),
      });
    }
    return { courses: out, note: "Only posted grades are included. Never estimate an unposted score." };
  },
});

/** Title search across synced course content. */
export const search = internalQuery({
  args: { userId: v.string(), timeZone: v.string(), query: v.string(), courseCanvasId: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const words = args.query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    if (words.length === 0) return { results: [] };
    const courses = await coursesOf(ctx, args.userId);
    const active = new Map(courses.active.map((c) => [c.canvasId, c]));
    const rows = await ctx.db
      .query("searchEntries")
      .withIndex("by_user_course", (q) =>
        args.courseCanvasId === undefined
          ? q.eq("userId", args.userId)
          : q.eq("userId", args.userId).eq("courseCanvasId", args.courseCanvasId),
      )
      .collect();
    const scored = rows
      .filter((r) => active.has(r.courseCanvasId))
      .map((r) => {
        const title = r.title.toLowerCase();
        const hits = words.filter((w) => title.includes(w)).length;
        return { r, score: hits / words.length + (title.startsWith(words[0]) ? 0.1 : 0) };
      })
      .filter((s) => s.score >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);
    return {
      results: scored.map(({ r }) => {
        const c = active.get(r.courseCanvasId);
        const readAs =
          r.kind === "page" && r.pageSlug ? { kind: "page", id: r.pageSlug }
          : r.kind === "assignment" ? { kind: "assignment", id: String(r.canvasId) }
          : r.kind === "announcement" ? { kind: "announcement", id: String(r.canvasId) }
          : r.kind === "file" ? { kind: "file", id: String(r.canvasId) }
          : undefined;
        return {
          kind: r.kind,
          title: r.title,
          courseId: r.courseCanvasId,
          course: c === undefined ? undefined : courses.label(c),
          read: readAs,
          due: r.dueAt === undefined ? undefined : localIso(r.dueAt, args.timeZone),
        };
      }),
    };
  },
});
