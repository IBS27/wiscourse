import { useInboxFeed } from "@/lib/list-queries";
import { useMutation } from "convex/react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock, FilePlus2, GraduationCap, Megaphone } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { FeedItem } from "../../../convex/inbox";
import { CountBadge, CourseTag } from "@/components/app/bits";
import { formatAgo } from "@/lib/dates";
import { feedSeenKind, feedSubtitle, feedTitle, groupFeed } from "@/lib/feed";
import { courseStyle, useCourses } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const ICON = { announcement: Megaphone, grade: GraduationCap, assignment: FilePlus2, change: Clock } as const;

export function FeedCard({ item, now }: { item: FeedItem; now: number }) {
  const { label, color } = useCourses();
  const markSeen = useMutation(api.seenState.markSeen);
  const Icon = ICON[item.type];
  // The rail is a glance: what happened, not the announcement body.
  const subtitle = item.type === "announcement" ? "Announcement" : feedSubtitle(item);

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
      className="group relative flex gap-[10px] py-[10px] pr-4 pl-[10px] text-inherit no-underline transition-colors after:absolute after:bottom-0 after:right-4 after:left-[51px] after:h-px after:bg-line last:after:hidden hover:bg-hover"
      style={courseStyle(color(item.courseCanvasId))}
    >
      {/* Unread lives in one fixed gutter, left of the icon, on every feed list. */}
      <span className="flex w-[6px] shrink-0 justify-center pt-[7px]">
        {!item.seen && <span className="size-[6px] rounded-full bg-unread" aria-label="Unread" />}
      </span>
      <Icon className="mt-[2px] size-[15px] shrink-0 text-ink-3" aria-hidden />
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-[13px] leading-[1.4] tracking-[-0.005em]",
            item.seen ? "text-ink-2" : "font-medium text-ink",
          )}
          title={feedTitle(item)}
        >
          {feedTitle(item)}
        </div>
        <div className="mt-[3px] flex min-w-0 items-center gap-[6px] text-[12px] whitespace-nowrap text-ink-3">
          <CourseTag className="shrink-0">{label(item.courseCanvasId)}</CourseTag>
          {subtitle && (
            <>
              <span className="text-line-2" aria-hidden>·</span>
              <span className="min-w-0 truncate">{subtitle}</span>
            </>
          )}
          <span className="ml-auto shrink-0 pl-2 tabular">{formatAgo(item.at, now)}</span>
        </div>
      </div>
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
