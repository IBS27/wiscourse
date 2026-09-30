// Rules for assignment submissions, shared by the outbox and the UI.

import type { CanvasSubmission } from "../canvas/types";

export type SubmissionKind = "text" | "url" | "file";

export const MAX_TEXT_CHARS = 100_000;
export const MAX_URL_CHARS = 2_048;
export const MAX_FILES = 10;
// One file is held in memory while it goes to Canvas; Convex actions have 64 MB.
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const CANVAS_TYPE: Record<SubmissionKind, string> = {
  text: "online_text_entry",
  url: "online_url",
  file: "online_upload",
};

// Online types wiscourse does not submit; the student uses Canvas for these.
const CANVAS_ONLY_TYPES = new Set([
  "media_recording",
  "student_annotation",
  "external_tool",
  "basic_lti_launch",
  "online_quiz",
  "discussion_topic",
  "wiki_page",
]);

export function acceptedKinds(submissionTypes: string[]): SubmissionKind[] {
  return (["text", "url", "file"] as const).filter((kind) => submissionTypes.includes(CANVAS_TYPE[kind]));
}

export function hasCanvasOnlyTypes(submissionTypes: string[]): boolean {
  return submissionTypes.some((type) => CANVAS_ONLY_TYPES.has(type));
}

/** Why Canvas would refuse a submission right now, from the synced dates. */
export function lockReason(
  assignment: { lockedForUser?: boolean; unlockAt?: number; lockAt?: number },
  now: number,
): string | undefined {
  if (assignment.unlockAt !== undefined && assignment.unlockAt > now) return "This assignment is not open yet.";
  if (assignment.lockAt !== undefined && assignment.lockAt <= now) return "This assignment is closed in Canvas.";
  if (assignment.lockedForUser === true) return "Canvas has locked this assignment.";
  return undefined;
}

export function extensionAllowed(name: string, allowed: string[] | undefined): boolean {
  if (allowed === undefined || allowed.length === 0) return true;
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  const extension = name.slice(dot + 1).toLowerCase();
  return allowed.some((a) => a.replace(/^\./, "").toLowerCase() === extension);
}

/** An http(s) URL in canonical form, or undefined. */
export function normalizeUrl(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_URL_CHARS) return undefined;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Plain text as the HTML Canvas stores for a text entry: paragraphs and line breaks. */
export function textToHtml(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${paragraph.replace(/[&<>"']/g, (c) => ESCAPES[c]).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Visible text of a Canvas body, for comparing what Canvas stored with what was sent. */
export function visibleText(html: string): string {
  return html
    .replace(/<br\s*\/?>|<\/p>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export interface OutboxContent {
  kind: SubmissionKind;
  text?: string;
  url?: string;
  canvasFileIds: number[];
}

export type Delivery =
  | { kind: "none" }
  | { kind: "ours"; attempt: number; submittedAt: string | null }
  | { kind: "other" };

/**
 * Canvas has no idempotency key for submissions, so after a send that may
 * have landed, the only proof is Canvas itself: a new attempt past the
 * baseline whose content is ours.
 */
export function findDelivery(current: CanvasSubmission, baselineAttempt: number, content: OutboxContent): Delivery {
  const versions = [current, ...(current.submission_history ?? [])];
  const newer = versions.filter((s) => (s.attempt ?? 0) > baselineAttempt);
  if (newer.length === 0) return { kind: "none" };
  const ours = newer.find((s) => matches(s, content));
  return ours ? { kind: "ours", attempt: ours.attempt ?? 0, submittedAt: ours.submitted_at } : { kind: "other" };
}

function matches(submission: CanvasSubmission, content: OutboxContent): boolean {
  if (submission.submission_type !== CANVAS_TYPE[content.kind]) return false;
  switch (content.kind) {
    case "text":
      return visibleText(submission.body ?? "") === visibleText(textToHtml(content.text ?? ""));
    case "url":
      return submission.url != null && normalizeUrl(submission.url) === content.url;
    case "file": {
      const ids = new Set((submission.attachments ?? []).map((a) => a.id));
      return content.canvasFileIds.length > 0 && content.canvasFileIds.every((id) => ids.has(id));
    }
  }
}

export const AUTO_ATTEMPTS = 4;
const RETRY_DELAYS_MS = [30_000, 2 * 60_000, 8 * 60_000];
// After a send that may have landed, wait until Canvas has surely finished
// the request before checking, or a slow write could look missing.
const CHECK_DELAY_MS = 90_000;

export function retryDelay(attemptsUsed: number, mayHavePosted: boolean): number {
  const delay = RETRY_DELAYS_MS[Math.min(Math.max(attemptsUsed - 1, 0), RETRY_DELAYS_MS.length - 1)];
  return mayHavePosted ? Math.max(delay, CHECK_DELAY_MS) : delay;
}

/** Canvas's own error text from a JSON error body, when it has one. */
export function canvasErrorText(body: string | undefined): string | undefined {
  if (!body) return undefined;
  try {
    const parsed: unknown = JSON.parse(body);
    const found: string[] = [];
    const walk = (value: unknown) => {
      if (typeof value === "string") return;
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") {
        for (const [key, item] of Object.entries(value)) {
          if (key === "message" && typeof item === "string") found.push(item);
          else walk(item);
        }
      }
    };
    walk(parsed);
    return found.length > 0 ? found.join(" ").slice(0, 300) : undefined;
  } catch {
    return undefined;
  }
}
