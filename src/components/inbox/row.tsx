import { Link } from "@tanstack/react-router";
import type { FeedItem } from "../../../convex/inbox";
import { formatAgo } from "@/lib/dates";
import { feedSubtitle, feedTitle } from "@/lib/feed";
import { courseStyle, useCourses } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { CourseTag } from "@/components/app/bits";
import { FEED_ICON } from "./format";

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
        "group relative isolate flex cursor-pointer items-start py-[11px] pr-4 pl-[10px] text-inherit no-underline focus-visible:outline-none md:pr-6 md:pl-[18px]",
        // Hairline between rows, from the title column to the content edge.
        "after:absolute after:right-4 after:bottom-0 after:left-[51px] after:h-px after:bg-line md:after:right-6 md:after:left-[59px]",
        // Hover, focus and selection fill an inset rounded plate, 8px in from the list edges.
        "before:absolute before:inset-x-1 before:inset-y-[2px] before:-z-10 before:rounded-[6px] before:transition-colors md:before:inset-x-2",
        "focus-visible:before:bg-hover",
        // Selected sits a clear step above hover in both themes; its own hairline drops so the plate reads as one block.
        // The row above drops its hairline too, so nothing touches the plate.
        "[&:has(+[aria-current])]:after:hidden",
        selected ? "before:bg-[color-mix(in_oklab,var(--ink)_6%,transparent)] before:shadow-[inset_2px_0_0_var(--ink)] after:hidden" : "hover:before:bg-hover",
      )}
      style={courseStyle(color(item.courseCanvasId))}
    >
      {/* Unread lives in one fixed gutter, left of the icon, on every feed list. */}
      <span className="mr-2 flex w-[6px] shrink-0 justify-center pt-[7px]">
        {!item.seen && <span className="size-[6px] rounded-full bg-unread" role="img" aria-label="Unread" />}
      </span>
      <Icon className="mt-[3px] mr-3 size-[15px] shrink-0 text-ink-3" aria-hidden />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "line-clamp-2 text-[14px] leading-[1.4] tracking-[-0.005em]",
            item.seen ? "font-normal text-ink" : "font-semibold text-ink",
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
          <span className="tabular ml-auto shrink-0 pl-2">{formatAgo(item.at, now)}</span>
        </span>
      </span>
    </Link>
  );
}
