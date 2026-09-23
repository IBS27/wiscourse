// Ask: the chat surface. Messages and streams live in the agent component;
// `assistantThreads` is the student's list of chats. Sending saves the
// student's message here, then schedules `assistantAgent.respond`, which
// streams the reply back through the component. The UI never talks to the
// model directly and never sees another user's thread.

import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import {
  abortStream,
  createThread,
  listStreams,
  listUIMessages,
  saveMessage,
  syncStreams,
  vStreamArgs,
} from "@convex-dev/agent";
import { components, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { isValidTimeZone } from "./lib/zones";
import {
  MAX_PROMPT_CHARS,
  assertAllowance,
  requireCourse,
  requireThread,
  threadOf,
  turnInProgress,
  usageDay,
} from "./lib/assistant";

const MAX_TITLE_CHARS = 80;
const MAX_THREADS_LISTED = 300;

const threadSummary = v.object({
  threadId: v.string(),
  title: v.string(),
  courseCanvasId: v.optional(v.number()),
  lastMessageAt: v.number(),
  archivedAt: v.optional(v.number()),
  runningSince: v.optional(v.number()),
  error: v.optional(v.string()),
});

function summary(row: Doc<"assistantThreads">) {
  return {
    threadId: row.threadId,
    title: row.title,
    courseCanvasId: row.courseCanvasId,
    lastMessageAt: row.lastMessageAt,
    archivedAt: row.archivedAt,
    runningSince: row.runningSince,
    error: row.error,
  };
}

function fail(message: string): never {
  throw new ConvexError(message);
}

/** First words of the message, until a real title is generated. */
function provisionalTitle(prompt: string): string {
  const oneLine = prompt.replace(/\s+/g, " ").trim();
  return oneLine.length <= 60 ? oneLine : `${oneLine.slice(0, 57).trimEnd()}…`;
}

// ── Reads ─────────────────────────────────────────────────────────────────

/** The student's chats, newest activity first. Archived ones included. */
export const threads = query({
  args: {},
  returns: v.array(threadSummary),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return [];
    const rows = await ctx.db
      .query("assistantThreads")
      .withIndex("by_user_lastMessageAt", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .take(MAX_THREADS_LISTED);
    return rows.map(summary);
  },
});

export const thread = query({
  args: { threadId: v.string() },
  returns: v.union(threadSummary, v.null()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const row = await threadOf(ctx, identity.subject, args.threadId);
    return row === null ? null : summary(row);
  },
});

/** Messages plus live stream deltas, in the shape `useUIMessages` expects. */
export const messages = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const row = identity === null ? null : await threadOf(ctx, identity.subject, args.threadId);
    if (row === null) {
      return { page: [], isDone: true, continueCursor: "", streams: undefined };
    }
    const paginated = await listUIMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
    });
    const streams = await syncStreams(ctx, components.agent, {
      threadId: args.threadId,
      streamArgs: args.streamArgs,
    });
    return { ...paginated, streams };
  },
});

// ── Writes ────────────────────────────────────────────────────────────────

/**
 * Send a message, starting a chat when `threadId` is omitted. Returns the
 * thread id. `courseCanvasId` scopes the chat to a course (`null` clears).
 */
export const send = mutation({
  args: {
    threadId: v.optional(v.string()),
    prompt: v.string(),
    courseCanvasId: v.optional(v.union(v.number(), v.null())),
    timeZone: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const prompt = args.prompt.trim();
    if (prompt === "") fail("Write a message first");
    if (prompt.length > MAX_PROMPT_CHARS) fail(`Keep messages under ${MAX_PROMPT_CHARS.toLocaleString()} characters`);

    const now = Date.now();
    await assertAllowance(ctx, userId, now);
    if (typeof args.courseCanvasId === "number") await requireCourse(ctx, userId, args.courseCanvasId);
    const timeZone = args.timeZone !== undefined && isValidTimeZone(args.timeZone) ? args.timeZone : undefined;

    let row: Doc<"assistantThreads">;
    if (args.threadId !== undefined) {
      row = await requireThread(ctx, userId, args.threadId);
      if (await turnInProgress(ctx, row, now)) fail("Ask is still replying. Wait for it to finish or stop it.");
    } else {
      const title = provisionalTitle(prompt);
      const threadId = await createThread(ctx, components.agent, { userId, title });
      const id = await ctx.db.insert("assistantThreads", {
        userId,
        threadId,
        title,
        titled: false,
        courseCanvasId: args.courseCanvasId ?? undefined,
        lastMessageAt: now,
      });
      row = (await ctx.db.get(id))!;
    }

    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId: row.threadId,
      userId,
      prompt,
    });
    const turnJobId = await ctx.scheduler.runAfter(0, internal.assistantAgent.respond, {
      threadId: row.threadId,
      userId,
      promptMessageId: messageId,
      turn: now,
      timeZone: timeZone ?? row.timeZone,
      titleFrom: row.titled ? undefined : prompt,
    });
    await ctx.db.patch(row._id, {
      lastMessageAt: now,
      archivedAt: undefined, // writing in an archived chat brings it back
      runningSince: now,
      turnJobId,
      stopRequested: undefined,
      error: undefined,
      promptMessageId: messageId,
      timeZone: timeZone ?? row.timeZone,
      ...(args.courseCanvasId !== undefined && { courseCanvasId: args.courseCanvasId ?? undefined }),
    });
    return row.threadId;
  },
});

/**
 * Stop the running reply. Text being streamed aborts at its next chunk; a
 * reply between steps (waiting on a tool) stops before the next model call.
 */
export const stop = mutation({
  args: { threadId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const row = await requireThread(ctx, userId, args.threadId);
    if (row.runningSince === undefined) return null;
    if (!(await turnInProgress(ctx, row, Date.now()))) {
      // The reply already died without clearing its state; unlock the chat.
      await ctx.db.patch(row._id, { runningSince: undefined, turnJobId: undefined, stopRequested: undefined });
      return null;
    }
    await ctx.db.patch(row._id, { stopRequested: true });
    const streams = await listStreams(ctx, components.agent, {
      threadId: row.threadId,
      includeStatuses: ["streaming"],
    });
    for (const stream of streams) {
      await abortStream(ctx, components.agent, { streamId: stream.streamId, reason: "Stopped" });
    }
    return null;
  },
});

/** Run the last message again after a failed or stopped reply. */
export const retry = mutation({
  args: { threadId: v.string(), timeZone: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const row = await requireThread(ctx, userId, args.threadId);
    const now = Date.now();
    if (await turnInProgress(ctx, row, now)) fail("Ask is still replying");
    if (row.promptMessageId === undefined) fail("There's nothing to retry");
    await assertAllowance(ctx, userId, now);
    const timeZone = args.timeZone !== undefined && isValidTimeZone(args.timeZone) ? args.timeZone : row.timeZone;
    const turnJobId = await ctx.scheduler.runAfter(0, internal.assistantAgent.respond, {
      threadId: row.threadId,
      userId,
      promptMessageId: row.promptMessageId,
      turn: now,
      timeZone,
    });
    await ctx.db.patch(row._id, { runningSince: now, turnJobId, stopRequested: undefined, error: undefined, timeZone });
    return null;
  },
});

export const setArchived = mutation({
  args: { threadId: v.string(), archived: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const row = await requireThread(ctx, userId, args.threadId);
    await ctx.db.patch(row._id, { archivedAt: args.archived ? Date.now() : undefined });
    return null;
  },
});

export const rename = mutation({
  args: { threadId: v.string(), title: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const row = await requireThread(ctx, userId, args.threadId);
    const title = args.title.replace(/\s+/g, " ").trim();
    if (title === "") fail("Give the chat a name");
    await ctx.db.patch(row._id, { title: title.slice(0, MAX_TITLE_CHARS), titled: true });
    return null;
  },
});

export const setCourse = mutation({
  args: { threadId: v.string(), courseCanvasId: v.union(v.number(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const row = await requireThread(ctx, userId, args.threadId);
    if (args.courseCanvasId !== null) await requireCourse(ctx, userId, args.courseCanvasId);
    await ctx.db.patch(row._id, { courseCanvasId: args.courseCanvasId ?? undefined });
    return null;
  },
});

/** Deletes the chat, its messages and its change history. Changes already applied stay. */
export const remove = mutation({
  args: { threadId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const row = await requireThread(ctx, userId, args.threadId);
    if (await turnInProgress(ctx, row, Date.now())) fail("Stop the reply before deleting this chat");
    const changes = await ctx.db
      .query("assistantChanges")
      .withIndex("by_thread", (q) => q.eq("threadId", row.threadId))
      .collect();
    for (const change of changes) await ctx.db.delete(change._id);
    await ctx.db.delete(row._id);
    await ctx.runMutation(components.agent.threads.deleteAllForThreadIdAsync, { threadId: row.threadId });
    return null;
  },
});

// ── Used by the reply action ──────────────────────────────────────────────

export const stopRequested = internalQuery({
  args: { threadId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("assistantThreads")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .unique();
    return row === null || row.stopRequested === true;
  },
});

/** Ends turn `turn`; a newer turn that already started is left alone. */
export const finishTurn = internalMutation({
  args: { threadId: v.string(), turn: v.number(), error: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("assistantThreads")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .unique();
    if (row === null || row.runningSince !== args.turn) return null;
    await ctx.db.patch(row._id, {
      runningSince: undefined,
      turnJobId: undefined,
      stopRequested: undefined,
      error: args.error,
      lastMessageAt: Date.now(),
    });
    return null;
  },
});

export const setGeneratedTitle = internalMutation({
  args: { threadId: v.string(), title: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("assistantThreads")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .unique();
    const title = args.title.replace(/["“”]/g, "").replace(/\s+/g, " ").trim().replace(/[.。]$/, "");
    if (row === null || row.titled || title === "") return null;
    await ctx.db.patch(row._id, { title: title.slice(0, MAX_TITLE_CHARS), titled: true });
    return null;
  },
});

export const recordUsage = internalMutation({
  args: { userId: v.string(), tokens: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(args.tokens > 0)) return null;
    const day = usageDay(Date.now());
    const row = await ctx.db
      .query("assistantUsage")
      .withIndex("by_user_day", (q) => q.eq("userId", args.userId).eq("day", day))
      .unique();
    if (row === null) await ctx.db.insert("assistantUsage", { userId: args.userId, day, tokens: args.tokens });
    else await ctx.db.patch(row._id, { tokens: row.tokens + args.tokens });
    return null;
  },
});
