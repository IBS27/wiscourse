import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { encryptSecret } from "../convex/lib/crypto";
import * as submissionsModule from "../convex/submissions";
import { BUSY_RETRY_MS } from "../convex/submissions";
import { createMockCanvas, MOCK_INSTANCE, MOCK_UPLOAD_HOST, type MockCanvas } from "./helpers/mock-canvas";

const modules = import.meta.glob("../convex/**/*.{ts,js}");
const userId = "student";
const course = 501;
const essay = 7001; // text or URL
const report = 7002; // files, pdf only
const reflection = 7003; // text

let canvas: MockCanvas;
// Captured before fake timers: Web Crypto finishes on real time.
const realSetTimeout = globalThis.setTimeout;

/** Waits for `condition` without moving the fake clock (no retry fires). */
async function until(condition: () => Promise<boolean>) {
  for (let i = 0; i < 400; i++) {
    if (await condition()) return;
    await vi.advanceTimersByTimeAsync(0);
    await new Promise((resolve) => realSetTimeout(resolve, 5));
  }
  throw new Error("condition not reached");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 8, 30, 15));
  vi.stubEnv("CANVAS_ENCRYPTION_KEY", btoa(String.fromCharCode(...new Uint8Array(32).fill(7))));
  canvas = createMockCanvas();
  vi.stubGlobal("fetch", canvas.fetch);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function setup() {
  const t = convexTest(schema, modules);
  // Each connect stores a new token and so a new credential revision.
  let tokens = 0;
  const connectAs = async (user: string) => t.mutation(internal.credentials.save, {
    userId: user, instance: MOCK_INSTANCE, canvasUserId: 1, canvasUserName: user,
    accessTokenEncrypted: await encryptSecret(`mock-token-${user}-${++tokens}`),
  });
  const seed = (user: string) => t.run(async (ctx) => {
    const base = { userId: user, courseCanvasId: course, syncedAt: 0, htmlUrl: `https://${MOCK_INSTANCE}/a`, dueAt: Date.now() + 86_400_000 };
    await ctx.db.insert("assignments", { ...base, canvasId: essay, name: "Essay", submissionTypes: ["online_text_entry", "online_url"] });
    await ctx.db.insert("assignments", { ...base, canvasId: report, name: "Report", submissionTypes: ["online_upload"], allowedExtensions: ["pdf"] });
    await ctx.db.insert("assignments", { ...base, canvasId: reflection, name: "Reflection", submissionTypes: ["online_text_entry"] });
  });
  await connectAs(userId);
  await seed(userId);
  const student = t.withIdentity({ subject: userId });
  const row = (id: Id<"submissionOutbox">) => t.run((ctx) => ctx.db.get(id));
  // Runs every due scheduled function, one timer at a time, until none is left.
  const drain = async () => {
    for (let i = 0; i < 100; i++) {
      await t.finishInProgressScheduledFunctions();
      if (vi.getTimerCount() === 0) return;
      vi.advanceTimersToNextTimer();
      await vi.advanceTimersByTimeAsync(0);
    }
    throw new Error("scheduled work did not settle");
  };
  const text = (clientKey: string, assignmentCanvasId = essay, as = student) =>
    as.mutation(api.submissions.submit, { clientKey, assignmentCanvasId, content: { kind: "text", text: "My essay\n\nSecond paragraph" }, confirmed: true });
  // The client's upload flow: the authenticated upload HTTP action.
  const post = (as: Pick<typeof student, "fetch"> | typeof t, blob: Blob) =>
    as.fetch("/submissions/upload", { method: "POST", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob });
  const upload = async (as: typeof student, blob: Blob) => {
    const response = await post(as, blob);
    expect(response.status).toBe(200);
    return ((await response.json()) as { storageId: Id<"_storage"> }).storageId;
  };
  const credential = () => t.run((ctx) => ctx.db.query("canvasCredentials").withIndex("by_user", (q) => q.eq("userId", userId)).unique());
  const schedule = () => t.run((ctx) => ctx.db.query("syncSchedule").withIndex("by_user", (q) => q.eq("userId", userId)).unique());
  return { t, student, row, drain, text, upload, post, seed, credential, schedule, connect: () => connectAs(userId), connectAs };
}

const posts = () => canvas.log.filter((r) => r.operation === "post");

it("queues a confirmed submission once and delivers it once", async () => {
  const { t, student, row, drain, text } = await setup();
  const id = await text("dialog-1");
  expect(await text("dialog-1")).toBe(id);
  await expect(text("dialog-2")).rejects.toThrow("already in progress");
  expect((await row(id))?.status).toBe("queued");

  await drain();
  expect(canvas.attempts(essay)).toHaveLength(1);
  expect(canvas.attempts(essay)[0].body).toBe("<p>My essay</p><p>Second paragraph</p>");
  expect(canvas.log.map((r) => r.operation)).toEqual(["check", "post"]);
  expect(canvas.log.every((r) => r.authorized)).toBe(true);
  const done = await row(id);
  expect(done).toMatchObject({ status: "submitted", canvasAttempt: 1 });

  // The mirror shows the confirmed submission and the todo is done.
  const panel = await student.query(api.submissions.panel, { assignmentCanvasId: essay });
  expect(panel?.submittedAt).toBe(done?.canvasSubmittedAt);
  const todo = await t.run((ctx) => ctx.db.query("todos").first());
  expect(todo).toMatchObject({ canvasId: essay, doneBySubmission: true });

  // A later resubmission is a new, separately confirmed write.
  await text("dialog-2");
  await drain();
  expect(canvas.attempts(essay)).toHaveLength(2);
});

it("refuses to queue what Canvas would refuse", async () => {
  const { t, student, text, upload } = await setup();
  const submit = (content: Parameters<typeof student.mutation<typeof api.submissions.submit>>[1]["content"], assignmentCanvasId = essay) =>
    student.mutation(api.submissions.submit, { clientKey: crypto.randomUUID(), assignmentCanvasId, content, confirmed: true });
  await expect(submit({ kind: "url", url: "javascript:alert(1)" })).rejects.toThrow("http");
  await expect(submit({ kind: "text", text: "   " })).rejects.toThrow("Write something");
  await expect(submit({ kind: "text", text: "x" }, report)).rejects.toThrow("does not take");
  const storageId = await upload(student, new Blob(["x"]));
  await expect(submit({ kind: "file", files: [{ storageId, name: "notes.docx" }] }, report)).rejects.toThrow("does not accept");

  await t.run(async (ctx) => {
    const a = await ctx.db.query("assignments").withIndex("by_user_canvasId", (q) => q.eq("userId", userId).eq("canvasId", essay)).unique();
    await ctx.db.patch(a!._id, { lockAt: Date.now() - 1 });
  });
  await expect(text("late")).rejects.toThrow("closed");
  expect(await t.run((ctx) => ctx.db.query("submissionOutbox").collect())).toHaveLength(0);
});

it("accepts only files the upload action stored for the caller", async () => {
  const { t, student, row, drain, upload, post, seed, connectAs } = await setup();
  await connectAs("other");
  await seed("other");
  const other = t.withIdentity({ subject: "other" });
  const bytes = "%PDF-1 A's report";
  const attach = (as: typeof student, storageId: Id<"_storage">, clientKey: string) => as.mutation(api.submissions.submit, {
    clientKey, assignmentCanvasId: report, confirmed: true, content: { kind: "file", files: [{ storageId, name: "report.pdf" }] },
  });

  // No function takes a storage id (or a hash) as proof of upload.
  expect(Object.keys(submissionsModule)).not.toContain("registerUpload");
  expect(Object.keys(submissionsModule)).not.toContain("generateUploadUrl");
  expect((await post(t, new Blob([bytes]))).status).toBe(401);

  // A blob A stored outside the upload action, and one A uploaded properly.
  const stray = await t.run((ctx) => ctx.storage.store(new Blob([bytes], { type: "application/pdf" })));
  const mine = await upload(student, new Blob([bytes], { type: "application/pdf" }));

  // B knows both ids and the bytes (so the hash and size) and still gets nothing.
  await expect(attach(other, stray, "b1")).rejects.toThrow("could not be verified");
  await expect(attach(other, mine, "b2")).rejects.toThrow("could not be verified");
  const theirs = await upload(other, new Blob([bytes], { type: "application/pdf" }));
  expect(theirs).not.toBe(stray);
  expect(theirs).not.toBe(mine);
  // A stray blob is not an upload for its owner either.
  await expect(attach(student, stray, "a0")).rejects.toThrow("could not be verified");
  await drain();
  expect(canvas.log).toHaveLength(0);
  expect(await t.run((ctx) => ctx.db.query("submissionOutbox").collect())).toHaveLength(0);
  expect(await t.run((ctx) => ctx.db.system.get(stray))).not.toBeNull();
  expect(await t.run((ctx) => ctx.db.system.get(mine))).not.toBeNull();

  // A's own upload submits; storage is freed after Canvas confirms.
  const id = await attach(student, mine, "a");
  await drain();
  expect((await row(id))?.status).toBe("submitted");
  expect(canvas.attempts(report)).toHaveLength(1);
  expect(await t.run((ctx) => ctx.db.system.get(mine))).toBeNull();
  expect(await t.run((ctx) => ctx.db.system.get(stray))).not.toBeNull();
});

it("retries throttling and outages without a second submission", async () => {
  const { row, drain, text } = await setup();
  canvas.fail("check", "serverError");
  canvas.fail("post", "rateLimit");
  canvas.fail("check", "networkError");
  const id = await text("k");
  await drain();
  expect((await row(id))?.status).toBe("submitted");
  // A throttled send is known not to have landed, so it is sent again.
  expect(posts()).toHaveLength(2);
  expect(canvas.attempts(essay)).toHaveLength(1);
});

it("dates a receipt found in history by its own attempt, and mirrors the latest one", async () => {
  const { t, row, drain, text } = await setup();
  canvas.fail("post", "acceptThenTimeout");
  const id = await text("history");
  await until(async () => (await row(id))?.status === "queued" && posts().length === 1);
  const ours = Date.parse(canvas.attempts(essay)[0].submitted_at);
  // Before the check, a different attempt lands a minute later and is graded.
  vi.setSystemTime(ours + 60_000);
  canvas.seed(essay, {
    submission_type: "online_text_entry", body: "<p>A later answer</p>", url: null, attachments: [],
    graded: { score: 9, grade: "9", posted_at: new Date(ours + 120_000).toISOString() },
  });
  await drain();

  expect(await row(id)).toMatchObject({ status: "submitted", canvasAttempt: 1, canvasSubmittedAt: ours });
  const mirror = await t.run((ctx) => ctx.db.query("assignments").withIndex("by_user_canvasId", (q) => q.eq("userId", userId).eq("canvasId", essay)).unique());
  expect(mirror?.submission).toMatchObject({ submittedAt: ours + 60_000, workflowState: "graded", score: 9, postedAt: ours + 120_000 });
  expect(posts()).toHaveLength(1);
});

it("lets a confirmed Send again replace a conflicting Canvas attempt, once", async () => {
  const { student, row, drain, text } = await setup();
  // Throttled: Canvas answered and did not take it, so a newer attempt is someone else's.
  canvas.fail("post", "rateLimit");
  const id = await text("conflict");
  await until(async () => (await row(id))?.status === "queued" && posts().length === 1);
  canvas.seed(essay, { submission_type: "online_text_entry", body: "<p>Typed straight into Canvas</p>", url: null, attachments: [] });
  await drain();
  expect(await row(id)).toMatchObject({ status: "unconfirmed", errorKind: "conflict" });

  // A check alone never replaces anything.
  await student.mutation(api.submissions.resume, { id });
  await drain();
  expect(await row(id)).toMatchObject({ status: "unconfirmed", errorKind: "conflict", baselineAttempt: 0 });

  await student.mutation(api.submissions.sendAgain, { id, confirmed: true });
  await drain();
  expect(await row(id)).toMatchObject({ status: "submitted", canvasAttempt: 2 });
  expect(posts()).toHaveLength(2);
  expect(canvas.attempts(essay).map((a) => a.body)).toEqual(["<p>Typed straight into Canvas</p>", "<p>My essay</p><p>Second paragraph</p>"]);
});

it("finds a late delivery before replacing, and asks again if Canvas moved on", async () => {
  const { student, row, drain, text } = await setup();
  canvas.fail("post", "rateLimit");
  const id = await text("late");
  await until(async () => (await row(id))?.status === "queued" && posts().length === 1);
  canvas.seed(essay, { submission_type: "online_text_entry", body: "<p>Other</p>", url: null, attachments: [] });
  await drain();
  expect((await row(id))?.errorKind).toBe("conflict");

  // After the student confirms, yet another attempt appears: that needs a new confirmation.
  await student.mutation(api.submissions.sendAgain, { id, confirmed: true });
  canvas.seed(essay, { submission_type: "online_text_entry", body: "<p>Another</p>", url: null, attachments: [] });
  await drain();
  expect(await row(id)).toMatchObject({ status: "unconfirmed", errorKind: "conflict" });
  expect(posts()).toHaveLength(1);

  // The original payload then shows up after all: confirmed without sending.
  canvas.seed(essay, { submission_type: "online_text_entry", body: "<p>My essay</p><p>Second paragraph</p>", url: null, attachments: [] });
  await student.mutation(api.submissions.sendAgain, { id, confirmed: true });
  await drain();
  expect(await row(id)).toMatchObject({ status: "submitted", canvasAttempt: 3 });
  expect(posts()).toHaveLength(1);
});

it.each(["rateLimit", "tooManyRequests"] as const)("retries a throttled file upload (%s) instead of failing it", async (fault) => {
  const { student, row, drain, upload } = await setup();
  const storageId = await upload(student, new Blob(["%PDF-1 throttled"], { type: "application/pdf" }));
  canvas.fail("upload", fault);
  const id = await student.mutation(api.submissions.submit, {
    clientKey: "throttled", assignmentCanvasId: report, confirmed: true, content: { kind: "file", files: [{ storageId, name: "report.pdf" }] },
  });
  await drain();
  expect(await row(id)).toMatchObject({ status: "submitted", attempt: 2 });
  expect(canvas.attempts(report)).toHaveLength(1);
  expect(canvas.log.filter((r) => r.host === MOCK_UPLOAD_HOST).every((r) => !r.authorized)).toBe(true);
});

it("still fails a file upload the upload host refuses outright", async () => {
  const { student, row, drain, upload, credential } = await setup();
  const storageId = await upload(student, new Blob(["%PDF-1 denied"], { type: "application/pdf" }));
  canvas.fail("upload", "forbidden");
  const id = await student.mutation(api.submissions.submit, {
    clientKey: "denied", assignmentCanvasId: report, confirmed: true, content: { kind: "file", files: [{ storageId, name: "report.pdf" }] },
  });
  await drain();
  expect(await row(id)).toMatchObject({ status: "failed", errorKind: "rejected", attempt: 1 });
  expect(posts()).toHaveLength(0);
  expect((await credential())?.status).toBe("active");
});

// Canvas stores a submission in its own form: here an entity re-encoded and a
// trailing slash on a URL, so the stored attempt does not match what was sent.
function storeRewritten() {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (init.method === "POST" && /\/submissions$/.test(url.pathname)) {
      const form = new URLSearchParams(init.body as URLSearchParams);
      const body = form.get("submission[body]");
      if (body !== null) form.set("submission[body]", body.replaceAll("&amp;", "&#38;"));
      const link = form.get("submission[url]");
      if (link !== null) form.set("submission[url]", link + "/");
      return canvas.fetch(input, { ...init, body: form });
    }
    return canvas.fetch(input, init);
  });
}

it.each(["text", "url"] as const)("keeps an unmatched attempt after a lost reply as possibly this one (%s)", async (kind) => {
  const { student, row, drain } = await setup();
  storeRewritten();
  canvas.fail("post", "acceptThenTimeout");
  const id = await student.mutation(api.submissions.submit, {
    clientKey: `rewritten-${kind}`, assignmentCanvasId: essay, confirmed: true,
    content: kind === "text" ? { kind, text: "Fish & chips" } : { kind, url: "https://example.invalid/work" },
  });
  await drain();
  // Canvas holds one attempt, ours as Canvas stored it: not a "different" submission.
  expect(canvas.attempts(essay)).toHaveLength(1);
  expect(await row(id)).toMatchObject({ status: "unconfirmed", errorKind: "unmatched", mayHavePosted: true, conflictAttempt: 1 });
  expect(posts()).toHaveLength(1);

  // Checking again never sends and still cannot tell.
  await student.mutation(api.submissions.resume, { id });
  await drain();
  expect(await row(id)).toMatchObject({ status: "unconfirmed", errorKind: "unmatched" });
  expect(posts()).toHaveLength(1);

  // Only a confirmation that warned about a possible second attempt sends again, once.
  await student.mutation(api.submissions.sendAgain, { id, confirmed: true });
  await expect(student.mutation(api.submissions.sendAgain, { id, confirmed: true })).rejects.toThrow("not waiting");
  await drain();
  expect(posts()).toHaveLength(2);
  expect(await row(id)).toMatchObject({ status: "submitted", canvasAttempt: 2 });
});

it("treats a newer attempt after a known unsent first try as a conflict", async () => {
  const { row, drain, text } = await setup();
  canvas.fail("post", "rateLimit");
  const id = await text("known");
  await until(async () => (await row(id))?.status === "queued" && posts().length === 1);
  expect((await row(id))?.mayHavePosted).toBeUndefined();
  canvas.seed(essay, { submission_type: "online_text_entry", body: "<p>Written elsewhere</p>", url: null, attachments: [] });
  await drain();
  expect(await row(id)).toMatchObject({ status: "unconfirmed", errorKind: "conflict", conflictAttempt: 1 });
  expect(posts()).toHaveLength(1);
});

it("confirms a rewritten submission Canvas acknowledged, without matching content", async () => {
  const { student, row, drain } = await setup();
  storeRewritten();
  const id = await student.mutation(api.submissions.submit, {
    clientKey: "acknowledged", assignmentCanvasId: essay, confirmed: true, content: { kind: "text", text: "Fish & chips" },
  });
  await drain();
  expect(await row(id)).toMatchObject({ status: "submitted", canvasAttempt: 1 });
  expect(posts()).toHaveLength(1);
});

it("checks Canvas instead of resending when a reply is lost", async () => {
  const { row, drain, text } = await setup();
  canvas.fail("post", "acceptThenTimeout");
  const id = await text("k");
  await drain();
  expect((await row(id))?.status).toBe("submitted");
  expect(posts()).toHaveLength(1);
  expect(canvas.attempts(essay)).toHaveLength(1);
});

it("keeps only checking while Canvas is slow to show an accepted send", async () => {
  const { student, row, drain, text } = await setup();
  canvas.setVisibilityLag(4);
  canvas.fail("post", "acceptThenTimeout");
  const id = await text("k");
  await drain();
  // Three automatic checks see nothing; absence is not proof, so no resend.
  expect(await row(id)).toMatchObject({ status: "unconfirmed", errorKind: "exhausted" });
  expect(posts()).toHaveLength(1);

  // Repeated "Check Canvas again" only looks, until Canvas shows it.
  await student.mutation(api.submissions.resume, { id });
  await drain();
  expect((await row(id))?.status).toBe("unconfirmed");
  await student.mutation(api.submissions.resume, { id });
  await student.mutation(api.submissions.resume, { id }).catch(() => undefined);
  await drain();
  expect(await row(id)).toMatchObject({ status: "submitted", canvasAttempt: 1 });
  expect(posts()).toHaveLength(1);
  expect(canvas.attempts(essay)).toHaveLength(1);
});

it("does not let the student skip the wait before checking a lost send", async () => {
  const { student, row, text } = await setup();
  canvas.fail("post", "timeout");
  const id = await text("k");
  vi.advanceTimersToNextTimer();
  while ((await row(id))?.status !== "queued" || posts().length === 0) await vi.advanceTimersByTimeAsync(0);
  await expect(student.mutation(api.submissions.resume, { id })).rejects.toThrow("check Canvas at the time shown");
});

it("never resends a lost send on its own; the student can, once, after confirming", async () => {
  const { student, row, drain, text } = await setup();
  canvas.fail("post", "timeout");
  const id = await text("k");
  await drain();
  expect(await row(id)).toMatchObject({ status: "unconfirmed", errorKind: "exhausted" });
  expect(posts()).toHaveLength(1);
  expect(canvas.attempts(essay)).toHaveLength(0);

  await student.mutation(api.submissions.sendAgain, { id, confirmed: true });
  await expect(student.mutation(api.submissions.sendAgain, { id, confirmed: true })).rejects.toThrow("not waiting");
  await drain();
  expect((await row(id))?.status).toBe("submitted");
  expect(posts()).toHaveLength(2);
  expect(canvas.attempts(essay)).toHaveLength(1);
});

it("leaves a possibly delivered submission unconfirmed until a check settles it", async () => {
  const { student, row, drain, text } = await setup();
  canvas.fail("check", "ok");
  canvas.fail("post", "acceptThenTimeout");
  canvas.fail("check", "serverError", 3);
  const id = await text("k");
  await drain();
  expect(await row(id)).toMatchObject({ status: "unconfirmed", errorKind: "exhausted" });
  await expect(text("again")).rejects.toThrow("already in progress");

  // "Check again" looks first and finds it; nothing is sent twice.
  await student.mutation(api.submissions.resume, { id });
  await drain();
  expect(await row(id)).toMatchObject({ status: "submitted", canvasAttempt: 1 });
  expect(posts()).toHaveLength(1);
});

it("stops at reconnect-required instead of retrying", async () => {
  const { t, student, row, drain, text, connect } = await setup();
  canvas.fail("check", "unauthenticated");
  const id = await text("k");
  await drain();
  expect(await row(id)).toMatchObject({ status: "failed", errorKind: "reconnect" });
  expect(canvas.log).toHaveLength(1);
  const credential = await t.run((ctx) => ctx.db.query("canvasCredentials").first());
  expect(credential?.status).toBe("invalid");
  await expect(student.mutation(api.submissions.sendAgain, { id, confirmed: true })).rejects.toThrow("Reconnect");
  await expect(text("new")).rejects.toThrow("Reconnect");

  await connect();
  await student.mutation(api.submissions.sendAgain, { id, confirmed: true });
  await drain();
  expect((await row(id))?.status).toBe("submitted");

  // Disconnected while queued: no Canvas request at all.
  const second = await text("next");
  await student.mutation(api.credentials.disconnect, {});
  const requests = canvas.log.length;
  await drain();
  expect(await row(second)).toMatchObject({ status: "failed", errorKind: "reconnect" });
  expect(canvas.log).toHaveLength(requests);
});

it("ignores a late 401 for a token that a reconnect replaced", async () => {
  const { t, row, drain, text, connect } = await setup();
  const held = canvas.gate("check");
  const id = await text("k");
  await vi.advanceTimersByTimeAsync(0);
  await held.reached; // the attempt's check, with the first token, is in flight

  await connect(); // the student reconnects with a new token
  canvas.fail("check", "unauthenticated"); // Canvas rejects the old token
  held.open();
  await drain();

  const credential = await t.run((ctx) => ctx.db.query("canvasCredentials").first());
  expect(credential).toMatchObject({ status: "active", revision: 2 });
  expect(await t.run((ctx) => ctx.db.query("syncSchedule").first())).not.toBeNull();
  expect(await row(id)).toMatchObject({ status: "submitted", attempt: 2 });
  expect(posts()).toHaveLength(1);
});

it("ignores a late 401 for a deleted and recreated credential", async () => {
  const { student, row, drain, text, connect, credential, schedule } = await setup();
  const old = await credential();
  const held = canvas.gate("check");
  const id = await text("k");
  await vi.advanceTimersByTimeAsync(0);
  await held.reached; // in flight with the first record's token

  await student.mutation(api.credentials.disconnect, {});
  await connect(); // a new record, back at revision 1
  const fresh = await credential();
  expect(fresh).toMatchObject({ revision: old!.revision, status: "active" });
  expect(fresh!._id).not.toBe(old!._id);
  canvas.fail("check", "unauthenticated");
  held.open();
  await drain();

  expect(await credential()).toMatchObject({ _id: fresh!._id, status: "active" });
  expect(await schedule()).not.toBeNull();
  expect((await row(id))?.status).toBe("submitted");
});

it("lets sync invalidate only the credential it used", async () => {
  const { t, student, connect, credential, schedule } = await setup();
  await t.run(async (ctx) => {
    const state = await ctx.db.query("syncState").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
    await ctx.db.patch(state!._id, { tripwireSnapshot: "[]" });
  });
  const tripwire = () => t.action(internal.sync.tripwireUser, { userId });

  // Late 401 for a disconnected-and-recreated credential: the new one stands.
  const held = canvas.gate("tripwire");
  const running = tripwire();
  await held.reached;
  await student.mutation(api.credentials.disconnect, {});
  await connect();
  const fresh = await credential();
  canvas.fail("tripwire", "unauthenticated");
  held.open();
  await expect(running).rejects.toThrow("credential changed");
  expect(await credential()).toMatchObject({ _id: fresh!._id, status: "active" });
  expect(await schedule()).not.toBeNull();

  // A 401 for the current credential still invalidates it.
  canvas.fail("tripwire", "unauthenticated");
  await tripwire();
  expect((await credential())?.status).toBe("invalid");
  expect(await schedule()).toBeNull();
});

it("keeps a submission that may have landed unconfirmed when the token dies mid-check", async () => {
  const { t, row, drain, text } = await setup();
  canvas.fail("post", "acceptThenTimeout");
  canvas.fail("check", "ok");
  canvas.fail("check", "unauthenticated");
  const id = await text("k");
  await drain();
  expect(await row(id)).toMatchObject({ status: "unconfirmed", errorKind: "reconnect" });
  expect((await t.run((ctx) => ctx.db.query("canvasCredentials").first()))?.status).toBe("invalid");
});

it("recovers a dead attempt with a check, and ignores the dead action", async () => {
  const { t, row, drain, text } = await setup();
  canvas.fail("post", "acceptThenStall");
  const id = await text("k");
  vi.advanceTimersToNextTimer();
  while (posts().length === 0) await vi.advanceTimersByTimeAsync(0);
  expect((await row(id))?.status).toBe("sending");

  await t.mutation(internal.submissions.recover, { id, attempt: 1 });
  expect(await row(id)).toMatchObject({ status: "queued", checkOnly: true });
  canvas.releaseStalls();
  await drain();
  expect(await row(id)).toMatchObject({ status: "submitted", attempt: 2 });
  expect(posts()).toHaveLength(1);
  expect(canvas.attempts(essay)).toHaveLength(1);
});

it("keeps one Canvas request in flight per user across submissions and sync", async () => {
  const { t, row, drain, text, seed, connectAs } = await setup();
  await connectAs("other");
  await seed("other");
  const other = t.withIdentity({ subject: "other" });
  await t.run(async (ctx) => {
    const state = await ctx.db.query("syncState").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
    await ctx.db.patch(state!._id, { tripwireSnapshot: "[]" }); // no delta sync
  });
  const checks = () => canvas.log.filter((r) => r.operation === "check").length;
  const tripwires = () => canvas.log.filter((r) => r.operation === "tripwire").length;

  // A sync holds the lease: a submission waits without spending an attempt.
  const syncHeld = canvas.gate("tripwire");
  const sync = t.action(internal.sync.tripwireUser, { userId });
  await syncHeld.reached;
  const first = await text("first");
  // `claim` found the lease taken and set the next try.
  await until(async () => (await row(first))?.nextAttemptAt !== undefined);
  expect(checks()).toBe(0);
  expect(await row(first)).toMatchObject({ status: "queued", attempt: 0, attemptsLeft: 4 });
  syncHeld.open();
  await sync;

  // The submission holds it: a second submission and the sync wait, while
  // another user's submission goes ahead.
  const checkHeld = canvas.gate("check");
  await vi.advanceTimersByTimeAsync(BUSY_RETRY_MS);
  await checkHeld.reached;
  const second = await text("second", reflection);
  await until(async () => (await row(second))?.nextAttemptAt !== undefined);
  await t.action(internal.sync.tripwireUser, { userId });
  expect(tripwires()).toBe(1);
  const theirs = await text("theirs", essay, other);
  await until(async () => (await row(theirs))?.status === "submitted");
  expect(await row(second)).toMatchObject({ status: "queued", attempt: 0 });

  checkHeld.open();
  await drain();
  expect((await row(first))?.status).toBe("submitted");
  expect((await row(second))?.status).toBe("submitted");
  await t.action(internal.sync.tripwireUser, { userId });
  expect(tripwires()).toBe(2);
  expect(Math.max(...canvas.peakInFlightPerToken())).toBe(1);
  expect(canvas.peakInFlight()).toBe(2); // the two users did overlap
});

it("uploads files without the token, once, and frees storage after", async () => {
  const { t, student, row, drain, upload } = await setup();
  const a = await upload(student, new Blob(["%PDF-1 a"], { type: "application/pdf" }));
  const b = await upload(student, new Blob(["%PDF-1 b"], { type: "application/pdf" }));
  canvas.setUploadReply("created");
  canvas.fail("post", "rateLimit");
  const id = await student.mutation(api.submissions.submit, {
    clientKey: "files", assignmentCanvasId: report, confirmed: true,
    content: { kind: "file", files: [{ storageId: a, name: "part1.pdf" }, { storageId: b, name: "Part2.PDF" }] },
  });
  await drain();
  const done = await row(id);
  expect(done?.status).toBe("submitted");
  expect(canvas.log.filter((r) => r.operation === "slot")).toHaveLength(2);
  expect(canvas.log.filter((r) => r.host === MOCK_UPLOAD_HOST).every((r) => !r.authorized)).toBe(true);
  expect(canvas.attempts(report)).toHaveLength(1);
  expect(canvas.attempts(report)[0].attachments.map((f) => f.display_name)).toEqual(["part1.pdf", "Part2.PDF"]);
  expect(done?.files?.every((f) => f.storageId === undefined && f.canvasFileId !== undefined)).toBe(true);
  expect(await t.run((ctx) => ctx.db.system.get(a))).toBeNull();
  expect(await t.run((ctx) => ctx.db.query("submissionUploads").collect())).toHaveLength(0);
});

it("confirms a redirected upload on the Canvas host only", async () => {
  const { student, row, drain, upload } = await setup();
  const a = await upload(student, new Blob(["%PDF-1"], { type: "application/pdf" }));
  const id = await student.mutation(api.submissions.submit, {
    clientKey: "files", assignmentCanvasId: report, confirmed: true, content: { kind: "file", files: [{ storageId: a, name: "r.pdf" }] },
  });
  await drain();
  expect((await row(id))?.status).toBe("submitted");
  const confirm = canvas.log.find((r) => r.operation === "confirm");
  expect(confirm).toMatchObject({ host: MOCK_INSTANCE, authorized: true });
});
