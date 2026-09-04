import { useEffect, useState, type ReactNode } from "react";
import { useAction } from "convex/react";
import { ArrowLeft, Download, ExternalLink, Lock } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { FileTypeIcon } from "./file-icon";
import { previewKind, typeLabel } from "./file-kinds";
import type { FileDoc } from "./file-tree";
import { Skeleton } from "@/components/ui/skeleton";
import { canvasUrl } from "@/lib/course-routes";
import { formatMonthDayYear } from "@/lib/dates";
import { formatBytes } from "@/lib/format";
import { useMarkSeenOnMount } from "@/lib/seen";
import { useSyncInfo } from "@/lib/sync-info";
import { cn } from "@/lib/utils";

/** Above this an inline text preview is a wall of characters — offer the file. */
const TEXT_MAX_BYTES = 256 * 1024;

type PreviewFile = Pick<FileDoc, "canvasId"> & Partial<Pick<FileDoc,
  "displayName" | "filename" | "size" | "lockedForUser" | "updatedAt" | "modifiedAt" | "_creationTime"
>>;
type FileName = { displayName: string; filename: string };

type Fetched =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; url: string; contentType: string; size: number; filename: string; displayName: string; updatedAt?: number };

/**
 * Canvas download links carry a short-lived verifier, so every selection
 * asks `files.freshUrl` for a new one. Mount with `key={file.canvasId}`:
 * one instance per selection, so "loading" is the initial state.
 */
export function FilePreview({
  file,
  courseId,
  onClose,
  className,
}: {
  file: PreviewFile;
  courseId: string;
  /** Rendered as a back arrow on mobile; omitted in the desktop pane. */
  onClose?: () => void;
  className?: string;
}) {
  const freshUrl = useAction(api.files.freshUrl);
  const sync = useSyncInfo();
  const [fetched, setFetched] = useState<Fetched>({ status: "loading" });

  const locked = file.lockedForUser === true;
  const canvasHref = canvasUrl(`courses/${courseId}/files/${file.canvasId}`, sync?.instance);
  useMarkSeenOnMount("file", fetched.status === "ready" ? file.canvasId : undefined);
  const metadata = fetched.status === "ready" ? fetched : file;
  const name = { displayName: metadata.displayName ?? "File", filename: metadata.filename ?? "file" };
  const addedAt = metadata.updatedAt ?? file.modifiedAt ?? file._creationTime;

  useEffect(() => {
    if (locked) return;
    let cancelled = false;
    void freshUrl({ fileCanvasId: file.canvasId })
      .then((result) => {
        if (!cancelled) setFetched({ status: "ready", ...result });
      })
      .catch(() => {
        if (!cancelled) setFetched({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [file.canvasId, locked, freshUrl]);

  return (
    <div className={cn("flex min-h-0 flex-col bg-sunken", className)}>
      <div className="flex shrink-0 items-center gap-[10px] border-b border-line px-[14px] py-[10px]">
        {onClose !== undefined && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="-ml-2 shrink-0 rounded-md p-1 text-ink-3 hover:bg-hover"
          >
            <ArrowLeft className="size-[18px]" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {locked && <Lock className="size-[13px] shrink-0 text-ink-3" aria-hidden />}
            <div className="truncate text-[13px] font-medium">{name.displayName}</div>
          </div>
          <div className="mt-px truncate text-[11.5px] text-ink-3">
            {metadata.size !== undefined && formatBytes(metadata.size)}
            {addedAt !== undefined && ` · ${formatMonthDayYear(addedAt)}`}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-[6px]">
          {fetched.status === "ready" ? (
            <a
              href={fetched.url}
              download={name.filename}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-[27px] items-center gap-[6px] rounded-lg bg-today px-[9px] text-xs font-medium text-today-fg"
            >
              <Download className="size-[13px]" />
              Download
            </a>
          ) : (
            <span
              aria-disabled
              className="inline-flex h-[27px] items-center gap-[6px] rounded-lg border border-line px-[9px] text-xs font-medium text-ink-3"
            >
              <Download className="size-[13px]" />
              Download
            </span>
          )}
          <a
            href={canvasHref}
            target="_blank"
            rel="noreferrer"
            aria-label="Open in Canvas"
            className="grid size-[27px] place-items-center rounded-lg border border-line text-ink-3 hover:bg-hover"
          >
            <ExternalLink className="size-[14px]" />
          </a>
        </div>
      </div>

      {locked ? (
        <Centered>
          <Lock className="size-5 text-ink-3" aria-hidden />
          <p className="text-[13px] font-medium">Locked in Canvas</p>
          <p className="text-xs text-ink-3">Your instructor hasn’t released this file yet.</p>
        </Centered>
      ) : (
        <PreviewBody file={name} fetched={fetched} />
      )}
    </div>
  );
}

function PreviewBody({ file, fetched }: { file: FileName; fetched: Fetched }) {
  if (fetched.status === "loading") {
    return (
      <div className="min-h-0 flex-1 space-y-[10px] p-5">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-[220px] w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }
  if (fetched.status === "error") {
    return (
      <Centered>
        <p className="text-[13px] font-medium">Preview unavailable</p>
      </Centered>
    );
  }

  const kind = previewKind(fetched.contentType, file.filename);
  const src = inlineUrl(fetched.url);

  if (kind === "pdf") {
    return (
      <iframe
        src={src}
        title={file.displayName}
        className="min-h-0 w-full flex-1 border-0 bg-white"
      />
    );
  }
  if (kind === "image") {
    return (
      <div className="grid min-h-0 flex-1 place-items-center overflow-auto p-5">
        <img src={src} alt={file.displayName} className="max-h-full max-w-full object-contain" />
      </div>
    );
  }
  if (kind === "text" && fetched.size <= TEXT_MAX_BYTES) {
    return <TextPreview key={src} url={src} file={file} fetched={fetched} />;
  }
  return <DownloadCard file={file} fetched={fetched} />;
}

// Canvas' storage host has a CORS policy we do not control, so an inline
// text preview is best-effort: any failure falls back to the download card.
function TextPreview({
  url,
  file,
  fetched,
}: {
  url: string;
  file: FileName;
  fetched: Extract<Fetched, { status: "ready" }>;
}) {
  const [body, setBody] = useState<string | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const abort = new AbortController();
    fetch(url, { signal: abort.signal, credentials: "omit" })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.text();
      })
      .then((text) => setBody(text))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFailed(true);
      });
    return () => abort.abort();
  }, [url]);

  if (failed) return <DownloadCard file={file} fetched={fetched} />;
  if (body === undefined) {
    return (
      <div className="min-h-0 flex-1 space-y-[10px] p-5">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    );
  }
  return (
    <pre className="min-h-0 flex-1 overflow-auto bg-surface p-[14px] font-mono text-[12px] leading-[1.55] whitespace-pre text-ink-2">
      {body}
    </pre>
  );
}

function DownloadCard({
  file,
  fetched,
}: {
  file: FileName;
  fetched: Extract<Fetched, { status: "ready" }>;
}) {
  return (
    <Centered>
      <FileTypeIcon
        contentType={fetched.contentType}
        filename={file.filename}
        className="size-6 text-ink-3"
      />
      <p className="max-w-[280px] truncate text-[13px] font-medium">{file.displayName}</p>
      <p className="text-xs text-ink-3">
        {typeLabel(fetched.contentType, file.filename)} · {formatBytes(fetched.size)}
      </p>
      <a
        href={fetched.url}
        download={file.filename}
        target="_blank"
        rel="noreferrer"
        className="mt-1 inline-flex h-[30px] items-center gap-[6px] rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink-2 hover:bg-hover"
      >
        <Download className="size-[13px]" />
        Download
      </a>
    </Centered>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[7px] p-6 text-center">
      {children}
    </div>
  );
}

/** Dropping `download_frd` returns the same bytes inline, which is what an
 *  iframe or an `<img>` needs; the Download button keeps the raw URL. */
function inlineUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("download_frd");
    return parsed.toString();
  } catch {
    return url;
  }
}

export function PreviewEmpty({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col items-center justify-center bg-sunken p-6 text-center",
        className,
      )}
    >
      <p className="text-[13px] text-ink-3">Select a file to preview it</p>
    </div>
  );
}
