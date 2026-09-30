import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { encryptSecret } from "../convex/lib/crypto";
import { createMockCanvas, MOCK_INSTANCE, MOCK_UPLOAD_HOST, type MockCanvas } from "./helpers/mock-canvas";

const modules = import.meta.glob("../convex/**/*.{ts,js}");
const userId = "student";
const course = 501;
const essay = 7001; // text or URL
const report = 7002; // files, pdf only

let canvas: MockCanvas;

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
  const connect = async () => t.mutation(internal.credentials.save, {
    userId, instance: MOCK_INSTANCE, canvasUserId: 1, canvasUserName: "Student",
    accessTokenEncrypted: await encryptSecret("mock-token"),
  });
  await connect();
  await t.run(async (ctx) => {
    const base = { userId, courseCanvasId: course, syncedAt: 0, htmlUrl: `https://${MOCK_INSTANCE}/a`, dueAt: Date.now() + 86_400_000 };
    await ctx.db.insert("assignments", { ...base, canvasId: essay, name: "Essay", submissionTypes: ["online_text_entry", "online_url"] });
    await ctx.db.insert("assignments", { ...base, canvasId: report, name: "Report", submissionTypes: ["online_upload"], allowedExtensions: ["pdf"] });
  });
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
  const text = (clientKey: string, body = "My essay\n\nSecond paragraph") =>
    student.mutation(api.submissions.submit, { clientKey, assignmentCanvasId: essay, content: { kind: "text", text: body }, confirmed: true });
  return { t, student, row, drain, text, connect };
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
  const { t, student, text } = await setup();
  const submit = (content: Parameters<typeof student.mutation<typeof api.submissions.submit>>[1]["content"], assignmentCanvasId = essay) =>
    student.mutation(api.submissions.submit, { clientKey: crypto.randomUUID(), assignmentCanvasId, content, confirmed: true });
  await expect(submit({ kind: "url", url: "javascript:alert(1)" })).rejects.toThrow("http");
  await expect(submit({ kind: "text", text: "   " })).rejects.toThrow("Write something");
  await expect(submit({ kind: "text", text: "x" }, report)).rejects.toThrow("does not take");
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["x"])));
  await expect(submit({ kind: "file", files: [{ storageId, name: "notes.docx" }] }, report)).rejects.toThrow("does not accept");

  await t.run(async (ctx) => {
    const a = await ctx.db.query("assignments").withIndex("by_user_canvasId", (q) => q.eq("userId", userId).eq("canvasId", essay)).unique();
    await ctx.db.patch(a!._id, { lockAt: Date.now() - 1 });
  });
  await expect(text("late")).rejects.toThrow("closed");
  expect(await t.run((ctx) => ctx.db.query("submissionOutbox").collect())).toHaveLength(0);
});

it("retries throttling and outages without a second submission", async () => {
  const { row, drain, text } = await setup();
  canvas.fail("check", "serverError");
  canvas.fail("post", "rateLimit");
  canvas.fail("check", "networkError");
  const id = await text("k");
  await drain();
  expect((await row(id))?.status).toBe("submitted");
  expect(canvas.attempts(essay)).toHaveLength(1);
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

it("does not let the student skip the wait before checking a lost send", async () => {
  const { student, row, text } = await setup();
  canvas.fail("post", "timeout");
  const id = await text("k");
  vi.advanceTimersToNextTimer();
  while ((await row(id))?.status !== "queued" || posts().length === 0) await vi.advanceTimersByTimeAsync(0);
  await expect(student.mutation(api.submissions.resume, { id })).rejects.toThrow("check Canvas at the time shown");
});

it("sends again only after Canvas shows the lost send never arrived", async () => {
  const { row, drain, text } = await setup();
  canvas.fail("post", "timeout");
  const id = await text("k");
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

it("reports a check that finds nothing as failed, and a retry then sends", async () => {
  const { student, row, drain, text } = await setup();
  canvas.fail("check", "ok");
  canvas.fail("post", "timeout");
  canvas.fail("check", "serverError", 3);
  const id = await text("k");
  await drain();
  expect((await row(id))?.status).toBe("unconfirmed");
  await student.mutation(api.submissions.resume, { id });
  await drain();
  expect(await row(id)).toMatchObject({ status: "failed", errorKind: "notReceived" });
  expect(posts()).toHaveLength(1);
  await student.mutation(api.submissions.resume, { id });
  await drain();
  expect((await row(id))?.status).toBe("submitted");
  expect(canvas.attempts(essay)).toHaveLength(1);
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
  await expect(student.mutation(api.submissions.resume, { id })).rejects.toThrow("Reconnect");
  await expect(text("new")).rejects.toThrow("Reconnect");

  await connect();
  await student.mutation(api.submissions.resume, { id });
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

it("keeps a submission that may have landed unconfirmed when the token dies mid-check", async () => {
  const { row, drain, text } = await setup();
  canvas.fail("post", "acceptThenTimeout");
  canvas.fail("check", "ok");
  canvas.fail("check", "unauthenticated");
  const id = await text("k");
  await drain();
  expect(await row(id)).toMatchObject({ status: "unconfirmed", errorKind: "reconnect" });
});

it("recovers a dead attempt with a check, and ignores the dead action", async () => {
  const { t, row, drain, text } = await setup();
  canvas.fail("post", "acceptThenStall");
  const id = await text("k");
  vi.advanceTimersToNextTimer();
  while (posts().length === 0) await vi.advanceTimersByTimeAsync(0);
  expect((await row(id))?.status).toBe("sending");

  await t.mutation(internal.submissions.recover, { id, attempt: 1 });
  expect((await row(id))?.status).toBe("queued");
  canvas.releaseStalls();
  await drain();
  expect(await row(id)).toMatchObject({ status: "submitted", attempt: 2 });
  expect(posts()).toHaveLength(1);
  expect(canvas.attempts(essay)).toHaveLength(1);
});

it("uploads files without the token, once, and frees storage after", async () => {
  const { t, student, row, drain } = await setup();
  const a = await t.run((ctx) => ctx.storage.store(new Blob(["%PDF-1 a"], { type: "application/pdf" })));
  const b = await t.run((ctx) => ctx.storage.store(new Blob(["%PDF-1 b"], { type: "application/pdf" })));
  canvas.setUploadReply("created");
  canvas.fail("post", "timeout");
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
});

it("confirms a redirected upload on the Canvas host only", async () => {
  const { t, student, row, drain } = await setup();
  const a = await t.run((ctx) => ctx.storage.store(new Blob(["%PDF-1"], { type: "application/pdf" })));
  const id = await student.mutation(api.submissions.submit, {
    clientKey: "files", assignmentCanvasId: report, confirmed: true, content: { kind: "file", files: [{ storageId: a, name: "r.pdf" }] },
  });
  await drain();
  expect((await row(id))?.status).toBe("submitted");
  const confirm = canvas.log.find((r) => r.operation === "confirm");
  expect(confirm).toMatchObject({ host: MOCK_INSTANCE, authorized: true });
});
