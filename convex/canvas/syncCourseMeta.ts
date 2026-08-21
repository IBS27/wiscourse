// Per-course Canvas metadata: assignment groups, grading periods, quizzes
// and discussions. A pure helper module — no registered Convex functions —
// called from sync.ts once per course. Requests are sequential, as
// everywhere in the sync layer.
//
// Request budget per course (excluding pagination, which only kicks in past
// 100 rows of a kind):
//   full  — 5: assignment_groups, grading_periods, quizzes,
//            discussion_topics, discussion_topics?only_announcements
//   delta — 1: discussion_topics?order_by=recent_activity
// Announcements on a delta come from one cross-course /announcements call
// per 10 courses, issued by sync.ts rather than from here.
//
// Any of these tabs can be switched off by the instructor, which Canvas
// reports as 401/403 (and 404 for grading periods on accounts without
// them). That is a normal, permanent state for a course, not an error: we
// treat it as an empty set and let the full sync prune. Rate-limit and
// token errors must still propagate.

import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { tolerateDisabledTab, type CanvasClient } from "./client";
import {
  toMillis,
  type CanvasAssignmentGroup,
  type CanvasDiscussionTopic,
  type CanvasGradingPeriod,
  type CanvasQuiz,
} from "./types";
import type {
  AssignmentGroupUpsert,
  DiscussionUpsert,
  GradingPeriodUpsert,
  QuizUpsert,
} from "../storeCourseMeta";

export type CourseMetaOptions =
  | { full: true }
  | { full: false; sinceMs: number };

export async function syncCourseMeta(
  ctx: ActionCtx,
  userId: string,
  client: CanvasClient,
  courseCanvasId: number,
  opts: CourseMetaOptions,
): Promise<void> {
  if (opts.full) {
    await syncAssignmentGroups(ctx, userId, client, courseCanvasId);
    await syncGradingPeriods(ctx, userId, client, courseCanvasId);
    await syncQuizzes(ctx, userId, client, courseCanvasId);
    await syncDiscussionsFull(ctx, userId, client, courseCanvasId);
    return;
  }
  await syncDiscussionsDelta(ctx, userId, client, courseCanvasId, opts.sinceMs);
}

// ---------------------------------------------------------------------------
// Assignment groups (full sync only — weights and drop rules change rarely)

async function syncAssignmentGroups(
  ctx: ActionCtx,
  userId: string,
  client: CanvasClient,
  courseCanvasId: number,
): Promise<void> {
  const groups = await tolerateDisabledTab(
    () =>
      client.getPaginated<CanvasAssignmentGroup>(
        `/courses/${courseCanvasId}/assignment_groups`,
      ),
    [],
  );
  const upserts: AssignmentGroupUpsert[] = groups.map((group) => ({
    canvasId: group.id,
    name: group.name,
    position: group.position,
    groupWeight: group.group_weight,
    dropLowest: group.rules?.drop_lowest,
    dropHighest: group.rules?.drop_highest,
    neverDrop: group.rules?.never_drop,
  }));
  await ctx.runMutation(internal.storeCourseMeta.upsertAssignmentGroups, {
    userId,
    courseCanvasId,
    groups: upserts,
    prune: true,
  });
}

// ---------------------------------------------------------------------------
// Grading periods (full sync only)

async function syncGradingPeriods(
  ctx: ActionCtx,
  userId: string,
  client: CanvasClient,
  courseCanvasId: number,
): Promise<void> {
  // Not a paginated list: the response is an object wrapping the array.
  // Most UW courses have no grading periods at all.
  const response = await tolerateDisabledTab(
    () =>
      client.get<{ grading_periods?: CanvasGradingPeriod[] }>(
        `/courses/${courseCanvasId}/grading_periods`,
      ),
    { grading_periods: [] },
  );
  const upserts: GradingPeriodUpsert[] = (response.grading_periods ?? []).flatMap(
    (period) => {
      const startAt = toMillis(period.start_date);
      const endAt = toMillis(period.end_date);
      if (startAt === undefined || endAt === undefined) return [];
      return [
        {
          canvasId: period.id,
          title: period.title,
          startAt,
          endAt,
          weight: period.weight ?? undefined,
        },
      ];
    },
  );
  await ctx.runMutation(internal.storeCourseMeta.upsertGradingPeriods, {
    userId,
    courseCanvasId,
    periods: upserts,
    prune: true,
  });
}

// ---------------------------------------------------------------------------
// Quizzes (full sync only; a quiz's gradeable state rides on its assignment,
// which the delta sync already refreshes through submissions)

async function syncQuizzes(
  ctx: ActionCtx,
  userId: string,
  client: CanvasClient,
  courseCanvasId: number,
): Promise<void> {
  const quizzes = await tolerateDisabledTab(
    () => client.getPaginated<CanvasQuiz>(`/courses/${courseCanvasId}/quizzes`),
    [],
  );
  const upserts: QuizUpsert[] = quizzes.map((quiz) => ({
    canvasId: quiz.id,
    title: quiz.title,
    description: quiz.description ?? undefined,
    quizType: quiz.quiz_type,
    dueAt: toMillis(quiz.due_at),
    unlockAt: toMillis(quiz.unlock_at),
    lockAt: toMillis(quiz.lock_at),
    pointsPossible: quiz.points_possible ?? undefined,
    timeLimitMinutes: quiz.time_limit ?? undefined,
    allowedAttempts: quiz.allowed_attempts,
    questionCount: quiz.question_count,
    assignmentCanvasId: quiz.assignment_id ?? undefined,
    htmlUrl: quiz.html_url,
    lockedForUser: quiz.locked_for_user,
  }));
  await ctx.runMutation(internal.storeCourseMeta.upsertQuizzes, {
    userId,
    courseCanvasId,
    quizzes: upserts,
    prune: true,
  });
}

// ---------------------------------------------------------------------------
// Discussions + announcements (one table, distinguished by isAnnouncement)

async function syncDiscussionsFull(
  ctx: ActionCtx,
  userId: string,
  client: CanvasClient,
  courseCanvasId: number,
): Promise<void> {
  const topics = await tolerateDisabledTab(
    () =>
      client.getPaginated<CanvasDiscussionTopic>(
        `/courses/${courseCanvasId}/discussion_topics`,
        { "include[]": ["all_dates"] },
      ),
    [],
  );
  const announcements = await tolerateDisabledTab(
    () =>
      client.getPaginated<CanvasDiscussionTopic>(
        `/courses/${courseCanvasId}/discussion_topics`,
        { only_announcements: true },
      ),
    [],
  );

  const upserts: DiscussionUpsert[] = [
    ...topics
      .filter((topic) => topic.is_announcement !== true)
      .map((topic) => mapDiscussion(courseCanvasId, topic, false)),
    ...announcements.map((topic) => mapDiscussion(courseCanvasId, topic, true)),
  ];
  await ctx.runMutation(internal.storeCourseMeta.upsertDiscussions, {
    userId,
    discussions: upserts,
    pruneCourseCanvasId: courseCanvasId,
  });
}

async function syncDiscussionsDelta(
  ctx: ActionCtx,
  userId: string,
  client: CanvasClient,
  courseCanvasId: number,
  sinceMs: number,
): Promise<void> {
  // The topics endpoint has no `since` filter, so sort by recent activity
  // and keep only what moved inside the window. One page is enough by
  // construction: anything touched since the last delta sorts to the front.
  const topics = await tolerateDisabledTab(
    () =>
      client.get<CanvasDiscussionTopic[]>(
        `/courses/${courseCanvasId}/discussion_topics`,
        { order_by: "recent_activity", per_page: 100 },
      ),
    [],
  );
  const upserts: DiscussionUpsert[] = topics
    .filter((topic) => {
      if (topic.is_announcement === true) return false;
      const activity = Math.max(
        toMillis(topic.last_reply_at) ?? 0,
        toMillis(topic.posted_at) ?? 0,
      );
      return activity > sinceMs;
    })
    .map((topic) => mapDiscussion(courseCanvasId, topic, false));
  if (upserts.length === 0) return;
  await ctx.runMutation(internal.storeCourseMeta.upsertDiscussions, {
    userId,
    discussions: upserts,
  });
}

export function mapDiscussion(
  courseCanvasId: number,
  topic: CanvasDiscussionTopic,
  isAnnouncement: boolean,
): DiscussionUpsert {
  return {
    courseCanvasId,
    canvasId: topic.id,
    title: topic.title,
    message: topic.message ?? undefined,
    isAnnouncement,
    postedAt: toMillis(topic.posted_at),
    lastReplyAt: toMillis(topic.last_reply_at),
    dueAt: toMillis(topic.assignment?.due_at),
    assignmentCanvasId: topic.assignment_id ?? undefined,
    authorName: topic.user_name ?? topic.author?.display_name ?? undefined,
    unreadCount: topic.unread_count,
    readState: topic.read_state,
    locked: topic.locked,
    pinned: topic.pinned,
    htmlUrl: topic.html_url,
  };
}

// ---------------------------------------------------------------------------

