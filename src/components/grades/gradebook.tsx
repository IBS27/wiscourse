import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { BarChart3, ChevronLeft, ArrowUpRight, FlaskConical, RotateCcw } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import {
  latestPosted,
  letterFor,
  neededForTarget,
  schemeFor,
  summarize,
  type GradeRow,
} from "../../../convex/lib/grades";
import { BigGrade, Stat } from "./bits";
import { CompositionStrip } from "./composition-strip";
import { GradebookTable, type TableFooter } from "./gradebook-table";
import { TargetsRail } from "./targets-rail";
import { useWhatIf } from "./what-if";
import { CourseTag } from "@/components/app/bits";
import { COURSE_CONTENT } from "@/components/course/content-width";
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
import { courseStyle, courseTitle, shortCode, useCourses, useNow, useToday } from "@/lib/hooks";
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
      <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
        <BarChart3 className="size-5 text-ink-3" aria-hidden />
        <p className="text-[13.5px] font-medium">No gradebook for this course yet</p>
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
  // The full name, as the course page shows it.
  const instructor = course?.verifiedInstructors?.[0]?.name;
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
  const metaParts = meta.filter((part): part is string => part !== undefined && part !== "");
  const metaLine = metaParts.join(" · ");

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

  const heroNotes = [
    hidden
      ? "Hidden by the instructor until grades are final."
      : whatIfOn
        ? rescaleNote(live)
        : (rescaleNote(base) ?? expectationNote(base)),
    !hidden && !whatIfOn && letterEstimated && canvasScore !== undefined
      ? "Letter estimated from the grading scale."
      : undefined,
  ].filter((note): note is string => note !== undefined);
  const standing = standingOf(live, base, scheme, whatIfOn, hidden, canvasLetter);

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
        <div className={cn(COURSE_CONTENT, "flex items-center justify-between gap-4 px-4 pt-4 md:px-6")}>
          <div className="min-w-0 truncate text-[12.5px] text-ink-3">{metaLine}</div>
          <div className="flex shrink-0 items-center gap-2">{toggle}</div>
        </div>
      ) : (
        // The page frame: on desktop a 64px bar whose 42px title block puts
        // the title at the same y and gutter as every page's (the course
        // colour rides on the code tag; the sidebar is the way back). Phones
        // keep the hub's template: a back chevron and a larger wrapping title.
        <header className="shrink-0 border-b border-line px-4 pt-[max(16px,env(safe-area-inset-top))] pb-4 md:h-16 md:px-6 md:py-0">
          {/* The same 1080px as the body below, left on the gutter. */}
          <div className="flex w-full max-w-[1080px] items-start gap-3 md:h-full md:items-center md:gap-5">
            <div className="flex min-w-0 flex-1 items-start">
              <Link
                to="/grades"
                aria-label="All grades"
                className="-mt-[2px] -ml-[7px] grid size-7 shrink-0 place-items-center rounded-md text-ink-3 transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:outline-none md:hidden"
              >
                <ChevronLeft className="size-[18px]" />
              </Link>
              <div className="min-w-0 md:flex md:h-[42px] md:flex-col">
                <h1 className="line-clamp-3 text-[22px] leading-[1.2] font-semibold tracking-[-0.022em] text-balance md:page-title md:block md:h-6 md:truncate md:leading-6">
                  {course ? courseTitle(course) : "Course"}
                </h1>
                <div className="mt-1 truncate text-[12.5px] text-ink-3 md:mt-[2px] md:h-4 md:leading-4">
                  {[code, ...metaParts].map((part, i) =>
                    part === undefined ? null : (
                      <span key={`${i}-${part}`}>
                        {i > (code === undefined ? 1 : 0) && (
                          <span className="mx-[7px]" aria-hidden>
                            ·
                          </span>
                        )}
                        {i === 0 ? <CourseTag>{part}</CourseTag> : part}
                      </span>
                    ),
                  )}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {toggle}
              <a
                href={canvasCourseUrl(courseCanvasId, sync?.instance)}
                target="_blank"
                rel="noreferrer"
                className="hidden h-8 shrink-0 items-center gap-[7px] rounded-lg border border-line px-3 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-line-2 hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:outline-none md:inline-flex"
              >
                Open in Canvas
                <ArrowUpRight className="size-[14px] text-ink-3" />
              </a>
            </div>
          </div>
        </header>
      )}

      <div
        className={cn(
          // Capped at the 1080px every page shares (plus gutters), left-aligned.
          COURSE_CONTENT,
          "min-w-0 flex-1",
          whatIfOn &&
            "lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:grid-rows-[auto_1fr] lg:items-start",
        )}
      >
        <section
          aria-label="Summary"
          className={cn("px-4 pt-6 pb-2 md:px-6", whatIfOn && "lg:col-start-1 lg:row-start-1")}
        >
          {/* The number, and the drawing of how it is built, side by side. */}
          <div className="grid gap-7 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)] lg:gap-12">
            <div className="min-w-0">
              <h2 className="text-[12.5px] font-medium text-ink-3">
                {whatIfOn ? "Current → what-if" : "Current grade"}
              </h2>
              <BigGrade
                className="mt-3"
                score={hidden ? undefined : whatIfOn ? live.score : canvasScore}
                letter={whatIfOn ? localLetter : canvasLetter}
                estimated={!whatIfOn && letterEstimated}
                was={whatIfOn ? canvasScore : undefined}
                placeholder={hidden ? "Hidden" : DASH}
              />
              {heroNotes.length > 0 && (
                <div className="mt-3 space-y-1 text-[12.5px] leading-[1.45] text-ink-3">
                  {heroNotes.map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                </div>
              )}
            </div>

            <CompositionStrip
              // Canvas mode draws Canvas's own picture; what-if draws the
              // edited one, and says so, so the bar and the caption agree.
              summary={whatIfOn ? live : base}
              note={whatIfOn ? editedNote(live, base) : undefined}
            />
          </div>

          <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-5 md:grid-cols-[minmax(0,240px)_minmax(0,220px)_minmax(0,1fr)] md:gap-x-12">
            <Stat label="Graded so far" meta={standing.remaining}>
              <span className="tabular text-[15px] font-semibold">
                {coverageLabel(live, true) ?? "Nothing yet"}
              </span>
            </Stat>

            {standing.keep !== undefined && (
              <Stat label={`To keep ${withArticle(standing.keep.letter)}`} meta="average on what's left">
                <span className="tabular text-[15px] font-semibold">
                  {formatPercent(standing.keep.needed)}
                </span>
              </Stat>
            )}

            {latest !== undefined && (
              <Stat
                label="Latest posted"
                className="col-span-2 md:col-span-1"
                meta={
                  latest.postedAt === undefined
                    ? undefined
                    : `${formatPlannedRelative(dayKeyOf(latest.postedAt), today)}, ${formatTime(latest.postedAt)}`
                }
              >
                <LatestScore row={latest} unseen={!seen.has(latest.canvasId, String(latest.postedAt))} />
              </Stat>
            )}
          </dl>
        </section>

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
          className={cn("px-4 pt-4 pb-10 md:px-6", whatIfOn && "lg:col-start-1 lg:row-start-2")}
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
    <div className="flex min-w-0 items-center gap-2 text-[14px]">
      <span className={cn("truncate", unseen ? "font-medium text-ink" : "text-ink-2")}>{row.name}</span>
      <span className="tabular shrink-0 text-ink-3">
        <span className="font-semibold text-ink">{parts.value}</span>
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
    "inline-flex h-8 shrink-0 items-center gap-[7px] rounded-lg text-[12.5px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:outline-none";
  return (
    <>
      {on && edits > 0 && (
        <button
          type="button"
          onClick={onReset}
          className={cn(button, "px-[10px] text-ink-3 hover:bg-hover hover:text-ink")}
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
            ? "bg-today px-3 text-today-fg hover:opacity-90"
            : "border border-line bg-surface px-3 text-ink-2 md:pr-[6px] hover:border-line-2 hover:bg-hover hover:text-ink",
        )}
      >
        <FlaskConical className={cn("size-[14px]", !on && "text-ink-3")} />
        {on ? "Done" : "What-if"}
        {!on && edits > 0 && <span className="tabular font-normal text-ink-3">· {edits}</span>}
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

/**
 * The secondary numbers under the headline: what is still open, and the
 * average on it that keeps Canvas's letter — or what the edits did.
 */
function standingOf(
  live: ReturnType<typeof summarize>,
  base: ReturnType<typeof summarize>,
  scheme: ReturnType<typeof schemeFor>,
  whatIfOn: boolean,
  hidden: boolean,
  /** Canvas's letter — the only one there is standing to "keep". */
  canvasLetter: string | undefined,
): { remaining: string; keep?: { letter: string; needed: number } } {
  const points = live.pointsRemaining > 0 ? `${formatPoints(live.pointsRemaining)} pts still ` : undefined;
  if (whatIfOn) {
    return {
      remaining: [editedNote(live, base), points === undefined ? undefined : `${points}open`]
        .filter((part): part is string => part !== undefined)
        .join(" · "),
    };
  }
  if (points === undefined) return { remaining: "everything is graded" };
  // With totals hidden by the instructor there is no standing to keep.
  if (hidden || canvasLetter === undefined) return { remaining: `${points}to come` };
  const cutoff = scheme.find((entry) => entry.name === canvasLetter);
  const needed = cutoff === undefined ? undefined : neededForTarget(live, cutoff.value * 100);
  const keep =
    needed === undefined || needed > 100 || needed <= 0 ? undefined : { letter: canvasLetter, needed };
  return { remaining: `${points}to come`, keep };
}

function GradebookSkeleton({ embedded }: { embedded: boolean }) {
  return (
    <div className="flex flex-1 flex-col">
      {!embedded && <div className="h-16 border-b border-line" />}
      <div className="space-y-4 px-4 py-6 md:px-6">
        <div className="h-10 w-36 rounded bg-chip" />
        <div className="h-3 w-full max-w-[520px] rounded bg-chip" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-4 w-full rounded bg-chip" />
        ))}
      </div>
    </div>
  );
}
