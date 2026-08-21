import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CountBadge } from "@/components/app/bits";
import { ProfileMenu } from "@/components/app/profile-menu";
import { FeedCard } from "@/components/agenda/new-rail";
import { groupFeed, useFeed } from "@/lib/feed";
import { useCourses, useNow, useToday } from "@/lib/hooks";

export const Route = createFileRoute("/inbox")({
  component: InboxPage,
});

function InboxPage() {
  const feed = useFeed();
  const markAll = useMutation(api.inbox.markAllSeen);
  const { courses } = useCourses();
  const today = useToday();
  const now = useNow();
  const unseen = feed?.filter((f) => !f.seen).length ?? 0;
  const groups = groupFeed(feed ?? [], today, now);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between gap-5 border-b border-line px-4 py-[14px] md:px-5">
        <div>
          <div className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.015em]">
            New
            <CountBadge n={unseen} />
          </div>
          <div className="mt-[3px] text-xs text-ink-3">
            {unseen} unread · {courses.length} courses
          </div>
        </div>
        <div className="flex items-center gap-3">
          {unseen > 0 && (
            <button type="button" onClick={() => void markAll()} className="text-xs text-ink-3 hover:text-ink">
              Mark all read
            </button>
          )}
          <span className="md:hidden">
            <ProfileMenu variant="avatar" />
          </span>
        </div>
      </header>
      <div className="mx-auto w-full max-w-[640px] pt-3 pb-6">
        {feed === undefined ? null : feed.length === 0 ? (
          <div className="flex flex-col items-center gap-[9px] px-10 py-11 text-center text-ink-3">
            <span className="text-[14px] font-medium text-ink-2">That's everything</span>
            <span className="text-[12.5px] leading-[1.5]">Announcements, posted grades and new assignments show up here.</span>
          </div>
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
    </div>
  );
}
