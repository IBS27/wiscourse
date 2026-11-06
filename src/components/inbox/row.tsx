import { Link } from "@tanstack/react-router";
import type { FeedItem } from "../../../convex/inbox";
import { formatAgo } from "@/lib/dates";
import { feedSubtitle, feedTitle } from "@/lib/feed";
import { courseStyle, useCourses } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { CourseTag } from "@/components/app/bits";
import { FEED_ICON } from "./format";

/** Icon, title, then "CS 537 · preview… · 2h"; a dot and a heavier title when unseen. */
export function InboxRow({
  item,
  now,
  dueAt,
  selected,
}: {
  item: FeedItem;
  now: number;
  dueAt?: number;
  selected: boolean;
}) {
  const { label, color } = useCourses();
  const Icon = FEED_ICON[item.type];
  const subtitle = feedSubtitle(item, dueAt);

  return (
    <Link
      to="/inbox"
      search={(prev) => ({ ...prev, item: item.key })}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group relative flex cursor-pointer items-start gap-3 px-4 py-[11px] text-inherit no-underline transition-colors md:px-6",
        // Hairline between rows, inset to the title column.
        "after:absolute after:right-0 after:bottom-0 after:left-[43px] after:h-px after:bg-line md:after:left-[51px]",
        "focus-visible:bg-hover focus-visible:outline-none",
        selected ? "bg-[color-mix(in_oklab,var(--ink)_6%,transparent)]" : "hover:bg-hover",
      )}
      style={courseStyle(color(item.courseCanvasId))}
    >
      <Icon className={cn("mt-[3px] size-[15px] shrink-0", item.seen ? "text-ink-3" : "text-ink-2")} aria-hidden />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "line-clamp-2 text-[14px] leading-[1.4] tracking-[-0.005em]",
            item.seen ? "text-ink-2" : "font-medium text-ink",
          )}
        >
          {feedTitle(item)}
        </span>
        <span className="mt-[3px] flex min-w-0 items-center gap-[6px] text-[12.5px] text-ink-3">
          <CourseTag className="shrink-0">{label(item.courseCanvasId) ?? "Course"}</CourseTag>
          {subtitle !== undefined && (
            <>
              <span aria-hidden>·</span>
              <span className="min-w-0 truncate">{subtitle}</span>
            </>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-[6px] pl-2">
            <span className="tabular">{formatAgo(item.at, now)}</span>
            <span
              className={cn("size-[6px] rounded-full", item.seen ? "bg-transparent" : "bg-unread")}
              aria-label={item.seen ? undefined : "Unread"}
              role={item.seen ? undefined : "img"}
            />
          </span>
        </span>
      </span>
    </Link>
  );
}
