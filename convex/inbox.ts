import { v, type Infer } from "convex/values";
import { mutation, query, type QueryCtx, type MutationCtx } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { getSeenSet, gradeVersion, upsertSeen } from "./seenState";
import { DAY_MS } from "./lib/time";
import { scoreStatisticsFields } from "./schema";
import { activeCourseIds } from "./lib/courses";

const ANNOUNCEMENT_WINDOW_MS = 30 * DAY_MS;
const GRADE_WINDOW_MS = 30 * DAY_MS;
const NEW_ASSIGNMENT_WINDOW_MS = 7 * DAY_MS;

export const feedItem = v.object({
  key: v.string(),
  type: v.union(
    v.literal("announcement"),
    v.literal("grade"),
    v.literal("assignment"),
    v.literal("change"),
  ),
  canvasId: v.number(),
  courseCanvasId: v.number(),
  title: v.string(),
  subtitle: v.optional(v.string()),
  at: v.number(),
  seen: v.boolean(),
  // Passed back to markSeen so a regrade shows as new again.
  seenVersion: v.optional(v.string()),
  htmlUrl: v.string(),
  // Grades only; present only when posted.
  score: v.optional(v.number()),
  grade: v.optional(v.string()),
  pointsPossible: v.optional(v.number()),
  change: v.optional(
    v.object({
      field: v.union(v.literal("dueAt"), v.literal("pointsPossible")),
      before: v.optional(v.number()),
      after: v.optional(v.number()),
    }),
  ),
});
export type FeedItem = Infer<typeof feedItem>;

function stripHtml(html: string | undefined): string | undefined {
  if (html === undefined) return undefined;
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text.length === 0 ? undefined : text;
}

// CanvasClient limits each course listing to 50 pages of 100 assignments.
// Restrict the database reads before loading rows, including for mark-all.
async function activeAssignments(ctx: QueryCtx | MutationCtx, userId: string, courseIds: Set<number>) {
  const courses = await Promise.all([...courseIds].map((courseCanvasId) =>
    ctx.db.query("assignments").withIndex("by_user_course", (q) =>
      q.eq("userId", userId).eq("courseCanvasId", courseCanvasId)).take(5000),
  ));
  return courses.flat();
}

export const feed = query({
  args: {},
  returns: v.array(feedItem),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return [];
    const userId = identity.subject;
    const now = Date.now();
    const items: FeedItem[] = [];
    const activeIds = await activeCourseIds(ctx, userId);

    const seenDiscussions = await getSeenSet(ctx, userId, "discussion");
    const announcements = await ctx.db
      .query("discussions")
      .withIndex("by_user_announcement_postedAt", (q) =>
        q
          .eq("userId", userId)
          .eq("isAnnouncement", true)
          .gte("postedAt", now - ANNOUNCEMENT_WINDOW_MS),
      )
      .collect();
    for (const a of announcements) {
      if (a.postedAt === undefined || !activeIds.has(a.courseCanvasId)) {
        continue;
      }
      items.push({
        key: `announcement:${a.canvasId}`,
        type: "announcement",
        canvasId: a.canvasId,
        courseCanvasId: a.courseCanvasId,
        title: a.title,
        subtitle: stripHtml(a.message),
        at: a.postedAt,
        seen: seenDiscussions.has(a.canvasId),
        htmlUrl: a.htmlUrl,
      });
    }

    const seenAssignments = await getSeenSet(ctx, userId, "assignment");
    const seenGrades = await getSeenSet(ctx, userId, "grade");
    const assignments = await activeAssignments(ctx, userId, activeIds);
    for (const a of assignments) {
      const postedAt = a.submission?.postedAt;
      const seen = seenAssignments.get(a.canvasId);
      if (postedAt !== undefined && postedAt >= now - GRADE_WINDOW_MS) {
        const version = gradeVersion(postedAt);
        items.push({
          key: `grade:${a.canvasId}`,
          type: "grade",
          canvasId: a.canvasId,
          courseCanvasId: a.courseCanvasId,
          title: a.name,
          subtitle: a.submission?.grade,
          at: postedAt,
          // Existing assignment rows supply the grade history until first changed.
          seen: (seenGrades.get(a.canvasId) ?? seen)?.seenVersion === version,
          seenVersion: version,
          htmlUrl: a.htmlUrl,
          score: a.submission?.score,
          grade: a.submission?.grade,
          pointsPossible: a.pointsPossible,
        });
      }
      // Rows synced before we stored Canvas's created_at have no date and
      // are never "new".
      const createdAt = a.canvasCreatedAt;
      if (createdAt !== undefined && createdAt >= now - NEW_ASSIGNMENT_WINDOW_MS) {
        items.push({
          key: `assignment:${a.canvasId}`,
          type: "assignment",
          canvasId: a.canvasId,
          courseCanvasId: a.courseCanvasId,
          title: a.name,
          at: createdAt,
          seen: seen !== undefined,
          htmlUrl: a.htmlUrl,
          pointsPossible: a.pointsPossible,
        });
      }
    }

    const seenChanges = await getSeenSet(ctx, userId, "assignmentChange");
    const changes = await ctx.db
      .query("assignmentChanges")
      .withIndex("by_user_changedAt", (q) =>
        q.eq("userId", userId).gte("changedAt", now - 30 * DAY_MS),
      )
      .collect();
    const assignmentById = new Map(
      assignments.map((assignment) => [assignment.canvasId, assignment]),
    );
    for (const change of changes) {
      if (!activeIds.has(change.courseCanvasId)) continue;
      const assignment = assignmentById.get(change.assignmentCanvasId);
      if (assignment === undefined) continue;
      const version = String(change.changedAt);
      items.push({
        key: `change:${change.assignmentCanvasId}:${change.changedAt}`,
        type: "change",
        canvasId: change.assignmentCanvasId,
        courseCanvasId: change.courseCanvasId,
        title: assignment.name,
        subtitle:
          change.field === "dueAt" ? "Due date moved" : "Points changed",
        at: change.changedAt,
        seen:
          Number(seenChanges.get(change.assignmentCanvasId)?.seenVersion ?? 0) >=
          change.changedAt,
        seenVersion: version,
        htmlUrl: assignment.htmlUrl,
        change: {
          field: change.field,
          before: change.before,
          after: change.after,
        },
      });
    }

    return items.sort((x, y) => y.at - x.at);
  },
});

export const gradeDetail = query({
  args: { assignmentCanvasId: v.number() },
  returns: v.union(
    v.object({
      score: v.optional(v.number()),
      pointsPossible: v.optional(v.number()),
      grade: v.optional(v.string()),
      postedAt: v.optional(v.number()),
      scoreStatistics: v.optional(scoreStatisticsFields),
      comments: v.array(
        v.object({
          authorName: v.string(),
          comment: v.string(),
          createdAt: v.number(),
        }),
      ),
      group: v.optional(
        v.object({ name: v.string(), weight: v.optional(v.number()) }),
      ),
      course: v.object({
        currentScore: v.optional(v.number()),
        currentGrade: v.optional(v.string()),
      }),
      todoKey: v.string(),
      htmlUrl: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const userId = identity.subject;
    const assignment = await ctx.db
      .query("assignments")
      .withIndex("by_user_canvasId", (q) =>
        q
          .eq("userId", userId)
          .eq("canvasId", args.assignmentCanvasId),
      )
      .unique();
    if (assignment === null) return null;
    const course = await ctx.db
      .query("courses")
      .withIndex("by_user_canvasId", (q) =>
        q
          .eq("userId", userId)
          .eq("canvasId", assignment.courseCanvasId),
      )
      .unique();
    const assignmentGroupCanvasId = assignment.assignmentGroupCanvasId;
    const group =
      assignmentGroupCanvasId === undefined
        ? null
        : await ctx.db
            .query("assignmentGroups")
            .withIndex("by_user_canvasId", (q) =>
              q
                .eq("userId", userId)
                .eq("canvasId", assignmentGroupCanvasId),
            )
            .unique();
    const posted = assignment.submission?.postedAt !== undefined;
    const showCourseScore = posted && course?.hideFinalGrades !== true;
    return {
      score: posted ? assignment.submission?.score : undefined,
      pointsPossible: assignment.pointsPossible,
      grade: posted ? assignment.submission?.grade : undefined,
      postedAt: assignment.submission?.postedAt,
      scoreStatistics: posted ? assignment.scoreStatistics : undefined,
      comments: posted ? (assignment.submission?.comments ?? []) : [],
      group: group
        ? {
            name: group.name,
            weight: course?.applyAssignmentGroupWeights ? group.groupWeight : undefined,
          }
        : undefined,
      course: {
        currentScore: showCourseScore ? course?.currentScore : undefined,
        currentGrade: showCourseScore ? course?.currentGrade : undefined,
      },
      todoKey: `assignment:${assignment.canvasId}`,
      htmlUrl: assignment.htmlUrl,
    };
  },
});

export const markAllSeen = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    const upsert = (
      kind: "assignment" | "grade" | "discussion" | "assignmentChange",
      canvasId: number,
      seenVersion: string | undefined,
    ) => upsertSeen(ctx, userId, kind, canvasId, seenVersion);

    const activeIds = await activeCourseIds(ctx, userId);

    const announcements = await ctx.db
      .query("discussions")
      .withIndex("by_user_announcement_postedAt", (q) =>
        q
          .eq("userId", userId)
          .eq("isAnnouncement", true)
          .gte("postedAt", now - ANNOUNCEMENT_WINDOW_MS),
      )
      .collect();
    for (const a of announcements) {
      if (activeIds.has(a.courseCanvasId)) {
        await upsert("discussion", a.canvasId, undefined);
      }
    }

    const assignments = await activeAssignments(ctx, userId, activeIds);
    for (const a of assignments) {
      const postedAt = a.submission?.postedAt;
      const isNew =
        a.canvasCreatedAt !== undefined && a.canvasCreatedAt >= now - NEW_ASSIGNMENT_WINDOW_MS;
      const hasGrade = postedAt !== undefined && postedAt >= now - GRADE_WINDOW_MS;
      if (!isNew && !hasGrade) continue;
      if (isNew) await upsert("assignment", a.canvasId, undefined);
      if (hasGrade) await upsert("grade", a.canvasId, gradeVersion(postedAt));
    }

    const changes = await ctx.db
      .query("assignmentChanges")
      .withIndex("by_user_changedAt", (q) =>
        q.eq("userId", userId).gte("changedAt", now - 30 * DAY_MS),
      )
      .collect();
    for (const change of changes) {
      if (!activeIds.has(change.courseCanvasId)) continue;
      await upsert(
        "assignmentChange",
        change.assignmentCanvasId,
        String(change.changedAt),
      );
    }
    return null;
  },
});
