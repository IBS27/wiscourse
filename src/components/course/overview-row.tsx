import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { OVERVIEW_ROW, OVERVIEW_ROW_NO_ICON, SECTION_TITLE, type RowIcon } from "./overview-icons";
import { cn } from "@/lib/utils";

/**
 * The overview's row, in the Home/Tasks anatomy: type icon · title (two
 * lines at most) with the meta line under it. One weight for every row:
 * these lists have no unread state. A list whose rows would all draw the
 * same icon passes none, and the hairline moves out to the gutter.
 */
export function OverviewRow({
  icon: Icon,
  title,
  meta,
  to,
  href,
  onClick,
  className,
}: {
  icon?: RowIcon;
  title: ReactNode;
  meta?: ReactNode;
  to?: string;
  href?: string;
  onClick?: () => void;
  className?: string;
}) {
  const body = (
    <>
      {Icon !== undefined && <Icon className="mt-[2px] size-[15px] shrink-0 text-ink-3" />}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[14px] leading-[1.4] font-medium tracking-[-0.006em] text-ink">
          {title}
        </span>
        {meta !== undefined && (
          <span className="tabular mt-[3px] flex min-w-0 items-center gap-[6px] text-[12.5px] whitespace-nowrap text-ink-3">
            {meta}
          </span>
        )}
      </span>
    </>
  );
  const interactive = to !== undefined || href !== undefined;
  const cls = cn(
    OVERVIEW_ROW,
    Icon === undefined && OVERVIEW_ROW_NO_ICON,
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
 * The heading above each overview block: sentence case, the body's loudest
 * label, quiet detail beside it, extras at the right. `muted` is the
 * smaller sub-heading inside a block.
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
            : SECTION_TITLE,
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
    muted ? "pt-3 pb-1" : "pt-5 pb-2 md:pt-6",
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
