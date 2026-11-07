import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink, ClipboardList } from "lucide-react";
import { CanvasHtml } from "@/components/reader/canvas-html";
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

  const when = announcement.postedAt === undefined ? undefined : formatAgo(announcement.postedAt, now);

  return (
    <article
      ref={ref}
      className="relative after:absolute after:right-4 after:bottom-0 after:left-[34px] after:h-px after:bg-line md:after:right-6 md:after:left-[42px]"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group grid w-full grid-cols-[6px_minmax(0,1fr)] gap-x-3 px-4 py-[13px] text-left transition-colors outline-none hover:bg-hover focus-visible:bg-hover md:px-6"
      >
        {/* The dot gutter is kept on read rows too, so titles never shift. */}
        <span className="flex justify-center pt-[8px]" aria-hidden>
          {unread && <span className="size-[6px] rounded-full bg-unread" />}
        </span>
        <span className="min-w-0">
          <span
            className={cn(
              "block text-[14.5px] leading-[1.4] tracking-[-0.01em] text-ink",
              unread ? "font-semibold" : "font-normal",
            )}
          >
            {announcement.title}
            {unread && <span className="sr-only"> (unread)</span>}
          </span>
          {/* The date rides the byline, next to the copy rather than at the far edge. */}
          <span className="mt-[2px] flex min-w-0 text-xs text-ink-3">
            <span className="truncate">{author}</span>
            {when !== undefined && <span className="tabular shrink-0">&nbsp;· {when}</span>}
          </span>
          {!open && (
            <span className="mt-[5px] line-clamp-2 max-w-[72ch] text-[13px] leading-[1.5] text-ink-3">
              {preview(announcement.message)}
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="pr-4 pb-5 pl-[34px] md:pr-6 md:pl-[42px]">
          <CanvasHtml
            html={announcement.message}
            courseId={courseId}
            className="max-w-[720px] text-[13.5px]"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="inline-flex h-7 max-w-[280px] items-center gap-[6px] rounded-md border border-line bg-surface px-[10px] text-[12.5px] font-medium text-ink no-underline transition-colors hover:border-line-2 hover:bg-hover"
              >
                <ClipboardList className="size-[13px] shrink-0 text-ink-3" />
                <span className="truncate">Open {link.label}</span>
              </Link>
            ))}
            <a
              href={announcement.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-7 items-center gap-[6px] rounded-md px-[10px] text-[12.5px] font-medium text-ink-3 no-underline transition-colors hover:bg-hover hover:text-ink"
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

/** Plain text of the body, cut at a word boundary past one line; CSS clamps the rest. */
function preview(html: string | undefined, max = 240): string {
  if (html === undefined) return "";
  const text = new DOMParser()
    .parseFromString(html, "text/html")
    .body.textContent!.replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const end = cut.lastIndexOf(" ");
  return `${(end > max * 0.6 ? cut.slice(0, end) : cut.slice(0, max)).replace(/[\s,;:.–—-]+$/, "")}…`;
}
