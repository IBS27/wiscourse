import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ChevronLeft, ExternalLink, FlaskConical, RotateCcw } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import {
  latestPosted,
  letterFor,
  neededForTarget,
  schemeFor,
  summarize,
  type GradeRow,
} from "../../../convex/lib/grades";
import { BigGrade, Coverage, Fact } from "./bits";
import { CompositionStrip } from "./composition-strip";
import { GradebookTable, type TableFooter } from "./gradebook-table";
import { TargetsRail } from "./targets-rail";
import { useWhatIf } from "./what-if";
import { Kbd } from "@/components/app/bits";
import { UnreadDot } from "@/components/course/unread-dot";
import { canvasCourseUrl } from "@/lib/course-routes";
import {
  dayKeyOf,
  formatDayShort,
  formatPlannedRelative,
  formatSince,
  formatTime,
} from "@/lib/dates";
import {
  DASH,
  coverageLabel,
  firstExpected,
  formatPercent,
  formatPoints,
  rescaleNote,
  scoreParts,
  usesWeights,
  withArticle,
} from "@/lib/grades-ui";
import { courseStyle, shortCode, useCourses, useNow, useToday } from "@/lib/hooks";
import { familyName } from "@/lib/instructors";
import { useSeen } from "@/lib/seen";
import { useSyncInfo } from "@/lib/sync-info";
import { isTyping, cn } from "@/lib/utils";

/**
 * One course's gradebook: the number, how it is built, every row behind it,
 * and a what-if mode that never touches Canvas.
 *
 * `embedded` drops the page header — the course hub already has one.
 */
export function CourseGradebook({
  courseCanvasId,
  embedded = false,
}: {
  courseCanvasId: number;
  embedded?: boolean;
}) {
  const book = useQuery(api.grades.course, { courseCanvasId });
  const { byId, color } = useCourses();
  const course = byId.get(courseCanvasId);
  const seen = useSeen("grade");
  const sync = useSyncInfo();
  const known = useMemo(
    () =>
      book == null
        ? undefined
        : new Set(book.groups.flatMap((group) => group.assignments.map((row) => row.canvasId))),
    [book],
  );
  const whatIf = useWhatIf(courseCanvasId, known);
  const today = useToday();
  const now = useNow();

  // Canvas mode is always where a reload lands: a stored edit must never
  // silently change the number on screen. The toggle carries the count so
  // the edits are still discoverable.
  const [mode, setMode] = useState(false);
  const hidden = book?.course.hideFinalGrades === true;
  const whatIfOn = mode && !hidden;

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "w" ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTyping(event.target) ||
        // The cutoffs dialog, ⌘K and quick-add all own the keyboard while open.
        document.querySelector('[role="dialog"]') !== null
      ) {
        return;
      }
      event.preventDefault();
      setMode((on) => !on);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const base = useMemo(() => (book == null ? undefined : summarize(book)), [book]);
  const live = useMemo(
    () => (book == null ? undefined : whatIfOn ? summarize(book, whatIf.edits) : summarize(book)),
    [book, whatIfOn, whatIf.edits],
  );
  const latest = useMemo(() => (book == null ? undefined : latestPosted(book)), [book]);

  if (book === undefined) return <GradebookSkeleton embedded={embedded} />;
  if (book === null || base === undefined || live === undefined) {
    return (
      <div className="px-5 py-10 text-center text-[13px] text-ink-3">
        No gradebook for this course yet.
      </div>
    );
  }

  const scheme = schemeFor(book.course);
  const canvasScore = book.course.currentScore;
  // Canvas's own letter when it sends one; otherwise an estimate from the
  // grading scale, shown as such (dashed chip). Only the estimate depends
  // on the cutoffs the student can edit.
  const canvasLetter =
    book.course.currentGrade ??
    (canvasScore === undefined ? undefined : letterFor(canvasScore, scheme));
  const letterEstimated = book.course.currentGrade === undefined && canvasLetter !== undefined;
  const localLetter = live.score === undefined ? undefined : letterFor(live.score, scheme);

  const code = course === undefined ? undefined : shortCode(course);
  const instructor = familyName(course?.verifiedInstructors?.[0]);
  const synced =
    sync?.lastSyncedAt === undefined ? undefined : `synced ${formatSince(sync.lastSyncedAt, now)}`;
  const meta = whatIfOn
    ? [
        "What-if",
        `${whatIf.edits.size} edit${whatIf.edits.size === 1 ? "" : "s"}`,
        "saved in this browser only",
      ]
    : [
        usesWeights(live) ? "Weighted" : "Points",
        instructor,
        hidden ? "totals hidden by the instructor" : undefined,
        synced,
      ];
  const metaLine = meta.filter((part): part is string => part !== undefined && part !== "").join(" · ");

  const footer: TableFooter | undefined = hidden
    ? undefined
    : whatIfOn
      ? {
          label: "What-if",
          sub: "local · drop rules and weights applied",
          score: live.score,
          letter: localLetter,
        }
      : {
          label: "Current",
          sub: "Canvas · graded groups only",
          score: canvasScore,
          letter: canvasLetter,
          letterEstimated,
        };

  const toggle = (
    <ModeToggle
      on={whatIfOn}
      disabled={hidden}
      edits={whatIf.edits.size}
      onToggle={() => setMode((value) => !value)}
      onReset={whatIf.reset}
    />
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      style={courseStyle(color(courseCanvasId))}
    >
      {embedded ? (
        <div className="flex items-center justify-between gap-4 px-4 pt-4 md:px-5">
          <div className="min-w-0 truncate text-xs text-ink-3">{metaLine}</div>
          <div className="flex shrink-0 items-center gap-2">{toggle}</div>
        </div>
      ) : (
        <header className="flex items-center justify-between gap-5 border-b border-line px-4 py-[14px] md:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.015em]">
              <Link to="/grades" aria-label="All grades" className="shrink-0 text-ink-3">
                <ChevronLeft className="size-[18px]" />
              </Link>
              <span className="truncate">{course?.nickname ?? course?.name ?? "Course"}</span>
              {code !== undefined && (
                <span className="shrink-0 text-[13px] font-medium text-ink-3">{code}</span>
              )}
            </div>
            <div className="mt-[3px] truncate text-xs text-ink-3">{metaLine}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {toggle}
            <a
              href={canvasCourseUrl(courseCanvasId, sync?.instance)}
              target="_blank"
              rel="noreferrer"
              className="hidden h-[31px] items-center gap-[7px] rounded-lg px-[6px] text-[12.5px] font-medium text-ink-3 hover:text-ink md:inline-flex"
            >
              <ExternalLink className="size-[13px]" />
              Canvas
            </a>
          </div>
        </header>
      )}

      <div
        className={cn(
          "min-w-0 flex-1",
          whatIfOn &&
            "lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:grid-rows-[auto_1fr] lg:items-start",
        )}
      >
        <div className={cn("px-4 md:px-5", whatIfOn && "lg:col-start-1 lg:row-start-1")}>
          {/* 2B: the number and the drawing of how it is built, side by side. */}
          <div className="flex flex-col gap-5 py-5 lg:flex-row lg:items-start lg:gap-10">
            <Fact
              className="lg:w-[220px] lg:shrink-0"
              label={whatIfOn ? "Current → what-if" : "Current"}
              meta={
                hidden
                  ? "by the instructor until grades are final"
                  : whatIfOn
                    ? rescaleNote(live)
                    : (rescaleNote(base) ?? expectationNote(base))
              }
            >
              <BigGrade
                score={hidden ? undefined : whatIfOn ? live.score : canvasScore}
                letter={whatIfOn ? localLetter : canvasLetter}
                estimated={!whatIfOn && letterEstimated}
                was={whatIfOn ? canvasScore : undefined}
                placeholder={hidden ? "Hidden" : DASH}
              />
            </Fact>

            <div className="min-w-0 lg:flex-1">
              <CompositionStrip
                // Canvas mode draws Canvas's own picture; what-if draws the
                // edited one, and says so, so the bar and the caption agree.
                summary={whatIfOn ? live : base}
                note={whatIfOn ? editedNote(live, base) : undefined}
              />
            </div>
          </div>

          <div className="flex flex-col gap-5 pb-5 md:flex-row md:gap-10">
            <Fact
              label="Graded so far"
              meta={settledNote(live, base, scheme, whatIfOn, hidden, canvasLetter)}
            >
              <Coverage
                className="mt-[2px]"
                fraction={live.coverage}
                label={coverageLabel(live, true) ?? "nothing graded yet"}
                trackClassName="w-[140px] md:w-[160px]"
              />
            </Fact>

            {latest !== undefined && (
              <Fact
                label="Latest"
                meta={
                  latest.postedAt === undefined
                    ? undefined
                    : `posted ${formatPlannedRelative(dayKeyOf(latest.postedAt), today)}, ${formatTime(latest.postedAt)}`
                }
              >
                <LatestScore row={latest} unseen={!seen.has(latest.canvasId, String(latest.postedAt))} />
              </Fact>
            )}
          </div>
        </div>

        {whatIfOn && (
          <TargetsRail
            courseCanvasId={courseCanvasId}
            course={book.course}
            summary={live}
            scheme={scheme}
            whatIf={whatIf}
            className="mt-2 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:h-full"
          />
        )}

        <div
          className={cn("px-2 pb-8 md:px-3", whatIfOn && "lg:col-start-1 lg:row-start-2")}
        >
          <GradebookTable summary={live} whatIf={whatIfOn ? whatIf : undefined} seen={seen} footer={footer} />
        </div>
      </div>
    </div>
  );
}

function LatestScore({ row, unseen }: { row: GradeRow; unseen: boolean }) {
  const parts = scoreParts(row, row.score);
  return (
    <div className="mt-[2px] flex items-center gap-2 text-[13.5px] font-medium">
      {row.postedAt !== undefined && unseen && <UnreadDot />}
      <span className="truncate">{row.name}</span>
      <span className="tabular shrink-0 font-normal text-ink-3">
        {parts.value}
        {parts.of}
      </span>
    </div>
  );
}

function ModeToggle({
  on,
  disabled,
  edits,
  onToggle,
  onReset,
}: {
  on: boolean;
  disabled: boolean;
  edits: number;
  onToggle: () => void;
  onReset: () => void;
}) {
  if (disabled) return null;
  const button =
    "inline-flex h-[31px] shrink-0 items-center gap-[7px] rounded-lg px-3 text-[12.5px] font-medium";
  return (
    <>
      {on && edits > 0 && (
        <button
          type="button"
          onClick={onReset}
          className={cn(button, "px-[6px] text-ink-3 hover:text-ink")}
        >
          <RotateCcw className="size-[13px]" />
          Reset
        </button>
      )}
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        className={cn(
          button,
          on
            ? "bg-today text-today-fg"
            : "border border-line bg-surface text-ink-2 hover:bg-hover",
        )}
      >
        <FlaskConical className="size-[13px]" />
        {on ? "Done" : "What-if"}
        {!on && edits > 0 && <span className="tabular text-ink-3">· {edits}</span>}
        {!on && <Kbd className="ml-[2px]">W</Kbd>}
      </button>
    </>
  );
}

/** "+25% from your edits", or nothing when the edits settle no new work. */
function editedNote(
  live: ReturnType<typeof summarize>,
  base: ReturnType<typeof summarize>,
): string | undefined {
  const gained = Math.round((live.coverage - base.coverage) * 100);
  return gained > 0 ? `+${gained}% from your edits` : undefined;
}

/** "first grade expected after Homework 1, due Fri Sep 11". */
function expectationNote(summary: ReturnType<typeof summarize>): string | undefined {
  if (summary.score !== undefined) return undefined;
  const next = firstExpected(summary);
  if (next === undefined) return "nothing to grade yet";
  const due = next.dueAt === undefined ? undefined : `, due ${formatDayShort(dayKeyOf(next.dueAt))}`;
  return `first grade expected after ${next.name}${due ?? ""}`;
}

/** "670 pts still to come · 93.4% on them keeps an A" — or what the edits did. */
function settledNote(
  live: ReturnType<typeof summarize>,
  base: ReturnType<typeof summarize>,
  scheme: ReturnType<typeof schemeFor>,
  whatIfOn: boolean,
  hidden: boolean,
  /** Canvas's letter — the only one there is standing to "keep". */
  canvasLetter: string | undefined,
): string | undefined {
  const remaining =
    live.pointsRemaining > 0 ? `${formatPoints(live.pointsRemaining)} pts still ` : undefined;
  if (whatIfOn) {
    return [editedNote(live, base), remaining === undefined ? undefined : `${remaining}open`]
      .filter((part): part is string => part !== undefined)
      .join(" · ");
  }
  if (remaining === undefined) return "everything is graded";
  // With totals hidden by the instructor there is no standing to keep.
  if (hidden) return `${remaining}to come`;
  const cutoff = scheme.find((entry) => entry.name === canvasLetter);
  const needed = cutoff === undefined ? undefined : neededForTarget(live, cutoff.value * 100);
  const keeps =
    needed === undefined || needed > 100 || needed <= 0 || canvasLetter === undefined
      ? undefined
      : `${formatPercent(needed)} on them keeps ${withArticle(canvasLetter)}`;
  return [`${remaining}to come`, keeps].filter((part): part is string => part !== undefined).join(" · ");
}

function GradebookSkeleton({ embedded }: { embedded: boolean }) {
  return (
    <div className="flex flex-1 flex-col">
      {!embedded && <div className="h-[62px] border-b border-line" />}
      <div className="space-y-4 px-4 py-6 md:px-5">
        <div className="h-8 w-32 rounded bg-chip" />
        <div className="h-3 w-full max-w-[520px] rounded bg-chip" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-4 w-full rounded bg-chip" />
        ))}
      </div>
    </div>
  );
}
