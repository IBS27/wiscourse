// The gradebook for one course, assembled from three synced tables.
//
// Two Canvas policies are enforced here and nowhere downstream, because a
// value that never leaves the server cannot leak into a UI by accident:
// - A score is withheld until the teacher posts it. `submission.postedAt`
//   is the only signal for that; a graded-but-unposted submission arrives
//   with a score attached and must still read as ungraded.
// - `hideFinalGrades` means the instructor hides course totals entirely.

import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const UNGROUPED_CANVAS_ID = 0; // Canvas ids start at 1, so 0 is free
const UNGROUPED_NAME = "Assignments";

function gradeRow(assignment: Doc<"assignments">) {
  const submission = assignment.submission;
  const posted = submission?.postedAt !== undefined;
  return {
    canvasId: assignment.canvasId,
    name: assignment.name,
    pointsPossible: assignment.pointsPossible,
    dueAt: assignment.dueAt,
    omitFromFinalGrade: assignment.omitFromFinalGrade,
    score: posted ? submission?.score : undefined,
    grade: posted ? submission?.grade : undefined,
    postedAt: submission?.postedAt,
    submittedAt: submission?.submittedAt,
    late: submission?.late,
    missing: submission?.missing,
  };
}

export const course = query({
  args: { courseCanvasId: v.number() },
  handler: async (ctx, args) => {
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

    const groupDocs = await ctx.db
      .query("assignmentGroups")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", userId).eq("courseCanvasId", args.courseCanvasId),
      )
      .collect();
    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", userId).eq("courseCanvasId", args.courseCanvasId),
      )
      .collect();

    const known = new Set(groupDocs.map((group) => group.canvasId));
    const byGroup = new Map<number, Doc<"assignments">[]>();
    for (const assignment of assignments) {
      const groupId = assignment.assignmentGroupCanvasId;
      // An assignment whose group Canvas never gave us (groups tab off, or
      // a delta-only sync) still has to appear on the page.
      const key =
        groupId !== undefined && known.has(groupId)
          ? groupId
          : UNGROUPED_CANVAS_ID;
      const bucket = byGroup.get(key);
      if (bucket) bucket.push(assignment);
      else byGroup.set(key, [assignment]);
    }

    const sortRows = (rows: Doc<"assignments">[]) =>
      rows
        .sort(
          (a, b) =>
            (a.position ?? Infinity) - (b.position ?? Infinity) ||
            (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) ||
            a.name.localeCompare(b.name),
        )
        .map(gradeRow);

    const groups = groupDocs
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
        groupWeight: undefined,
        dropLowest: undefined,
        dropHighest: undefined,
        neverDrop: undefined,
        assignments: sortRows(ungrouped),
      });
    }

    const hidden = courseDoc.hideFinalGrades === true;
    return {
      course: {
        currentScore: hidden ? undefined : courseDoc.currentScore,
        currentGrade: hidden ? undefined : courseDoc.currentGrade,
        finalScore: hidden ? undefined : courseDoc.finalScore,
        finalGrade: hidden ? undefined : courseDoc.finalGrade,
        hideFinalGrades: courseDoc.hideFinalGrades,
        applyAssignmentGroupWeights: courseDoc.applyAssignmentGroupWeights,
      },
      groups,
    };
  },
});
