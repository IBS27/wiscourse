// Per-user settings: the display time zone and the ICS feed.
//
// The feed secret is a bearer capability. It never appears in a URL the
// server logs beyond the HTTP route, and regenerating it is the only way to
// revoke a link that leaked.

import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireUserId } from "./lib/auth";
import { isValidTimeZone, CAMPUS_TIME_ZONE, dayKeyIn } from "./lib/zones";
import { expandMeetings, MEETING_KIND_LABELS } from "./lib/meetings";
import { buildIcs, type IcsEvent } from "./lib/ics";
import { buildList } from "./todos";
import { classifyCourses } from "./lib/terms";
import { DAY_MS } from "./lib/time";

const icsInclude = v.object({
  meetings: v.boolean(),
  due: v.boolean(),
  planned: v.boolean(),
  events: v.boolean(),
});
const DEFAULT_INCLUDE = { meetings: true, due: true, planned: true, events: true };

// The feed covers two weeks back and the rest of the term (or four months).
const FEED_PAST_MS = 14 * DAY_MS;
const FEED_FUTURE_MS = 120 * DAY_MS;

async function getPrefs(ctx: QueryCtx | MutationCtx, userId: string): Promise<Doc<"userPrefs"> | null> {
  return await ctx.db
    .query("userPrefs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

async function ensurePrefs(ctx: MutationCtx, userId: string): Promise<Doc<"userPrefs">> {
  const existing = await getPrefs(ctx, userId);
  if (existing !== null) return existing;
  const id = await ctx.db.insert("userPrefs", { userId });
  return (await ctx.db.get(id))!;
}

function newSecret(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

export const get = query({
  args: {},
  returns: v.union(
    v.object({
      timeZone: v.optional(v.string()),
      icsSecret: v.optional(v.string()),
      icsInclude,
      icsLastFetchedAt: v.optional(v.number()),
      icsLastFetchedBy: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const row = await getPrefs(ctx, identity.subject);
    return {
      timeZone: row?.timeZone,
      icsSecret: row?.icsSecret,
      icsInclude: row?.icsInclude ?? DEFAULT_INCLUDE,
      icsLastFetchedAt: row?.icsLastFetchedAt,
      icsLastFetchedBy: row?.icsLastFetchedBy,
    };
  },
});

/** `null` clears the override (times follow the browser again). */
export const setTimeZone = mutation({
  args: { timeZone: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (args.timeZone !== null && !isValidTimeZone(args.timeZone)) {
      throw new Error("Unknown time zone");
    }
    const row = await ensurePrefs(ctx, userId);
    await ctx.db.patch(row._id, { timeZone: args.timeZone ?? undefined });
    return null;
  },
});

export const setIcsInclude = mutation({
  args: { include: icsInclude },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const row = await ensurePrefs(ctx, userId);
    await ctx.db.patch(row._id, { icsInclude: args.include });
    return null;
  },
});

/** Creates the feed on first call; afterwards every old link stops working. */
export const regenerateIcs = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const row = await ensurePrefs(ctx, userId);
    const icsSecret = newSecret();
    await ctx.db.patch(row._id, {
      icsSecret,
      icsInclude: row.icsInclude ?? DEFAULT_INCLUDE,
      icsLastFetchedAt: undefined,
      icsLastFetchedBy: undefined,
    });
    return icsSecret;
  },
});

export const disableIcs = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const row = await getPrefs(ctx, userId);
    if (row !== null) {
      await ctx.db.patch(row._id, {
        icsSecret: undefined,
        icsLastFetchedAt: undefined,
        icsLastFetchedBy: undefined,
      });
    }
    return null;
  },
});

// ── The feed itself (called from convex/http.ts) ─────────────────────────

export const recordIcsFetch = internalMutation({
  args: { secret: v.string(), userAgent: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("userPrefs")
      .withIndex("by_icsSecret", (q) => q.eq("icsSecret", args.secret))
      .unique();
    if (row === null) return null;
    await ctx.db.patch(row._id, {
      icsLastFetchedAt: Date.now(),
      icsLastFetchedBy: args.userAgent === undefined ? undefined : clientName(args.userAgent),
    });
    return null;
  },
});

/** "Apple Calendar", "Google Calendar", "Outlook", or the raw agent's first word. */
function clientName(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes("dataaccessd") || ua.includes("calendaragent") || ua.includes("ical")) return "Apple Calendar";
  if (ua.includes("google")) return "Google Calendar";
  if (ua.includes("outlook") || ua.includes("microsoft")) return "Outlook";
  if (ua.includes("thunderbird")) return "Thunderbird";
  return userAgent.split(/[\s/]/)[0] || "a calendar app";
}

/** The rendered .ics for a secret, or null when no feed has it. */
export const icsFeed = internalQuery({
  args: { secret: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const prefs = await ctx.db
      .query("userPrefs")
      .withIndex("by_icsSecret", (q) => q.eq("icsSecret", args.secret))
      .unique();
    if (prefs === null) return null;
    const userId = prefs.userId;
    const include = prefs.icsInclude ?? DEFAULT_INCLUDE;
    const now = Date.now();
    const from = now - FEED_PAST_MS;
    const to = now + FEED_FUTURE_MS;

    const courses = await ctx.db
      .query("courses")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const coursePrefs = await ctx.db
      .query("coursePrefs")
      .withIndex("by_user_course", (q) => q.eq("userId", userId))
      .collect();
    const hidden = new Set(coursePrefs.filter((p) => p.hidden === true).map((p) => p.courseCanvasId));
    const nickname = new Map(coursePrefs.map((p) => [p.courseCanvasId, p.nickname]));
    const sets = classifyCourses(courses, now);
    const shown = [...sets.current, ...sets.other].filter((c) => !hidden.has(c.canvasId));
    const byId = new Map(shown.map((c) => [c.canvasId, c]));
    const label = (courseCanvasId: number | undefined): string | undefined => {
      if (courseCanvasId === undefined) return undefined;
      const course = byId.get(courseCanvasId);
      if (course === undefined) return undefined;
      const nick = nickname.get(courseCanvasId);
      if (nick !== undefined && nick !== "") return nick;
      const code = course.courseCode.trim();
      return code !== "" && code.length <= 14 ? code : course.name;
    };

    const events: IcsEvent[] = [];

    if (include.meetings) {
      const meetings = await ctx.db
        .query("courseMeetings")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      const occurrences = expandMeetings(
        meetings.filter((m) => byId.has(m.courseCanvasId)),
        from,
        to,
        (id) => {
          const c = byId.get(id);
          return c === undefined ? undefined : { startAt: c.termStartAt ?? c.startAt, endAt: c.termEndAt ?? c.endAt };
        },
      );
      for (const o of occurrences) {
        const kind = MEETING_KIND_LABELS[o.kind];
        events.push({
          uid: `meeting-${o.meetingId}-${o.day}@wiscourse`,
          title: [label(o.courseCanvasId), o.label ?? kind].filter(Boolean).join(" "),
          startAt: o.startAt,
          endAt: o.endAt,
          location: o.location,
        });
      }
    }

    if (include.due || include.planned) {
      const items = await buildList(ctx, userId, { from, to });
      for (const item of items) {
        // A hidden or past course stays out of the feed, like everywhere else.
        if (item.courseCanvasId !== undefined && !byId.has(item.courseCanvasId)) continue;
        const course = label(item.courseCanvasId);
        const title = course === undefined ? item.title : `${course}: ${item.title}`;
        const done = item.doneAt !== undefined;
        if (include.due && item.dueAt !== undefined && item.dueAt >= from && item.dueAt < to) {
          events.push({
            uid: `due-${item.key}@wiscourse`,
            title: done ? `✓ ${title}` : `Due: ${title}`,
            startAt: item.dueAt,
            endAt: item.dueAt,
            url: item.htmlUrl,
            description: item.pointsPossible === undefined ? undefined : `${item.pointsPossible} points`,
          });
        }
        if (include.planned && item.plannedDay !== undefined && !done) {
          events.push({
            uid: `plan-${item.key}@wiscourse`,
            title: `Plan: ${title}`,
            startAt: 0,
            allDayKey: item.plannedDay,
            url: item.htmlUrl,
          });
        }
      }
    }

    if (include.events) {
      const rows = await ctx.db
        .query("calendarEvents")
        .withIndex("by_user_startAt", (q) => q.eq("userId", userId).gte("startAt", from).lt("startAt", to))
        .collect();
      for (const row of rows) {
        const courseId =
          row.courseCanvasId ??
          (row.contextCode?.startsWith("course_") ? Number(row.contextCode.slice(7)) : undefined);
        if (courseId !== undefined && row.source === "canvas" && !byId.has(courseId)) continue;
        const course = label(courseId);
        events.push({
          uid: `event-${row._id}@wiscourse`,
          title: course === undefined ? row.title : `${course}: ${row.title}`,
          startAt: row.startAt,
          endAt: row.endAt,
          allDayKey: row.allDay === true ? dayKeyIn(row.startAt, CAMPUS_TIME_ZONE) : undefined,
          allDayEndKey:
            row.allDay === true && row.endAt !== undefined
              ? dayKeyIn(row.endAt, CAMPUS_TIME_ZONE)
              : undefined,
          location: row.location,
          description: row.description === undefined ? undefined : stripHtml(row.description),
          updatedAt: row.syncedAt,
        });
      }
    }

    return buildIcs(events, "wiscourse", now);
  },
});

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 2000);
}
