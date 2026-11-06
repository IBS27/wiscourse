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
  const meta = [author, when].filter(Boolean).join(" · ");

  return (
    <article
      ref={ref}
      className="relative after:absolute after:right-4 after:bottom-0 after:left-4 after:h-px after:bg-line md:after:right-6 md:after:left-6"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group relative block w-full px-4 py-[14px] text-left transition-colors outline-none hover:bg-hover focus-visible:bg-hover md:px-6"
      >
        <div className="flex items-baseline gap-4">
          <div
            className={cn(
              "min-w-0 flex-1 text-[14.5px] leading-[1.4] tracking-[-0.01em]",
              unread ? "font-medium text-ink" : "text-ink-2",
            )}
          >
            {announcement.title}
            {unread && <span className="sr-only"> (unread)</span>}
          </div>
          <span className="tabular hidden shrink-0 text-[12px] text-ink-3 md:block">{meta}</span>
        </div>
        <div className="tabular mt-[2px] text-[12.5px] text-ink-3 md:hidden">{meta}</div>
        {!open && (
          <p
            className={cn(
              "mt-[5px] line-clamp-2 max-w-[700px] text-[13px] leading-[1.55]",
              unread ? "text-ink-2" : "text-ink-3",
            )}
          >
            {preview(announcement.message)}
          </p>
        )}
      </button>

      {open && (
        <div className="px-4 pb-5 md:px-6">
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

function preview(html: string | undefined): string {
  if (html === undefined) return "";
  return new DOMParser()
    .parseFromString(html, "text/html")
    .body.textContent!.replace(/\s+/g, " ")
    .trim();
}
