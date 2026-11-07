import type { ComponentType } from "react";
import { useInboxFeed } from "@/lib/list-queries";
import { useMutation } from "convex/react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock, FilePlus2, GraduationCap, Megaphone } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { FeedItem } from "../../../convex/inbox";
import { CountBadge, CourseTag } from "@/components/app/bits";
import { formatAgo } from "@/lib/dates";
import { feedSeenKind, feedStatus, feedTitle, groupFeed } from "@/lib/feed";
import { FEED_ROW } from "./feed-row";
import { courseStyle, useCourses } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const ICON = { announcement: Megaphone, grade: GraduationCap, assignment: FilePlus2, change: Clock } as const;

/**
 * Gutter dot · type icon · title (two lines max) with the time on the right,
 * then course tag and what happened. One layout for every feed glance.
 */
export function FeedRowBody({
  icon: Icon,
  title,
  unread,
  course,
  status,
  time,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  unread: boolean;
  /** Short course label; omitted inside a course page. */
  course?: string;
  status?: string;
  time: string;
}) {
  return (
    <>
      <span className="flex w-[6px] shrink-0 justify-center pt-[7px]">
        {unread && <span className="size-[6px] rounded-full bg-unread" aria-label="Unread" />}
      </span>
      <Icon className="mt-[2px] size-[15px] shrink-0 text-ink-3" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "line-clamp-2 min-w-0 flex-1 text-[13px] leading-[1.4] tracking-[-0.005em]",
              unread ? "font-medium text-ink" : "text-ink-2",
            )}
          >
            {title}
          </div>
          <span className="shrink-0 pt-px text-[12px] text-ink-3 tabular">{time}</span>
        </div>
        {(course !== undefined || status !== undefined) && (
          <div className="mt-[3px] flex min-w-0 items-center gap-[6px] text-[12.5px] whitespace-nowrap text-ink-3">
            {course !== undefined && <CourseTag className="shrink-0">{course}</CourseTag>}
            {course !== undefined && status !== undefined && (
              <span className="text-line-2" aria-hidden>
                ·
              </span>
            )}
            {status !== undefined && <span className="min-w-0 truncate">{status}</span>}
          </div>
        )}
      </div>
    </>
  );
}

export function FeedCard({ item, now }: { item: FeedItem; now: number }) {
  const { label, color } = useCourses();
  const markSeen = useMutation(api.seenState.markSeen);

  return (
    <a
      href={item.htmlUrl}
      target="_blank"
      rel="noreferrer"
      onClick={() => {
        if (!item.seen) {
          void markSeen({
            kind: feedSeenKind(item.type),
            canvasId: item.canvasId,
            seenVersion: item.seenVersion,
          });
        }
      }}
      className={FEED_ROW}
      style={courseStyle(color(item.courseCanvasId))}
    >
      <FeedRowBody
        icon={ICON[item.type]}
        title={feedTitle(item)}
        unread={!item.seen}
        course={label(item.courseCanvasId)}
        status={feedStatus(item)}
        time={formatAgo(item.at, now)}
      />
    </a>
  );
}

const RAIL_LIMIT = 8;

export function NewRail({ todayKey, now }: { todayKey: string; now: number }) {
  const feed = useInboxFeed();
  const markAll = useMutation(api.inbox.markAllSeen);
  const unseen = feed?.filter((f) => !f.seen) ?? [];
  const groups = groupFeed((feed ?? []).slice(0, RAIL_LIMIT), todayKey, now);

  return (
    <aside className="hidden w-[340px] shrink-0 flex-col border-l border-line bg-surface xl:flex">
      <div className="flex min-h-[44px] items-center gap-2 px-4 pt-3 pb-1">
        <span className="text-[13px] font-semibold tracking-[-0.01em]">New</span>
        <CountBadge n={unseen.length} />
        {unseen.length > 0 && (
          <button type="button" onClick={() => void markAll()} className="ml-auto text-[12px] text-ink-3 transition-colors hover:text-ink">
            Mark all read
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {feed === undefined ? null : feed.length === 0 ? (
          <div className="px-6 py-10 text-center text-[12.5px] leading-[1.5] text-ink-3">
            Nothing new. Announcements, new assignments and posted grades land here.
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.label}>
              <div className="px-4 pt-3 pb-1 text-[12px] font-medium text-ink-3">{g.label}</div>
              {g.items.map((f) => (
                <FeedCard key={f.key} item={f} now={now} />
              ))}
            </div>
          ))
        )}
      </div>
      <Link
        to="/inbox"
        className="mt-auto flex items-center gap-[6px] border-t border-line px-4 py-3 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink"
      >
        View all in Inbox
        <ArrowRight className="size-[13px]" aria-hidden />
      </Link>
    </aside>
  );
}
