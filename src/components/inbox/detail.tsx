import { Link } from "@tanstack/react-router";
import { Inbox } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { FeedItem } from "../../../convex/inbox";
import { Kbd } from "@/components/app/bits";
import { CanvasHtml } from "@/components/reader/canvas-html";
import { announcementsHref, todoHref } from "@/lib/course-routes";
import {
  Action,
  BackToInbox,
  ByLine,
  CanvasButton,
  DESCRIPTION,
  DetailShell,
  Fact,
  Facts,
  MarkUnreadButton,
  READING,
} from "./detail-shell";
import { formatChange, pointsLabel, shortDateTime } from "./format";
import { GradeDetail } from "./grade-detail";
import { feedTitle } from "@/lib/feed";

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
    <div className={READING}>
      <BackToInbox />
      <div className="space-y-3">
        <div className="h-3 w-1/4 rounded bg-chip" />
        <div className="h-5 w-2/3 rounded bg-chip" />
        <div className="h-3 w-1/3 rounded bg-chip" />
      </div>
    </div>
  );
}

/** The reading pane before anything is picked. */
export function DetailEmpty() {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 px-10 pb-16 text-center">
      <span className="grid size-11 place-items-center rounded-xl border border-line bg-sunken text-ink-3">
        <Inbox className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="mt-1 text-[14px] font-medium text-ink">Nothing selected</div>
      <p className="max-w-[300px] text-[12.5px] leading-[1.55] text-ink-3">
        Pick an announcement, grade or change from the list to read it here.
      </p>
      <p className="mt-2 flex items-center gap-[6px] text-[12px] text-ink-3">
        <Kbd>⌘K</Kbd> searches everything
      </p>
    </div>
  );
}

function AnnouncementDetail({ item, onMarkUnread }: { item: FeedItem; onMarkUnread: () => void }) {
  // The one row, not the course's last hundred announcement bodies.
  const announcement = useQuery(api.discussions.get, { canvasId: item.canvasId });

  return (
    <DetailShell
      item={item}
      kind="Announcement"
      title={item.title}
      by={<ByLine name={announcement?.authorName} when={shortDateTime(item.at)} />}
      actions={
        <>
          <Action primary asChild>
            <Link to={announcementsHref(item.courseCanvasId)}>All announcements</Link>
          </Action>
          <CanvasButton href={announcement?.htmlUrl ?? item.htmlUrl}>Open in Canvas</CanvasButton>
          <MarkUnreadButton onClick={onMarkUnread} disabled={!item.seen} />
        </>
      }
    >
      {announcement === undefined ? (
        <div className="space-y-[10px]">
          <div className="h-3 w-3/4 rounded bg-chip" />
          <div className="h-3 w-2/3 rounded bg-chip" />
          <div className="h-3 w-1/2 rounded bg-chip" />
        </div>
      ) : announcement?.message === undefined ? (
        <p className="text-[13px] text-ink-3">This announcement has no body.</p>
      ) : (
        <CanvasHtml
          html={announcement.message}
          courseId={item.courseCanvasId}
          className="text-[14.5px] leading-[1.65] [&_h1]:mt-8 [&_h2]:mt-8 [&_h3]:mt-7 [&_h3]:mb-[6px] [&_h3]:text-[15px] [&_h4]:mt-7 [&_h4]:mb-[6px] [&_h4]:text-[14.5px] [&_h4]:text-ink [&_p]:mb-[14px]"
        />
      )}
    </DetailShell>
  );
}

function ChangeDetail({ item, onMarkUnread }: { item: FeedItem; onMarkUnread: () => void }) {
  const change = item.change === undefined ? undefined : formatChange(item.change);
  return (
    <DetailShell
      item={item}
      kind="Assignment updated"
      title={feedTitle(item)}
      by={<ByLine when={`Changed ${shortDateTime(item.at)}`} />}
      actions={
        <>
          <Action primary asChild>
            <Link to={todoHref("assignment", item.canvasId)}>Open assignment</Link>
          </Action>
          <CanvasButton href={item.htmlUrl}>Open in Canvas</CanvasButton>
          <MarkUnreadButton onClick={onMarkUnread} disabled={!item.seen} />
        </>
      }
    >
      {change !== undefined && (
        <Facts>
          <Fact label={item.change?.field === "dueAt" ? "Due date" : "Points"}>
            <span className="flex flex-wrap items-center gap-2">
              <s className="font-normal text-ink-3 decoration-ink-3">{change.before}</s>
              <span aria-hidden className="text-ink-3">→</span>
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
      kind="New assignment"
      title={item.title}
      by={<ByLine when={`Added ${shortDateTime(item.at)}`} />}
      actions={
        <>
          <Action primary asChild>
            <Link to={todoHref("assignment", item.canvasId)}>Open assignment</Link>
          </Action>
          <CanvasButton href={item.htmlUrl}>Open in Canvas</CanvasButton>
          <MarkUnreadButton onClick={onMarkUnread} disabled={!item.seen} />
        </>
      }
    >
      <Facts>
        <Fact label="Due">{dueAt === undefined ? "No due date" : shortDateTime(dueAt)}</Fact>
        <Fact label="Points">{points ?? "—"}</Fact>
      </Facts>
      {description !== undefined && description !== null && (
        <div className="mt-6">
          <CanvasHtml html={description} courseId={item.courseCanvasId} className={DESCRIPTION} />
        </div>
      )}
    </DetailShell>
  );
}
