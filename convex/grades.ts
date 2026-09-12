// The gradebook for one course (and, for the index, every course),
// assembled from three synced tables.
//
// Two Canvas policies are enforced here and nowhere downstream, because a
// value that never leaves the server cannot leak into a UI by accident:
// - A score is withheld until the teacher posts it. `submission.postedAt`
//   is the only signal for that; a graded-but-unposted submission arrives
//   with a score attached and must still read as ungraded.
// - `hideFinalGrades` means the instructor hides course totals entirely.
//
// Arithmetic (subtotals, coverage, what-if) lives in convex/lib/grades.ts
// and runs on the client, so one pure module serves every surface.

import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { gradingSchemeEntry } from "./schema";
import { requireUserId } from "./lib/auth";
import type { GradeCourse, GradeGroup, GradeRow, Gradebook } from "./lib/grades";

const UNGROUPED_CANVAS_ID = 0; // Canvas ids start at 1, so 0 is free
const UNGROUPED_NAME = "Assignments";

function gradeRow(assignment: Doc<"assignments">): GradeRow {
  const submission = assignment.submission;
  const posted = submission?.postedAt !== undefined;
  // An excusal is a grading decision like any other: it shows once posted.
  const excused =
    posted && (submission?.excused === true || submission?.grade === "EX");
  return {
    canvasId: assignment.canvasId,
    name: assignment.name,
    pointsPossible: assignment.pointsPossible,
    dueAt: assignment.dueAt,
    omitFromFinalGrade: assignment.omitFromFinalGrade,
    gradingType: assignment.gradingType,
    score: posted && !excused ? submission?.score : undefined,
    grade: posted ? submission?.grade : undefined,
    postedAt: submission?.postedAt,
    submittedAt: submission?.submittedAt,
    late: submission?.late,
    missing: submission?.missing,
    excused: excused || undefined,
    median: assignment.scoreStatistics?.median,
  };
}

function courseFields(
  courseDoc: Doc<"courses">,
  pref: Doc<"coursePrefs"> | undefined,
): GradeCourse {
  const hidden = courseDoc.hideFinalGrades === true;
  return {
    currentScore: hidden ? undefined : courseDoc.currentScore,
    currentGrade: hidden ? undefined : courseDoc.currentGrade,
    finalScore: hidden ? undefined : courseDoc.finalScore,
    finalGrade: hidden ? undefined : courseDoc.finalGrade,
    hideFinalGrades: courseDoc.hideFinalGrades,
    applyAssignmentGroupWeights: courseDoc.applyAssignmentGroupWeights,
    gradingScheme: courseDoc.gradingScheme,
    gradeCutoffs: pref?.gradeCutoffs,
  };
}

export async function buildGradebook(
  ctx: QueryCtx,
  userId: string,
  courseDoc: Doc<"courses">,
  pref: Doc<"coursePrefs"> | undefined,
): Promise<Gradebook> {
  const groupDocs = await ctx.db
    .query("assignmentGroups")
    .withIndex("by_user_course", (q) =>
      q.eq("userId", userId).eq("courseCanvasId", courseDoc.canvasId),
    )
    .collect();
  const assignments = await ctx.db
    .query("assignments")
    .withIndex("by_user_course", (q) =>
      q.eq("userId", userId).eq("courseCanvasId", courseDoc.canvasId),
    )
    .collect();

  const known = new Set(groupDocs.map((group) => group.canvasId));
  const byGroup = new Map<number, Doc<"assignments">[]>();
  for (const assignment of assignments) {
    const groupId = assignment.assignmentGroupCanvasId;
    // An assignment whose group Canvas never gave us (groups tab off, or
    // a delta-only sync) still has to appear on the page.
    const key =
      groupId !== undefined && known.has(groupId) ? groupId : UNGROUPED_CANVAS_ID;
    const bucket = byGroup.get(key);
    if (bucket) bucket.push(assignment);
    else byGroup.set(key, [assignment]);
  }

  const sortRows = (rows: Doc<"assignments">[]) =>
    rows
      .sort(
        (a, b) =>
          (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) ||
          (a.position ?? Infinity) - (b.position ?? Infinity) ||
          a.name.localeCompare(b.name),
      )
      .map(gradeRow);

  const groups: GradeGroup[] = groupDocs
    .sort((a, b) => a.position - b.position)
    .map((group) => ({
      canvasId: group.canvasId,
      name: group.name,
      position: group.position,
      groupWeight: group.groupWeight,
      dropLowest: group.dropLowest,
      dropHighest: group.dropHighest,
      neverDrop: group.neverDrop,
      assignments: sortRows(byGroup.get(group.canvasId) ?? []),
    }));

  const ungrouped = byGroup.get(UNGROUPED_CANVAS_ID);
  if (ungrouped !== undefined && ungrouped.length > 0) {
    groups.push({
      canvasId: UNGROUPED_CANVAS_ID,
      name: UNGROUPED_NAME,
      position: groups.length + 1,
      assignments: sortRows(ungrouped),
    });
  }

  return { course: courseFields(courseDoc, pref), groups };
}

async function prefFor(
  ctx: QueryCtx,
  userId: string,
  courseCanvasId: number,
): Promise<Doc<"coursePrefs"> | undefined> {
  return (
    (await ctx.db
      .query("coursePrefs")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", userId).eq("courseCanvasId", courseCanvasId),
      )
      .unique()) ?? undefined
  );
}

export const course = query({
  args: { courseCanvasId: v.number() },
  handler: async (ctx, args): Promise<Gradebook | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const userId = identity.subject;
    const courseDoc = await ctx.db
      .query("courses")
      .withIndex("by_user_canvasId", (q) =>
        q.eq("userId", userId).eq("canvasId", args.courseCanvasId),
      )
      .unique();
    if (courseDoc === null) return null;
    const pref = await prefFor(ctx, userId, args.courseCanvasId);
    return await buildGradebook(ctx, userId, courseDoc, pref);
  },
});

/**
 * The gradebook of every active course, keyed by course. The client groups
 * them by term with `useCourses()` and summarises each with
 * convex/lib/grades.ts. Past courses are not here: the ledger folds them to
 * the final letter that `courses.list` already carries, so a fourth-year
 * student's subscription does not re-read every assignment ever graded.
 */
export const index = query({
  args: {},
  handler: async (ctx): Promise<Array<{ courseCanvasId: number; book: Gradebook }>> => {
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
    const out: Array<{ courseCanvasId: number; book: Gradebook }> = [];
    for (const courseDoc of courses) {
      if (courseDoc.enrollmentState === "completed") continue;
      out.push({
        courseCanvasId: courseDoc.canvasId,
        book: await buildGradebook(ctx, userId, courseDoc, prefByCourse.get(courseDoc.canvasId)),
      });
    }
    return out;
  },
});

/** The student's own letter cutoffs for a course; `null` restores the default scale. */
export const setCutoffs = mutation({
  args: {
    courseCanvasId: v.number(),
    cutoffs: v.union(v.array(gradingSchemeEntry), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (args.cutoffs !== null) {
      if (args.cutoffs.length === 0) throw new Error("Give at least one cutoff");
      for (const entry of args.cutoffs) {
        if (entry.name.trim() === "") throw new Error("Every cutoff needs a letter");
        if (!(entry.value >= 0 && entry.value <= 1)) throw new Error("Cutoffs are fractions of 100");
      }
    }
    const existing = await ctx.db
      .query("coursePrefs")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", userId).eq("courseCanvasId", args.courseCanvasId),
      )
      .unique();
    const gradeCutoffs = args.cutoffs === null ? undefined : args.cutoffs;
    if (existing) await ctx.db.patch(existing._id, { gradeCutoffs });
    else if (gradeCutoffs !== undefined) {
      await ctx.db.insert("coursePrefs", { userId, courseCanvasId: args.courseCanvasId, gradeCutoffs });
    }
    return null;
  },
});
