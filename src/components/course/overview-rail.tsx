import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { FeedItem } from "../../../convex/inbox";
import { ROW_ICON } from "./overview-icons";
import { OverviewRow } from "./overview-row";
import { CountBadge } from "@/components/app/bits";
import { announcementsHref, todoHref } from "@/lib/course-routes";
import { formatAgo } from "@/lib/dates";
import { feedSeenKind, feedTitle } from "@/lib/feed";
import type { Course } from "@/lib/hooks";
import { leadInstructor, otherInstructors } from "@/lib/instructors";
import { cn } from "@/lib/utils";

type CourseFacts = NonNullable<FunctionReturnType<typeof api.courses.facts>>;
type CourseHub = NonNullable<FunctionReturnType<typeof api.courses.hub>>;

const RAIL_ROW = "border-b-0 py-[7px] pr-[14px] pl-[30px] text-[12.5px]";

export function OverviewRail({
  courseId,
  canvasId,
  course,
  facts,
  hub,
  feed,
  now,
}: {
  courseId: string;
  canvasId: number;
  course: Course | undefined;
  facts: CourseFacts | undefined;
  hub: CourseHub | null | undefined;
  feed: FeedItem[] | undefined;
  now: number;
}) {
  const markSeen = useMutation(api.seenState.markSeen);
  const markManySeen = useMutation(api.seenState.markManySeen);
  const items = (feed ?? []).filter((f) => f.courseCanvasId === canvasId);
  const unseen = items.filter((f) => !f.seen);
  const standing = standingLines(hub);

  // One write for the whole column: a busy course can hold a dozen unseen
  // items, and each mutation is a round trip.
  const markAll = () => {
    if (unseen.length === 0) return;
    void markManySeen({
      items: unseen.map((item) => ({
        kind: feedSeenKind(item.type),
        canvasId: item.canvasId,
        seenVersion: item.seenVersion,
      })),
    });
  };

  return (
    <aside className="flex shrink-0 flex-col border-t border-line bg-sunken lg:w-[300px] lg:border-t-0 lg:border-l">
      {facts?.officeHours !== undefined && (
        <Fact label="Office hours" value={facts.officeHours} />
      )}
      <InstructorFact course={course} />
      {standing !== undefined && (
        <Fact label="Standing" value={standing.value} sub={standing.sub} />
      )}

      <div className="flex items-center gap-2 px-[14px] pt-4 pb-3">
        <span className="text-[13px] font-semibold tracking-[-0.01em]">New</span>
        <CountBadge n={unseen.length} />
        {unseen.length > 0 && (
          <button
            type="button"
            onClick={markAll}
            className="ml-auto text-[11.5px] text-ink-3 hover:text-ink"
          >
            Mark read
          </button>
        )}
      </div>

      {feed !== undefined && items.length === 0 ? (
        <div className="px-[14px] pb-3 text-xs text-ink-3">Nothing new.</div>
      ) : (
        items.slice(0, 8).map((item) => (
          <OverviewRow
            key={item.key}
            className={RAIL_ROW}
            icon={item.type === "assignment" ? ROW_ICON.Assignment : ROW_ICON[item.type]}
            title={feedTitle(item)}
            unread={!item.seen}
            meta={formatAgo(item.at, now)}
            to={
              item.type === "announcement"
                ? announcementsHref(courseId, item.canvasId)
                : todoHref("assignment", item.canvasId)
            }
            onClick={() => {
              if (item.seen) return;
              void markSeen({
                kind: feedSeenKind(item.type),
                canvasId: item.canvasId,
                seenVersion: item.seenVersion,
              });
            }}
          />
        ))
      )}

      <Link
        to={announcementsHref(courseId)}
        className="mt-auto border-t border-line px-[14px] py-3 text-xs font-medium text-ink-2 no-underline hover:text-ink"
      >
        All announcements <span className="text-ink-3">→</span>
      </Link>
    </aside>
  );
}

function Fact({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="border-b border-line px-[14px] pt-[13px] pb-3 text-[13px] text-ink">
      <div className="eyebrow mb-[3px] text-[10.5px]">{label}</div>
      {value}
      {sub !== undefined && <div className="mt-[2px] text-xs text-ink-3">{sub}</div>}
    </div>
  );
}

function InstructorFact({ course }: { course: Course | undefined }) {
  const lead = leadInstructor(course);
  if (lead === undefined) return null;
  const others = otherInstructors(course);
  return (
    <Fact
      label="Instructor"
      value={lead.name}
      sub={
        <>
          {lead.email !== undefined && (
            <a href={`mailto:${lead.email}`} className="hover:text-ink">
              {lead.email}
            </a>
          )}
          {others.length > 0 && (
            <div className={cn(lead.email !== undefined && "mt-[2px]")}>
              With {others.map((t) => t.name).join(", ")}
            </div>
          )}
        </>
      }
    />
  );
}

/** "91.2% · A" over "4 of 12 graded · Projects weigh 50%". */
function standingLines(
  hub: CourseHub | null | undefined,
): { value: string; sub?: string } | undefined {
  if (hub === null || hub === undefined) return undefined;
  const score =
    hub.currentScore === undefined
      ? undefined
      : `${Number.isInteger(hub.currentScore) ? hub.currentScore : hub.currentScore.toFixed(1)}%`;
  const value = [score, hub.currentGrade].filter(Boolean).join(" · ");
  const sub = [
    hub.assignmentCount > 0 ? `${hub.gradedCount} of ${hub.assignmentCount} graded` : undefined,
    hub.heaviestGroup === undefined
      ? undefined
      : `${hub.heaviestGroup.name} weigh ${hub.heaviestGroup.weight}%`,
  ]
    .filter(Boolean)
    .join(" · ");
  if (value === "") return sub === "" ? undefined : { value: sub };
  return { value, sub: sub === "" ? undefined : sub };
}
