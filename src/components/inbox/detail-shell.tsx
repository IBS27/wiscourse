import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ExternalLink, Mail } from "lucide-react";
import type { FeedItem } from "../../../convex/inbox";
import { Button } from "@/components/ui/button";
import { courseStyle, useCourses } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { CourseTag } from "@/components/app/bits";
import { FEED_ICON } from "./format";

/** Reading column shared by the detail pane and its loading state. */
export const READING = "mx-auto w-full max-w-[720px] px-4 pt-4 pb-12 md:px-8 md:pt-7";

/** Mobile-only way back to the list; on lg the list sits beside the pane. */
export function BackToInbox() {
  return (
    <Link
      to="/inbox"
      search={(prev) => ({ ...prev, item: undefined })}
      className="mb-4 -ml-1 inline-flex h-8 items-center gap-1 rounded-md pr-2 text-[13px] font-medium text-ink-3 no-underline transition-colors hover:text-ink lg:hidden"
    >
      <ChevronLeft className="size-4" />
      Inbox
    </Link>
  );
}

/** The frame every detail pane shares: kind line, title, by-line, actions, body. */
export function DetailShell({
  item,
  kind,
  title,
  by,
  actions,
  children,
}: {
  item: FeedItem;
  /** What happened: "Announcement", "Graded 10/10", … */
  kind: ReactNode;
  title: ReactNode;
  by?: ReactNode;
  actions: ReactNode;
  children?: ReactNode;
}) {
  const { label, color } = useCourses();
  const Icon = FEED_ICON[item.type];
  return (
    <article className={READING} style={courseStyle(color(item.courseCanvasId))}>
      <BackToInbox />

      <div className="mb-[10px] flex items-center gap-2 text-[12.5px] text-ink-3">
        <CourseTag>{label(item.courseCanvasId) ?? "Course"}</CourseTag>
        <span aria-hidden>·</span>
        <span className="inline-flex min-w-0 items-center gap-[5px]">
          <Icon className="size-[13px] shrink-0" aria-hidden />
          <span className="truncate">{kind}</span>
        </span>
      </div>

      <h1 className="text-[22px] leading-[1.25] font-semibold tracking-[-0.022em] text-balance text-ink">{title}</h1>
      {by !== undefined && (
        <div className="mt-[10px] flex items-center gap-2 text-[12.5px] text-ink-3">{by}</div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2 border-b border-line pb-5 [&_[data-slot=button]]:text-[13px]">
        {actions}
      </div>

      <div className="pt-6">{children}</div>
    </article>
  );
}

/** "Cassie Williams · Nov 2, 12:02 PM" with an initials chip; either half may be missing. */
export function ByLine({ name, when }: { name?: string; when: string }) {
  return (
    <>
      {name !== undefined && <Initials name={name} />}
      {name !== undefined && <span className="font-medium text-ink-2">{name}</span>}
      {name !== undefined && <span aria-hidden>·</span>}
      <span className="tabular">{when}</span>
    </>
  );
}

/** Initials chip beside an author name. */
export function Initials({ name }: { name: string }) {
  const letters = name
    .replace(/[^\p{L}\s,]/gu, "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  if (letters === "") return null;
  return (
    <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-chip text-[9.5px] font-semibold text-ink-2">
      {letters}
    </span>
  );
}

/** Key numbers as a quiet row of label-over-value pairs. */
export function Facts({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl
      className={cn(
        "tabular grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border border-line px-4 py-[14px] sm:grid-cols-[repeat(auto-fit,minmax(130px,1fr))]",
        className,
      )}
    >
      {children}
    </dl>
  );
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="mb-1 text-[12px] text-ink-3">{label}</dt>
      <dd className="text-[14px] font-medium text-ink">{children}</dd>
    </div>
  );
}

export function BlockLabel({ children }: { children: ReactNode }) {
  return <h2 className="mt-7 mb-3 text-[13px] font-semibold tracking-[-0.01em] text-ink">{children}</h2>;
}

export function CanvasButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button asChild size="sm" variant="outline">
      <a href={href} target="_blank" rel="noreferrer">
        <ExternalLink />
        {children}
      </a>
    </Button>
  );
}

export function MarkUnreadButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label="Mark unread"
      title="Mark unread"
      className="text-ink-3 hover:text-ink sm:ml-auto"
      onClick={onClick}
      disabled={disabled}
    >
      <Mail />
      <span className="hidden sm:inline">Mark unread</span>
    </Button>
  );
}
