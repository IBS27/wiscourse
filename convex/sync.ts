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
// Request budget, unpaginated: per course ~11 on a full sync (1 assignments,
// up to 1 tabs, 5 metadata, 4 content) and 4 on a delta (2 submissions, 1
// discussions, 1 modules). Per user on top of that: 1 courses list and one
// calendar (full) or announcements (delta) call per 10 courses. A 6-course student therefore costs ~70 requests nightly and
// ~26 per delta — well inside a single token's budget.
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

  const rawCourses = await client.getPaginated<CanvasCourse>("/courses", {
    enrollment_state: "active",
    "include[]": [
      "term",
      "favorites",
      "syllabus_body",
      "course_image",
      "tabs",
      "total_scores",
    ],
  });
  const courses = rawCourses.filter(
    (course) => course.name !== undefined && !course.access_restricted_by_date,
  );

  const courseUpserts: CourseUpsert[] = [];
  for (const course of courses) {
    courseUpserts.push(mapCourse(course, await courseTabIds(client, course)));
  }
  await ctx.runMutation(internal.syncStore.upsertCourses, {
    userId,
    courses: courseUpserts,
  });

  for (const course of courses) {
    // include[]=submission returns the calling student's own submission
    // inline — no separate submissions pass needed.
    const assignments = await client.getPaginated<CanvasAssignment>(
      `/courses/${course.id}/assignments`,
      { "include[]": ["submission"], order_by: "due_at" },
    );
    await ctx.runMutation(internal.syncStore.upsertAssignments, {
      userId,
      courseCanvasId: course.id,
      assignments: assignments.map(mapAssignment),
      prune: true,
    });

    await syncCourseMeta(ctx, userId, client, course.id, { full: true });
    await syncCourseContent(ctx, userId, client, course.id, { full: true });
  }

  // Announcements come from the per-course pass above on a full sync; only
  // the genuinely cross-course endpoints are left here.
  const courseIds = courses.map((course) => course.id);
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
    const submitted = await client.getPaginated<CanvasSubmission>(
      `/courses/${courseId}/students/submissions`,
      { "student_ids[]": ["self"], submitted_since: sinceIso },
    );
    const graded = await client.getPaginated<CanvasSubmission>(
      `/courses/${courseId}/students/submissions`,
      { "student_ids[]": ["self"], graded_since: sinceIso },
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
  const inline = course.tabs;
  const tabs = Array.isArray(inline)
    ? inline
    : await tolerateDisabledTab<CanvasTab[] | undefined>(
        () => client.getPaginated<CanvasTab>(`/courses/${course.id}/tabs`),
        undefined,
      );
  if (tabs === undefined) return undefined;
  return tabs
    .filter((tab) => tab.hidden !== true)
    .sort((a, b) => a.position - b.position)
    .map((tab) => tab.id);
}

function mapCourse(
  course: CanvasCourse,
  tabs: string[] | undefined,
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
    startAt: toMillis(course.start_at),
    endAt: toMillis(course.end_at),
    isFavorite: course.is_favorite,
    defaultView: course.default_view,
    tabs,
    syllabusBody: course.syllabus_body ?? undefined,
    imageUrl: course.image_download_url ?? undefined,
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

function mapAssignment(assignment: CanvasAssignment): AssignmentUpsert {
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
    submission: assignment.submission
      ? mapSubmission(assignment.submission)
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
