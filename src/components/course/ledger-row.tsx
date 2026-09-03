import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { FeedItem } from "../../../convex/inbox";
import type { TodoItem } from "../../../convex/todos";
import { UnreadDot } from "./unread-dot";
import { Dot } from "@/components/app/bits";
import { courseHref } from "@/lib/course-routes";
import { formatDayShort, formatTime, formatWeekday, dayKeyOf } from "@/lib/dates";
import { courseStyle, shortCode, type Course } from "@/lib/hooks";
import { familyName, leadInstructor } from "@/lib/instructors";
import { useSeen } from "@/lib/seen";
import { cn } from "@/lib/utils";

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
  // One row per course, so the only per-row query is the handful of
  // recently-changed file ids, never the whole listing.
  const fresh = useQuery(api.files.fresh, { courseCanvasId: course.canvasId });
  const seenFiles = useSeen("file");

  const code = shortCode(course);
  const meta = [code, familyName(leadInstructor(course))].filter(
    (part): part is string => part !== undefined && part !== "",
  );

  const next = nextDue(todos, course.canvasId);
  const overdue = next?.dueAt !== undefined && next.dueAt < now;
  const freshFiles = (fresh ?? []).filter((file) => !seenFiles.has(file.canvasId)).length;
  const summary = newSummary(feed, course.canvasId, freshFiles);

  return (
    <Link
      to={courseHref(course.canvasId)}
      style={courseStyle(color)}
      className="grid grid-cols-1 gap-y-[6px] border-b border-line px-4 py-[11px] text-inherit no-underline hover:bg-hover md:h-[58px] md:grid-cols-[minmax(0,1fr)_250px_230px] md:items-center md:gap-x-4 md:gap-y-0 md:px-5 md:py-0"
    >
      <div className="flex min-w-0 items-center gap-3">
        <Dot className="size-2" />
        <div className="min-w-0">
          <div className="truncate text-[14px] leading-[1.25] font-medium tracking-[-0.01em]">
            {course.nickname ?? course.name}
          </div>
          <div className="mt-[2px] truncate text-xs text-ink-3">
            {meta.map((part, i) => (
              <span key={`${i}-${part}`}>
                {i > 0 && <span className="opacity-55"> · </span>}
                <span className={cn(i === 0 && code !== undefined && "font-medium text-c")}>
                  {part}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "min-w-0 text-[13px] leading-[1.25]",
          // A bare em-dash on its own line is noise once the row stacks.
          next === undefined && "hidden text-ink-3 md:block",
        )}
      >
        {next === undefined ? (
          "—"
        ) : (
          <>
            <span className="block truncate">{next.title}</span>
            {next.dueAt !== undefined && (
              <span className={cn("mt-[2px] block text-xs text-ink-3", overdue && "text-red")}>
                {overdue
                  ? `Overdue · was ${formatWeekday(dayKeyOf(next.dueAt))} ${formatTime(next.dueAt)}`
                  : `${formatDayShort(dayKeyOf(next.dueAt))} · ${formatTime(next.dueAt)}`}
              </span>
            )}
          </>
        )}
      </div>

      <div
        className={cn(
          "items-center gap-2 text-[12.5px]",
          summary === undefined ? "hidden text-ink-3 md:flex" : "flex text-ink-2",
        )}
      >
        {summary === undefined ? (
          "—"
        ) : (
          <>
            <UnreadDot />
            {summary}
          </>
        )}
      </div>
    </Link>
  );
}

export function LedgerPastRow({ course, color }: { course: Course; color: string }) {
  const code = shortCode(course) ?? course.courseCode;
  const instructor = familyName(leadInstructor(course));
  const final = course.hideFinalGrades === true ? undefined : course.finalGrade;
  return (
    <Link
      to={courseHref(course.canvasId)}
      style={courseStyle(color)}
      className="flex items-center gap-4 border-b border-line px-4 py-[10px] text-ink-2 no-underline hover:bg-hover md:h-[42px] md:px-5 md:py-0"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Dot className="size-2 opacity-45" />
        <div className="min-w-0 truncate">
          <span className="text-[13.5px] font-medium">{course.nickname ?? course.name}</span>
          <span className="ml-[10px] text-xs text-ink-3">
            {[code, instructor].filter(Boolean).join(" · ")}
          </span>
        </div>
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

/** "2 announcements · 3 files · 1 grade", or undefined when nothing is new. */
function newSummary(
  feed: FeedItem[] | undefined,
  canvasId: number,
  files: number,
): string | undefined {
  const unseen = (feed ?? []).filter((f) => f.courseCanvasId === canvasId && !f.seen);
  const count = (type: FeedItem["type"]) => unseen.filter((f) => f.type === type).length;
  const parts = [
    plural(count("announcement"), "announcement"),
    plural(files, "file"),
    plural(count("grade"), "grade"),
    plural(count("assignment"), "assignment"),
    plural(count("change"), "change"),
  ].filter((part): part is string => part !== undefined);
  return parts.length === 0 ? undefined : parts.join(" · ");
}

function plural(n: number, noun: string): string | undefined {
  return n === 0 ? undefined : `${n} ${noun}${n === 1 ? "" : "s"}`;
}
