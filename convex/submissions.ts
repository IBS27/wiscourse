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
//   first send. An attempt that may have reached Canvas is checked, never
//   repeated blindly; if a check is impossible the row ends `unconfirmed`.
//
// A missing or rejected credential ends the attempt at once: the student
// reconnects in Settings, then retries. Retrying a dead token cannot help.

import { ConvexError, v, type Infer } from "convex/values";
import {
  internalAction,
  internalMutation,
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
} from "./credentials";
import {
  CanvasApiError,
  CanvasAuthError,
  CanvasRateLimitError,
  type CanvasUploadSlot,
} from "./canvas/client";
import type { CanvasSubmission } from "./canvas/types";
import { outboxErrorKind, submissionFields } from "./schema";
import { mapSubmission } from "./sync";
import { applySubmissionUpdate } from "./syncStore";
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
const POST_TIMEOUT_MS = 90_000;
const UPLOAD_TIMEOUT_MS = 3 * 60_000;

export const RECONNECT_MESSAGE = "Canvas needs to be reconnected. Reconnect in Settings, then try again.";

type Row = Doc<"submissionOutbox">;
type Step = NonNullable<Row["step"]>;
type ErrorKind = Infer<typeof outboxErrorKind>;
type Progress = {
  step?: Step;
  baselineAttempt?: number;
  mayHavePosted?: boolean;
  uploaded?: { index: number; canvasFileId: number };
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
    // The next attempt must look before sending.
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
// Student actions

/** Files go to Convex storage first so delivery survives a closed tab. */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

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

    const fields = await validContent(ctx, args.content, assignment.allowedExtensions);
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
    await scheduleSend(ctx, id, 0);
    return id;
  },
});

async function validContent(ctx: MutationCtx, input: Infer<typeof content>, allowedExtensions: string[] | undefined) {
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
 * Moves a stalled row forward, by state: a queued retry runs now, a failed
 * row is sent again, an unconfirmed row is checked against Canvas.
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
    if (row.status !== "failed" && row.status !== "unconfirmed") fail("There is nothing to retry.");
    if ((await credentialState(ctx, row.userId)) !== "active") fail(RECONNECT_MESSAGE);
    if (row.status === "failed") {
      if ((await openRow(ctx, row.userId, row.assignmentCanvasId, row._id)) !== null) {
        fail("A submission for this assignment is already in progress.");
      }
      if (row.files?.some((f) => f.canvasFileId === undefined && f.storageId === undefined)) {
        fail("The files for this submission are gone. Submit them again.");
      }
    }
    await ctx.db.patch(row._id, {
      status: "queued",
      // An unconfirmed row may already be in Canvas: look before sending.
      checkOnly: row.status === "unconfirmed" ? true : undefined,
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

async function releaseFiles(ctx: MutationCtx, row: Row) {
  if (row.files === undefined) return undefined;
  for (const file of row.files) {
    if (file.storageId !== undefined && (await ctx.db.system.get(file.storageId)) !== null) {
      await ctx.storage.delete(file.storageId);
    }
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

/** Starts an attempt: marks the row `sending` and arms its watchdog. */
export const claim = internalMutation({
  args: { id: v.id("submissionOutbox") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (row === null || row.status !== "queued" || row.dismissed === true) return null;
    // A job that `resume` replaced may still fire; only a due row is sent.
    if (row.nextAttemptAt !== undefined && row.nextAttemptAt > Date.now()) return null;
    const attempt = row.attempt + 1;
    await ctx.db.patch(row._id, {
      status: "sending",
      step: "checking",
      attempt,
      attemptsLeft: row.attemptsLeft - 1,
      nextAttemptAt: undefined,
      jobId: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(LEASE_MS, internal.submissions.recover, { id: row._id, attempt });
    return { ...row, attempt };
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
    // `retry`: nothing reached Canvas. `check`: it may have; look first.
    kind: v.union(v.literal("retry"), v.literal("check"), outboxErrorKind),
    error: v.string(),
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
  const cleared = { step: undefined, checkOnly: undefined, nextAttemptAt: undefined, updatedAt: now };
  if (result.type === "submitted") {
    await ctx.db.patch(row._id, {
      ...cleared,
      status: "submitted",
      error: undefined,
      errorKind: undefined,
      mayHavePosted: undefined,
      canvasAttempt: result.canvasAttempt,
      canvasSubmittedAt: result.canvasSubmittedAt,
      files: await releaseFiles(ctx, row),
    });
    await applySubmissionUpdate(ctx, row.userId, row.assignmentCanvasId, result.submission);
    return;
  }
  const mayHavePosted = row.mayHavePosted === true;
  const final = (kind: ErrorKind) => {
    // A refusal is proof Canvas did not take it. Otherwise, while Canvas may
    // have it, "failed" would invite a duplicate.
    const definite = kind === "rejected";
    return ctx.db.patch(row._id, {
      ...cleared,
      status: !definite && (mayHavePosted || kind === "conflict") ? "unconfirmed" : "failed",
      mayHavePosted: definite ? undefined : row.mayHavePosted,
      error: result.error,
      errorKind: kind,
    });
  };
  if (result.kind !== "retry" && result.kind !== "check") return await final(result.kind);
  if (row.attemptsLeft <= 0) return await final("exhausted");
  const delay = retryDelay(AUTO_ATTEMPTS - row.attemptsLeft, mayHavePosted);
  await ctx.db.patch(row._id, {
    ...cleared,
    checkOnly: row.checkOnly,
    status: "queued",
    nextAttemptAt: now + delay,
    error: result.error,
    errorKind: undefined,
  });
  await scheduleSend(ctx, row._id, delay);
}

type Claimed = Row & { attempt: number };

class Superseded extends Error {}

/** One delivery attempt. Scheduled by `submit`, `resume` and retries. */
export const send = internalAction({
  args: { id: v.id("submissionOutbox") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row: Claimed | null = await ctx.runMutation(internal.submissions.claim, { id: args.id });
    if (row === null) return null;
    const state = { step: "checking" as Step, mayHavePosted: row.mayHavePosted === true };
    let result: Outcome;
    try {
      result = await deliver(ctx, row, state);
    } catch (error) {
      if (error instanceof Superseded) return null;
      if (error instanceof CanvasAuthError) {
        await ctx.runMutation(internal.credentials.markInvalid, { userId: row.userId });
      }
      result = classify(error, state);
    }
    await ctx.runMutation(internal.submissions.finish, { id: row._id, attempt: row.attempt, outcome: result });
    return null;
  },
});

async function deliver(
  ctx: ActionCtx,
  row: Claimed,
  state: { step: Step; mayHavePosted: boolean },
): Promise<Outcome> {
  const record = async (fields: Progress) => {
    if (fields.step !== undefined) state.step = fields.step;
    if (fields.mayHavePosted !== undefined) state.mayHavePosted = fields.mayHavePosted;
    const held = await ctx.runMutation(internal.submissions.progress, { id: row._id, attempt: row.attempt, ...fields });
    if (!held) throw new Superseded();
  };

  const { client } = await getCanvasClient(ctx, row.userId);
  const base = `/courses/${row.courseCanvasId}/assignments/${row.assignmentCanvasId}/submissions`;
  const files = row.files ?? [];
  const canvasFileIds = files.flatMap((f) => (f.canvasFileId === undefined ? [] : [f.canvasFileId]));
  const current = await client.get<CanvasSubmission>(`${base}/self`, { "include[]": ["submission_history"] });

  if (row.baselineAttempt === undefined) {
    await record({ baselineAttempt: current.attempt ?? 0 });
  } else {
    const contentSent: OutboxContent = { kind: row.kind, text: row.text, url: row.url, canvasFileIds };
    const delivery = findDelivery(current, row.baselineAttempt, contentSent);
    if (delivery.kind === "ours") return submitted(current, delivery.attempt);
    if (delivery.kind === "other") {
      return {
        type: "error",
        kind: "conflict",
        error: "Canvas shows a newer submission that is not this one. Check Canvas before sending again.",
      };
    }
    if (state.mayHavePosted) await record({ mayHavePosted: false });
  }
  if (row.checkOnly === true) {
    return { type: "error", kind: "notReceived", error: "Canvas has no record of this submission. You can send it again." };
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
      const blob = file.storageId === undefined ? null : await ctx.storage.get(file.storageId);
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
  return submitted(result, result.attempt ?? 0);
}

function submitted(submission: CanvasSubmission, attempt: number): Outcome {
  return {
    type: "submitted",
    canvasAttempt: attempt,
    canvasSubmittedAt: mapSubmission(submission).submittedAt,
    submission: mapSubmission(submission),
  };
}

/** What an error means for the row, given how far the attempt got. */
export function classify(error: unknown, state: { step: Step; mayHavePosted: boolean }): Outcome {
  const outcomeOf = (kind: Extract<Outcome, { type: "error" }>["kind"], message: string): Outcome => ({ type: "error", kind, error: message });
  if (error instanceof CanvasReconnectRequired || error instanceof CanvasAuthError) {
    return outcomeOf("reconnect", RECONNECT_MESSAGE);
  }
  // Canvas throttles before doing any work.
  if (error instanceof CanvasRateLimitError) {
    return outcomeOf(state.mayHavePosted ? "check" : "retry", "Canvas is busy. Trying again shortly.");
  }
  const posting = state.step === "submitting";
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
    return outcomeOf("check", "Canvas did not confirm in time. Checking whether it arrived before trying again.");
  }
  return outcomeOf("retry", "Could not reach Canvas. Trying again shortly.");
}
