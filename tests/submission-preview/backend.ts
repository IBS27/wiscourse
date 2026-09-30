// The preview's backend: the real Convex functions on convex-test, inside the
// Vite dev server, with the mock Canvas as the only network. Loaded through
// `ssrLoadModule` so `import.meta.glob` works. Nothing here reads a real
// credential or reaches a real host: `fetch` is replaced for this process
// and refuses every host but the mock Canvas.

import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import schema from "../../convex/schema";
import { internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { encryptSecret } from "../../convex/lib/crypto";
import { syncListSummary } from "../../convex/lib/listSummaries";
import { createMockCanvas, MOCK_INSTANCE, type Fault, type Operation } from "../helpers/mock-canvas";

const modules = import.meta.glob("../../convex/**/*.{ts,js}");
const USER = "preview-student";
const COURSE = 101;
const DAY = 86_400_000;

// A throwaway key for the fake token below; never a deployment's key.
process.env.CANVAS_ENCRYPTION_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(42)));

export const canvas = createMockCanvas();
globalThis.fetch = canvas.fetch as typeof fetch;

export const FIXTURES = [
  { canvasId: 8101, name: "Reading response 4", types: ["online_text_entry"], due: 2 * DAY },
  { canvasId: 8102, name: "Portfolio link", types: ["online_url"], due: 1 * DAY },
  { canvasId: 8103, name: "Lab report 2", types: ["online_upload"], due: 3 * DAY, allowedExtensions: ["pdf", "docx"] },
  { canvasId: 8104, name: "Final project proposal", types: ["online_text_entry", "online_url", "online_upload"], due: 5 * DAY },
  { canvasId: 8105, name: "Weekly reflection (already submitted)", types: ["online_text_entry"], due: 4 * DAY, submitted: true },
  { canvasId: 8106, name: "Late essay", types: ["online_text_entry"], due: -1 * DAY },
  { canvasId: 8107, name: "Closed writeup", types: ["online_text_entry"], due: -3 * DAY, lockAt: -2 * DAY },
  { canvasId: 8108, name: "Video presentation", types: ["media_recording"], due: 6 * DAY },
] as const;

let t = convexTest(schema, modules);
let student = t.withIdentity({ subject: USER, name: "Preview Student" });

async function connect() {
  await t.mutation(internal.credentials.save, {
    userId: USER, instance: MOCK_INSTANCE, canvasUserId: 1, canvasUserName: "Preview Student",
    accessTokenEncrypted: await encryptSecret("mock-token-not-a-real-credential"),
  });
}

async function seed() {
  const now = Date.now();
  await connect();
  await t.run(async (ctx) => {
    const courseId = await ctx.db.insert("courses", {
      userId: USER, canvasId: COURSE, name: "Preview Course", courseCode: "MOCK 101", term: "Fall 2026",
      termStartAt: now - 30 * DAY, termEndAt: now + 90 * DAY, enrollmentState: "active", syncedAt: now,
    });
    await syncListSummary(ctx, "courses", (await ctx.db.get(courseId))!);
    for (const f of FIXTURES) {
      const submitted = "submitted" in f && f.submitted ? now - 2 * DAY : undefined;
      const id = await ctx.db.insert("assignments", {
        userId: USER, courseCanvasId: COURSE, canvasId: f.canvasId, syncedAt: now, name: f.name,
        description: `<p>Mock assignment for the submission preview. Nothing here reaches Canvas.</p>`,
        dueAt: now + f.due, lockAt: "lockAt" in f ? now + f.lockAt : undefined, pointsPossible: 10,
        htmlUrl: `https://${MOCK_INSTANCE}/courses/${COURSE}/assignments/${f.canvasId}`,
        submissionTypes: [...f.types],
        allowedExtensions: "allowedExtensions" in f ? [...f.allowedExtensions] : undefined,
        submission: submitted ? { submittedAt: submitted, workflowState: "submitted" } : undefined,
      });
      await syncListSummary(ctx, "assignments", (await ctx.db.get(id))!);
    }
  });
  canvas.seed(8105, { submission_type: "online_text_entry", body: "<p>Earlier reflection</p>", url: null, attachments: [] });
}

let ready = seed();

export async function reset() {
  await ready;
  // Retries still scheduled on the old backend would otherwise reach the new Canvas.
  await t.run(async (ctx) => {
    for (const job of await ctx.db.system.query("_scheduled_functions").collect()) {
      if (job.state.kind === "pending") await ctx.scheduler.cancel(job._id);
    }
  });
  canvas.reset();
  t = convexTest(schema, modules);
  student = t.withIdentity({ subject: USER, name: "Preview Student" });
  ready = seed();
  await ready;
}

export const UPLOAD_PATH = "/__mock/upload";

/** A call from the page, as the signed-in preview student. */
export async function call(type: "query" | "mutation" | "action", name: string, args: Record<string, unknown>) {
  await ready;
  try {
    // The real mutation records the upload ticket; the bytes then go to this
    // server, never to a Convex deployment.
    if (name === "submissions:generateUploadUrl") {
      await student.mutation(makeFunctionReference<"mutation">(name), args);
      return { value: UPLOAD_PATH };
    }
    const value = type === "query"
      ? await student.query(makeFunctionReference<"query">(name), args)
      : type === "mutation"
        ? await student.mutation(makeFunctionReference<"mutation">(name), args)
        : await student.action(makeFunctionReference<"action">(name), args);
    return { value: value ?? null };
  } catch (error) {
    if (error instanceof ConvexError) return { error: { message: String(error.data), data: error.data } };
    return { error: { message: error instanceof Error ? error.message : String(error) } };
  }
}

export async function upload(blob: Blob) {
  await ready;
  const storageId = await t.run((ctx) => ctx.storage.store(blob));
  return { storageId };
}

export type Control =
  | { action: "fault"; faults: Array<{ operation: Operation; fault: Fault; times?: number }> }
  | { action: "clearFaults" }
  | { action: "delay"; ms: number }
  | { action: "visibilityLag"; checks: number }
  | { action: "uploadReply"; mode: "redirect" | "created" }
  | { action: "credential"; state: "active" | "invalid" | "missing" }
  | { action: "expireLease" }
  | { action: "releaseStalls" }
  | { action: "reset" };

export async function control(command: Control) {
  await ready;
  switch (command.action) {
    case "fault":
      for (const f of command.faults) canvas.fail(f.operation, f.fault, f.times ?? 1);
      break;
    case "clearFaults":
      canvas.clearFaults();
      break;
    case "visibilityLag":
      canvas.setVisibilityLag(command.checks);
      break;
    case "delay":
      canvas.setDelay(command.ms);
      break;
    case "uploadReply":
      canvas.setUploadReply(command.mode);
      break;
    case "credential":
      if (command.state === "active") await connect();
      else if (command.state === "invalid") await t.mutation(internal.credentials.markInvalid, { userId: USER });
      else await t.run(async (ctx) => {
        const row = await ctx.db.query("canvasCredentials").withIndex("by_user", (q) => q.eq("userId", USER)).unique();
        if (row) await ctx.db.delete(row._id);
      });
      break;
    case "expireLease": {
      // What the watchdog does once an attempt outlives any action.
      const sending = await t.run((ctx) => ctx.db.query("submissionOutbox").filter((q) => q.eq(q.field("status"), "sending")).collect());
      for (const row of sending) await t.mutation(internal.submissions.recover, { id: row._id as Id<"submissionOutbox">, attempt: row.attempt });
      break;
    }
    case "releaseStalls":
      canvas.releaseStalls();
      break;
    case "reset":
      await reset();
      break;
  }
  return { ok: true };
}

/** What the control panel shows: Canvas's side and the outbox's. */
export async function state() {
  await ready;
  const [credential, outbox] = await t.run(async (ctx) => [
    (await ctx.db.query("canvasCredentials").withIndex("by_user", (q) => q.eq("userId", USER)).unique())?.status ?? "missing",
    (await ctx.db.query("submissionOutbox").order("desc").take(20)).map((r) => ({
      id: r._id, assignmentCanvasId: r.assignmentCanvasId, status: r.status, step: r.step, attempt: r.attempt,
      attemptsLeft: r.attemptsLeft, nextAttemptAt: r.nextAttemptAt, mayHavePosted: r.mayHavePosted ?? false,
      checkOnly: r.checkOnly ?? false, errorKind: r.errorKind, dismissed: r.dismissed ?? false,
    })),
  ] as const);
  return {
    credential,
    outbox,
    pendingFaults: canvas.pendingFaults(),
    log: canvas.log.slice(-40),
    attempts: FIXTURES.map((f) => ({ canvasId: f.canvasId, name: f.name, attempts: canvas.attempts(f.canvasId).map((a) => ({ attempt: a.attempt, type: a.submission_type, at: a.submitted_at })) })),
  };
}
