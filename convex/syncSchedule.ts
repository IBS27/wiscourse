// Adaptive tripwire cadence. Each user with an active Canvas credential has
// one syncSchedule row. The dispatcher cron reads only rows that are due, so
// its cost follows the users it probes, not the users who exist. Client
// heartbeats mark a user active: probes then run every two minutes instead of
// fifteen, and a return from idle moves the next probe up to the next tick.

import { v } from "convex/values";
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import {
  ACTIVE_WINDOW_MS,
  HEARTBEAT_DEDUPE_MS,
  nextTripwireAt,
} from "./lib/syncCadence";

async function findSchedule(ctx: MutationCtx, userId: string) {
  return await ctx.db
    .query("syncSchedule")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

/**
 * Puts a user in the tripwire queue if they are not already. `dueAt` applies
 * only to a new row; an existing row keeps its cadence.
 */
export async function ensureSyncSchedule(
  ctx: MutationCtx,
  userId: string,
  fields: { dueAt: number; activeUntil?: number },
): Promise<void> {
  if ((await findSchedule(ctx, userId)) === null) {
    await ctx.db.insert("syncSchedule", { userId, ...fields });
  }
}

/** Takes a user out of the tripwire queue: disconnected or token rejected. */
export async function removeSyncSchedule(ctx: MutationCtx, userId: string): Promise<void> {
  const row = await findSchedule(ctx, userId);
  if (row !== null) await ctx.db.delete(row._id);
}

/** Sent by an open, in-use client at most every HEARTBEAT_MS. */
export const heartbeat = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    const activeUntil = now + ACTIVE_WINDOW_MS;
    const row = await findSchedule(ctx, userId);
    if (row === null) {
      // Accounts connected before this queue existed join on their first beat.
      const credential = await ctx.db
        .query("canvasCredentials")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();
      if (credential?.status === "active") {
        await ctx.db.insert("syncSchedule", { userId, dueAt: now, activeUntil });
      }
      return null;
    }
    const current = row.activeUntil ?? 0;
    if (current - now > ACTIVE_WINDOW_MS - HEARTBEAT_DEDUPE_MS) return null;
    if (current > now) {
      await ctx.db.patch(row._id, { activeUntil });
      return null;
    }
    // Back from idle: probe on the next tick, unless one ran moments ago.
    const promoted = Math.max(now, nextTripwireAt(row.lastDispatchedAt ?? 0, true));
    await ctx.db.patch(row._id, { activeUntil, dueAt: Math.min(row.dueAt, promoted) });
    return null;
  },
});

/**
 * Run once after deploying the queue (`convex run syncSchedule:backfill`):
 * accounts connected earlier would otherwise wait for a heartbeat or the
 * nightly sync to rejoin. Idempotent; returns how many accounts it added.
 */
export const backfill = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    let added = 0;
    for await (const credential of ctx.db.query("canvasCredentials")) {
      if (credential.status !== "active") continue;
      if ((await findSchedule(ctx, credential.userId)) !== null) continue;
      await ctx.db.insert("syncSchedule", { userId: credential.userId, dueAt: Date.now() });
      added += 1;
    }
    return added;
  },
});
