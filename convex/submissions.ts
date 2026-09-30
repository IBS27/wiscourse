// Assignment submissions through a durable outbox.
//
// A submission is a confirmed write. The student reviews it in a dialog,
// `submit` stores one outbox row, and `send` delivers it to Canvas in the
// background; the UI shows the row's state and is never optimistic.
//
// Duplicate protection, from the outside in:
// - The dialog's `clientKey`: submitting the same key again returns the row.
// - One open row per assignment: a new submission waits until the last one
//   is submitted, failed or dismissed.
// - One attempt at a time per row: `claim` hands out numbered attempts, and
//   a stale action or watchdog with an older number changes nothing.
// - Canvas has no idempotency key, so each attempt first reads the student's
//   submission and compares it with the attempt number seen before the
//   first send. Once a send may have reached Canvas (a lost reply, a
//   timeout, a 5xx, a dead action), the row only checks: a check that finds
//   nothing is not proof, because Canvas can show a new attempt late. Only
//   the student sends again, through `sendAgain` and a second confirmation.
//
// Every attempt holds the user's Canvas lease (shared with sync, see
// syncStore), so one token never has two requests in flight.
//
// A missing or rejected credential ends the attempt at once: the student
// reconnects in Settings, then retries. A 401 for a token that a reconnect
// (or a disconnect and new connect) has since replaced does not invalidate
// the new one: `markInvalid` compares the exact credential row and revision.

import { ConvexError, v, type Infer } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  httpAction,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUserId } from "./lib/auth";
import {
  CanvasReconnectRequired,
  credentialState,
  getCanvasClient,
  type CredentialIdentity,
} from "./credentials";
import {
  CanvasApiError,
  CanvasAuthError,
  CanvasRateLimitError,
  type CanvasUploadSlot,
} from "./canvas/client";
import { toMillis, type CanvasSubmission } from "./canvas/types";
import { outboxErrorKind, submissionFields } from "./schema";
import { mapSubmission } from "./sync";
import { applySubmissionUpdate, claimCanvasLease, releaseCanvasLease } from "./syncStore";
import {
  AUTO_ATTEMPTS,
  CANVAS_TYPE,
  MAX_FILES,
  MAX_FILE_BYTES,
  MAX_TEXT_CHARS,
  acceptedKinds,
  canvasErrorText,
  extensionAllowed,
  findDelivery,
  hasCanvasOnlyTypes,
  lockReason,
  normalizeUrl,
  retryDelay,
  textToHtml,
  type OutboxContent,
} from "./lib/submissions";

// Convex stops an action after 10 minutes, so an attempt still marked
// `sending` after this is dead and the watchdog may start the next one.
export const LEASE_MS = 11 * 60_000;
// How long an attempt waits when a sync or another attempt holds the lease.
export const BUSY_RETRY_MS = 20_000;
const POST_TIMEOUT_MS = 90_000;
const UPLOAD_TIMEOUT_MS = 3 * 60_000;
const UPLOAD_TTL_MS = 24 * 60 * 60_000;

export const RECONNECT_MESSAGE = "Canvas needs to be reconnected. Reconnect in Settings, then try again.";

type Row = Doc<"submissionOutbox">;
type Step = NonNullable<Row["step"]>;
type ErrorKind = Infer<typeof outboxErrorKind>;
type Progress = {
  step?: Step;
  baselineAttempt?: number;
  mayHavePosted?: boolean;
  uploaded?: { index: number; canvasFileId: number };
  replaced?: true;
};

function fail(message: string): never {
  throw new ConvexError(message);
}

const OPEN: ReadonlySet<Row["status"]> = new Set(["queued", "sending", "unconfirmed"]);

// ---------------------------------------------------------------------------
// Reads

function view(row: Row) {
  return {
    id: row._id,
    createdAt: row._creationTime,
    kind: row.kind,
    text: row.text,
    url: row.url,
    files: row.files?.map((f) => ({ name: f.name, size: f.size, uploaded: f.canvasFileId !== undefined })),
    status: row.status,
    step: row.step,
    checkOnly: row.checkOnly,
    // Canvas may already have it: the next attempt only looks.
    awaitingCheck: row.mayHavePosted === true,
    nextAttemptAt: row.nextAttemptAt,
    error: row.error,
    errorKind: row.errorKind,
    canvasAttempt: row.canvasAttempt,
    canvasSubmittedAt: row.canvasSubmittedAt,
  };
}
export type OutboxView = ReturnType<typeof view>;

/** Everything the assignment's submission panel shows. */
export const panel = query({
  args: { assignmentCanvasId: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const userId = identity.subject;
    const assignment = await findAssignment(ctx, userId, args.assignmentCanvasId);
    if (assignment === null) return null;
    const latest = await ctx.db
      .query("submissionOutbox")
      .withIndex("by_user_assignment", (q) => q.eq("userId", userId).eq("assignmentCanvasId", args.assignmentCanvasId))
      .order("desc")
      .filter((q) => q.neq(q.field("dismissed"), true))
      .first();
    return {
      credential: await credentialState(ctx, userId),
      kinds: acceptedKinds(assignment.submissionTypes),
      canvasOnly: hasCanvasOnlyTypes(assignment.submissionTypes),
      lockedForUser: assignment.lockedForUser,
      unlockAt: assignment.unlockAt,
      lockAt: assignment.lockAt,
      allowedExtensions: assignment.allowedExtensions,
      submittedAt: assignment.submission?.submittedAt,
      outbox: latest ? view(latest) : null,
    };
  },
});

async function findAssignment(ctx: QueryCtx, userId: string, canvasId: number) {
  return await ctx.db
    .query("assignments")
    .withIndex("by_user_canvasId", (q) => q.eq("userId", userId).eq("canvasId", canvasId))
    .unique();
}

async function openRow(ctx: MutationCtx, userId: string, assignmentCanvasId: number, except?: Id<"submissionOutbox">) {
  const rows = await ctx.db
    .query("submissionOutbox")
    .withIndex("by_user_assignment", (q) => q.eq("userId", userId).eq("assignmentCanvasId", assignmentCanvasId))
    .order("desc")
    .collect();
  return rows.find((row) => row._id !== except && row.dismissed !== true && OPEN.has(row.status)) ?? null;
}

async function ownRow(ctx: MutationCtx, id: Id<"submissionOutbox">): Promise<Row> {
  const userId = await requireUserId(ctx);
  const row = await ctx.db.get(id);
  if (row === null || row.userId !== userId) fail("Submission not found.");
  return row;
}

// ---------------------------------------------------------------------------
// Uploads
//
// A storage id alone proves nothing, and neither does knowing a file's hash.
// Submission files therefore enter storage only through `uploadFile`, an
// authenticated HTTP action that stores the bytes itself and records the
// resulting storage id for the signed-in user in the same request. No
// function takes a caller's storage id as proof of upload.

async function uploadOf(ctx: QueryCtx, storageId: Id<"_storage">) {
  return await ctx.db
    .query("submissionUploads")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .unique();
}

// Bearer-token requests from the app's origin; no cookies are involved, so
// any origin may call it but only with the caller's own Convex token.
const UPLOAD_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function uploadReply(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...UPLOAD_CORS, "Content-Type": "application/json" } });
}

/**
 * POST /submissions/upload with the file as the body and the user's Convex
 * token. Files go to Convex storage first so delivery survives a closed tab.
 */
export const uploadFile = httpAction(async (ctx, request) => {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return uploadReply({ error: "Sign in to upload files." }, 401);
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > MAX_FILE_BYTES) {
    return uploadReply({ error: "Files must be 20 MB or smaller." }, 413);
  }
  const blob = await request.blob();
  if (blob.size === 0) return uploadReply({ error: "This file is empty." }, 400);
  if (blob.size > MAX_FILE_BYTES) return uploadReply({ error: "Files must be 20 MB or smaller." }, 413);
  const storageId = await ctx.storage.store(blob);
  await ctx.runMutation(internal.submissions.recordUpload, { userId: identity.subject, storageId });
  return uploadReply({ storageId }, 200);
});

export const uploadPreflight = httpAction(async () => new Response(null, { status: 204, headers: UPLOAD_CORS }));

/** Records who stored a file; only `uploadFile` calls this. */
export const recordUpload = internalMutation({
  args: { userId: v.string(), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    // Uploads never attached to a submission expire; clear a few each time.
    const stale = await ctx.db
      .query("submissionUploads")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.and(q.lt(q.field("expiresAt"), now), q.eq(q.field("outboxId"), undefined)))
      .take(20);
    for (const upload of stale) {
      if ((await ctx.db.system.get(upload.storageId)) !== null) await ctx.storage.delete(upload.storageId);
      await ctx.db.delete(upload._id);
    }
    await ctx.db.insert("submissionUploads", { userId: args.userId, storageId: args.storageId, expiresAt: now + UPLOAD_TTL_MS });
    return null;
  },
});

/** Whether `storageId` belongs to this user and this outbox row. */
export const uploadOwned = internalQuery({
  args: { storageId: v.id("_storage"), userId: v.string(), outboxId: v.id("submissionOutbox") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const upload = await uploadOf(ctx, args.storageId);
    return upload !== null && upload.userId === args.userId && upload.outboxId === args.outboxId;
  },
});

// ---------------------------------------------------------------------------
// Student actions

const content = v.union(
  v.object({ kind: v.literal("text"), text: v.string() }),
  v.object({ kind: v.literal("url"), url: v.string() }),
  v.object({
    kind: v.literal("file"),
    files: v.array(v.object({ storageId: v.id("_storage"), name: v.string() })),
  }),
);

/**
 * Queue a submission the student confirmed. Returns the outbox row; the same
 * `clientKey` always returns the same row.
 */
export const submit = mutation({
  args: {
    clientKey: v.string(),
    assignmentCanvasId: v.number(),
    content,
    // Only the confirmation dialog calls this.
    confirmed: v.literal(true),
  },
  returns: v.id("submissionOutbox"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const repeat = await ctx.db
      .query("submissionOutbox")
      .withIndex("by_user_clientKey", (q) => q.eq("userId", userId).eq("clientKey", args.clientKey))
      .unique();
    if (repeat !== null) return repeat._id;

    const assignment = await findAssignment(ctx, userId, args.assignmentCanvasId);
    if (assignment === null) fail("This assignment is no longer in Canvas.");
    if (!acceptedKinds(assignment.submissionTypes).includes(args.content.kind)) {
      fail("This assignment does not take that kind of submission.");
    }
    const locked = lockReason(assignment, Date.now());
    if (locked !== undefined) fail(locked);
    if ((await credentialState(ctx, userId)) !== "active") fail(RECONNECT_MESSAGE);
    if ((await openRow(ctx, userId, assignment.canvasId)) !== null) {
      fail("A submission for this assignment is already in progress.");
    }

    const fields = await validContent(ctx, userId, args.content, assignment.allowedExtensions);
    // A new submission replaces earlier failed ones.
    const earlier = await ctx.db
      .query("submissionOutbox")
      .withIndex("by_user_assignment", (q) => q.eq("userId", userId).eq("assignmentCanvasId", assignment.canvasId))
      .collect();
    for (const row of earlier) {
      if (row.status === "failed" && row.dismissed !== true) await dismissRow(ctx, row);
    }

    const id = await ctx.db.insert("submissionOutbox", {
      userId,
      courseCanvasId: assignment.courseCanvasId,
      assignmentCanvasId: assignment.canvasId,
      clientKey: args.clientKey,
      ...fields,
      status: "queued",
      attempt: 0,
      attemptsLeft: AUTO_ATTEMPTS,
      updatedAt: Date.now(),
    });
    for (const file of fields.files ?? []) {
      const upload = await uploadOf(ctx, file.storageId);
      await ctx.db.patch(upload!._id, { outboxId: id });
    }
    await scheduleSend(ctx, id, 0);
    return id;
  },
});

async function validContent(
  ctx: MutationCtx,
  userId: string,
  input: Infer<typeof content>,
  allowedExtensions: string[] | undefined,
): Promise<{ kind: Row["kind"]; text?: string; url?: string; files?: Array<{ storageId: Id<"_storage">; name: string; size: number; contentType: string }> }> {
  switch (input.kind) {
    case "text": {
      const text = input.text.trim();
      if (text.length === 0) fail("Write something to submit.");
      if (text.length > MAX_TEXT_CHARS) fail("This text is too long to submit from wiscourse.");
      return { kind: input.kind, text };
    }
    case "url": {
      const url = normalizeUrl(input.url);
      if (url === undefined) fail("Enter a full web address starting with http:// or https://.");
      return { kind: input.kind, url };
    }
    case "file": {
      if (input.files.length === 0) fail("Choose a file to submit.");
      if (input.files.length > MAX_FILES) fail(`Submit at most ${MAX_FILES} files from wiscourse.`);
      if (new Set(input.files.map((f) => f.storageId)).size !== input.files.length) fail("A file is listed twice.");
      const files = [];
      for (const file of input.files) {
        const name = file.name.trim();
        // Ownership first: nothing about another user's file is read or revealed.
        const upload = await uploadOf(ctx, file.storageId);
        if (upload === null || upload.userId !== userId || upload.outboxId !== undefined) {
          fail(`"${name}" could not be verified as your upload. Choose it again.`);
        }
        const stored = await ctx.db.system.get(file.storageId);
        if (stored === null) fail(`"${name}" did not finish uploading. Choose it again.`);
        if (name.length === 0 || name.length > 255) fail("A file needs a name under 256 characters.");
        if (stored.size > MAX_FILE_BYTES) fail(`"${name}" is over 20 MB. Submit large files in Canvas.`);
        if (!extensionAllowed(name, allowedExtensions)) fail(`Canvas does not accept "${name}" for this assignment.`);
        files.push({ storageId: file.storageId, name, size: stored.size, contentType: stored.contentType ?? "application/octet-stream" });
      }
      return { kind: input.kind, files };
    }
  }
}

/**
 * Moves a stalled row forward without sending anything new: a queued retry
 * runs now, and an unconfirmed row is checked against Canvas once.
 */
export const resume = mutation({
  args: { id: v.id("submissionOutbox") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ownRow(ctx, args.id);
    if (row.dismissed === true) fail("This submission was dismissed.");
    if (row.status === "queued") {
      // Canvas may still be finishing the send; checking early could miss it.
      if (row.mayHavePosted === true) fail("wiscourse will check Canvas at the time shown. Canvas may still be finishing the last send.");
      await ctx.db.patch(row._id, { nextAttemptAt: undefined, updatedAt: Date.now() });
      await scheduleSend(ctx, row._id, 0, row.jobId);
      return null;
    }
    if (row.status !== "unconfirmed") fail("There is nothing to check.");
    if ((await credentialState(ctx, row.userId)) !== "active") fail(RECONNECT_MESSAGE);
    await ctx.db.patch(row._id, {
      status: "queued",
      checkOnly: true,
      attemptsLeft: 1,
      nextAttemptAt: undefined,
      error: undefined,
      errorKind: undefined,
      updatedAt: Date.now(),
    });
    await scheduleSend(ctx, row._id, 0, row.jobId);
    return null;
  },
});

/**
 * Sends a failed or unconfirmed row again, after the student confirmed it.
 * The attempt still reads Canvas first and stops if the earlier send shows.
 * For an unconfirmed row this can make a second Canvas attempt if the first
 * is still invisible; the dialog says so.
 */
export const sendAgain = mutation({
  args: { id: v.id("submissionOutbox"), confirmed: v.literal(true) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ownRow(ctx, args.id);
    if (row.dismissed === true) fail("This submission was dismissed.");
    if (row.status !== "failed" && row.status !== "unconfirmed") fail("This submission is not waiting to be sent again.");
    if ((await credentialState(ctx, row.userId)) !== "active") fail(RECONNECT_MESSAGE);
    if ((await openRow(ctx, row.userId, row.assignmentCanvasId, row._id)) !== null) {
      fail("A submission for this assignment is already in progress.");
    }
    if (row.files?.some((f) => f.canvasFileId === undefined && f.storageId === undefined)) {
      fail("The files for this submission are gone. Submit them again.");
    }
    await ctx.db.patch(row._id, {
      status: "queued",
      checkOnly: undefined,
      mayHavePosted: undefined,
      // The student chose to send after the conflicting attempt they were shown.
      replaceConfirmed: row.errorKind === "conflict" && row.conflictAttempt !== undefined ? true : undefined,
      attemptsLeft: AUTO_ATTEMPTS,
      nextAttemptAt: undefined,
      error: undefined,
      errorKind: undefined,
      updatedAt: Date.now(),
    });
    await scheduleSend(ctx, row._id, 0, row.jobId);
    return null;
  },
});

/** Hides a finished row and frees its uploads. Canvas is not touched. */
export const dismiss = mutation({
  args: { id: v.id("submissionOutbox") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ownRow(ctx, args.id);
    if (row.status === "queued" || row.status === "sending") fail("This submission is still being sent.");
    await dismissRow(ctx, row);
    return null;
  },
});

async function dismissRow(ctx: MutationCtx, row: Row) {
  await ctx.db.patch(row._id, { dismissed: true, files: await releaseFiles(ctx, row), updatedAt: Date.now() });
}

/** Deletes only files registered to this row's owner and this row. */
async function releaseFiles(ctx: MutationCtx, row: Row) {
  if (row.files === undefined) return undefined;
  for (const file of row.files) {
    if (file.storageId === undefined) continue;
    const upload = await uploadOf(ctx, file.storageId);
    if (upload === null || upload.userId !== row.userId || upload.outboxId !== row._id) continue;
    if ((await ctx.db.system.get(file.storageId)) !== null) await ctx.storage.delete(file.storageId);
    await ctx.db.delete(upload._id);
  }
  return row.files.map((file) => ({ ...file, storageId: undefined }));
}

async function scheduleSend(ctx: MutationCtx, id: Id<"submissionOutbox">, delayMs: number, previous?: Id<"_scheduled_functions">) {
  if (previous !== undefined) {
    const job = await ctx.db.system.get(previous);
    if (job?.state.kind === "pending") await ctx.scheduler.cancel(previous);
  }
  const jobId = await ctx.scheduler.runAfter(delayMs, internal.submissions.send, { id });
  await ctx.db.patch(id, { jobId });
}

// ---------------------------------------------------------------------------
// Delivery

/**
 * Starts an attempt: takes the user's Canvas lease, marks the row `sending`
 * and arms its watchdog. While a sync or another attempt holds the lease the
 * row waits, without using up an attempt.
 */
export const claim = internalMutation({
  args: { id: v.id("submissionOutbox") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (row === null || row.status !== "queued" || row.dismissed === true) return null;
    // A job that `resume` replaced may still fire; only a due row is sent.
    if (row.nextAttemptAt !== undefined && row.nextAttemptAt > Date.now()) return null;
    const lease = await claimCanvasLease(ctx, row.userId);
    if (lease === null) {
      await ctx.db.patch(row._id, {
        nextAttemptAt: Date.now() + BUSY_RETRY_MS,
        error: row.error ?? "Waiting for another Canvas request to finish.",
        updatedAt: Date.now(),
      });
      await scheduleSend(ctx, row._id, BUSY_RETRY_MS, row.jobId);
      return null;
    }
    const attempt = row.attempt + 1;
    await ctx.db.patch(row._id, {
      status: "sending",
      step: "checking",
      attempt,
      attemptsLeft: row.attemptsLeft - 1,
      nextAttemptAt: undefined,
      jobId: undefined,
      canvasLease: lease,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(LEASE_MS, internal.submissions.recover, { id: row._id, attempt });
    return { ...row, attempt, canvasLease: lease };
  },
});

/** Records progress for the attempt that holds the row; false if it no longer does. */
export const progress = internalMutation({
  args: {
    id: v.id("submissionOutbox"),
    attempt: v.number(),
    step: v.optional(v.union(v.literal("checking"), v.literal("uploading"), v.literal("submitting"))),
    baselineAttempt: v.optional(v.number()),
    mayHavePosted: v.optional(v.boolean()),
    uploaded: v.optional(v.object({ index: v.number(), canvasFileId: v.number() })),
    // The confirmed replacement was used; it does not carry to later attempts.
    replaced: v.optional(v.literal(true)),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (row === null || row.status !== "sending" || row.attempt !== args.attempt) return false;
    const files = row.files && args.uploaded
      ? row.files.map((f, i) => (i === args.uploaded!.index ? { ...f, canvasFileId: args.uploaded!.canvasFileId } : f))
      : row.files;
    await ctx.db.patch(row._id, {
      ...(args.step !== undefined && { step: args.step }),
      ...(args.baselineAttempt !== undefined && { baselineAttempt: args.baselineAttempt }),
      ...(args.mayHavePosted !== undefined && { mayHavePosted: args.mayHavePosted }),
      ...(args.replaced && { conflictAttempt: undefined, replaceConfirmed: undefined }),
      files,
      updatedAt: Date.now(),
    });
    return true;
  },
});

const outcome = v.union(
  v.object({
    type: v.literal("submitted"),
    canvasAttempt: v.number(),
    canvasSubmittedAt: v.optional(v.number()),
    submission: submissionFields,
  }),
  v.object({
    type: v.literal("error"),
    // `retry`: try again as before. `check`: the send may have landed, so
    // from now on the row only checks.
    kind: v.union(v.literal("retry"), v.literal("check"), outboxErrorKind),
    error: v.string(),
    // Canvas answered the send and did not take it (throttled, token
    // replaced): this attempt's send is known not to have landed.
    notSent: v.optional(v.boolean()),
    // With `conflict`: Canvas's latest attempt at the time.
    observedAttempt: v.optional(v.number()),
  }),
);
type Outcome = Infer<typeof outcome>;

/** Ends an attempt. Ignored when a newer attempt or the watchdog took the row. */
export const finish = internalMutation({
  args: { id: v.id("submissionOutbox"), attempt: v.number(), outcome },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (row === null || row.status !== "sending" || row.attempt !== args.attempt) return null;
    await settle(ctx, row, args.outcome);
    return null;
  },
});

/** The watchdog: an attempt that outlived any action is treated as interrupted. */
export const recover = internalMutation({
  args: { id: v.id("submissionOutbox"), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (row === null || row.status !== "sending" || row.attempt !== args.attempt) return null;
    await settle(ctx, row, {
      type: "error",
      kind: row.mayHavePosted === true ? "check" : "retry",
      error: "Sending was interrupted.",
    });
    return null;
  },
});

async function settle(ctx: MutationCtx, row: Row, result: Outcome) {
  const now = Date.now();
  if (row.canvasLease !== undefined) await releaseCanvasLease(ctx, row.userId, row.canvasLease);
  const cleared = { step: undefined, checkOnly: undefined, nextAttemptAt: undefined, canvasLease: undefined, updatedAt: now };
  if (result.type === "submitted") {
    await ctx.db.patch(row._id, {
      ...cleared,
      status: "submitted",
      error: undefined,
      errorKind: undefined,
      mayHavePosted: undefined,
      canvasAttempt: result.canvasAttempt,
      canvasSubmittedAt: result.canvasSubmittedAt,
      conflictAttempt: undefined,
      replaceConfirmed: undefined,
      files: await releaseFiles(ctx, row),
    });
    await applySubmissionUpdate(ctx, row.userId, row.assignmentCanvasId, result.submission);
    return;
  }
  // A refusal of the send proves Canvas did not take it.
  const notSent = result.kind === "rejected" || result.notSent === true;
  const mayHavePosted = row.mayHavePosted === true && !notSent;
  const final = (kind: ErrorKind) =>
    ctx.db.patch(row._id, {
      ...cleared,
      // While Canvas may have it, "failed" would invite a duplicate.
      status: mayHavePosted || kind === "conflict" ? "unconfirmed" : "failed",
      mayHavePosted: mayHavePosted || undefined,
      // A new conflict needs a new confirmation.
      ...(kind === "conflict" && { conflictAttempt: result.observedAttempt, replaceConfirmed: undefined }),
      error: result.error,
      errorKind: kind,
    });
  if (result.kind !== "retry" && result.kind !== "check") return await final(result.kind);
  if (row.attemptsLeft <= 0) return await final("exhausted");
  const delay = retryDelay(AUTO_ATTEMPTS - row.attemptsLeft, mayHavePosted);
  await ctx.db.patch(row._id, {
    ...cleared,
    // Once a send may have landed, only a confirmed `sendAgain` sends again.
    checkOnly: result.kind === "check" || row.checkOnly || undefined,
    mayHavePosted: mayHavePosted || undefined,
    status: "queued",
    nextAttemptAt: now + delay,
    error: result.error,
    errorKind: undefined,
  });
  await scheduleSend(ctx, row._id, delay);
}

type Claimed = Row & { attempt: number; canvasLease: number };
type AttemptState = { step: Step; mayHavePosted: boolean; credential?: CredentialIdentity };

class Superseded extends Error {}

/** One delivery attempt. Scheduled by `submit`, `resume`, `sendAgain` and retries. */
export const send = internalAction({
  args: { id: v.id("submissionOutbox") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row: Claimed | null = await ctx.runMutation(internal.submissions.claim, { id: args.id });
    if (row === null) return null;
    const state: AttemptState = { step: "checking", mayHavePosted: row.mayHavePosted === true };
    try {
      let result: Outcome;
      try {
        result = await deliver(ctx, row, state);
      } catch (error) {
        if (error instanceof Superseded) return null;
        result = classify(error, state);
        if (error instanceof CanvasAuthError) {
          // Only the token this attempt used; a reconnect since then stands.
          // A CanvasAuthError comes from a request, so `credential` is set.
          const current = state.credential !== undefined &&
            (await ctx.runMutation(internal.credentials.markInvalid, { userId: row.userId, credential: state.credential }));
          if (!current) {
            result = { type: "error", kind: "retry", notSent: state.step === "submitting", error: "Canvas was reconnected during this attempt. Trying again." };
          }
        }
      }
      await ctx.runMutation(internal.submissions.finish, { id: row._id, attempt: row.attempt, outcome: result });
    } finally {
      // `finish` and the watchdog release the lease; this covers a failure
      // between them. A stale lease value changes nothing.
      await ctx.runMutation(internal.syncStore.releaseSync, { userId: row.userId, lease: row.canvasLease });
    }
    return null;
  },
});

async function deliver(ctx: ActionCtx, row: Claimed, state: AttemptState): Promise<Outcome> {
  const record = async (fields: Progress) => {
    if (fields.step !== undefined) state.step = fields.step;
    if (fields.mayHavePosted !== undefined) state.mayHavePosted = fields.mayHavePosted;
    const held = await ctx.runMutation(internal.submissions.progress, { id: row._id, attempt: row.attempt, ...fields });
    if (!held) throw new Superseded();
  };

  const { client, identity } = await getCanvasClient(ctx, row.userId);
  state.credential = identity;
  const base = `/courses/${row.courseCanvasId}/assignments/${row.assignmentCanvasId}/submissions`;
  const files = row.files ?? [];
  const canvasFileIds = files.flatMap((f) => (f.canvasFileId === undefined ? [] : [f.canvasFileId]));
  const current = await client.get<CanvasSubmission>(`${base}/self`, { "include[]": ["submission_history"] });

  if (row.baselineAttempt === undefined) {
    await record({ baselineAttempt: current.attempt ?? 0 });
  } else {
    const contentSent: OutboxContent = { kind: row.kind, text: row.text, url: row.url, canvasFileIds };
    const delivery = findDelivery(current, row.baselineAttempt, contentSent);
    // The receipt is the matched attempt's; the mirror stays Canvas's latest.
    if (delivery.kind === "ours") return submitted(current, delivery.attempt, toMillis(delivery.submittedAt));
    if (delivery.kind === "other") {
      const latest = current.attempt ?? 0;
      // Our payload did not show up, and Canvas's latest is the attempt the
      // student confirmed sending after: send after it, this once.
      if (row.replaceConfirmed === true && row.conflictAttempt === latest) {
        await record({ baselineAttempt: latest, replaced: true });
      } else {
        return {
          type: "error",
          kind: "conflict",
          observedAttempt: latest,
          error: "Canvas shows a newer submission that is not this one. Check Canvas before sending again.",
        };
      }
    }
  }
  if (row.checkOnly === true) {
    // Canvas can show a new attempt late, so not seeing it proves nothing.
    return { type: "error", kind: "check", error: "Canvas has not shown this submission yet." };
  }

  const params: Record<string, string | number[]> = { "submission[submission_type]": CANVAS_TYPE[row.kind] };
  if (row.kind === "text") params["submission[body]"] = textToHtml(row.text ?? "");
  if (row.kind === "url") params["submission[url]"] = row.url ?? "";
  if (row.kind === "file") {
    const ids: number[] = [];
    for (const [index, file] of files.entries()) {
      if (file.canvasFileId !== undefined) {
        ids.push(file.canvasFileId);
        continue;
      }
      await record({ step: "uploading" });
      const owned = file.storageId !== undefined &&
        (await ctx.runQuery(internal.submissions.uploadOwned, { storageId: file.storageId, userId: row.userId, outboxId: row._id }));
      const blob = owned ? await ctx.storage.get(file.storageId!) : null;
      if (blob === null) return { type: "error", kind: "rejected", error: `"${file.name}" is no longer stored. Submit it again.` };
      const slot = await client.post<CanvasUploadSlot>(`${base}/self/files`, {
        name: file.name,
        size: file.size,
        content_type: file.contentType,
      });
      const uploaded = await client.uploadFile<{ id: number }>(slot, blob, file.name, UPLOAD_TIMEOUT_MS);
      await record({ uploaded: { index, canvasFileId: uploaded.id } });
      ids.push(uploaded.id);
    }
    params["submission[file_ids][]"] = ids;
  }

  await record({ step: "submitting", mayHavePosted: true });
  const result = await client.post<CanvasSubmission>(base, params, { timeoutMs: POST_TIMEOUT_MS });
  return submitted(result, result.attempt ?? 0, toMillis(result.submitted_at));
}

/** `current` updates the assignment mirror; `attempt` and `submittedAt` are this row's receipt. */
function submitted(current: CanvasSubmission, attempt: number, submittedAt: number | undefined): Outcome {
  return { type: "submitted", canvasAttempt: attempt, canvasSubmittedAt: submittedAt, submission: mapSubmission(current) };
}

/** What an error means for the row, given how far the attempt got. */
export function classify(error: unknown, state: AttemptState): Outcome {
  const outcomeOf = (kind: Extract<Outcome, { type: "error" }>["kind"], message: string, notSent?: boolean): Outcome =>
    ({ type: "error", kind, error: message, ...(notSent && { notSent }) });
  const posting = state.step === "submitting";
  if (error instanceof CanvasReconnectRequired || error instanceof CanvasAuthError) {
    return outcomeOf("reconnect", RECONNECT_MESSAGE, posting);
  }
  // Canvas throttles before doing any work.
  if (error instanceof CanvasRateLimitError) {
    return outcomeOf("retry", "Canvas is busy. Trying again shortly.", posting);
  }
  if (error instanceof CanvasApiError && error.status >= 400 && error.status < 500 && error.status !== 408) {
    // A refusal of the send itself, or of any step before a possible send, is final.
    if (posting || !state.mayHavePosted) {
      const reason = canvasErrorText(error.body);
      return outcomeOf("rejected", reason ? `Canvas refused this submission: ${reason}` : `Canvas refused this submission (error ${error.status}).`);
    }
    return outcomeOf("check", `Could not check Canvas (error ${error.status}).`);
  }
  // Timeouts, network errors and 5xx: if the send went out, it may have landed.
  if (posting || state.mayHavePosted) {
    return outcomeOf("check", "Canvas did not confirm in time. wiscourse will check whether it arrived; it will not send again on its own.");
  }
  return outcomeOf("retry", "Could not reach Canvas. Trying again shortly.");
}
