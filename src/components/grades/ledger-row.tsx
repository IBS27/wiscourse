import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { latestPosted, letterFor, schemeFor, summarize, type Gradebook } from "../../../convex/lib/grades";
import { Coverage, ESTIMATED_LETTER_NOTE, GradeNumber } from "./bits";
import { Dot } from "@/components/app/bits";
import { UnreadDot } from "@/components/course/unread-dot";
import { dayKeyOf, formatPlannedRelative } from "@/lib/dates";
import { coverageLabel, formatPercent, formatPoints, schemeLabel } from "@/lib/grades-ui";
import { courseStyle, shortCode, type Course } from "@/lib/hooks";
import type { Seen } from "@/lib/seen";
import { cn } from "@/lib/utils";

/** The grid the header and every row share. */
export const LEDGER_COLUMNS =
  "md:grid-cols-[minmax(0,1fr)_150px_210px_minmax(0,330px)]";

export function GradesLedgerHeader() {
  return (
    <div
      className={cn(
        "hidden h-[34px] items-center gap-x-4 border-b border-line px-5 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase md:grid",
        LEDGER_COLUMNS,
      )}
    >
      <span>Course</span>
      <span>Current</span>
      <span>Graded so far</span>
      <span>Latest posted</span>
    </div>
  );
}

export function GradesLedgerRow({
  course,
  color,
  book,
  seen,
  today,
}: {
  course: Course;
  color: string;
  /** Undefined while `grades.index` is in flight. */
  book: Gradebook | undefined;
  seen: Seen;
  today: string;
}) {
  const summary = useMemo(() => (book === undefined ? undefined : summarize(book)), [book]);
  const latest = useMemo(() => (book === undefined ? undefined : latestPosted(book)), [book]);

  const hidden = book?.course.hideFinalGrades === true;
  const score = book?.course.currentScore;
  // Canvas's letter when it sends one; else an estimate from the grading
  // scale, drawn as an estimate so it never claims to be Canvas's.
  const letter =
    book?.course.currentGrade ??
    (book === undefined || score === undefined ? undefined : letterFor(score, schemeFor(book.course)));
  const estimated = book?.course.currentGrade === undefined && letter !== undefined;

  const code = shortCode(course);
  const coverage = summary === undefined ? undefined : coverageLabel(summary);
  const unseen =
    latest?.postedAt !== undefined && !seen.has(latest.canvasId, String(latest.postedAt));

  return (
    <Link
      to="/grades/$courseId"
      params={{ courseId: String(course.canvasId) }}
      style={courseStyle(color)}
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 border-b border-line px-4 py-[11px] text-inherit no-underline hover:bg-hover md:h-[60px] md:py-0 md:px-5",
        LEDGER_COLUMNS,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Dot className="size-2" />
        <div className="min-w-0">
          <div className="truncate text-[14px] leading-[1.25] font-medium tracking-[-0.01em]">
            {course.nickname ?? course.name}
          </div>
          <div className="mt-[1px] truncate text-xs text-ink-3">
            {code !== undefined && <span className="font-medium text-c">{code}</span>}
            {/* Desktop spells out the scheme; the phone spends the line on
                coverage and what just landed instead. */}
            {summary !== undefined && (
              <span className="hidden md:inline">
                {code !== undefined && " · "}
                {schemeLabel(summary)}
              </span>
            )}
            <span className="md:hidden">
              {coverage !== undefined && (
                <>
                  {code !== undefined && " · "}
                  {hidden ? "totals hidden" : coverage.replace(" of grade", " graded")}
                </>
              )}
              {latest !== undefined && (
                <>
                  {" · "}
                  {unseen && <UnreadDot className="mr-[5px] inline-block align-[1px]" />}
                  {latest.name}
                </>
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="col-start-2 row-start-1 justify-self-end md:col-auto md:row-auto md:justify-self-auto">
        <GradeNumber
          score={hidden ? undefined : score}
          letter={hidden ? undefined : letter}
          estimated={estimated}
          placeholder={hidden ? "Hidden" : "—"}
        />
      </div>

      <div className="hidden min-w-0 md:block">
        {coverage === undefined || hidden ? (
          <span className="text-[12.5px] text-ink-3">—</span>
        ) : (
          <Coverage fraction={summary?.coverage ?? 0} label={coverage} trackClassName="w-20" />
        )}
      </div>

      <div className="hidden min-w-0 items-center gap-[9px] text-[13px] md:flex">
        {latest === undefined ? (
          <span className="text-[12.5px] text-ink-3">—</span>
        ) : (
          <>
            {unseen && <UnreadDot />}
            <span className="truncate">{latest.name}</span>
            <span className="tabular shrink-0 font-medium">
              {formatPoints(latest.score ?? 0)}
              {(latest.pointsPossible ?? 0) > 0 && (
                <span className="font-normal text-ink-3">
                  {" / "}
                  {formatPoints(latest.pointsPossible ?? 0)}
                </span>
              )}
            </span>
            {latest.postedAt !== undefined && (
              <span className="shrink-0 whitespace-nowrap text-ink-3">
                · {formatPlannedRelative(dayKeyOf(latest.postedAt), today)}
              </span>
            )}
          </>
        )}
      </div>
    </Link>
  );
}

/**
 * A finished course reads from `courses.list` alone: `grades.index` carries
 * active courses only, and a final letter is all a past term shows anyway.
 */
export function GradesPastRow({ course, color }: { course: Course; color: string }) {
  const hidden = course.hideFinalGrades === true;
  const score = hidden ? undefined : (course.finalScore ?? course.currentScore);
  // Canvas's final letter, else one estimated from the course's scale (the
  // synced scheme or the UW default; no per-course cutoffs here).
  const canvasLetter = hidden ? undefined : (course.finalGrade ?? course.currentGrade);
  const letter =
    canvasLetter ??
    (score === undefined ? undefined : letterFor(score, schemeFor({ gradingScheme: course.gradingScheme })));
  const estimated = canvasLetter === undefined && letter !== undefined;
  const code = shortCode(course) ?? course.courseCode;

  return (
    <Link
      to="/grades/$courseId"
      params={{ courseId: String(course.canvasId) }}
      style={courseStyle(color)}
      className="flex items-center gap-4 border-b border-line px-4 py-[10px] text-ink-2 no-underline hover:bg-hover md:h-[42px] md:py-0 md:px-5"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Dot className="size-2 opacity-45" />
        <div className="min-w-0 truncate">
          <span className="text-[13.5px]">{course.nickname ?? course.name}</span>
          <span className="ml-[10px] text-xs text-ink-3">{code}</span>
        </div>
      </div>
      <span className="tabular shrink-0 text-[12.5px] text-ink-3">
        {letter === undefined && score === undefined ? (
          hidden ? "Hidden" : "—"
        ) : (
          <>
            Final
            {letter !== undefined && (
              <b
                title={estimated ? ESTIMATED_LETTER_NOTE : undefined}
                className={cn("ml-[6px] font-semibold text-ink", estimated && "font-medium text-ink-2 underline decoration-dashed underline-offset-4")}
              >
                {letter}
                {estimated && <span className="sr-only"> (estimated)</span>}
              </b>
            )}
            {score !== undefined && <span className="ml-2">{formatPercent(score)}</span>}
          </>
        )}
      </span>
    </Link>
  );
}
