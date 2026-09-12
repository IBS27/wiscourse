import { useInboxFeed } from "@/lib/list-queries";
import { useMutation } from "convex/react";
import { Clock, Megaphone, Star, FilePlus2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { FeedItem } from "../../../convex/inbox";
import { CountBadge } from "@/components/app/bits";
import { formatAgo } from "@/lib/dates";
import { feedSeenKind, feedSubtitle, feedTitle, groupFeed } from "@/lib/feed";
import { courseStyle, useCourses } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const ICON = { announcement: Megaphone, grade: Star, assignment: FilePlus2, change: Clock } as const;

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
        "relative mx-[14px] mb-2 block rounded-lg border border-line bg-raised px-[11px] py-[10px] text-inherit no-underline hover:border-line-2",
        !item.seen &&
          "before:absolute before:top-[11px] before:-left-px before:h-[15px] before:w-[3px] before:rounded-r-[3px] before:bg-c",
      )}
      style={courseStyle(color(item.courseCanvasId))}
    >
      <div className="flex items-center gap-[6px] text-[11.5px] text-ink-3">
        <Icon className="size-[13px]" />
        <span className="font-medium text-c">{label(item.courseCanvasId)}</span>
        <span className="ml-auto">{formatAgo(item.at, now)}</span>
      </div>
      <div className="mt-[5px] text-[13px] leading-[1.35] font-medium tracking-[-0.005em]">
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
    <aside className="hidden w-[308px] shrink-0 flex-col border-l border-line bg-sunken xl:flex">
      <div className="flex items-center gap-2 px-[14px] pt-[14px] pb-3">
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
              <div className="eyebrow px-[14px] pt-[6px] pb-1 text-[10.5px]">{g.label}</div>
              {g.items.map((f) => (
                <FeedCard key={f.key} item={f} now={now} />
              ))}
            </div>
          ))
        )}
      </div>
      <div className="mt-auto border-t border-line px-[14px] py-3 text-xs text-ink-3">
        Grades appear here only once the instructor posts them.
      </div>
    </aside>
  );
}
