import { Link } from "@tanstack/react-router";
import { Clock, FilePlus2, Megaphone, Star } from "lucide-react";
import type { FeedItem } from "../../../convex/inbox";
import { formatAgo } from "@/lib/dates";
import { feedSubtitle, feedTitle } from "@/lib/feed";
import { courseStyle, useCourses } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const FEED_ICON = {
  announcement: Megaphone,
  grade: Star,
  assignment: FilePlus2,
  change: Clock,
} as const;

/** Icon, title, "CS 537 · preview…", relative time; a rail when unseen. */
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
      className={cn(
        "relative flex min-h-[52px] items-start gap-3 border-b border-line px-4 py-[9px] text-inherit no-underline",
        "hover:bg-hover focus-visible:bg-hover focus-visible:outline-none",
        selected && "bg-hover shadow-[inset_0_0_0_1px_var(--line)]",
        !item.seen &&
          "before:absolute before:top-[15px] before:left-0 before:h-4 before:w-[3px] before:rounded-r-[3px] before:bg-c",
      )}
      style={courseStyle(color(item.courseCanvasId))}
    >
      <Icon className="mt-[3px] size-[15px] shrink-0 text-ink-3" />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[13.5px] leading-[1.35] tracking-[-0.005em]",
            item.seen ? "text-ink-2" : "font-semibold text-ink",
          )}
        >
          {feedTitle(item)}
        </span>
        <span className="mt-[2px] block truncate text-[12px] text-ink-3">
          <span className="font-medium text-c">{label(item.courseCanvasId) ?? "Course"}</span>
          {subtitle !== undefined && <> · {subtitle}</>}
        </span>
      </span>
      <span className="tabular mt-[3px] shrink-0 text-[12px] text-ink-3">{formatAgo(item.at, now)}</span>
    </Link>
  );
}
