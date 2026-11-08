import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { latestPosted, letterFor, schemeFor, summarize, type Gradebook } from "../../../convex/lib/grades";
import { CoverageBar, GradeNumber, Letter } from "./bits";
import { CourseTag } from "@/components/app/bits";
import { dayKeyOf, formatPlannedRelative } from "@/lib/dates";
import { coverageLabel, formatPercent, formatPoints, schemeLabel } from "@/lib/grades-ui";
import { courseStyle, courseTitle, shortCode, type Course } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/** The grid the header and every row share. */
export const LEDGER_COLUMNS =
  "md:grid-cols-[minmax(0,1fr)_128px_minmax(0,180px)_minmax(0,290px)]";

const GUTTER = "px-4 md:px-6";

/** Hairline under each row, inset to the content gutters like every other table. */
const RULE =
  "relative after:absolute after:right-4 after:bottom-0 after:left-4 after:h-px after:bg-line md:after:right-6 md:after:left-6";

export function GradesLedgerHeader() {
  return (
    <div
      className={cn(
        "hidden h-9 items-center gap-x-8 text-xs font-medium text-ink-3 md:grid",
        GUTTER,
        RULE,
        LEDGER_COLUMNS,
      )}
    >
      <span>Course</span>
      {/* Ends over the % edge, not the letter chip beside it (26px chip + 10px gap). */}
      <span className="pr-9 text-right whitespace-nowrap">Current grade</span>
      <span>Graded so far</span>
      <span>Latest posted</span>
    </div>
  );
}

export function GradesLedgerRow({
  course,
  color,
  book,
  today,
}: {
  course: Course;
  color: string;
  /** Undefined while `grades.index` is in flight. */
  book: Gradebook | undefined;
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

  return (
    <Link
      to="/grades/$courseId"
      params={{ courseId: String(course.canvasId) }}
      style={courseStyle(color)}
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_96px] items-start gap-x-6 py-3 text-inherit no-underline transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none md:min-h-[64px] md:items-center md:gap-x-8 md:py-[10px]",
        GUTTER,
        RULE,
        LEDGER_COLUMNS,
      )}
    >
      <div className="min-w-0">
        <div className="line-clamp-2 text-[14px] leading-[1.3] font-medium tracking-[-0.01em] md:line-clamp-1">
          {courseTitle(course)}
        </div>
        <div className="mt-[3px] flex min-w-0 items-center gap-[6px] text-[12.5px] text-ink-3">
          {code !== undefined && <CourseTag className="shrink-0">{code}</CourseTag>}
          {/* Desktop spells out the scheme; the phone spends the line on
              how much is graded instead. */}
          {summary !== undefined && (
            <span className="hidden min-w-0 truncate md:inline">
              {code !== undefined && <Sep />}
              {schemeLabel(summary)}
            </span>
          )}
          {coverage !== undefined && (
            <span className="min-w-0 truncate md:hidden">
              {code !== undefined && <Sep />}
              {hidden ? "totals hidden" : coverage.replace(" of grade", " graded")}
            </span>
          )}
        </div>
      </div>

      <div className="col-start-2 row-start-1 flex justify-end md:col-auto md:row-auto">
        <GradeNumber
          score={hidden ? undefined : score}
          letter={hidden ? undefined : letter}
          estimated={estimated}
          placeholder={hidden ? "Hidden" : "—"}
        />
      </div>

      <div className="hidden min-w-0 md:block">
        {coverage === undefined || hidden ? (
          <span className="text-[13px] text-ink-3">—</span>
        ) : (
          <>
            <div className="tabular truncate text-[13px] text-ink-2">{coverage}</div>
            <CoverageBar fraction={summary?.coverage ?? 0} className="mt-[7px] max-w-[160px]" />
          </>
        )}
      </div>

      <div className="hidden min-w-0 md:block">
        {latest === undefined ? (
          <span className="text-[13px] text-ink-3">—</span>
        ) : (
          <>
            {/* One line, one weight in every row: the ledger reads as a column. */}
            <div className="truncate text-[13px] leading-[1.35] text-ink" title={latest.name}>
              {latest.name}
            </div>
            <div className="tabular mt-[3px] truncate text-[12.5px] text-ink-3">
              <span className="font-medium text-ink-2">{formatPoints(latest.score ?? 0)}</span>
              {(latest.pointsPossible ?? 0) > 0 && ` / ${formatPoints(latest.pointsPossible ?? 0)}`}
              {latest.postedAt !== undefined &&
                ` · ${formatPlannedRelative(dayKeyOf(latest.postedAt), today)}`}
            </div>
          </>
        )}
      </div>
    </Link>
  );
}

function Sep() {
  return (
    <span className="mr-[6px]" aria-hidden>
      ·
    </span>
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
      className={cn(
        "flex items-center gap-4 py-[10px] text-ink-2 no-underline transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none md:h-11 md:py-0",
        GUTTER,
        RULE,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="min-w-0 truncate text-[13.5px]">{courseTitle(course)}</span>
        {code !== undefined && (
          <CourseTag className="shrink-0 text-xs font-normal text-ink-3">{code}</CourseTag>
        )}
      </div>
      <span className="tabular flex shrink-0 items-center gap-[10px] text-[12.5px] text-ink-3">
        {letter === undefined && score === undefined ? (
          hidden ? "Hidden" : "—"
        ) : (
          <>
            <span>Final{score !== undefined && ` ${formatPercent(score)}`}</span>
            {letter !== undefined && <Letter letter={letter} estimated={estimated} />}
          </>
        )}
      </span>
    </Link>
  );
}
