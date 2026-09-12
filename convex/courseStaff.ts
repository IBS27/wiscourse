import { sameValue } from "./lib/equality";
import { syncListSummary } from "./lib/listSummaries";
import { getCanvasClient } from "./credentials";
import { courseInstructors } from "./sync";
import { v } from "convex/values";
import {
  internalQuery,
  internalMutation,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { courseText } from "./lib/courseSource";
import { identifyInstructors } from "./lib/instructorEvidence";
import schema, { instructorFields } from "./schema";
export const sources = internalQuery({
  args: {
    userId: v.string(),
    courseCanvasId: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.object({
    text: v.string(),
    cursor: v.string(),
    done: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("pages")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", args.userId).eq("courseCanvasId", args.courseCanvasId),
      )
      .paginate({
        cursor: args.cursor,
        numItems: 40,
        maximumBytesRead: 1_000_000,
      });
    return {
      text: page.page
        .filter(
          (p) =>
            p.published &&
            !p.lockedForUser &&
            !p.contentUnavailable &&
            (p.isFrontPage ||
              /syllabus|contact|instructor|course.information|teaching/i.test(
                p.title + " " + p.url,
              )),
        )
        .map((p) => courseText(p.body ?? "", args.courseCanvasId))
        .join("\n"),
      cursor: page.continueCursor,
      done: page.isDone,
    };
  },
});
export const course = internalQuery({
  args: { userId: v.string(), courseCanvasId: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("courses"),
      _creationTime: v.number(),
      ...schema.tables.courses.validator.fields,
    }),
  ),
  handler: (ctx, a) =>
    ctx.db
      .query("courses")
      .withIndex("by_user_canvasId", (q) =>
        q.eq("userId", a.userId).eq("canvasId", a.courseCanvasId),
      )
      .unique(),
});
export const save = internalMutation({
  args: {
    userId: v.string(),
    courseCanvasId: v.number(),
    instructors: v.array(instructorFields),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const course = await ctx.db
      .query("courses")
      .withIndex("by_user_canvasId", (q) =>
        q.eq("userId", a.userId).eq("canvasId", a.courseCanvasId),
      )
      .unique();
    if (course) {
      if (!sameValue(course.verifiedInstructors, a.instructors))
        await ctx.db.patch(course._id, { verifiedInstructors: a.instructors, syncedAt: Date.now() });
      await syncListSummary(ctx, "courses", { ...course, verifiedInstructors: a.instructors });
    }
    return null;
  },
});
export const refresh = internalAction({
  args: { userId: v.string(), courseCanvasId: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const course = await ctx.runQuery(internal.courseStaff.course, args);
    if (!course) return null;
    let text = courseText(course.syllabusBody ?? "", args.courseCanvasId);
    let cursor: string | null = null;
    do {
      const page: { text: string; cursor: string; done: boolean } =
        await ctx.runQuery(internal.courseStaff.sources, { ...args, cursor });
      text += "\n" + page.text;
      cursor = page.done ? null : page.cursor;
    } while (cursor !== null);
    let instructors = identifyInstructors(text, course.instructors ?? []);
    if (!instructors.length) {
      const pdfText = await ctx.runAction(internal.filePreview.staffText, args);
      instructors = identifyInstructors(
        text + "\n" + pdfText,
        course.instructors ?? [],
      );
    }
    await ctx.runMutation(internal.courseStaff.save, { ...args, instructors });
    return null;
  },
});

export const documents = internalQuery({
  args: { userId: v.string(), courseCanvasId: v.number() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const files = await ctx.db
      .query("files")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", args.userId).eq("courseCanvasId", args.courseCanvasId),
      )
      .take(1000);
    return files
      .filter(
        (f) =>
          !f.lockedForUser &&
          !f.hidden &&
          f.contentType === "application/pdf" &&
          /syllabus|course.*info/i.test(f.displayName),
      )
      .slice(0, 3)
      .map((f) => f.url);
  },
});

export const roster = internalMutation({
  args: {
    userId: v.string(),
    courseCanvasId: v.number(),
    instructors: v.array(instructorFields),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    const course = await ctx.db
      .query("courses")
      .withIndex("by_user_canvasId", (q) =>
        q.eq("userId", a.userId).eq("canvasId", a.courseCanvasId),
      )
      .unique();
    if (course) {
      if (!sameValue(course.instructors, a.instructors))
        await ctx.db.patch(course._id, { instructors: a.instructors, syncedAt: Date.now() });
      await syncListSummary(ctx, "courses", { ...course, instructors: a.instructors });
    }
    return null;
  },
});
export const refreshRoster = internalAction({
  args: { userId: v.string(), courseCanvasId: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lease = await ctx.runMutation(internal.syncStore.claimSync, {
      userId: args.userId,
      full: false,
    });
    if (lease === null) throw new Error("Canvas is syncing; retry shortly");
    try {
      const { client } = await getCanvasClient(ctx, args.userId);
      const instructors = await courseInstructors(client, args.courseCanvasId);
      await ctx.runMutation(internal.courseStaff.roster, {
        ...args,
        instructors,
      });
    } finally {
      await ctx.runMutation(internal.syncStore.releaseSync, {
        userId: args.userId,
        lease,
      });
    }
    await ctx.runAction(internal.courseStaff.refresh, args);
    return null;
  },
});
