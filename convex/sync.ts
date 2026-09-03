// Three-tier Canvas sync.
//
// Tier 1 (tripwire, every 5 min): GET /users/self/activity_stream/summary —
// a tiny payload. Only when it changes do we run a delta sync.
// Tier 2 (delta): the cheap, frequently-changing slice. Per course, two
// filtered submission calls (submitted_since / graded_since) plus recently
// active discussion topics and the content refresh; globally, one
// /announcements call per 10 courses.
// Tier 3 (nightly full): everything, and the only tier allowed to prune —
// courses (with tabs, syllabus and enrollment totals), assignments,
// per-course metadata (assignment groups, grading periods, quizzes,
// discussions) and course content (modules, pages, files), plus the
// calendar window.
//
// Request budget, unpaginated: per active course ~14 on a full sync (1
// assignments, 1 submission-comments pass, up to 1 tabs, 1 instructors,
// 1 syllabus (UW's list endpoint never inlines it), 5 metadata, and content
// sync is 4 + 1 per oversized module). A completed course costs 1 assignment
// call. A delta costs 4 per active course. Per user, add 2 course lists and
// one calendar call on full sync or one announcements call per 10 active
// courses on delta.
//
// Dispatch rules (Convex-specific, deliberate):
// - Crons must not loop over users: overlapping cron runs are skipped, so
//   a slow loop silently drops cycles. Crons call a dispatcher mutation
//   that fans out one Workpool job per user.
// - Fan-out happens in MUTATIONS (exactly-once, atomic); actions only talk
//   to Canvas. Actions are at-most-once, so the Workpool retries them.
// - One CanvasClient per user per job, strictly sequential requests —
//   Canvas throttles on concurrency (~12 in-flight per token), not rate.

import { v } from "convex/values";
import { Workpool } from "@convex-dev/workpool";
import {
  internalAction,
  internalMutation,
  mutation,
  type ActionCtx,
} from "./_generated/server";
import { components, internal } from "./_generated/api";
import { requireUserId } from "./lib/auth";
import { getCanvasClient, type CanvasSession } from "./credentials";
import {
  CanvasAuthError,
  tolerateDisabledTab,
  type CanvasClient,
} from "./canvas/client";
import {
  toMillis,
  type CanvasActivityStreamSummaryItem,
  type CanvasAssignment,
  type CanvasCalendarEvent,
  type CanvasCourse,
  type CanvasDiscussionTopic,
  type CanvasSubmission,
  type CanvasTab,
  type CanvasUser,
} from "./canvas/types";
import { mapDiscussion, syncCourseMeta } from "./canvas/syncCourseMeta";
import { syncCourseContent } from "./canvas/syncContent";
import type {
  AssignmentUpsert,
  CalendarEventUpsert,
  CourseUpsert,
} from "./syncStore";
import type { DiscussionUpsert } from "./storeCourseMeta";
import { DAY_MS } from "./lib/time";

// The calendar_events endpoint silently ignores context codes past the
// first 10 — chunking is mandatory, not an optimization.
const CONTEXT_CODE_CHUNK = 10;

export const syncPool = new Workpool(components.syncWorkpool, {
  maxParallelism: 5,
  retryActionsByDefault: true,
  defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 2000, base: 2 },
});

// ---------------------------------------------------------------------------
// Dispatch

export const dispatchTripwire = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userIds: string[] = await ctx.runQuery(
      internal.syncStore.listActiveUserIds,
      {},
    );
    for (const userId of userIds) {
      await syncPool.enqueueAction(ctx, internal.sync.tripwireUser, { userId });
    }
    return null;
  },
});

export const dispatchFullSync = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userIds: string[] = await ctx.runQuery(
      internal.syncStore.listActiveUserIds,
      {},
    );
    for (const userId of userIds) {
      await syncPool.enqueueAction(ctx, internal.sync.fullSyncUser, { userId });
    }
    return null;
  },
});

export const enqueueFullSync = internalMutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await syncPool.enqueueAction(ctx, internal.sync.fullSyncUser, {
      userId: args.userId,
    });
    return null;
  },
});

/** "Sync now" button in settings. */
export const requestSync = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    await syncPool.enqueueAction(ctx, internal.sync.fullSyncUser, { userId });
    return null;
  },
});

// ---------------------------------------------------------------------------
// Actions

export const tripwireUser = internalAction({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const session = await getCanvasClient(ctx, args.userId);
      const summary = await session.client.get<CanvasActivityStreamSummaryItem[]>(
        "/users/self/activity_stream/summary",
      );
      const snapshot = JSON.stringify(summary);
      const state = await ctx.runQuery(internal.syncStore.getSyncState, {
        userId: args.userId,
      });
      const changed = snapshot !== state?.tripwireSnapshot;
      await ctx.runMutation(internal.syncStore.recordSyncResult, {
        userId: args.userId,
        kind: "tripwire",
        tripwireSnapshot: snapshot,
        rateLimitRemaining: session.rateLimitRemaining(),
      });
      if (changed) {
        await runDeltaSync(ctx, args.userId, session);
      }
    } catch (error) {
      await handleSyncError(ctx, args.userId, error);
    }
    return null;
  },
});

export const fullSyncUser = internalAction({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const session = await getCanvasClient(ctx, args.userId);
      await runFullSync(ctx, args.userId, session);
    } catch (error) {
      await handleSyncError(ctx, args.userId, error);
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// Sync implementations

async function runFullSync(
  ctx: ActionCtx,
  userId: string,
  session: CanvasSession,
): Promise<void> {
  const { client } = session;
  await ctx.runMutation(internal.syncStore.setSyncStatus, {
    userId,
    status: "syncing",
  });

  const courseIncludes = [
    "term",
    "favorites",
    "syllabus_body",
    "course_image",
    "tabs",
    "total_scores",
  ];
  const rawActiveCourses = await client.getPaginated<CanvasCourse>("/courses", {
    enrollment_state: "active",
    "include[]": courseIncludes,
  });
  const rawCompletedCourses = await client.getPaginated<CanvasCourse>("/courses", {
    enrollment_state: "completed",
    "include[]": ["term", "total_scores"],
  });
  const usable = (course: CanvasCourse) =>
    course.name !== undefined && !course.access_restricted_by_date;
  const activeCourses = rawActiveCourses.filter(usable);
  const activeIds = new Set(activeCourses.map((course) => course.id));
  const completedCourses = rawCompletedCourses.filter(
    (course) => usable(course) && !activeIds.has(course.id),
  );

  const courseUpserts: CourseUpsert[] = [];
  for (const course of activeCourses) {
    const tabs = await courseTabIds(client, course);
    const instructors = await courseInstructors(client, course.id);
    const syllabusBody = await courseSyllabus(client, course);
    courseUpserts.push(
      mapCourse({ ...course, syllabus_body: syllabusBody }, tabs, "active", instructors),
    );
  }
  for (const course of completedCourses) {
    courseUpserts.push(
      mapCourse(course, inlineCourseTabIds(course), "completed", undefined),
    );
  }
  await ctx.runMutation(internal.syncStore.upsertCourses, {
    userId,
    courses: courseUpserts,
    prune: true,
  });

  for (const course of [...activeCourses, ...completedCourses]) {
    const active = activeIds.has(course.id);
    const assignments = await tolerateDisabledTab<CanvasAssignment[] | undefined>(
      () =>
        client.getPaginated<CanvasAssignment>(
          `/courses/${course.id}/assignments`,
          {
            "include[]": ["submission", "score_statistics"],
            order_by: "due_at",
          },
        ),
      undefined,
    );
    const submissions = active
      ? await tolerateDisabledTab(
          () =>
            client.getPaginated<CanvasSubmission>(
              `/courses/${course.id}/students/submissions`,
              {
                "student_ids[]": ["self"],
                "include[]": ["submission_comments"],
              },
            ),
          [],
        )
      : [];
    const submissionByAssignment = new Map(
      submissions.map((submission) => [submission.assignment_id, submission]),
    );
    if (assignments !== undefined) {
      await ctx.runMutation(internal.syncStore.upsertAssignments, {
        userId,
        courseCanvasId: course.id,
        assignments: assignments.map((assignment) =>
          mapAssignment(assignment, submissionByAssignment.get(assignment.id)),
        ),
        logChanges: active,
        prune: true,
      });
    }

    if (active) {
      await syncCourseMeta(ctx, userId, client, course.id, { full: true });
      await syncCourseContent(ctx, userId, client, course.id, { full: true });
    }
  }

  // Announcements come from the per-course pass above on a full sync; only
  // the genuinely cross-course endpoints are left here.
  const courseIds = activeCourses.map((course) => course.id);
  await syncCalendarEvents(ctx, userId, client, session, courseIds);

  await ctx.runMutation(internal.syncStore.recordSyncResult, {
    userId,
    kind: "full",
    rateLimitRemaining: session.rateLimitRemaining(),
  });
}

async function runDeltaSync(
  ctx: ActionCtx,
  userId: string,
  session: CanvasSession,
): Promise<void> {
  const { client } = session;
  await ctx.runMutation(internal.syncStore.setSyncStatus, {
    userId,
    status: "syncing",
  });

  const state = await ctx.runQuery(internal.syncStore.getSyncState, { userId });
  const sinceMs =
    state?.lastDeltaSyncAt ?? state?.lastFullSyncAt ?? Date.now() - 7 * DAY_MS;
  const sinceIso = new Date(sinceMs).toISOString();

  const courseIds: number[] = await ctx.runQuery(
    internal.syncStore.getCourseCanvasIds,
    { userId },
  );

  for (const courseId of courseIds) {
    // Grade and submission deltas. Two filtered calls (submitted vs graded)
    // are far cheaper than refetching every assignment.
    const submitted = await tolerateDisabledTab(
      () =>
        client.getPaginated<CanvasSubmission>(
          `/courses/${courseId}/students/submissions`,
          {
            "student_ids[]": ["self"],
            "include[]": ["submission_comments"],
            submitted_since: sinceIso,
          },
        ),
      [],
    );
    const graded = await tolerateDisabledTab(
      () =>
        client.getPaginated<CanvasSubmission>(
          `/courses/${courseId}/students/submissions`,
          {
            "student_ids[]": ["self"],
            "include[]": ["submission_comments"],
            graded_since: sinceIso,
          },
        ),
      [],
    );
    const byAssignment = new Map<number, CanvasSubmission>();
    for (const submission of [...submitted, ...graded]) {
      byAssignment.set(submission.assignment_id, submission);
    }
    if (byAssignment.size > 0) {
      await ctx.runMutation(internal.syncStore.applySubmissionUpdates, {
        userId,
        updates: [...byAssignment.entries()].map(([assignmentCanvasId, s]) => ({
          assignmentCanvasId,
          submission: mapSubmission(s),
        })),
      });
    }

    await syncCourseMeta(ctx, userId, client, courseId, {
      full: false,
      sinceMs,
    });
    await syncCourseContent(ctx, userId, client, courseId, { full: false });
  }

  await syncAnnouncements(ctx, userId, client, courseIds, sinceMs);

  await ctx.runMutation(internal.syncStore.recordSyncResult, {
    userId,
    kind: "delta",
    rateLimitRemaining: session.rateLimitRemaining(),
  });
}

/**
 * Recent announcements across every course in one call per 10 courses.
 * Cheap enough for the delta tier, unlike the per-course topic listings.
 */
async function syncAnnouncements(
  ctx: ActionCtx,
  userId: string,
  client: CanvasClient,
  courseIds: number[],
  sinceMs: number,
): Promise<void> {
  for (const chunk of chunked(courseIds, CONTEXT_CODE_CHUNK)) {
    const announcements = await client.getPaginated<CanvasDiscussionTopic>(
      "/announcements",
      {
        "context_codes[]": chunk.map((id) => `course_${id}`),
        start_date: new Date(sinceMs).toISOString(),
        end_date: new Date(Date.now() + DAY_MS).toISOString(),
      },
    );
    const upserts: DiscussionUpsert[] = announcements.flatMap((announcement) => {
      const courseCanvasId = parseContextCourseId(announcement.context_code);
      // A non-course context (a group announcement) has no home in the
      // course-scoped table; drop it rather than orphan it under course 0.
      if (courseCanvasId === undefined) return [];
      return [mapDiscussion(courseCanvasId, announcement, true)];
    });
    if (upserts.length > 0) {
      await ctx.runMutation(internal.storeCourseMeta.upsertDiscussions, {
        userId,
        discussions: upserts,
      });
    }
  }
}

async function syncCalendarEvents(
  ctx: ActionCtx,
  userId: string,
  client: CanvasClient,
  session: CanvasSession,
  courseIds: number[],
): Promise<void> {
  const contextCodes = courseIds.map((id) => `course_${id}`);
  if (session.credential.canvasUserId !== undefined) {
    contextCodes.push(`user_${session.credential.canvasUserId}`);
  }
  const startDate = new Date(Date.now() - 7 * DAY_MS).toISOString();
  const endDate = new Date(Date.now() + 120 * DAY_MS).toISOString();

  for (const chunk of chunked(contextCodes, CONTEXT_CODE_CHUNK)) {
    const events = await client.getPaginated<CanvasCalendarEvent>(
      "/calendar_events",
      {
        type: "event",
        "context_codes[]": chunk,
        start_date: startDate,
        end_date: endDate,
      },
    );
    const upserts: CalendarEventUpsert[] = events.flatMap((event) => {
      const startAt = toMillis(event.start_at);
      if (startAt === undefined) return [];
      return [
        {
          canvasId: event.id,
          contextCode: event.context_code,
          title: event.title,
          description: event.description ?? undefined,
          startAt,
          endAt: toMillis(event.end_at),
          allDay: event.all_day,
          location: event.location_name ?? undefined,
        },
      ];
    });
    if (upserts.length > 0) {
      await ctx.runMutation(internal.syncStore.upsertCalendarEvents, {
        userId,
        events: upserts,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers

async function handleSyncError(
  ctx: ActionCtx,
  userId: string,
  error: unknown,
): Promise<void> {
  if (error instanceof CanvasAuthError) {
    // Token revoked or expired (UW-issued manual tokens live max 120 days).
    // Mark invalid so dispatchers skip this user until reconnect; do not
    // rethrow, retrying an invalid token is pointless.
    await ctx.runMutation(internal.credentials.markInvalid, { userId });
    await ctx.runMutation(internal.syncStore.setSyncStatus, {
      userId,
      status: "error",
      lastError: "Canvas rejected the token. Reconnect in Settings.",
    });
    return;
  }
  await ctx.runMutation(internal.syncStore.setSyncStatus, {
    userId,
    status: "error",
    lastError: error instanceof Error ? error.message : String(error),
  });
  // Rethrow so the Workpool retries with backoff (covers transient Canvas
  // 5xx and rate-limit errors).
  throw error;
}

/**
 * The ordered ids of the nav tabs the instructor left visible. Canvas does
 * not honour `include[]=tabs` on the course *list* endpoint on every
 * instance, so fall back to the per-course endpoint — it is a small,
 * uncached-but-cheap request and only runs on a full sync.
 */
async function courseTabIds(
  client: CanvasClient,
  course: CanvasCourse,
): Promise<string[] | undefined> {
  const inline = inlineCourseTabIds(course);
  if (inline !== undefined) return inline;
  const tabs = await tolerateDisabledTab<CanvasTab[] | undefined>(
    () => client.getPaginated<CanvasTab>(`/courses/${course.id}/tabs`),
    undefined,
  );
  if (tabs === undefined) return undefined;
  return visibleTabIds(tabs);
}

function inlineCourseTabIds(course: CanvasCourse): string[] | undefined {
  return Array.isArray(course.tabs) ? visibleTabIds(course.tabs) : undefined;
}

function visibleTabIds(tabs: CanvasTab[]): string[] {
  return tabs
    .filter((tab) => tab.hidden !== true)
    .sort((a, b) => a.position - b.position)
    .map((tab) => tab.id);
}

/**
 * The course list endpoint does not reliably honour `include[]=syllabus_body`
 * (UW's instance returns none), so fall back to the single-course endpoint
 * when the list left it out. One small request per active course, full
 * sync only.
 */
async function courseSyllabus(
  client: CanvasClient,
  course: CanvasCourse,
): Promise<string | undefined> {
  if (course.syllabus_body) return course.syllabus_body;
  const full = await tolerateDisabledTab<CanvasCourse | undefined>(
    () =>
      client.get<CanvasCourse>(`/courses/${course.id}`, {
        "include[]": ["syllabus_body"],
      }),
    undefined,
  );
  return full?.syllabus_body ?? undefined;
}

async function courseInstructors(
  client: CanvasClient,
  courseCanvasId: number,
): Promise<NonNullable<CourseUpsert["instructors"]>> {
  const users = await tolerateDisabledTab(
    () =>
      client.getPaginated<CanvasUser>(`/courses/${courseCanvasId}/users`, {
        "enrollment_type[]": ["teacher", "ta"],
        "include[]": ["email", "enrollments"],
      }),
    [],
  );
  // Canvas enrollment types are "TeacherEnrollment" / "TaEnrollment"; a
  // user with both counts as a teacher.
  return users
    .map((user) => {
      const types = new Set(
        user.enrollments?.map((enrollment) => enrollment.type),
      );
      return {
        name: user.name,
        email: user.email ?? undefined,
        role:
          !types.has("TeacherEnrollment") && types.has("TaEnrollment")
            ? ("ta" as const)
            : ("teacher" as const),
      };
    })
    .sort((a, b) => Number(a.role === "ta") - Number(b.role === "ta"))
    .slice(0, 8);
}

function mapCourse(
  course: CanvasCourse,
  tabs: string[] | undefined,
  enrollmentState: "active" | "completed",
  instructors: CourseUpsert["instructors"],
): CourseUpsert {
  // Only the student enrollment's totals are ours to show; a TA or designer
  // enrollment on the same course reports someone else's (or no) scores.
  const enrollment = course.enrollments?.find(
    (candidate) => candidate.type === "student",
  );
  const hideFinalGrades = course.hide_final_grades === true;
  return {
    canvasId: course.id,
    name: course.name ?? "Untitled course",
    courseCode: course.course_code ?? "",
    term: course.term?.name,
    termId: course.term?.id,
    termStartAt: toMillis(course.term?.start_at),
    termEndAt: toMillis(course.term?.end_at),
    startAt: toMillis(course.start_at),
    endAt: toMillis(course.end_at),
    isFavorite: course.is_favorite,
    defaultView: course.default_view,
    tabs,
    syllabusBody: course.syllabus_body ?? undefined,
    imageUrl: course.image_download_url ?? undefined,
    enrollmentState,
    instructors,
    currentScore: hideFinalGrades
      ? undefined
      : (enrollment?.computed_current_score ?? undefined),
    currentGrade: hideFinalGrades
      ? undefined
      : (enrollment?.computed_current_grade ?? undefined),
    finalScore: hideFinalGrades
      ? undefined
      : (enrollment?.computed_final_score ?? undefined),
    finalGrade: hideFinalGrades
      ? undefined
      : (enrollment?.computed_final_grade ?? undefined),
    hideFinalGrades: course.hide_final_grades,
    applyAssignmentGroupWeights: course.apply_assignment_group_weights,
  };
}

function mapAssignment(
  assignment: CanvasAssignment,
  supplementalSubmission?: CanvasSubmission,
): AssignmentUpsert {
  const submission = assignment.submission
    ? {
        ...assignment.submission,
        submission_comments:
          supplementalSubmission?.submission_comments ??
          assignment.submission.submission_comments,
      }
    : supplementalSubmission;
  return {
    canvasId: assignment.id,
    name: assignment.name,
    description: assignment.description ?? undefined,
    dueAt: toMillis(assignment.due_at),
    unlockAt: toMillis(assignment.unlock_at),
    lockAt: toMillis(assignment.lock_at),
    pointsPossible: assignment.points_possible ?? undefined,
    gradingType: assignment.grading_type,
    assignmentGroupCanvasId: assignment.assignment_group_id,
    position: assignment.position,
    htmlUrl: assignment.html_url,
    submissionTypes: assignment.submission_types ?? [],
    quizCanvasId: assignment.quiz_id,
    discussionCanvasId: assignment.discussion_topic?.id,
    lockedForUser: assignment.locked_for_user,
    omitFromFinalGrade: assignment.omit_from_final_grade,
    submission: submission ? mapSubmission(submission) : undefined,
    scoreStatistics: assignment.score_statistics
      ? {
          min: assignment.score_statistics.min,
          max: assignment.score_statistics.max,
          mean: assignment.score_statistics.mean,
          median: assignment.score_statistics.median ?? undefined,
          lowerQuartile: assignment.score_statistics.lower_q ?? undefined,
          upperQuartile: assignment.score_statistics.upper_q ?? undefined,
        }
      : undefined,
    canvasCreatedAt: toMillis(assignment.created_at),
    canvasUpdatedAt: toMillis(assignment.updated_at),
  };
}

function mapSubmission(submission: CanvasSubmission) {
  return {
    submittedAt: toMillis(submission.submitted_at),
    workflowState: submission.workflow_state,
    score: submission.score ?? undefined,
    grade: submission.grade ?? undefined,
    late: submission.late,
    missing: submission.missing,
    postedAt: toMillis(submission.posted_at),
    comments: submission.submission_comments?.flatMap((comment) => {
      const createdAt = toMillis(comment.created_at);
      if (createdAt === undefined) return [];
      return [
        {
          authorName: comment.author_name,
          comment: comment.comment,
          createdAt,
        },
      ];
    }),
  };
}

function parseContextCourseId(
  contextCode: string | undefined,
): number | undefined {
  if (contextCode === undefined || !contextCode.startsWith("course_")) {
    return undefined;
  }
  const id = Number.parseInt(contextCode.slice("course_".length), 10);
  return Number.isNaN(id) ? undefined : id;
}

function chunked<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
