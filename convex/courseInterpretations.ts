import { v } from "convex/values";
import { Workpool, vOnCompleteArgs } from "@convex-dev/workpool";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { components, internal } from "./_generated/api";
import { requireUserId } from "./lib/auth";
import schema from "./schema";
import {
  courseMapValidator,
  resultResourceValidator,
  INTERPRETER_MODEL,
  INTERPRETER_VERSION,
} from "./lib/courseMap";
import type { Doc } from "./_generated/dataModel";

const pool = new Workpool(components.interpretationWorkpool, {
  maxParallelism: 2,
  retryActionsByDefault: false,
});
const stateValidator = v.object({
  _id: v.id("courseInterpretations"),
  _creationTime: v.number(),
  ...schema.tables.courseInterpretations.validator.fields,
});

export const get = query({
  args: { courseCanvasId: v.number() },
  returns: v.object({
    configured: v.boolean(),
    state: v.union(stateValidator, v.null()),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const state = identity
      ? await ctx.db
          .query("courseInterpretations")
          .withIndex("by_user_course", (q) =>
            q
              .eq("userId", identity.subject)
              .eq("courseCanvasId", args.courseCanvasId),
          )
          .unique()
      : null;
    return {
      configured: identity !== null && Boolean(process.env.OPENAI_API_KEY),
      state,
    };
  },
});

async function enqueue(
  ctx: MutationCtx,
  state: Doc<"courseInterpretations">,
): Promise<void> {
  const generation = state.generation + 1;
  const status = process.env.OPENAI_API_KEY ? "queued" : "blocked";
  await ctx.db.patch(state._id, {
    generation,
    status,
    requestedAt: Date.now(),
    error: undefined,
    validationIssues: undefined,
  });
  if (status === "queued")
    await pool.enqueueAction(
      ctx,
      internal.courseInterpreter.run,
      { interpretationId: state._id, generation },
      {
        onComplete: internal.courseInterpretations.completed,
        context: { interpretationId: state._id, generation },
      },
    );
}

export const request = mutation({
  args: { courseCanvasId: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const course = await ctx.db
      .query("courses")
      .withIndex("by_user_canvasId", (q) =>
        q.eq("userId", userId).eq("canvasId", args.courseCanvasId),
      )
      .unique();
    if (!course || course.enrollmentState === "completed")
      throw new Error("Active course not found");
    let state = await ctx.db
      .query("courseInterpretations")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", userId).eq("courseCanvasId", args.courseCanvasId),
      )
      .unique();
    if (
      state &&
      ["queued", "running"].includes(state.status) &&
      Date.now() - state.requestedAt < 10 * 60_000
    )
      return null;
    if (
      state &&
      state.status !== "blocked" &&
      Date.now() - state.requestedAt < 60_000
    )
      throw new Error(
        "Please wait a minute before requesting another interpretation",
      );
    if (!state) {
      const id = await ctx.db.insert("courseInterpretations", {
        userId,
        courseCanvasId: args.courseCanvasId,
        enabled: true,
        sourceRevision: 0,
        generation: 0,
        status: "stale",
        requestedAt: 0,
        model: INTERPRETER_MODEL,
        promptVersion: INTERPRETER_VERSION,
      });
      state = (await ctx.db.get(id))!;
    } else if (!state.enabled) {
      await ctx.db.patch(state._id, { enabled: true });
    }
    await enqueue(ctx, state);
    return null;
  },
});

export const disable = mutation({
  args: { courseCanvasId: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const state = await ctx.db
      .query("courseInterpretations")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", userId).eq("courseCanvasId", args.courseCanvasId),
      )
      .unique();
    if (state)
      await ctx.db.patch(state._id, {
        enabled: false,
        generation: state.generation + 1,
        status: state.map ? "ready" : "stale",
      });
    return null;
  },
});

export const refreshEnabled = internalMutation({
  args: { userId: v.string(), cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("courseInterpretations")
      .withIndex("by_user_course", (q) => q.eq("userId", args.userId))
      .paginate({ cursor: args.cursor ?? null, numItems: 25 });
    for (const state of page.page) {
      const course = await ctx.db
        .query("courses")
        .withIndex("by_user_canvasId", (q) =>
          q.eq("userId", state.userId).eq("canvasId", state.courseCanvasId),
        )
        .unique();
      if (!course || course.enrollmentState === "completed") continue;
      if (
        !state.enabled ||
        (["queued", "running"].includes(state.status) &&
          Date.now() - state.requestedAt < 10 * 60_000)
      )
        continue;
      if (
        state.resultRevision !== state.sourceRevision ||
        state.promptVersion !== INTERPRETER_VERSION ||
        state.model !== INTERPRETER_MODEL
      )
        await enqueue(ctx, state);
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(
        0,
        internal.courseInterpretations.refreshEnabled,
        { userId: args.userId, cursor: page.continueCursor },
      );
    return null;
  },
});

export const context = internalQuery({
  args: { interpretationId: v.id("courseInterpretations") },
  returns: v.union(stateValidator, v.null()),
  handler: (ctx, args) => ctx.db.get(args.interpretationId),
});
export const begin = internalMutation({
  args: {
    interpretationId: v.id("courseInterpretations"),
    generation: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const state = await ctx.db.get(args.interpretationId);
    if (
      !state?.enabled ||
      state.generation !== args.generation ||
      state.status !== "queued"
    )
      return false;
    await ctx.db.patch(state._id, {
      status: "running",
      startedAt: Date.now(),
      inputTokens: 0,
      outputTokens: 0,
      toolCalls: 0,
    });
    return true;
  },
});
export const attachThread = internalMutation({
  args: {
    interpretationId: v.id("courseInterpretations"),
    generation: v.number(),
    threadId: v.string(),
    snapshotHash: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.db.get(args.interpretationId);
    if (state?.generation === args.generation)
      await ctx.db.patch(state._id, {
        threadId: args.threadId,
        snapshotHash: args.snapshotHash,
      });
    return null;
  },
});
export const finish = internalMutation({
  args: {
    interpretationId: v.id("courseInterpretations"),
    generation: v.number(),
    revision: v.number(),
    hash: v.string(),
    model: v.optional(v.string()),
    promptVersion: v.optional(v.string()),
    map: v.optional(courseMapValidator),
    resources: v.optional(v.array(resultResourceValidator)),
    error: v.optional(v.string()),
    issues: v.optional(v.array(v.string())),
    inputTokens: v.number(),
    outputTokens: v.number(),
    toolCalls: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.db.get(args.interpretationId);
    if (!state?.enabled || state.generation !== args.generation) return null;
    const course = await ctx.db
      .query("courses")
      .withIndex("by_user_canvasId", (q) =>
        q.eq("userId", state.userId).eq("canvasId", state.courseCanvasId),
      )
      .unique();
    const stale =
      state.sourceRevision !== args.revision ||
      !course ||
      course.enrollmentState === "completed";
    await ctx.db.patch(state._id, {
      status: stale ? "stale" : args.error || !args.map ? "failed" : "ready",
      finishedAt: Date.now(),
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      toolCalls: args.toolCalls,
      error: args.error,
      validationIssues: args.issues,
      ...(!stale && args.map && !args.error
        ? {
            map: args.map,
            resources: args.resources,
            resultRevision: args.revision,
            resultHash: args.hash,
            model: args.model ?? INTERPRETER_MODEL,
            promptVersion: args.promptVersion ?? INTERPRETER_VERSION,
          }
        : {}),
    });
    if (stale && course && course.enrollmentState !== "completed") {
      await ctx.scheduler.runAfter(
        30_000,
        internal.courseInterpretations.refreshEnabled,
        { userId: state.userId },
      );
    }
    return null;
  },
});

export const completed = internalMutation({
  args: vOnCompleteArgs(
    v.object({
      interpretationId: v.id("courseInterpretations"),
      generation: v.number(),
    }),
  ),
  returns: v.null(),
  handler: async (ctx, { context }) => {
    const state = await ctx.db.get(context.interpretationId);
    if (
      state?.generation === context.generation &&
      ["queued", "running"].includes(state.status)
    ) {
      await ctx.db.patch(state._id, {
        status: "failed",
        finishedAt: Date.now(),
        error: "Interpretation ended before saving a result. Please retry.",
      });
    }
    return null;
  },
});

export const disableUser = internalMutation({
  args: { userId: v.string(), cursor: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("courseInterpretations")
      .withIndex("by_user_course", (q) => q.eq("userId", args.userId))
      .paginate({ cursor: args.cursor, numItems: 100 });
    for (const state of page.page)
      await ctx.db.patch(state._id, {
        enabled: false,
        generation: state.generation + 1,
        status: state.map ? "ready" : "stale",
      });
    if (!page.isDone)
      await ctx.scheduler.runAfter(
        0,
        internal.courseInterpretations.disableUser,
        { userId: args.userId, cursor: page.continueCursor },
      );
    return null;
  },
});
