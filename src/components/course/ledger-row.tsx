import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { FeedItem } from "../../../convex/inbox";
import type { TodoItem } from "../../../convex/todos";
import { Clock } from "lucide-react";
import { CourseTag } from "@/components/app/bits";
import { courseHref } from "@/lib/course-routes";
import { formatDayShort, formatTime, formatWeekday, dayKeyOf } from "@/lib/dates";
import { courseStyle, courseTitle, shortCode, type Course } from "@/lib/hooks";
import { familyName } from "@/lib/instructors";
import { useSeen } from "@/lib/seen";
import { cn } from "@/lib/utils";

/**
 * Course · next due · new. The new column is exactly as wide as its slots.
 * Course and next due share what is left; from xl next due gets a fixed
 * 280px and the course takes the rest. A fixed track at md would squeeze the
 * course to nothing beside the sidebar.
 */
export const LEDGER_COLS =
  "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:gap-x-6 xl:grid-cols-[minmax(0,1fr)_280px_auto]";

/** Hairline under each row, from the title's edge to the content's. */
const RULE =
  "after:absolute after:right-4 after:bottom-0 after:left-4 after:h-px after:bg-line md:after:right-6 md:after:left-6";

/** The fixed slots of the New column, in the order the header draws them. */
const NEW_SLOTS = [
  { key: "announcement", label: "Announcements", short: "Ann." },
  { key: "file", label: "Files", short: "Files" },
  { key: "grade", label: "Grades", short: "Grades" },
  { key: "assignment", label: "Assignments", short: "Assign." },
] as const;
type SlotKey = (typeof NEW_SLOTS)[number]["key"];

/**
 * One slot, right-aligned so a column of numbers ends exactly where its
 * label does: 88px names it in full, 56px abbreviates. Flex-end, so a label
 * a hair wider than its slot spills left, never past the right edge. Header
 * and cells share the class.
 */
const SLOT = "flex w-14 shrink-0 justify-end whitespace-nowrap tabular xl:w-[88px]";

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
        "group relative grid grid-cols-1 gap-y-[6px] px-4 py-3 text-inherit no-underline transition-colors outline-none hover:bg-hover focus-visible:bg-hover md:min-h-[62px] md:items-center md:gap-y-0 md:px-6 md:py-[10px]",
        LEDGER_COLS,
        RULE,
      )}
    >
      <div className="min-w-0">
        {/* One line on desktop, so every row is the same height; the full name is the tooltip. */}
        <div
          className="text-[14px] leading-[1.35] font-medium tracking-[-0.01em] text-ink md:truncate"
          title={courseTitle(course)}
        >
          {courseTitle(course)}
        </div>
        <CourseMeta code={code} instructor={instructor} />
      </div>

      <div className={cn("min-w-0 leading-[1.35]", next === undefined && "hidden md:block")}>
        {next === undefined ? (
          <span className="text-[12.5px] text-ink-3">Nothing due</span>
        ) : (
          <>
            <span className="line-clamp-2 text-[13px] text-ink-2 md:line-clamp-1" title={next.title}>
              <span className="text-ink-3 md:hidden">Next · </span>
              {next.title}
            </span>
            {next.dueAt !== undefined && (
              <span className="tabular mt-[2px] flex items-center gap-[5px] text-[12.5px] text-ink-3">
                {overdue && <Clock className="size-3 shrink-0 text-red" aria-hidden />}
                <span className={cn(overdue && "text-ink-2")}>
                  {overdue
                    ? `Overdue · was ${formatWeekday(dayKeyOf(next.dueAt))} ${formatTime(next.dueAt)}`
                    : `${formatDayShort(dayKeyOf(next.dueAt))} · ${formatTime(next.dueAt)}`}
                </span>
              </span>
            )}
          </>
        )}
      </div>

      <NewCounts counts={counts} />
    </Link>
  );
}

/**
 * Fixed slots on desktop, one per kind, numbers only: the header names each
 * slot, so a column reads like a table; a zero is a faint "0", so every
 * column stays filled and the counts that exist stand out. Phones have no header, so they get the same
 * counts as words.
 */
function NewCounts({ counts }: { counts: Record<SlotKey, number> }) {
  const present = NEW_SLOTS.filter((slot) => counts[slot.key] > 0);
  const label =
    present.length === 0
      ? "Nothing new"
      : present.map((slot) => plural(counts[slot.key], slot.label)).join(" · ");
  return (
    <>
      {present.length > 0 && <span className="text-[12.5px] text-ink-3 md:hidden">{label}</span>}
      <span className="hidden justify-end text-[13px] md:flex" title={label}>
        <span className="sr-only">{label}</span>
        {NEW_SLOTS.map((slot) => (
          <span
            key={slot.key}
            className={cn(SLOT, counts[slot.key] > 0 ? "font-medium text-ink-2" : "text-ink-3/50")}
            aria-hidden
          >
            {counts[slot.key]}
          </span>
        ))}
      </span>
    </>
  );
}

/**
 * The header cell over `NewCounts`: "New since you looked" spans the slots
 * with a rule under it, and each slot is named in full beneath (abbreviated
 * where the row is too narrow to spell them out).
 */
export function NewCountsHead() {
  return (
    <span className="flex flex-col items-stretch">
      <span className="border-b border-line pb-[5px] text-center">New since you looked</span>
      <span className="flex justify-end pt-[5px]">
        {NEW_SLOTS.map(({ key, label, short }) => (
          <span key={key} className={cn(SLOT, "font-normal")} title={label}>
            <span className="hidden xl:inline">{label}</span>
            <span className="xl:hidden" aria-hidden>
              {short}
            </span>
            <span className="sr-only xl:hidden">{label}</span>
          </span>
        ))}
      </span>
    </span>
  );
}

/** "MATH 234 · Williams", the code as a course tag. */
function CourseMeta({
  code,
  instructor,
  className,
}: {
  code: string | undefined;
  instructor: string | undefined;
  className?: string;
}) {
  return (
    <div className={cn("mt-[3px] flex min-w-0 items-center gap-[6px] text-[12.5px] text-ink-3", className)}>
      {code !== undefined && <CourseTag className="shrink-0">{code}</CourseTag>}
      {code !== undefined && instructor !== undefined && (
        <span className="text-line-2" aria-hidden>
          ·
        </span>
      )}
      {instructor !== undefined && <span className="truncate">{instructor}</span>}
    </div>
  );
}

/** A course inside an open past-term fold, indented to the fold's label. */
export function LedgerPastRow({ course, color }: { course: Course; color: string }) {
  const code = shortCode(course) ?? course.courseCode;
  const instructor = familyName(course.verifiedInstructors?.[0]);
  const final = course.hideFinalGrades === true ? undefined : course.finalGrade;
  return (
    <Link
      to={courseHref(course.canvasId)}
      style={courseStyle(color)}
      className="group relative flex min-h-10 items-center gap-4 py-2 pr-4 pl-[38px] no-underline transition-colors outline-none after:absolute after:right-4 after:bottom-0 after:left-[38px] after:h-px after:bg-line hover:bg-hover focus-visible:bg-hover md:pr-6 md:pl-[46px] md:after:right-6 md:after:left-[46px]"
    >
      <div className="min-w-0 flex-1 md:flex md:items-center md:gap-3">
        <span className="block truncate text-[13px] text-ink-2 transition-colors group-hover:text-ink md:min-w-0">
          {courseTitle(course)}
        </span>
        <CourseMeta code={code} instructor={instructor} className="shrink-0 md:mt-0" />
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

/** Unseen feed items per slot, plus fresh files. New and changed assignments share a slot. */
function newCounts(
  feed: FeedItem[] | undefined,
  canvasId: number,
  files: number,
): Record<SlotKey, number> {
  const unseen = (feed ?? []).filter((f) => f.courseCanvasId === canvasId && !f.seen);
  const count = (...types: FeedItem["type"][]) => unseen.filter((f) => types.includes(f.type)).length;
  return {
    announcement: count("announcement"),
    file: files,
    grade: count("grade"),
    assignment: count("assignment", "change"),
  };
}

/** "1 announcement", "6 files": the slot label, singular when it should be. */
function plural(n: number, label: string): string {
  const noun = label.toLowerCase();
  return `${n} ${n === 1 ? noun.replace(/s$/, "") : noun}`;
}
