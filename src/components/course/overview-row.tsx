import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { RowIcon } from "./overview-icons";
import { UnreadDot } from "./unread-dot";
import { cn } from "@/lib/utils";

/**
 * The overview's row: type icon · title · meta. `line` rows sit in the main
 * column (meta drops under the title on phones) and carry unread with title
 * weight alone. `rail` rows are the side column's feed: unread is a dot in a
 * fixed gutter left of the icon, as on Home, with a title of up to two
 * lines and its meta line underneath.
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
  /** Undefined when the caller does not track it: the title stays plain ink. */
  unread?: boolean;
  to?: string;
  href?: string;
  onClick?: () => void;
  variant?: "line" | "rail";
  className?: string;
}) {
  const rail = variant === "rail";
  const weight =
    unread === undefined ? undefined : unread ? "font-medium text-ink" : "text-ink-2";
  const body = rail ? (
    <>
      <span className="flex h-[18px] w-[6px] shrink-0 items-center">
        {unread === true && <UnreadDot />}
        {unread === true && <span className="sr-only">Unread</span>}
      </span>
      <Icon className="mt-[2px] size-[14px] shrink-0 text-ink-3" />
      <span className="min-w-0 flex-1">
        <span className={cn("line-clamp-2 leading-[18px] tracking-[-0.005em]", weight)}>
          {title}
        </span>
        {meta !== undefined && (
          <span className="tabular mt-[3px] block truncate text-[12px] text-ink-3">{meta}</span>
        )}
      </span>
    </>
  ) : (
    <>
      <Icon className="mt-[2px] size-[14px] shrink-0 text-ink-3 md:mt-0" />
      <span className="flex min-w-0 flex-1 flex-col gap-[2px] md:flex-row md:items-center md:gap-4">
        <span className={cn("min-w-0 md:truncate", weight)}>{title}</span>
        {meta !== undefined && (
          <span className="tabular flex shrink-0 items-center gap-2 text-[12px] whitespace-nowrap text-ink-3 md:ml-auto">
            {meta}
          </span>
        )}
      </span>
    </>
  );
  const interactive = to !== undefined || href !== undefined;
  const cls = cn(
    "relative flex w-full gap-[10px] text-left text-[13px] text-ink no-underline transition-colors outline-none",
    rail
      ? "items-start py-[10px] pr-5 pl-[14px] after:absolute after:right-5 after:bottom-0 after:left-[54px] after:h-px after:bg-line last:after:hidden"
      : "items-start py-[9px] pr-4 pl-4 after:absolute after:right-4 after:bottom-0 after:left-10 after:h-px after:bg-line md:items-center md:pr-6 md:pl-6 md:after:right-6 md:after:left-12",
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
