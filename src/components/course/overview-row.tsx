import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { RowIcon } from "./overview-icons";
import { UnreadDot } from "./unread-dot";
import { cn } from "@/lib/utils";

/**
 * The overview's row: type icon · title · meta, with a trailing unread dot
 * when the caller tracks one. `line` rows sit in the main column (meta drops
 * under the title on phones); `rail` rows are the side column's: a title
 * of up to two lines with its meta line underneath.
 */
export function OverviewRow({
  icon: Icon,
  title,
  meta,
  unread,
  to,
  href,
  onClick,
  variant = "line",
  className,
}: {
  icon: RowIcon;
  title: ReactNode;
  meta?: ReactNode;
  /** Pass a boolean to reserve the dot slot so a column of rows lines up. */
  unread?: boolean;
  to?: string;
  href?: string;
  onClick?: () => void;
  variant?: "line" | "rail";
  className?: string;
}) {
  const rail = variant === "rail";
  const dot =
    unread === undefined ? null : (
      <span className="flex w-[6px] shrink-0 justify-end" aria-hidden={!unread}>
        {unread && <UnreadDot />}
      </span>
    );
  const body = rail ? (
    <>
      <Icon className="mt-[2px] size-[14px] shrink-0 text-ink-3" />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "line-clamp-2 leading-[1.4] tracking-[-0.005em]",
            unread ? "font-medium text-ink" : "text-ink-2",
          )}
        >
          {title}
        </span>
        {meta !== undefined && (
          <span className="tabular mt-[2px] block truncate text-[12px] text-ink-3">{meta}</span>
        )}
      </span>
      {dot !== null && <span className="mt-[6px] flex">{dot}</span>}
    </>
  ) : (
    <>
      <Icon className="mt-[2px] size-[14px] shrink-0 text-ink-3 md:mt-0" />
      <span className="flex min-w-0 flex-1 flex-col gap-[2px] md:flex-row md:items-center md:gap-4">
        <span className={cn("min-w-0 md:truncate", unread === true && "font-medium")}>{title}</span>
        {meta !== undefined && (
          <span className="tabular flex shrink-0 items-center gap-2 text-[12px] whitespace-nowrap text-ink-3 md:ml-auto">
            {meta}
          </span>
        )}
      </span>
      {dot !== null && <span className="mt-[6px] flex md:mt-0">{dot}</span>}
    </>
  );
  const interactive = to !== undefined || href !== undefined;
  const cls = cn(
    "relative flex w-full gap-[10px] text-left text-[13px] text-ink no-underline transition-colors outline-none",
    rail
      ? "items-start rounded-md px-2 py-[9px]"
      : "items-start py-[9px] pr-4 pl-4 after:absolute after:right-0 after:bottom-0 after:left-10 after:h-px after:bg-line md:items-center md:pr-6 md:pl-6 md:after:left-12",
    interactive && "hover:bg-hover focus-visible:bg-hover",
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

/**
 * The heading above each overview block, in the Home section style:
 * sentence case, 13px semibold, quiet detail beside it, extras at the right.
 * `muted` is the smaller sub-heading inside a block.
 */
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
          "min-w-0 truncate",
          muted
            ? "text-[12.5px] font-medium text-ink-2"
            : "text-[13px] font-semibold tracking-[-0.005em] text-ink",
          red && "text-red",
        )}
      >
        {title}
      </span>
      {detail !== undefined && (
        <span className="min-w-0 truncate text-[12.5px] text-ink-3">{detail}</span>
      )}
      {right !== undefined && (
        <span className="ml-auto flex shrink-0 items-center gap-[6px] text-[12px] text-ink-3">
          {right}
        </span>
      )}
    </>
  );
  const base = cn(
    "flex items-baseline gap-2 px-4 md:px-6",
    muted ? "pt-3 pb-1" : "pt-6 pb-2",
    className,
  );
  return to === undefined ? (
    <div className={base}>{inner}</div>
  ) : (
    <Link to={to} className={cn(base, "transition-colors hover:bg-hover")}>
      {inner}
    </Link>
  );
}
