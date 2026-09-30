import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Check, FileUp, Link2, Loader2, RotateCw, Type, X } from "lucide-react";
import { sha256 } from "@noble/hashes/sha2.js";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { OutboxView } from "../../../convex/submissions";
import type { TodoItem } from "../../../convex/todos";
import {
  MAX_FILES,
  MAX_FILE_BYTES,
  MAX_TEXT_CHARS,
  extensionAllowed,
  lockReason,
  normalizeUrl,
  type SubmissionKind,
} from "../../../convex/lib/submissions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useDiscardDrafts, useDraft } from "@/lib/drafts";
import { dayKeyOf, formatDayShort, formatTime } from "@/lib/dates";
import { errorMessage } from "@/lib/ask";
import { useNow } from "@/lib/hooks";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";

type Panel = NonNullable<ReturnType<typeof useQuery<typeof api.submissions.panel>>>;

const KIND_LABEL: Record<SubmissionKind, string> = { text: "Text", url: "Website URL", file: "File upload" };
const KIND_ICON: Record<SubmissionKind, ReactNode> = {
  text: <Type className="size-[13px]" />,
  url: <Link2 className="size-[13px]" />,
  file: <FileUp className="size-[13px]" />,
};

/** What the student is about to send, as the confirmation shows it. */
type Pending =
  | { kind: "text"; text: string }
  | { kind: "url"; url: string }
  | { kind: "file"; files: Array<{ name: string; size: number }> };

/**
 * Submitting an assignment from wiscourse. Every send goes through a
 * confirmation, then an outbox row whose state this panel shows as Canvas
 * reports it; nothing is marked submitted until Canvas confirms.
 */
export function SubmissionPanel({ item }: { item: TodoItem }) {
  const assignmentCanvasId = item.canvasId!;
  const panel = useQuery(api.submissions.panel, { assignmentCanvasId });
  const now = useNow(15_000);
  if (panel === undefined || panel === null) return null;

  const row = panel.outbox;
  const open = row !== null && (row.status === "queued" || row.status === "sending" || row.status === "unconfirmed");
  const locked = lockReason(panel, now);
  const reconnect = panel.credential !== "active";

  let composer: ReactNode = null;
  if (open) {
    // One submission at a time; the card above says what is happening.
  } else if (panel.kinds.length === 0) {
    if (panel.canvasOnly) composer = <Note>This assignment takes a kind of submission wiscourse cannot send. Submit it in Canvas.</Note>;
  } else if (locked !== undefined) composer = <Note>{locked}</Note>;
  else if (reconnect) composer = <ReconnectNote />;
  else composer = <Composer item={item} panel={panel} />;

  return (
    <div className="mt-2 flex flex-col gap-2">
      {row !== null && <OutboxCard row={row} item={item} panel={panel} now={now} />}
      {composer}
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <div className="text-[12.5px] text-ink-3">{children}</div>;
}

function ReconnectNote() {
  return (
    <Note>
      Canvas needs to be reconnected before wiscourse can submit.{" "}
      <Link to="/settings" className="text-ink underline">Reconnect in Settings</Link>
    </Note>
  );
}

// ---------------------------------------------------------------------------
// Composing

function Composer({ item, panel }: { item: TodoItem; panel: Panel }) {
  const group = `submission:${item.canvasId}`;
  const [expanded, setExpanded] = useDraft(`${group}:expanded`, false);
  const [chosen, setKind] = useDraft<SubmissionKind>(`${group}:kind`, panel.kinds[0]);
  const [text, setText] = useDraft(`${group}:text`, "");
  const [url, setUrl] = useDraft(`${group}:url`, "");
  const [files, setFiles] = useDraft<File[]>(`${group}:files`, []);
  const [confirming, setConfirming] = useDraft<string | null>(`${group}:confirm`, null);
  const discardDrafts = useDiscardDrafts(group);
  // Discarding does not re-render; collapsing does, and reads fresh drafts.
  const discard = () => {
    discardDrafts();
    setExpanded(false);
  };
  const kind = panel.kinds.includes(chosen) ? chosen : panel.kinds[0];

  if (!expanded) {
    return (
      <div>
        <Button size="sm" onClick={() => setExpanded(true)}>
          {panel.submittedAt !== undefined ? "Resubmit…" : "Submit…"}
        </Button>
      </div>
    );
  }

  const problem = contentProblem(kind, { text, url, files }, panel.allowedExtensions);
  const pending: Pending = kind === "text" ? { kind, text: text.trim() }
    : kind === "url" ? { kind, url: normalizeUrl(url) ?? url }
    : { kind, files: files.map((f) => ({ name: f.name, size: f.size })) };

  return (
    <div className="rounded-lg border border-line p-3">
      {panel.kinds.length > 1 && (
        <div role="tablist" aria-label="Submission type" className="mb-3 flex gap-1">
          {panel.kinds.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={k === kind}
              onClick={() => setKind(k)}
              className={cn(
                "flex h-7 items-center gap-[6px] rounded-md px-[9px] text-[12.5px] font-medium",
                k === kind ? "bg-chip text-ink" : "text-ink-3 hover:text-ink",
              )}
            >
              {KIND_ICON[k]}
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      )}
      {kind === "text" && (
        <textarea
          aria-label="Submission text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write your submission…"
          rows={8}
          className="w-full resize-y rounded-md border border-line bg-surface p-2 text-[13px] leading-[1.55] outline-none focus:border-line-2"
        />
      )}
      {kind === "url" && (
        <input
          aria-label="Submission URL"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
          className="h-8 w-full rounded-md border border-line bg-surface px-2 text-[13px] outline-none focus:border-line-2"
        />
      )}
      {kind === "file" && <FilePicker files={files} setFiles={setFiles} allowed={panel.allowedExtensions} />}
      {problem !== undefined && (kind !== "text" || text.length > 0) && (kind !== "url" || url.length > 0) && (kind !== "file" || files.length > 0) && (
        <div className="mt-2 text-[12px] text-red">{problem}</div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" disabled={problem !== undefined} onClick={() => setConfirming(newClientKey())}>
          Review submission
        </Button>
        <Button size="sm" variant="ghost" className="text-ink-3" onClick={discard}>
          Cancel
        </Button>
      </div>
      {confirming !== null && (
        <ConfirmDialog
          item={item}
          panel={panel}
          content={pending}
          onCancel={() => setConfirming(null)}
          send={async (report, uploads) => {
            const content = kind === "file"
              ? { kind, files: await uploadFiles(files, report, uploads) }
              : kind === "text" ? { kind, text } : { kind, url };
            report("Adding to the outbox…");
            return { clientKey: confirming, content };
          }}
          onQueued={discard}
        />
      )}
    </div>
  );
}

/** Identifies one confirmation. `randomUUID` needs a secure origin; this does not. */
function newClientKey(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

function contentProblem(
  kind: SubmissionKind,
  input: { text: string; url: string; files: File[] },
  allowed: string[] | undefined,
): string | undefined {
  switch (kind) {
    case "text":
      if (input.text.trim().length === 0) return "Write something to submit.";
      if (input.text.length > MAX_TEXT_CHARS) return "This is too long to submit from wiscourse. Submit it in Canvas.";
      return undefined;
    case "url":
      return normalizeUrl(input.url) === undefined ? "Enter a full web address starting with http:// or https://." : undefined;
    case "file": {
      if (input.files.length === 0) return "Choose a file.";
      if (input.files.length > MAX_FILES) return `Choose at most ${MAX_FILES} files.`;
      const big = input.files.find((f) => f.size > MAX_FILE_BYTES);
      if (big) return `"${big.name}" is over 20 MB. Submit large files in Canvas.`;
      const wrong = input.files.find((f) => !extensionAllowed(f.name, allowed));
      if (wrong) return `Canvas does not accept "${wrong.name}" here. Allowed: ${allowed?.join(", ")}.`;
      return undefined;
    }
  }
}

function FilePicker({ files, setFiles, allowed }: { files: File[]; setFiles: (next: File[]) => void; allowed: string[] | undefined }) {
  return (
    <div>
      <label className="flex h-8 w-fit cursor-pointer items-center gap-2 rounded-md border border-line-2 px-3 text-[12.5px] font-medium">
        <FileUp className="size-[14px]" />
        Choose files
        <input
          type="file"
          multiple
          aria-label="Files to submit"
          accept={allowed?.map((e) => `.${e.replace(/^\./, "")}`).join(",")}
          className="sr-only"
          onChange={(e) => {
            const chosen = Array.from(e.target.files ?? []);
            setFiles([...files, ...chosen.filter((f) => !files.some((g) => g.name === f.name && g.size === f.size))]);
            e.target.value = "";
          }}
        />
      </label>
      <div className="mt-1 text-[11.5px] text-ink-3">
        {allowed ? `Allowed: ${allowed.join(", ")}. ` : ""}Up to {MAX_FILES} files, 20 MB each.
      </div>
      {files.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {files.map((f, i) => (
            <li key={`${f.name}:${f.size}`} className="flex items-center gap-2 text-[12.5px]">
              <span className="truncate">{f.name}</span>
              <span className="text-ink-3">{formatBytes(f.size)}</span>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
                className="ml-auto text-ink-3 hover:text-ink"
              >
                <X className="size-[13px]" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

class UploadError extends Error {}

type Uploads = {
  generateUploadUrl: (args: { sha256: string; size: number }) => Promise<string>;
  registerUpload: (args: { storageId: Id<"_storage"> }) => Promise<null>;
};

/**
 * Stores the files in Convex first, so delivery does not depend on this tab.
 * The server takes a file as this user's only if its hash matches the one
 * declared here, so a storage id alone cannot claim someone else's upload.
 */
async function uploadFiles(files: File[], report: (status: string) => void, uploads: Uploads) {
  const stored = [];
  for (const [i, file] of files.entries()) {
    report(`Uploading ${i + 1} of ${files.length}…`);
    const url = await uploads.generateUploadUrl({ sha256: base64Sha256(new Uint8Array(await file.arrayBuffer())), size: file.size });
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!response.ok) throw new UploadError(`"${file.name}" did not upload (error ${response.status}). Try again.`);
    const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
    await uploads.registerUpload({ storageId });
    stored.push({ storageId, name: file.name });
  }
  return stored;
}

// Web Crypto needs a secure origin; this hash does not.
function base64Sha256(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of sha256(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// Confirming

type SubmitArgs = Parameters<ReturnType<typeof useMutation<typeof api.submissions.submit>>>[0];

/**
 * The explicit confirmation before any Canvas write. `send` prepares the
 * mutation arguments (uploading files first); `resend` sends an outbox row
 * again, warning when Canvas may already have it.
 */
function ConfirmDialog({
  item,
  panel,
  content,
  onCancel,
  send,
  resend,
  onQueued,
}: {
  item: TodoItem;
  panel: Panel;
  content: Pending;
  onCancel: () => void;
  send?: (report: (status: string) => void, uploads: Uploads) => Promise<Omit<SubmitArgs, "assignmentCanvasId" | "confirmed">>;
  resend?: OutboxView;
  onQueued: () => void;
}) {
  const submit = useMutation(api.submissions.submit);
  const sendAgain = useMutation(api.submissions.sendAgain);
  const generateUploadUrl = useMutation(api.submissions.generateUploadUrl);
  const registerUpload = useMutation(api.submissions.registerUpload);
  const online = useOnline();
  const group = `submission:${item.canvasId}`;
  const [status, setStatus] = useDraft<string | null>(`${group}:status`, null);
  const [error, setError] = useDraft<string | null>(`${group}:error`, null);
  const now = useNow();
  const late = item.dueAt !== undefined && item.dueAt < now;
  const busy = status !== null;

  const confirm = async () => {
    setError(null);
    setStatus("Preparing…");
    try {
      if (resend !== undefined) await sendAgain({ id: resend.id, confirmed: true });
      else await submit({ ...(await send!(setStatus, { generateUploadUrl, registerUpload })), assignmentCanvasId: item.canvasId!, confirmed: true });
      setStatus(null);
      onQueued();
    } catch (e) {
      setStatus(null);
      setError(e instanceof UploadError ? e.message : errorMessage(e));
    }
  };
  const close = () => {
    setError(null);
    onCancel();
  };

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !busy) close(); }}>
      <DialogContent className="max-w-[480px] p-5">
        <DialogTitle className="text-[15px] font-semibold tracking-[-0.015em]">
          {resend !== undefined ? "Send this submission again?" : "Submit to Canvas?"}
        </DialogTitle>
        <DialogDescription className="mt-1 text-[12.5px] text-ink-3">
          {item.title}
        </DialogDescription>

        <div className="mt-4 rounded-lg border border-line bg-sunken p-3">
          <div className="mb-2 flex items-center gap-[6px] text-[11.5px] font-medium text-ink-3">
            {KIND_ICON[content.kind]}
            {KIND_LABEL[content.kind]}
          </div>
          <ContentPreview content={content} />
        </div>

        <ul className="mt-3 flex flex-col gap-1 text-[12.5px] text-ink-2">
          {resend?.status === "unconfirmed" && (
            <li className="text-red">
              Canvas may already have the earlier send and not show it yet. Sending again could make a second
              attempt. wiscourse checks Canvas first and stops if the earlier send appears.
            </li>
          )}
          {panel.submittedAt !== undefined && <li>Canvas keeps your earlier submission. This becomes a new attempt.</li>}
          {late && <li className="text-red">The due date has passed. Canvas may mark this late.</li>}
          <li>wiscourse sends it in the background and shows here when Canvas confirms it.</li>
        </ul>

        {!online && <div className="mt-3 text-[12.5px] text-red">You are offline. Submit once you are back online.</div>}
        {error !== null && <div role="alert" className="mt-3 text-[12.5px] text-red">{error}</div>}

        <div className="mt-5 flex items-center gap-2">
          <Button size="sm" disabled={busy || !online} onClick={() => void confirm()}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {busy ? status : "Submit to Canvas"}
          </Button>
          <DialogClose asChild>
            <Button size="sm" variant="ghost" className="ml-auto text-ink-3" disabled={busy}>
              Cancel
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ContentPreview({ content }: { content: Pending }) {
  switch (content.kind) {
    case "text":
      return <div className="max-h-48 overflow-y-auto text-[13px] leading-[1.55] whitespace-pre-wrap">{content.text}</div>;
    case "url":
      return <div className="text-[13px] break-all">{content.url}</div>;
    case "file":
      return (
        <ul className="flex flex-col gap-1 text-[13px]">
          {content.files.map((f) => (
            <li key={`${f.name}:${f.size}`} className="flex gap-2">
              <span className="truncate">{f.name}</span>
              <span className="text-ink-3">{formatBytes(f.size)}</span>
            </li>
          ))}
        </ul>
      );
  }
}

// ---------------------------------------------------------------------------
// Outbox state

function OutboxCard({ row, item, panel, now }: { row: OutboxView; item: TodoItem; panel: Panel; now: number }) {
  const resume = useMutation(api.submissions.resume);
  const dismiss = useMutation(api.submissions.dismiss);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reconnect = panel.credential !== "active";
  const act = (run: () => Promise<unknown>) => {
    setError(null);
    run().catch((e: unknown) => setError(errorMessage(e)));
  };

  let tone: "plain" | "good" | "bad" | "warn" = "plain";
  let icon: ReactNode;
  let title: string;
  let detail: ReactNode = null;
  let actions: ReactNode = null;
  const dismissButton = (
    <Button size="xs" variant="ghost" className="text-ink-3" onClick={() => act(() => dismiss({ id: row.id }))}>
      Dismiss
    </Button>
  );

  switch (row.status) {
    case "queued": {
      const waiting = row.nextAttemptAt !== undefined && row.nextAttemptAt > now;
      icon = waiting ? <RotateCw /> : <Loader2 className="animate-spin" />;
      title = waiting
        ? row.awaitingCheck ? "Waiting to check Canvas" : "Waiting to try again"
        : row.checkOnly || row.awaitingCheck ? "Checking Canvas shortly" : "Queued to send";
      detail = waiting ? `${row.error ?? ""} Next ${row.awaitingCheck ? "check" : "try"} at ${formatTime(row.nextAttemptAt!)}.` : "You can leave this page.";
      if (waiting && !row.awaitingCheck) {
        actions = (
          <Button size="xs" variant="outline" onClick={() => act(() => resume({ id: row.id }))}>
            Try now
          </Button>
        );
      }
      break;
    }
    case "sending": {
      icon = <Loader2 className="animate-spin" />;
      const files = row.files ?? [];
      title = row.step === "uploading"
        ? `Uploading files to Canvas (${Math.min(files.filter((f) => f.uploaded).length + 1, files.length)} of ${files.length})`
        : row.step === "submitting" ? "Sending to Canvas" : "Checking Canvas";
      detail = "You can leave this page.";
      break;
    }
    case "submitted":
      tone = "good";
      icon = <Check />;
      title = row.canvasAttempt ? `Canvas confirmed attempt ${row.canvasAttempt}` : "Canvas confirmed it";
      detail = row.canvasSubmittedAt !== undefined
        ? `Submitted ${formatDayShort(dayKeyOf(row.canvasSubmittedAt))}, ${formatTime(row.canvasSubmittedAt)}`
        : null;
      actions = dismissButton;
      break;
    case "failed":
      tone = "bad";
      icon = <AlertTriangle />;
      title = FAILED_TITLE[row.errorKind ?? "rejected"];
      detail = row.error;
      actions = (
        <>
          {reconnect ? (
            <Button size="xs" variant="outline" asChild><Link to="/settings">Reconnect in Settings</Link></Button>
          ) : (
            <Button size="xs" variant="outline" onClick={() => setResending(true)}>Try again…</Button>
          )}
          {dismissButton}
        </>
      );
      break;
    case "unconfirmed":
      tone = "warn";
      icon = <AlertTriangle />;
      title = row.errorKind === "conflict" ? "Canvas has a different submission" : "Not confirmed yet";
      detail = (
        <>
          {row.error} Canvas may already have this. wiscourse will not send it again unless you choose to.
        </>
      );
      actions = (
        <>
          {reconnect ? (
            <Button size="xs" variant="outline" asChild><Link to="/settings">Reconnect in Settings</Link></Button>
          ) : (
            <>
              <Button size="xs" variant="outline" onClick={() => act(() => resume({ id: row.id }))}>Check Canvas again</Button>
              <Button size="xs" variant="ghost" onClick={() => setResending(true)}>Send again…</Button>
            </>
          )}
          {item.htmlUrl && (
            <Button size="xs" variant="ghost" asChild>
              <a href={item.htmlUrl} target="_blank" rel="noreferrer">Open in Canvas</a>
            </Button>
          )}
          <Button
            size="xs"
            variant="ghost"
            className="text-ink-3"
            onClick={() => {
              if (confirm("Dismiss without knowing whether Canvas has this submission?")) act(() => dismiss({ id: row.id }));
            }}
          >
            Dismiss
          </Button>
        </>
      );
      break;
  }

  return (
    <div
      data-status={row.status}
      className={cn(
        "rounded-lg border px-3 py-[10px]",
        tone === "bad" ? "border-red/30 bg-red-bg" : tone === "warn" ? "border-line-2 bg-sunken" : "border-line bg-sunken",
      )}
    >
      <div className="flex items-start gap-2">
        <span className={cn("mt-[2px] [&_svg]:size-[14px]", tone === "bad" ? "text-red" : tone === "warn" ? "text-[var(--course-amber)]" : tone === "good" ? "text-ink" : "text-ink-3")}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium" role="status">{title}</div>
          {detail && <div className="mt-[2px] text-xs text-ink-2">{detail}</div>}
          <div className="mt-[2px] truncate text-xs text-ink-3">{summarize(row)}</div>
          {error !== null && <div role="alert" className="mt-1 text-xs text-red">{error}</div>}
          {actions && <div className="mt-2 flex flex-wrap items-center gap-1">{actions}</div>}
        </div>
      </div>
      {resending && (
        <ConfirmDialog
          item={item}
          panel={panel}
          content={row.kind === "text" ? { kind: "text", text: row.text ?? "" } : row.kind === "url" ? { kind: "url", url: row.url ?? "" } : { kind: "file", files: row.files ?? [] }}
          resend={row}
          onCancel={() => setResending(false)}
          onQueued={() => setResending(false)}
        />
      )}
    </div>
  );
}

const FAILED_TITLE = {
  rejected: "Canvas refused this submission",
  reconnect: "Canvas needs to be reconnected",
  exhausted: "Could not reach Canvas",
  conflict: "Canvas has a different submission",
} as const;

function summarize(row: OutboxView): string {
  switch (row.kind) {
    case "text": {
      const words = (row.text ?? "").split(/\s+/).filter(Boolean).length;
      return `Text · ${words} word${words === 1 ? "" : "s"}`;
    }
    case "url":
      return row.url ?? "";
    case "file":
      return (row.files ?? []).map((f) => f.name).join(", ");
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
