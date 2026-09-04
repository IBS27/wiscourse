import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import schema, { COURSE_COLORS, courseColor } from "./schema";
import { requireUserId } from "./lib/auth";
import { parseSyllabusFacts } from "./lib/syllabusFacts";
import { getSeenSet } from "./seenState";
import { DAY_MS } from "./lib/time";

const FRESH_FILE_WINDOW_MS = 14 * DAY_MS;

const syllabusFacts = v.object({
  meets: v.optional(v.string()),
  location: v.optional(v.string()),
  officeHours: v.optional(v.string()),
  textbook: v.optional(v.string()),
});
const courseFields = {
  _id: v.id("courses"),
  _creationTime: v.number(),
  ...schema.tables.courses.validator.fields,
};
const courseListItem = v.object({
  ...courseFields,
  color: courseColor,
  nickname: v.optional(v.string()),
  position: v.optional(v.number()),
  hidden: v.boolean(),
});

/**
 * Courses with their local-only presentation (colour, nickname, order,
 * hidden) folded in. A course with no saved colour gets one from the
 * palette by its position in the canvasId order, so colours are stable
 * across syncs without a write.
 */
export const list = query({
  args: {},
  returns: v.array(courseListItem),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return [];
    const userId = identity.subject;
    const courses = await ctx.db
      .query("courses")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const prefs = await ctx.db
      .query("coursePrefs")
      .withIndex("by_user_course", (q) => q.eq("userId", userId))
      .collect();
    const prefByCourse = new Map(prefs.map((p) => [p.courseCanvasId, p]));

    // `syllabusBody` is unbounded instructor HTML; keep it out of the list
    // payload and let `get` fetch it for the one course being viewed.
    return courses
      .sort((a, b) => a.canvasId - b.canvasId)
      .map((course, index) => {
        const pref = prefByCourse.get(course.canvasId);
        return {
          ...course,
          syllabusBody: undefined,
          enrollmentState: course.enrollmentState ?? "active",
          color: pref?.color ?? COURSE_COLORS[index % COURSE_COLORS.length],
          nickname: pref?.nickname,
          position: pref?.position,
          hidden: pref?.hidden ?? false,
        };
      })
      .sort((a, b) => {
        if (a.position !== b.position) {
          return (a.position ?? Infinity) - (b.position ?? Infinity);
        }
        return a.name.localeCompare(b.name);
      });
  },
});

/** The single course, syllabus included. Fetched only when one is opened. */
export const get = query({
  args: { canvasId: v.number() },
  returns: v.union(v.object(courseFields), v.null()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    return await ctx.db
      .query("courses")
      .withIndex("by_user_canvasId", (q) =>
        q.eq("userId", identity.subject).eq("canvasId", args.canvasId),
      )
      .unique();
  },
});

/**
 * Just the parsed syllabus facts — what a course row or header needs,
 * without shipping the syllabus HTML that `get` carries.
 */
export const facts = query({
  args: { canvasId: v.number() },
  returns: v.union(syllabusFacts, v.null()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const course = await ctx.db
      .query("courses")
      .withIndex("by_user_canvasId", (q) =>
        q.eq("userId", identity.subject).eq("canvasId", args.canvasId),
      )
      .unique();
    return course === null ? null : parseSyllabusFacts(course.syllabusBody);
  },
});

export const hub = query({
  args: { canvasId: v.number() },
  returns: v.union(
    v.object({
      gradedCount: v.number(),
      assignmentCount: v.number(),
      heaviestGroup: v.optional(
        v.object({ name: v.string(), weight: v.number() }),
      ),
      currentScore: v.optional(v.number()),
      currentGrade: v.optional(v.string()),
      // Tab badges: any unseen item in an unlocked module; files added in
      // the last two weeks and never opened here.
      unreadModules: v.boolean(),
      newFiles: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const userId = identity.subject;
    const course = await ctx.db
      .query("courses")
      .withIndex("by_user_canvasId", (q) =>
        q.eq("userId", userId).eq("canvasId", args.canvasId),
      )
      .unique();
    if (course === null) return null;
    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", userId).eq("courseCanvasId", args.canvasId),
      )
      .collect();
    const groups = await ctx.db
      .query("assignmentGroups")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", userId).eq("courseCanvasId", args.canvasId),
      )
      .collect();
    // Group weights only mean anything when the instructor turned them on.
    const weightedGroups = course.applyAssignmentGroupWeights
      ? groups.filter(
          (group): group is typeof group & { groupWeight: number } =>
            group.groupWeight !== undefined && group.groupWeight > 0,
        )
      : [];
    const heaviest = weightedGroups.sort(
      (a, b) => b.groupWeight - a.groupWeight,
    )[0];
    const hideTotals = course.hideFinalGrades === true;

    const modules = await ctx.db
      .query("modules")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", userId).eq("courseCanvasId", args.canvasId),
      )
      .collect();
    const unlocked = new Set(
      modules.filter((m) => m.state !== "locked").map((m) => m.canvasId),
    );
    const items = await ctx.db
      .query("moduleItems")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", userId).eq("courseCanvasId", args.canvasId),
      )
      .collect();
    const seenItems = await getSeenSet(ctx, userId, "moduleItem");
    const unreadModules = items.some(
      (item) =>
        item.type !== "SubHeader" &&
        unlocked.has(item.moduleCanvasId) &&
        item.completionRequirement?.completed !== true &&
        !seenItems.has(item.canvasId),
    );
    const files = await ctx.db
      .query("files")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", userId).eq("courseCanvasId", args.canvasId),
      )
      .collect();
    const seenFiles = await getSeenSet(ctx, userId, "file");
    const since = Date.now() - FRESH_FILE_WINDOW_MS;
    const newFiles = files.filter((file) => {
      const at = file.updatedAt ?? file.modifiedAt;
      return file.hidden !== true && at !== undefined && at >= since && !seenFiles.has(file.canvasId);
    }).length;

    return {
      unreadModules,
      newFiles,
      gradedCount: assignments.filter(
        (assignment) => assignment.submission?.postedAt !== undefined,
      ).length,
      assignmentCount: assignments.length,
      heaviestGroup: heaviest
        ? { name: heaviest.name, weight: heaviest.groupWeight }
        : undefined,
      currentScore: hideTotals ? undefined : course.currentScore,
      currentGrade: hideTotals ? undefined : course.currentGrade,
    };
  },
});

export const setPrefs = mutation({
  args: {
    courseCanvasId: v.number(),
    color: v.optional(courseColor),
    nickname: v.optional(v.union(v.string(), v.null())),
    hidden: v.optional(v.boolean()),
    position: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { courseCanvasId, ...rest } = args;
    const patch = {
      ...(rest.color !== undefined && { color: rest.color }),
      ...(rest.nickname !== undefined && { nickname: rest.nickname ?? undefined }),
      ...(rest.hidden !== undefined && { hidden: rest.hidden }),
      ...(rest.position !== undefined && { position: rest.position ?? undefined }),
    };
    const existing = await ctx.db
      .query("coursePrefs")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", userId).eq("courseCanvasId", courseCanvasId),
      )
      .unique();
    if (existing) await ctx.db.patch(existing._id, patch);
    else await ctx.db.insert("coursePrefs", { userId, courseCanvasId, ...patch });
    return null;
  },
});
