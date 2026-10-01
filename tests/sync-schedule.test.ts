import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { getFunctionName } from "convex/server";
import type { WorkId } from "@convex-dev/workpool";
import { syncPool } from "../convex/sync";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import {
  ACTIVE_TRIPWIRE_MS,
  ACTIVE_WINDOW_MS,
  DISPATCH_TICK_MS,
  IDLE_TRIPWIRE_MS,
} from "../convex/lib/syncCadence";

const modules = import.meta.glob("../convex/**/*.{ts,js}");
const userId = "student";
const now = Date.UTC(2026, 8, 30, 15);
const minute = 60_000;

function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const t = convexTest(schema, modules);
  const enqueue = vi.spyOn(syncPool, "enqueueAction").mockResolvedValue("work" as WorkId);
  const connect = () => t.mutation(internal.credentials.save, {
    userId, instance: "canvas.example.edu", canvasUserId: 1, canvasUserName: "Student", accessTokenEncrypted: "sealed",
  });
  const schedule = () => t.run((ctx) => ctx.db.query("syncSchedule").withIndex("by_user", (q) => q.eq("userId", userId)).unique());
  const dispatch = () => t.mutation(internal.sync.dispatchTripwire, {});
  const tripwires = () => enqueue.mock.calls.filter((call) => getFunctionName(call[1]) === "sync:tripwireUser").length;
  return { t, student: t.withIdentity({ subject: userId }), enqueue, connect, schedule, dispatch, tripwires };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("probes an idle account every 15 minutes and an active one every 2", async () => {
  const { connect, dispatch, tripwires, student } = setup();
  await connect();
  await dispatch();
  expect(tripwires()).toBe(0);

  vi.setSystemTime(now + DISPATCH_TICK_MS);
  await dispatch();
  expect(tripwires()).toBe(1);
  vi.setSystemTime(now + 3 * DISPATCH_TICK_MS);
  await dispatch();
  expect(tripwires()).toBe(1);
  vi.setSystemTime(now + DISPATCH_TICK_MS + IDLE_TRIPWIRE_MS);
  await dispatch();
  expect(tripwires()).toBe(2);

  // Returning from idle moves the next probe to the coming tick.
  vi.setSystemTime(now + DISPATCH_TICK_MS + IDLE_TRIPWIRE_MS + 5 * minute);
  await student.mutation(api.syncSchedule.heartbeat, {});
  await dispatch();
  expect(tripwires()).toBe(3);
  for (let tick = 1; tick <= 3; tick++) {
    vi.setSystemTime(now + DISPATCH_TICK_MS + IDLE_TRIPWIRE_MS + 5 * minute + tick * ACTIVE_TRIPWIRE_MS);
    await dispatch();
  }
  expect(tripwires()).toBe(6);

  // Without further beats the account falls back to the idle cadence.
  vi.setSystemTime(now + DISPATCH_TICK_MS + IDLE_TRIPWIRE_MS + 5 * minute + ACTIVE_WINDOW_MS + 4 * DISPATCH_TICK_MS);
  await dispatch();
  const settled = tripwires();
  vi.setSystemTime(Date.now() + 3 * DISPATCH_TICK_MS);
  await dispatch();
  expect(tripwires()).toBe(settled);
});

it("does not re-probe on a return right after a probe, and ignores duplicate beats", async () => {
  const { connect, dispatch, tripwires, student, schedule } = setup();
  await connect();
  vi.setSystemTime(now + DISPATCH_TICK_MS);
  await dispatch();
  vi.setSystemTime(now + DISPATCH_TICK_MS + 10_000);
  await student.mutation(api.syncSchedule.heartbeat, {});
  expect((await schedule())?.dueAt).toBe(now + DISPATCH_TICK_MS + ACTIVE_TRIPWIRE_MS - DISPATCH_TICK_MS / 2);
  await dispatch();
  expect(tripwires()).toBe(1);

  vi.setSystemTime(now + DISPATCH_TICK_MS + 30_000);
  const before = await schedule();
  await student.mutation(api.syncSchedule.heartbeat, {});
  expect(await schedule()).toEqual(before);
});

it("keeps the queue in step with the credential", async () => {
  const { t, connect, dispatch, tripwires, student, schedule } = setup();
  await student.mutation(api.syncSchedule.heartbeat, {});
  expect(await schedule()).toBeNull();

  await connect();
  expect(await schedule()).not.toBeNull();
  const credential = await t.run((ctx) => ctx.db.query("canvasCredentials").first());
  await t.mutation(internal.credentials.markInvalid, { userId, credential: { credentialId: credential!._id, revision: credential!.revision ?? 0 } });
  expect(await schedule()).toBeNull();
  await student.mutation(api.syncSchedule.heartbeat, {});
  expect(await schedule()).toBeNull();

  await connect();
  await student.mutation(api.credentials.disconnect, {});
  expect(await schedule()).toBeNull();

  // A row whose credential vanished some other way is dropped, not probed.
  await connect();
  await t.run(async (ctx) => {
    const credential = await ctx.db.query("canvasCredentials").first();
    await ctx.db.delete(credential!._id);
  });
  vi.setSystemTime(now + DISPATCH_TICK_MS);
  await dispatch();
  expect(tripwires()).toBe(0);
  expect(await schedule()).toBeNull();
});

it("enrolls accounts connected before the queue existed", async () => {
  const { t, connect, student, schedule, dispatch, tripwires } = setup();
  await connect();
  await t.run(async (ctx) => { await ctx.db.delete((await ctx.db.query("syncSchedule").first())!._id); });

  await t.mutation(internal.sync.dispatchFullSync, {});
  expect(await schedule()).not.toBeNull();
  await t.run(async (ctx) => { await ctx.db.delete((await ctx.db.query("syncSchedule").first())!._id); });

  await student.mutation(api.syncSchedule.heartbeat, {});
  await dispatch();
  expect(tripwires()).toBe(1);
  await t.run(async (ctx) => { await ctx.db.delete((await ctx.db.query("syncSchedule").first())!._id); });

  expect(await t.mutation(internal.syncSchedule.backfill, {})).toBe(1);
  expect(await t.mutation(internal.syncSchedule.backfill, {})).toBe(0);
  await dispatch();
  expect(tripwires()).toBe(2);
});

it("reports a missing credential without asking the Workpool to retry", async () => {
  const { t } = setup();
  await expect(t.action(internal.sync.tripwireUser, { userId })).resolves.toBeNull();
  const state = await t.query(internal.syncStore.getSyncState, { userId });
  expect(state?.status).toBe("error");
  expect(state?.syncLeaseStartedAt).toBeUndefined();
});

it("holds a steady cadence under cron jitter: 2 min active, never over 15 idle", async () => {
  const { connect, dispatch, enqueue, student } = setup();
  await connect();
  // Crons fire slightly late by varying amounts; one tick every DISPATCH_TICK_MS.
  const jitter = (tick: number) => ((tick * 7919) % 900);
  const probes: number[] = [];
  const beats = new Set([46, 48, 51, 53]); // active from tick 46 to 56 (heartbeats every <=5 min)
  for (let tick = 1; tick <= 90; tick++) {
    vi.setSystemTime(now + tick * DISPATCH_TICK_MS + jitter(tick));
    if (beats.has(tick)) await student.mutation(api.syncSchedule.heartbeat, {});
    const before = enqueue.mock.calls.length;
    await dispatch();
    if (enqueue.mock.calls.length > before) probes.push(tick);
  }
  const gaps = probes.slice(1).map((tick, i) => (tick - probes[i]) * DISPATCH_TICK_MS);
  const idle = [
    ...gaps.slice(0, probes.indexOf(46) - 1),
    ...gaps.slice(probes.indexOf(57)),
  ];
  // Idle probes keep one steady spacing, never over the 15-minute period.
  expect(new Set(idle).size).toBe(1);
  expect(idle[0]).toBeLessThanOrEqual(IDLE_TRIPWIRE_MS);
  // The return is probed on its own tick, then every tick while active.
  expect(probes).toContain(46);
  const active = probes.filter((tick) => tick >= 46 && tick <= 56);
  expect(active).toEqual([46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56].filter((tick) => active.includes(tick)));
  expect(active.slice(1).every((tick, i) => tick - active[i] === ACTIVE_TRIPWIRE_MS / DISPATCH_TICK_MS)).toBe(true);
  expect(active.length).toBeGreaterThanOrEqual(10);
});
