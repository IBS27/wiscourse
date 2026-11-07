import { Link } from "@tanstack/react-router";
import type { FeedItem } from "../../../convex/inbox";
import { formatAgo } from "@/lib/dates";
import { feedSubtitle, feedTitle } from "@/lib/feed";
import { courseStyle, useCourses } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { CourseTag } from "@/components/app/bits";
import { FEED_ICON } from "./format";
import { WordTruncate } from "./word-truncate";

/** Unread gutter, icon, title, then "MATH 234 · Graded 10/10 · 2h". Unread rows carry a dot and a heavier title. */
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
        "group relative isolate flex cursor-pointer items-start py-[11px] pr-4 pl-4 text-inherit no-underline focus-visible:outline-none md:pr-8 md:pl-8",
        // Hairline between rows, from the title column to the content edge.
        "after:absolute after:right-4 after:bottom-0 after:left-[65px] after:h-px after:bg-line md:after:right-8 md:after:left-[81px]",
        // Hover, focus and selection fill a rounded plate that stays inside the list's gutters.
        "before:absolute before:inset-x-1 before:inset-y-[2px] before:-z-10 before:rounded-[6px] before:transition-colors md:before:inset-x-6",
        "focus-visible:before:bg-hover",
        // Selected sits a clear step above hover in both themes; its own hairline drops so the plate reads as one block.
        // The row above drops its hairline too, so nothing touches the plate.
        "[&:has(+[aria-current])]:after:hidden",
        selected ? "before:bg-[color-mix(in_oklab,var(--ink)_7%,transparent)] after:hidden" : "hover:before:bg-hover",
      )}
      style={courseStyle(color(item.courseCanvasId))}
    >
      {/* Unread lives in one fixed 12px column, left of the icon, on every feed list. */}
      <span className="mr-[10px] flex w-3 shrink-0 justify-center pt-[7px]">
        {!item.seen && <span className="size-[6px] rounded-full bg-unread" role="img" aria-label="Unread" />}
      </span>
      <Icon className="mt-[3px] mr-3 size-[15px] shrink-0 text-ink-3" aria-hidden />
      <span className="min-w-0 flex-1">
        {/* Time on the title line, right-aligned — the same place as every feed list. */}
        <span className="flex items-start gap-3">
          <span
            className={cn(
              "line-clamp-2 min-w-0 flex-1 text-[14px] leading-[1.4] tracking-[-0.005em]",
              item.seen ? "font-normal text-ink" : "font-semibold text-ink",
            )}
          >
            {feedTitle(item)}
          </span>
          <span className="tabular shrink-0 pt-px text-[12.5px] text-ink-3">{formatAgo(item.at, now)}</span>
        </span>
        <span className="mt-[3px] flex min-w-0 items-center gap-[6px] text-[12.5px] text-ink-3">
          <CourseTag className="shrink-0">{label(item.courseCanvasId) ?? "Course"}</CourseTag>
          {subtitle !== undefined && (
            <>
              <span aria-hidden>·</span>
              <WordTruncate text={subtitle} />
            </>
          )}
        </span>
      </span>
    </Link>
  );
}
