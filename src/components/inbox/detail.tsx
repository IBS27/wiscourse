import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { FeedItem } from "../../../convex/inbox";
import { Button } from "@/components/ui/button";
import { CanvasHtml } from "@/components/reader/canvas-html";
import { announcementsHref, todoHref } from "@/lib/course-routes";
import { CanvasButton, DetailShell, Fact, Facts, Initials, MarkUnreadButton } from "./detail-shell";
import { formatChange, pointsLabel, shortDateTime } from "./format";
import { GradeDetail } from "./grade-detail";

export function InboxDetail({
  item,
  dueAt,
  onMarkUnread,
}: {
  item: FeedItem;
  /** Due date for new-assignment items; the feed does not carry one. */
  dueAt?: number;
  onMarkUnread: () => void;
}) {
  if (item.type === "grade") return <GradeDetail item={item} onMarkUnread={onMarkUnread} />;
  if (item.type === "announcement") return <AnnouncementDetail item={item} onMarkUnread={onMarkUnread} />;
  if (item.type === "change") return <ChangeDetail item={item} onMarkUnread={onMarkUnread} />;
  return <NewAssignmentDetail item={item} dueAt={dueAt} onMarkUnread={onMarkUnread} />;
}

/** Placeholder while the feed loads under a deep link to one item. */
export function DetailLoading() {
  return (
    <div className="px-4 pt-4 md:px-7 md:pt-6">
      <Link
        to="/inbox"
        search={(prev) => ({ ...prev, item: undefined })}
        className="mb-5 -ml-1 inline-flex items-center gap-1 text-[13px] text-ink-3 no-underline hover:text-ink lg:hidden"
      >
        <ChevronLeft className="size-4" />
        Inbox
      </Link>
      <div className="space-y-3">
        <div className="h-4 w-1/2 rounded bg-chip" />
        <div className="h-3 w-1/3 rounded bg-chip" />
      </div>
    </div>
  );
}

export function DetailEmpty() {
  return (
    <div className="flex h-full items-center justify-center px-10 py-16 text-[13px] text-ink-3">
      Select an item
    </div>
  );
}

function AnnouncementDetail({ item, onMarkUnread }: { item: FeedItem; onMarkUnread: () => void }) {
  // The one row, not the course's last hundred announcement bodies.
  const announcement = useQuery(api.discussions.get, { canvasId: item.canvasId });
  const author = announcement?.authorName;

  return (
    <DetailShell
      item={item}
      eyebrow="Announcement"
      title={item.title}
      by={
        <>
          {author !== undefined && <Initials name={author} />}
          <span>
            {author !== undefined && `${author} · `}
            posted {shortDateTime(item.at)}
          </span>
        </>
      }
      actions={
        <>
          <CanvasButton href={announcement?.htmlUrl ?? item.htmlUrl}>Open in Canvas</CanvasButton>
          <Button asChild size="sm" variant="outline">
            <Link to={announcementsHref(item.courseCanvasId)}>All announcements</Link>
          </Button>
          <MarkUnreadButton onClick={onMarkUnread} disabled={!item.seen} />
        </>
      }
    >
      {announcement === undefined ? (
        <div className="space-y-2">
          <div className="h-3 w-3/4 rounded bg-chip" />
          <div className="h-3 w-2/3 rounded bg-chip" />
        </div>
      ) : announcement?.message === undefined ? (
        <p className="text-[13px] text-ink-3">No body.</p>
      ) : (
        <CanvasHtml html={announcement.message} courseId={item.courseCanvasId} />
      )}
    </DetailShell>
  );
}

function ChangeDetail({ item, onMarkUnread }: { item: FeedItem; onMarkUnread: () => void }) {
  const change = item.change === undefined ? undefined : formatChange(item.change);
  return (
    <DetailShell
      item={item}
      eyebrow={`Assignment updated · ${item.title}`}
      title={`${item.title} ${change?.verb ?? "updated"}`}
      by={<span>changed {shortDateTime(item.at)}</span>}
      actions={
        <>
          <Button asChild size="sm">
            <Link to={todoHref("assignment", item.canvasId)}>Open assignment</Link>
          </Button>
          <CanvasButton href={item.htmlUrl}>Open in Canvas</CanvasButton>
          <MarkUnreadButton onClick={onMarkUnread} disabled={!item.seen} />
        </>
      }
    >
      {change !== undefined && (
        <Facts className="md:grid-cols-2">
          <Fact label={item.change?.field === "dueAt" ? "Due date" : "Points"}>
            <span className="flex flex-wrap items-center gap-[6px]">
              <s className="text-ink-3 decoration-ink-3">{change.before}</s>
              <span aria-hidden>→</span>
              <span>{change.after}</span>
            </span>
          </Fact>
        </Facts>
      )}
    </DetailShell>
  );
}

function NewAssignmentDetail({
  item,
  dueAt,
  onMarkUnread,
}: {
  item: FeedItem;
  dueAt?: number;
  onMarkUnread: () => void;
}) {
  const description = useQuery(api.todos.description, {
    kind: "assignment",
    canvasId: item.canvasId,
  });
  const points = pointsLabel(item.pointsPossible);

  return (
    <DetailShell
      item={item}
      eyebrow="New assignment"
      title={item.title}
      by={<span>added {shortDateTime(item.at)}</span>}
      actions={
        <>
          <Button asChild size="sm">
            <Link to={todoHref("assignment", item.canvasId)}>Open assignment</Link>
          </Button>
          <CanvasButton href={item.htmlUrl}>Open in Canvas</CanvasButton>
          <MarkUnreadButton onClick={onMarkUnread} disabled={!item.seen} />
        </>
      }
    >
      <Facts className="md:grid-cols-2">
        <Fact label="Due">{dueAt === undefined ? "No due date" : shortDateTime(dueAt)}</Fact>
        <Fact label="Points">{points ?? "—"}</Fact>
      </Facts>
      {description !== undefined && description !== null && (
        <div className="mt-5">
          <CanvasHtml html={description} courseId={item.courseCanvasId} />
        </div>
      )}
    </DetailShell>
  );
}
