import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { CAMPUS_TIME_ZONE, dayKeyIn } from "./zones";

export const ASSISTANT_MODEL = "gpt-6-luna";

/** Tokens (input + output) one student may spend per campus day. */
export const DAILY_TOKEN_LIMIT = 1_500_000;

/**
 * A reply still marked running after this long is treated as crashed. The
 * server also checks the scheduled job, so this only bounds what the UI shows.
 */
export const ASSISTANT_TURN_TIMEOUT_MS = 10 * 60 * 1000;

export const MAX_PROMPT_CHARS = 4000;

/** The allowance resets at midnight in Madison. */
export function usageDay(ms: number): string {
  return dayKeyIn(ms, CAMPUS_TIME_ZONE);
}

export function isRunning(thread: Pick<Doc<"assistantThreads">, "runningSince">, now: number): boolean {
  return thread.runningSince !== undefined && now - thread.runningSince < ASSISTANT_TURN_TIMEOUT_MS;
}

/**
 * Whether a reply is really in flight: its scheduled job is pending or
 * running. A job that crashed without clearing `runningSince` doesn't count.
 */
export async function turnInProgress(
  ctx: QueryCtx | MutationCtx,
  thread: Pick<Doc<"assistantThreads">, "runningSince" | "turnJobId">,
  now: number,
): Promise<boolean> {
  if (!isRunning(thread, now)) return false;
  if (thread.turnJobId === undefined) return true;
  const job = await ctx.db.system.get(thread.turnJobId);
  return job !== null && (job.state.kind === "pending" || job.state.kind === "inProgress");
}

export async function assertAllowance(ctx: QueryCtx | MutationCtx, userId: string, now: number): Promise<void> {
  const usage = await ctx.db
    .query("assistantUsage")
    .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", usageDay(now)))
    .unique();
  if ((usage?.tokens ?? 0) >= DAILY_TOKEN_LIMIT) {
    throw new ConvexError("You've reached today's Ask limit. It resets at midnight, Madison time.");
  }
}

export async function requireCourse(ctx: QueryCtx | MutationCtx, userId: string, courseCanvasId: number): Promise<void> {
  const course = await ctx.db
    .query("courses")
    .withIndex("by_user_canvasId", (q) => q.eq("userId", userId).eq("canvasId", courseCanvasId))
    .unique();
  if (course === null) throw new ConvexError(`Unknown course ${courseCanvasId}`);
}

/** The chat row for `threadId` when it belongs to `userId`, else null. */
export async function threadOf(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  threadId: string,
): Promise<Doc<"assistantThreads"> | null> {
  const row = await ctx.db
    .query("assistantThreads")
    .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
    .unique();
  return row !== null && row.userId === userId ? row : null;
}

export async function requireThread(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  threadId: string,
): Promise<Doc<"assistantThreads">> {
  const row = await threadOf(ctx, userId, threadId);
  if (row === null) throw new ConvexError("Chat not found");
  return row;
}
