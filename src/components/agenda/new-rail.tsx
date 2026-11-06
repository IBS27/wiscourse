import { useInboxFeed } from "@/lib/list-queries";
import { useMutation } from "convex/react";
import { Clock, FilePlus2, GraduationCap, Megaphone } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { FeedItem } from "../../../convex/inbox";
import { CountBadge } from "@/components/app/bits";
import { formatAgo } from "@/lib/dates";
import { feedSeenKind, feedSubtitle, feedTitle, groupFeed } from "@/lib/feed";
import { courseStyle, useCourses } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const ICON = { announcement: Megaphone, grade: GraduationCap, assignment: FilePlus2, change: Clock } as const;

export function FeedCard({ item, now }: { item: FeedItem; now: number }) {
  const { label, color } = useCourses();
  const markSeen = useMutation(api.seenState.markSeen);
  const Icon = ICON[item.type];
  const subtitle = feedSubtitle(item);

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
      className={cn(
        "relative mx-[10px] mb-[6px] block rounded-[10px] border border-line bg-raised px-3 py-[10px] text-inherit no-underline shadow-[0_1px_2px_rgba(16,17,20,0.04)] transition-colors hover:border-line-2",
      )}
      style={courseStyle(color(item.courseCanvasId))}
    >
      <div className="flex items-center gap-[6px] text-[12px] text-ink-3">
        <span className="size-[7px] shrink-0 rounded-full bg-c" aria-hidden />
        <span className="truncate font-medium text-ink-2">{label(item.courseCanvasId)}</span>
        <Icon className="size-[12px] shrink-0" aria-hidden />
        <span className="ml-auto flex shrink-0 items-center gap-[6px]">
          {formatAgo(item.at, now)}
          {!item.seen && <span className="size-[6px] rounded-full bg-unread" aria-label="Unread" />}
        </span>
      </div>
      <div className={cn("mt-[5px] text-[13px] leading-[1.4] tracking-[-0.005em]", item.seen ? "text-ink-2" : "font-medium text-ink")}>
        {feedTitle(item)}
      </div>
      {subtitle && <div className="mt-[3px] truncate text-xs text-ink-3">{subtitle}</div>}
    </a>
  );
}

export function NewRail({ todayKey, now }: { todayKey: string; now: number }) {
  const feed = useInboxFeed();
  const markAll = useMutation(api.inbox.markAllSeen);
  const unseen = feed?.filter((f) => !f.seen) ?? [];
  const groups = groupFeed((feed ?? []).slice(0, 12), todayKey, now);

  return (
    <aside className="hidden w-[320px] shrink-0 flex-col border-l border-line bg-sunken xl:flex">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <span className="text-[13px] font-semibold tracking-[-0.01em]">New</span>
        <CountBadge n={unseen.length} />
        {unseen.length > 0 && (
          <button type="button" onClick={() => void markAll()} className="ml-auto text-[11.5px] text-ink-3 hover:text-ink">
            Mark all read
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {feed === undefined ? null : feed.length === 0 ? (
          <div className="px-[14px] py-8 text-center text-xs text-ink-3">Nothing new.</div>
        ) : (
          groups.map((g) => (
            <div key={g.label}>
              <div className="px-4 pt-3 pb-[6px] text-[12px] font-medium text-ink-3">{g.label}</div>
              {g.items.map((f) => (
                <FeedCard key={f.key} item={f} now={now} />
              ))}
            </div>
          ))
        )}
      </div>
      <div className="mt-auto border-t border-line px-4 py-3 text-[12px] leading-[1.45] text-ink-3">
        Grades appear here only once the instructor posts them.
      </div>
    </aside>
  );
}
