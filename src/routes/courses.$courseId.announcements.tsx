import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { AnnouncementRow } from "@/components/course/announcement-row";
import { courseColorVar, courseStyle, useCourses, useNow } from "@/lib/hooks";
import { useMarkSeenOnMount, useSeen } from "@/lib/seen";

export interface AnnouncementSearch {
  /** `announcement:<canvasId>` — what `announcementsHref` produces. */
  item?: string;
}

export const Route = createFileRoute("/courses/$courseId/announcements")({
  validateSearch: (search: Record<string, unknown>): AnnouncementSearch =>
    typeof search.item === "string" ? { item: search.item } : {},
  component: CourseAnnouncements,
});

function CourseAnnouncements() {
  const { courseId } = Route.useParams();
  const canvasId = Number(courseId);
  const { item } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { byId } = useCourses();
  const course = byId.get(canvasId);
  const now = useNow();
  const seen = useSeen("discussion");
  const announcements = useQuery(api.discussions.announcements, { courseCanvasId: canvasId });

  const openId = parseItem(item);
  // Only the id the page *loaded* with should steal the scroll position;
  // clicking a row further down the list must not yank the view.
  const [initialOpenId] = useState(openId);
  useMarkSeenOnMount("discussion", openId);

  const toggle = (id: number) => {
    void navigate({
      search: openId === id ? {} : { item: `announcement:${id}` },
      replace: true,
    });
  };

  return (
    <div className="min-w-0 flex-1 pb-8" style={courseStyle(courseColorVar(course?.color))}>
      {announcements === undefined ? null : announcements.length === 0 ? (
        <p className="p-4 text-[13px] text-ink-3 md:p-5">No announcements yet.</p>
      ) : (
        announcements.map((announcement) => (
          <AnnouncementRow
            key={announcement.canvasId}
            announcement={announcement}
            courseId={canvasId}
            open={openId === announcement.canvasId}
            unread={!seen.has(announcement.canvasId)}
            now={now}
            autoScroll={initialOpenId === announcement.canvasId}
            onToggle={() => toggle(announcement.canvasId)}
          />
        ))
      )}
    </div>
  );
}

function parseItem(item: string | undefined): number | undefined {
  const match = item === undefined ? null : /^announcement:(\d+)$/.exec(item);
  return match === null ? undefined : Number(match[1]);
}
