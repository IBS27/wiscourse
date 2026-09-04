import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { RowIcon } from "./overview-icons";
import { UnreadDot } from "./unread-dot";
import { cn } from "@/lib/utils";

/** The overview's row: unread dot, type icon, title, right-aligned meta. */
export function OverviewRow({
  icon: Icon,
  title,
  meta,
  unread = false,
  to,
  href,
  onClick,
  className,
}: {
  icon: RowIcon;
  title: ReactNode;
  meta?: ReactNode;
  unread?: boolean;
  to?: string;
  href?: string;
  onClick?: () => void;
  className?: string;
}) {
  const body = (
    <>
      {/* Always rendered so titles line up whether or not a row is new. */}
      <span className="-ml-4 shrink-0">
        {unread ? <UnreadDot /> : <span className="block size-[6px]" aria-hidden />}
      </span>
      <Icon className="size-[14px] shrink-0 text-ink-3" />
      <span className={cn("truncate", unread && "font-medium")}>{title}</span>
      {meta !== undefined && (
        <span className="tabular ml-auto flex shrink-0 items-center gap-2 text-[11.5px] whitespace-nowrap text-ink-3">
          {meta}
        </span>
      )}
    </>
  );
  const cls = cn(
    "flex w-full items-center gap-[10px] border-b border-line py-2 pr-4 pl-9 text-left text-[13px] text-ink no-underline md:pr-5",
    (to !== undefined || href !== undefined) && "hover:bg-hover",
    className,
  );

  if (to !== undefined) {
    return (
      <Link to={to} onClick={onClick} className={cls}>
        {body}
      </Link>
    );
  }
  if (href !== undefined) {
    return (
      <a href={href} target="_blank" rel="noreferrer" onClick={onClick} className={cls}>
        {body}
      </a>
    );
  }
  return <div className={cls}>{body}</div>;
}

/** The uppercase section rule above each block. */
export function SectionHead({
  title,
  detail,
  right,
  red = false,
  muted = false,
  to,
  className,
}: {
  title: string;
  detail?: ReactNode;
  right?: ReactNode;
  red?: boolean;
  muted?: boolean;
  to?: string;
  className?: string;
}) {
  const inner = (
    <>
      <span
        className={cn(
          "text-[11.5px] font-semibold tracking-[0.09em] uppercase",
          red && "text-red",
          muted && "text-ink-3",
        )}
      >
        {title}
      </span>
      {detail !== undefined && (
        <span className="truncate text-[11.5px] tracking-[0.01em] text-ink-3">{detail}</span>
      )}
      {right !== undefined && (
        <span className="ml-auto flex shrink-0 items-center gap-[6px] text-[11px] font-semibold text-ink-3">
          {right}
        </span>
      )}
    </>
  );
  const base = cn("flex items-center gap-2 px-4 pt-4 pb-[7px] md:px-5", className);
  return to === undefined ? (
    <div className={base}>{inner}</div>
  ) : (
    <Link to={to} className={cn(base, "hover:bg-hover")}>
      {inner}
    </Link>
  );
}
