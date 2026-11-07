import { useDraft } from "@/lib/drafts";
import {
  ArrowRight,
  CheckCheck,
  ChevronRight,
  Megaphone,
  Plus,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { FeedItem } from "../../../convex/inbox";
import { CountBadge } from "@/components/app/bits";
import { FeedRowBody } from "@/components/agenda/new-rail";
import { FEED_ROW } from "@/components/agenda/feed-row";
import { MeetingsEditor } from "@/components/calendar/meetings-editor";
import { dayLetters, minuteRange } from "@/lib/calendar";
import { announcementsHref, todoHref } from "@/lib/course-routes";
import { formatAgo } from "@/lib/dates";
import { coverageLabel, DASH, formatPercent } from "@/lib/grades-ui";
import { Letter, Meter } from "@/components/grades/bits";
import { letterFor, schemeFor, summarize } from "../../../convex/lib/grades";
import { feedSeenKind, feedStatus, feedTitle } from "@/lib/feed";
import type { Course } from "@/lib/hooks";
import { cn } from "@/lib/utils";

type CourseFacts = NonNullable<FunctionReturnType<typeof api.courses.facts>>;
type CourseHub = NonNullable<FunctionReturnType<typeof api.courses.hub>>;

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
    <aside className="flex shrink-0 flex-col border-t border-line bg-surface lg:w-[340px] lg:border-t-0 lg:border-l">
      <StandingFact courseId={courseId} canvasId={canvasId} hub={hub} />
      <InstructorFact course={course} />
      {facts?.officeHours !== undefined && <Fact label="Office hours" value={facts.officeHours} />}
      <ClassTimesFact canvasId={canvasId} />

      <div className="flex items-center gap-2 px-5 pt-5 pb-2">
        <span className="text-[13px] font-semibold tracking-[-0.005em] text-ink">Recent</span>
        <CountBadge n={unseen.length} />
        {unseen.length > 0 && (
          <button
            type="button"
            onClick={markAll}
            className="-mr-2 ml-auto rounded-md px-2 py-[3px] text-[12px] text-ink-3 transition-colors hover:bg-hover hover:text-ink"
          >
            Mark all read
          </button>
        )}
      </div>

      {feed !== undefined && items.length === 0 ? (
        <div className="flex items-center gap-[10px] px-5 pt-1 pb-4 text-[12.5px] text-ink-3">
          <CheckCheck className="size-[14px] shrink-0" aria-hidden />
          You’re all caught up.
        </div>
      ) : (
        <div className="pb-3">
          {items.slice(0, 8).map((item) => (
            <Link
              key={item.key}
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
              className={FEED_ROW}
            >
              <FeedRowBody
                title={feedTitle(item)}
                unread={!item.seen}
                status={feedStatus(item)}
                time={formatAgo(item.at, now)}
              />
            </Link>
          ))}
        </div>
      )}

      <Link
        to={announcementsHref(courseId)}
        className="mt-auto flex items-center gap-[6px] border-t border-line px-5 py-3 text-[12.5px] font-medium text-ink-2 no-underline transition-colors hover:bg-hover hover:text-ink"
      >
        <Megaphone className="size-[14px] text-ink-3" aria-hidden />
        All announcements
        <ArrowRight className="ml-auto size-[14px] text-ink-3" aria-hidden />
      </Link>
    </aside>
  );
}

const FACT = "block border-b border-line px-5 py-[14px] text-[13px] leading-[1.45] text-ink";
const FACT_LABEL = "mb-1 text-[12px] font-medium text-ink-3";

function Fact({
  label,
  value,
  sub,
  to,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  /** Makes the whole block a link, with a chevron to say so. */
  to?: string;
}) {
  const body = (
    <>
      <div className={cn(FACT_LABEL, to !== undefined && "flex items-center")}>
        {label}
        {to !== undefined && (
          <ChevronRight
            className="ml-auto size-[14px] text-ink-3 transition-transform group-hover:translate-x-px"
            aria-hidden
          />
        )}
      </div>
      {value}
      {sub !== undefined && <div className="mt-[2px] text-[12px] text-ink-2">{sub}</div>}
    </>
  );
  return to === undefined ? (
    <div className={FACT}>{body}</div>
  ) : (
    <Link to={to} className={cn(FACT, "group no-underline transition-colors hover:bg-hover")}>
      {body}
    </Link>
  );
}

/** Meeting times live here because Canvas does not carry them. */
function ClassTimesFact({ canvasId }: { canvasId: number }) {
  const meetings = useQuery(api.meetings.forCourse, { courseCanvasId: canvasId });
  const [open, setOpen] = useDraft(`meetings:open:${canvasId}`, false);
  if (meetings === undefined) return null;
  return (
    <>
      <div className={FACT}>
        <div className={FACT_LABEL}>Class times</div>
        {meetings.length === 0 ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-[2px] inline-flex h-7 items-center gap-[6px] rounded-md border border-dashed border-line-2 px-[10px] text-[12.5px] font-medium text-ink-2 transition-colors hover:border-ink-3 hover:bg-hover hover:text-ink"
          >
            <Plus className="size-[13px]" aria-hidden />
            Add class times
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Edit class times"
            className="-mx-2 block w-[calc(100%+16px)] rounded-md px-2 py-[2px] text-left transition-colors hover:bg-hover"
          >
            {meetings.map((meeting) => (
              <div key={meeting._id} className="tabular">
                {dayLetters(meeting.days)} {minuteRange(meeting.startMinute, meeting.endMinute)}
                {meeting.location !== undefined && (
                  <span className="text-ink-3"> · {meeting.location}</span>
                )}
              </div>
            ))}
          </button>
        )}
      </div>
      <MeetingsEditor open={open} onOpenChange={setOpen} courseCanvasId={canvasId} />
    </>
  );
}

function InstructorFact({ course }: { course: Course | undefined }) {
  const teachers = course?.verifiedInstructors ?? [];
  if (teachers.length === 0) return null;
  return (
    <Fact
      label={teachers.length === 1 ? "Instructor" : "Instructors"}
      value={
        <div className="space-y-2">
          {teachers.map((teacher) => (
            <div key={teacher.name}>
              <div>{teacher.name}</div>
              {teacher.email && (
                <a
                  href={`mailto:${teacher.email}`}
                  className="text-[12px] text-ink-3 transition-colors hover:text-ink hover:underline"
                >
                  {teacher.email}
                </a>
              )}
            </div>
          ))}
        </div>
      }
    />
  );
}

/**
 * The Grades screen's numbers in small: percent and letter chip, then a
 * slim "graded so far" bar. Reads the same gradebook the Grades tab does,
 * so the two can never disagree; the hub's numbers stand in until it lands.
 */
function StandingFact({
  courseId,
  canvasId,
  hub,
}: {
  courseId: string;
  canvasId: number;
  hub: CourseHub | null | undefined;
}) {
  const book = useQuery(api.grades.course, { courseCanvasId: canvasId });
  const summary = useMemo(() => (book ? summarize(book) : undefined), [book]);
  if (hub === null || hub === undefined) return null;

  const hidden = book ? book.course.hideFinalGrades === true : false;
  const score = book ? book.course.currentScore : hub.currentScore;
  const canvasLetter = book ? book.course.currentGrade : hub.currentGrade;
  // Canvas's letter when it sends one; else the Grades screen's estimate.
  const letter =
    hidden || score === undefined
      ? undefined
      : (canvasLetter ?? (book ? letterFor(score, schemeFor(book.course)) : undefined));
  const estimated = canvasLetter === undefined && letter !== undefined;
  const coverage = summary === undefined || hidden ? undefined : coverageLabel(summary);
  const heavy =
    hub.heaviestGroup === undefined ? undefined : `${hub.heaviestGroup.name} are ${hub.heaviestGroup.weight}% of grade`;
  const sub = [coverage, heavy].filter(Boolean).join(" · ");
  if (score === undefined && sub === "") return null;

  return (
    <Fact
      label="Standing"
      to={`/courses/${courseId}/grades`}
      value={
        <span className="flex items-center gap-[10px]">
          <span className="tabular text-[24px] leading-[1.15] font-semibold tracking-[-0.02em] text-ink">
            {hidden ? "Hidden" : score === undefined ? DASH : formatPercent(score)}
          </span>
          {letter !== undefined && <Letter letter={letter} estimated={estimated} />}
        </span>
      }
      sub={
        sub === "" ? undefined : (
          <>
            {/* The bar measures how much is graded, so its label sits beside it,
                apart from the grade above. */}
            {coverage !== undefined && (
              <span className="mt-[6px] flex items-center gap-[10px]">
                <Meter fraction={summary?.coverage ?? 0} className="min-w-0 flex-1" tone="neutral" />
                <span className="tabular shrink-0">{coverage.replace(" of grade", " graded")}</span>
              </span>
            )}
            {heavy !== undefined && <span className="mt-1 block">{heavy}</span>}
          </>
        )
      }
    />
  );
}
