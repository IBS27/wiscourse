// The "New" feed: announcements, posted grades, and newly appeared
// assignments, in one chronological list with per-item seen state.
//
// Seen semantics reuse `seenState`: an announcement is seen once a row
// exists; an assignment is seen once a row exists, and becomes unseen
// again when a grade posts with a `postedAt` the student has not seen
// (`seenVersion`). "New assignment" therefore means: created in Canvas
// recently (`canvasCreatedAt`, not our sync time) and no seen row at all.

import { v, type Infer } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { getSeenSet, gradeVersion, upsertSeen } from "./seenState";
import { DAY_MS } from "./lib/time";

const ANNOUNCEMENT_WINDOW_MS = 30 * DAY_MS;
const GRADE_WINDOW_MS = 30 * DAY_MS;
const NEW_ASSIGNMENT_WINDOW_MS = 7 * DAY_MS;

export const feedItem = v.object({
  key: v.string(),
  type: v.union(
    v.literal("announcement"),
    v.literal("grade"),
    v.literal("assignment"),
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
  pointsPossible: v.optional(v.number()),
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

export const feed = query({
  args: {},
  returns: v.array(feedItem),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return [];
    const userId = identity.subject;
    const now = Date.now();
    const items: FeedItem[] = [];

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
      if (a.postedAt === undefined) continue;
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
    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
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
          seen: seen?.seenVersion === version,
          seenVersion: version,
          htmlUrl: a.htmlUrl,
          score: a.submission?.score,
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

    return items.sort((x, y) => y.at - x.at);
  },
});

export const markAllSeen = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    const upsert = (
      kind: "assignment" | "discussion",
      canvasId: number,
      seenVersion: string | undefined,
    ) => upsertSeen(ctx, userId, kind, canvasId, seenVersion);

    const announcements = await ctx.db
      .query("discussions")
      .withIndex("by_user_announcement_postedAt", (q) =>
        q
          .eq("userId", userId)
          .eq("isAnnouncement", true)
          .gte("postedAt", now - ANNOUNCEMENT_WINDOW_MS),
      )
      .collect();
    for (const a of announcements) await upsert("discussion", a.canvasId, undefined);

    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const a of assignments) {
      const postedAt = a.submission?.postedAt;
      const isNew =
        a.canvasCreatedAt !== undefined && a.canvasCreatedAt >= now - NEW_ASSIGNMENT_WINDOW_MS;
      const hasGrade = postedAt !== undefined && postedAt >= now - GRADE_WINDOW_MS;
      if (!isNew && !hasGrade) continue;
      await upsert(
        "assignment",
        a.canvasId,
        postedAt === undefined ? undefined : gradeVersion(postedAt),
      );
    }
    return null;
  },
});
