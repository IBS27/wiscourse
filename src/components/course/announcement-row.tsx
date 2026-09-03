import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink, SquareCheck } from "lucide-react";
import { CanvasHtml } from "@/components/reader/canvas-html";
import { Initials } from "@/components/inbox/detail-shell";
import { fileHref, rewriteCanvasHref } from "@/lib/course-routes";
import { formatAgo } from "@/lib/dates";
import { cn } from "@/lib/utils";

export interface Announcement {
  canvasId: number;
  title: string;
  message?: string;
  authorName?: string;
  postedAt?: number;
  htmlUrl: string;
}

export function AnnouncementRow({
  announcement,
  courseId,
  open,
  unread,
  now,
  autoScroll = false,
  onToggle,
}: {
  announcement: Announcement;
  courseId: number;
  open: boolean;
  unread: boolean;
  now: number;
  /** Set when the row was opened by a deep link rather than a click. */
  autoScroll?: boolean;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (autoScroll) ref.current?.scrollIntoView({ block: "center" });
  }, [autoScroll]);

  const author = announcement.authorName ?? "Course staff";
  const links = detectLinks(announcement.message, courseId);

  return (
    <article
      ref={ref}
      className={cn(
        "relative border-b border-line",
        open && "bg-surface",
        unread &&
          "before:absolute before:top-[14px] before:left-0 before:h-4 before:w-[3px] before:rounded-r-[3px] before:bg-c",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="block w-full px-4 pt-[13px] pb-[14px] text-left hover:bg-hover md:px-5"
      >
        <div className="flex items-center gap-2 text-xs text-ink-3">
          <Initials name={author} />
          <span className="truncate font-medium text-ink-2">{author}</span>
          <span className="tabular ml-auto shrink-0">
            {announcement.postedAt === undefined ? "" : formatAgo(announcement.postedAt, now)}
          </span>
        </div>
        <div
          className={cn(
            "mt-1 text-[14px] tracking-[-0.005em]",
            unread ? "font-semibold" : "font-medium",
          )}
        >
          {announcement.title}
        </div>
        {!open && (
          <div className="mt-[3px] line-clamp-2 text-[12.5px] leading-[1.5] text-ink-3">
            {preview(announcement.message)}
          </div>
        )}
      </button>

      {open && (
        <div className="px-4 pb-[14px] md:px-5">
          <CanvasHtml html={announcement.message} courseId={courseId} className="text-[13.5px]" />
          <div className="mt-3 flex flex-wrap gap-2">
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="inline-flex h-[27px] max-w-[280px] items-center gap-[6px] rounded-lg border border-line bg-surface px-[10px] text-xs font-medium text-ink no-underline hover:bg-hover"
              >
                <SquareCheck className="size-[13px] shrink-0 text-ink-3" />
                <span className="truncate">Open {link.label}</span>
              </Link>
            ))}
            <a
              href={announcement.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-[27px] items-center gap-[6px] rounded-lg px-[10px] text-xs font-medium text-ink-3 no-underline hover:bg-hover hover:text-ink"
            >
              <ExternalLink className="size-[13px]" />
              Reply in Canvas
            </a>
          </div>
        </div>
      )}
    </article>
  );
}

/** Assignments, pages and files the body points at, in document order. */
function detectLinks(html: string | undefined, courseId: number): { to: string; label: string }[] {
  if (html === undefined || html === "") return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: { to: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const anchor of doc.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href");
    if (href === null) continue;
    const link = rewriteCanvasHref(href, courseId);
    let to: string | undefined;
    if (link.kind === "internal" && /^\/todo\/|\/pages\//.test(link.to)) to = link.to;
    else if (link.kind === "file") to = fileHref(link.courseId, link.fileId);
    if (to === undefined || seen.has(to)) continue;
    seen.add(to);
    const text = (anchor.textContent ?? "").replace(/\s+/g, " ").trim();
    out.push({ to, label: text === "" ? "link" : text });
    if (out.length === 3) break;
  }
  return out;
}

function preview(html: string | undefined): string {
  if (html === undefined) return "";
  return new DOMParser()
    .parseFromString(html, "text/html")
    .body.textContent!.replace(/\s+/g, " ")
    .trim();
}
