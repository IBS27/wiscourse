import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ExternalLink } from "lucide-react";
import type { FeedItem } from "../../../convex/inbox";
import { Button } from "@/components/ui/button";
import { UnreadDot } from "@/components/course/unread-dot";
import { courseStyle, useCourses } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/** The frame every detail pane shares: eyebrow, title, by-line, body, actions. */
export function DetailShell({
  item,
  eyebrow,
  title,
  by,
  actions,
  children,
}: {
  item: FeedItem;
  /** The part after the course code: "Grade posted · Homework 3". */
  eyebrow: string;
  title: ReactNode;
  by?: ReactNode;
  actions: ReactNode;
  children?: ReactNode;
}) {
  const { label, color } = useCourses();
  return (
    <article className="px-4 pt-4 pb-8 md:px-7 md:pt-6" style={courseStyle(color(item.courseCanvasId))}>
      <Link
        to="/inbox"
        search={(prev) => ({ ...prev, item: undefined })}
        className="mb-4 -ml-1 inline-flex items-center gap-1 text-[13px] text-ink-3 no-underline hover:text-ink lg:hidden"
      >
        <ChevronLeft className="size-4" />
        Inbox
      </Link>

      <div className="mb-2 flex items-center gap-2 text-[11.5px] text-ink-3">
        <UnreadDot />
        <span className="font-medium text-c">{label(item.courseCanvasId) ?? "Course"}</span>
        <span>·</span>
        <span className="truncate">{eyebrow}</span>
      </div>

      <h1 className="text-[19px] leading-[1.25] font-semibold tracking-[-0.02em]">{title}</h1>
      {by !== undefined && (
        <div className="mt-[6px] flex items-center gap-2 text-[12.5px] text-ink-3">{by}</div>
      )}

      <div className="mt-[18px]">{children}</div>

      <div className="mt-[22px] flex flex-wrap items-center gap-2 border-t border-line pt-4">{actions}</div>
    </article>
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
    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-chip text-[9px] font-semibold text-ink-2">
      {letters}
    </span>
  );
}

/** The bordered stat tiles: Score · Class median · Weight · Course now. */
export function Facts({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl
      className={cn(
        "tabular grid grid-cols-2 gap-x-4 gap-y-[14px] border-y border-line py-[14px] text-[13px] text-ink md:grid-cols-4",
        className,
      )}
    >
      {children}
    </dl>
  );
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="eyebrow mb-1 text-[10.5px]">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function BlockLabel({ children }: { children: ReactNode }) {
  return <div className="eyebrow mt-5 mb-1 text-[10.5px]">{children}</div>;
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
    <Button size="sm" variant="ghost" className="ml-auto text-ink-3" onClick={onClick} disabled={disabled}>
      Mark unread
    </Button>
  );
}
