import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { FeedItem } from "../../../convex/inbox";
import type { TodoItem } from "../../../convex/todos";
import { ROW_ICON, type RowIcon } from "./overview-icons";
import { Dot } from "@/components/app/bits";
import { courseHref } from "@/lib/course-routes";
import { formatDayShort, formatTime, formatWeekday, dayKeyOf } from "@/lib/dates";
import { courseStyle, courseTitle, shortCode, type Course } from "@/lib/hooks";
import { familyName } from "@/lib/instructors";
import { useSeen } from "@/lib/seen";
import { cn } from "@/lib/utils";

/** Course · next due · new — the columns `LEDGER_HEAD` labels. */
export const LEDGER_COLS = "md:grid-cols-[minmax(0,1fr)_minmax(0,300px)_176px]";

/** Hairline under each row, inset to the title column (dot + gap). */
const RULE =
  "after:absolute after:right-0 after:bottom-0 after:left-9 after:h-px after:bg-line md:after:left-[44px]";

export function LedgerRow({
  course,
  color,
  todos,
  feed,
  now,
}: {
  course: Course;
  color: string;
  /** The whole unified todo list; sliced to this course here. */
  todos: TodoItem[] | undefined;
  feed: FeedItem[] | undefined;
  now: number;
}) {
  // The query returns recent file IDs; it scans this course’s file records.
  const fresh = useQuery(api.files.fresh, { courseCanvasId: course.canvasId });
  const seenFiles = useSeen("file");

  const code = shortCode(course);
  const instructor = familyName(course.verifiedInstructors?.[0]);

  const next = nextDue(todos, course.canvasId);
  const overdue = next?.dueAt !== undefined && next.dueAt < now;
  const freshFiles = (fresh ?? []).filter((file) => !seenFiles.has(file.canvasId)).length;
  const counts = newCounts(feed, course.canvasId, freshFiles);

  return (
    <Link
      to={courseHref(course.canvasId)}
      style={courseStyle(color)}
      className={cn(
        "group relative grid grid-cols-1 gap-y-[6px] py-3 pr-4 pl-9 text-inherit no-underline transition-colors outline-none hover:bg-hover focus-visible:bg-hover md:min-h-[62px] md:items-center md:gap-x-8 md:gap-y-0 md:py-[10px] md:pr-6 md:pl-[44px]",
        LEDGER_COLS,
        RULE,
      )}
    >
      <div className="relative min-w-0">
        <Dot className="absolute top-[6px] -left-5 size-2" />
        <div className="text-[14px] leading-[1.35] font-medium tracking-[-0.01em] text-ink md:truncate">
          {courseTitle(course)}
        </div>
        <div className="mt-[2px] truncate text-[12.5px] text-ink-3">
          {code !== undefined && <span className="font-medium text-ink-2">{code}</span>}
          {code !== undefined && instructor !== undefined && (
            <span className="text-line-2" aria-hidden>
              {" · "}
            </span>
          )}
          {instructor}
        </div>
      </div>

      <div className={cn("min-w-0 leading-[1.35]", next === undefined && "hidden md:block")}>
        {next === undefined ? (
          <span className="text-[12.5px] text-ink-3">Nothing due</span>
        ) : (
          <>
            <span className="block truncate text-[13px] text-ink-2">
              <span className="text-ink-3 md:hidden">Next · </span>
              {next.title}
            </span>
            {next.dueAt !== undefined && (
              <span
                className={cn("tabular mt-[2px] block text-[12.5px] text-ink-3", overdue && "text-red")}
              >
                {overdue
                  ? `Overdue · was ${formatWeekday(dayKeyOf(next.dueAt))} ${formatTime(next.dueAt)}`
                  : `${formatDayShort(dayKeyOf(next.dueAt))} · ${formatTime(next.dueAt)}`}
              </span>
            )}
          </>
        )}
      </div>

      <NewCounts counts={counts} />
    </Link>
  );
}

interface NewCount {
  n: number;
  noun: string;
  icon: RowIcon;
}

/** Icon + number per kind: "6 announcements · 13 grades · 4 changes" in one glance, never two lines. */
function NewCounts({ counts }: { counts: NewCount[] }) {
  if (counts.length === 0) {
    return <span className="hidden text-[12.5px] text-ink-3 md:block">Up to date</span>;
  }
  const label = counts.map(({ n, noun }) => plural(n, noun)).join(" · ");
  return (
    <div className="flex items-center gap-x-[14px] text-[12.5px]" title={label}>
      <span className="sr-only">{label}</span>
      {counts.map(({ n, noun, icon: Icon }) => (
        <span key={noun} className="inline-flex items-center gap-[5px]" aria-hidden>
          <Icon className="size-[13px] text-ink-3" />
          <span className="tabular font-medium text-ink-2">{n}</span>
        </span>
      ))}
    </div>
  );
}

export function LedgerPastRow({ course, color }: { course: Course; color: string }) {
  const code = shortCode(course) ?? course.courseCode;
  const instructor = familyName(course.verifiedInstructors?.[0]);
  const final = course.hideFinalGrades === true ? undefined : course.finalGrade;
  return (
    <Link
      to={courseHref(course.canvasId)}
      style={courseStyle(color)}
      className={cn(
        "relative flex items-center gap-4 py-[10px] pr-4 pl-9 text-ink-2 no-underline transition-colors outline-none hover:bg-hover focus-visible:bg-hover md:min-h-[44px] md:py-[9px] md:pr-6 md:pl-[44px]",
        RULE,
      )}
    >
      <div className="relative min-w-0 flex-1 md:flex md:items-baseline md:gap-[10px]">
        <Dot className="absolute top-[6px] -left-5 size-2 opacity-45" />
        <span className="block truncate text-[13.5px] font-medium md:min-w-0 md:flex-initial">
          {courseTitle(course)}
        </span>
        <span className="block shrink-0 truncate text-[12.5px] text-ink-3">
          {[code, instructor].filter(Boolean).join(" · ")}
        </span>
      </div>
      {final !== undefined && (
        <span className="tabular shrink-0 text-[12.5px] text-ink-3">
          Final<b className="ml-2 font-medium text-ink-2">{final}</b>
        </span>
      )}
    </Link>
  );
}

/** Soonest item still owed for this course; overdue work counts. */
function nextDue(todos: TodoItem[] | undefined, canvasId: number): TodoItem | undefined {
  return (todos ?? [])
    .filter(
      (t) =>
        t.courseCanvasId === canvasId &&
        t.doneAt === undefined &&
        t.submission !== "submitted" &&
        t.submission !== "graded" &&
        t.dueAt !== undefined,
    )
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))[0];
}

/** Unseen feed items per kind, plus fresh files; empty when nothing is new. */
function newCounts(feed: FeedItem[] | undefined, canvasId: number, files: number): NewCount[] {
  const unseen = (feed ?? []).filter((f) => f.courseCanvasId === canvasId && !f.seen);
  const count = (type: FeedItem["type"]) => unseen.filter((f) => f.type === type).length;
  return [
    { n: count("announcement"), noun: "announcement", icon: ROW_ICON.announcement },
    { n: files, noun: "file", icon: ROW_ICON.File },
    { n: count("grade"), noun: "grade", icon: ROW_ICON.grade },
    { n: count("assignment"), noun: "assignment", icon: ROW_ICON.Assignment },
    { n: count("change"), noun: "change", icon: ROW_ICON.change },
  ].filter((c) => c.n > 0);
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
