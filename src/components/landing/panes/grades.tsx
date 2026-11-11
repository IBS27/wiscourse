/**
 * Showcase pane: one course's gradebook in what-if mode, a static copy of
 * routes/grades.$courseId (header, summary, composition strip, table and the
 * targets rail). Its one live moment types a quiz score into the table and
 * lets the total, the group bar and the targets follow.
 *
 * The numbers are one consistent book: Quizzes 10%, Projects 40%, Homework
 * 25%, Final 25% (ungraded), on the standard UW scale.
 */

import type { ReactNode } from "react";
import { ArrowUpRight, ChevronLeft, FlaskConical, RotateCcw, SlidersHorizontal } from "lucide-react";
import { CourseTag } from "@/components/app/bits";
import { cn } from "@/lib/utils";
import { c } from "../landing-data";
import { enter, useCountUp, useSequence, useTyped } from "../landing-motion";

/** The what-if edit: the one quiz, posted at 81, retried at 86. */
const EDIT = { name: "Quiz 1: Processes", was: 81, typed: "86" };
const TOTAL = { was: 89.4, edited: 90.1 };

/** "How the grade is built": each group's share, how much is graded, its score. */
const BUILT: { name: string; share: string; graded: string; score?: number; edited?: number }[] = [
  { name: "Quizzes", share: "10%", graded: "100%", score: EDIT.was, edited: Number(EDIT.typed) },
  { name: "Projects", share: "40%", graded: "50%", score: 88.5 },
  { name: "Homework", share: "25%", graded: "100%", score: 94.2 },
  { name: "Final", share: "25%", graded: "0%" },
];

/** Posted scores only; a row without one shows no percentage. */
const PROJECTS: { name: string; due: string; percent?: string; missing?: boolean }[] = [
  { name: "Project 0: Unix Utilities", due: "Fri Jul 31", percent: "85.0%" },
  { name: "Project 1: xv6 Shell", due: "Fri Aug 7", percent: "92.0%" },
  { name: "Project 2: Multithreaded Web Server", due: "Wed Aug 19", missing: true },
  { name: "Project 3: xv6 Scheduler", due: "Mon Aug 24" },
];

/** What each letter needs on the 300 points still open: before the edit, then with it. */
const TARGETS: { letter: string; cutoff: string; needs: [string, string] }[] = [
  { letter: "A", cutoff: "93.0%", needs: ["97.0%", "95.9%"] },
  { letter: "AB", cutoff: "88.0%", needs: ["85.9%", "84.8%"] },
  { letter: "B", cutoff: "83.0%", needs: ["74.8%", "73.7%"] },
  { letter: "BC", cutoff: "78.0%", needs: ["63.7%", "62.6%"] },
  { letter: "C", cutoff: "70.0%", needs: ["45.9%", "44.8%"] },
  { letter: "D", cutoff: "60.0%", needs: ["23.7%", "22.6%"] },
  { letter: "F", cutoff: "0.0%", needs: ["already there", "already there"] },
];
/** Where the average lands on that scale. */
const HERE = "AB";

const percent = (n: number) => `${n.toFixed(1)}%`;

/** `enter(i)` merged with the element's own classes. */
const row = (i: number, className: string) => ({ ...enter(i), className: cn(enter(i).className, className) });

const BUTTON = "inline-flex h-8 shrink-0 items-center gap-[7px] rounded-lg text-[12.5px] font-medium";
const ROW =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-[2px] lg:grid-cols-[minmax(0,1fr)_128px_72px] lg:gap-y-0";
const NAME_CELL = "col-start-1 row-start-1 lg:col-auto lg:row-auto";
const SCORE_CELL = "col-start-2 row-start-1 lg:col-auto lg:row-auto";
const PERCENT_CELL = "col-start-2 row-start-2 lg:col-auto lg:row-auto";
const FIELD =
  "tabular flex h-7 w-[84px] shrink-0 items-center justify-end rounded-md border bg-surface px-2 text-[13px] font-medium text-ink";
const PLACEHOLDER = <span className="text-[12px] font-normal text-ink-3">try a score</span>;

export function GradesPane({ active }: { active: boolean }) {
  // Step 0 puts the caret in the quiz field; step 1 commits what was typed.
  const step = useSequence(active, [1350, 2350]);
  const typed = useTyped(EDIT.typed, step >= 0, { delay: 350, speed: 170 });
  const focused = step === 0;
  const edited = step >= 1;
  const total = useCountUp<HTMLSpanElement>(edited, {
    from: TOTAL.was, to: TOTAL.edited, decimals: 1, suffix: "%", duration: 800,
  });
  const quiz = edited ? Number(EDIT.typed) : EDIT.was;

  return (
    <div className="flex h-full flex-col" style={c("indigo")}>
      <header {...row(0, "shrink-0 border-b border-line px-4 py-4 lg:h-16 lg:px-6 lg:py-0")}>
        <div className="flex w-full items-start gap-3 lg:h-full lg:items-center lg:gap-5">
          <div className="flex min-w-0 flex-1 items-start">
            <span className="-mt-[2px] -ml-[7px] grid size-7 shrink-0 place-items-center rounded-md text-ink-3 lg:hidden">
              <ChevronLeft className="size-[18px]" />
            </span>
            <div className="min-w-0 lg:flex lg:h-[42px] lg:flex-col">
              <div className="line-clamp-3 text-[22px] leading-[1.2] font-semibold tracking-[-0.022em] text-balance lg:block lg:h-6 lg:truncate lg:page-title lg:leading-6">
                Operating Systems
              </div>
              <div className="mt-1 truncate text-[12.5px] text-ink-3 lg:mt-[2px] lg:h-4 lg:leading-4">
                <CourseTag>CS 537</CourseTag>
                {["What-if", edited ? "1 edit" : "0 edits", "saved in this browser only"].map((part, i) => (
                  <span key={i}>
                    <span className="mx-[7px]">·</span>
                    {part}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={cn(BUTTON, "px-[10px] text-ink-3 transition-opacity duration-300", !edited && "opacity-0")}>
              <RotateCcw className="size-[13px]" />
              Reset
            </span>
            <span className={cn(BUTTON, "bg-today px-3 text-today-fg")}>
              <FlaskConical className="size-[14px]" />
              Done
            </span>
            <span className="hidden h-8 shrink-0 items-center gap-[7px] rounded-lg border border-line px-3 text-[12.5px] font-medium text-ink-2 lg:inline-flex">
              Open in Canvas
              <ArrowUpRight className="size-[14px] text-ink-3" />
            </span>
          </div>
        </div>
      </header>

      <div className="min-h-0 min-w-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1fr)_216px]">
        <div className="min-w-0">
          <section className="px-4 pt-6 pb-2 lg:px-6">
            <div className="grid gap-7 lg:grid-cols-[174px_minmax(0,1fr)] lg:items-center lg:gap-4">
              <div {...row(1, "min-w-0")}>
                <div className="text-[12.5px] font-medium text-ink-3">Current → what-if</div>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="flex items-center gap-3">
                    <span className="tabular text-[28px] leading-none font-medium tracking-[-0.035em] text-ink-3">
                      {percent(TOTAL.was)}
                    </span>
                    <span className="text-lg text-ink-3">→</span>
                  </span>
                  <span ref={total} className="tabular text-[40px] leading-none font-semibold tracking-[-0.035em]">
                    {percent(TOTAL.edited)}
                  </span>
                  <span className="inline-flex h-[28px] min-w-[34px] shrink-0 items-center justify-center rounded-[7px] bg-chip px-[7px] text-[15px] leading-none font-semibold whitespace-nowrap text-ink-2">
                    {HERE}
                  </span>
                </div>
              </div>

              <section className="hidden min-w-0 lg:block">
                <div {...row(2, "text-[12.5px] font-medium text-ink-3")}>How the grade is built</div>
                <div className="mt-1 grid grid-cols-1">
                  {BUILT.map((group, i) => {
                    const score = group.edited !== undefined && edited ? group.edited : group.score;
                    return (
                      <div
                        key={group.name}
                        {...row(3 + i, "grid min-w-0 grid-cols-[minmax(0,1fr)_64px_52px] items-center gap-x-3 py-[6px] text-[13px]")}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">{group.name}</span>
                          <span className="tabular block truncate text-[12.5px] text-ink-2">
                            {group.share} of grade<span className="text-ink-3"> · {group.graded} graded</span>
                          </span>
                        </span>
                        <span className="block h-[6px] overflow-hidden rounded-full bg-line-2 dark:bg-line">
                          {group.score !== undefined && (
                            // Drawn at its widest (the edited score) and scaled back until the edit lands.
                            <span
                              className="block h-full origin-left rounded-full bg-ink-3 transition-transform duration-700"
                              style={{
                                width: `${group.edited ?? group.score}%`,
                                transform: `scaleX(${(score ?? 0) / (group.edited ?? group.score)})`,
                              }}
                            />
                          )}
                        </span>
                        {/* Nothing posted, nothing shown: the empty track and "0% graded" say so. */}
                        {score !== undefined && (
                          <span className="tabular text-right font-semibold text-ink">{percent(score)}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </section>

          <div className="px-4 pt-4 pb-10 lg:px-6">
            <div {...row(7, cn(ROW, "hidden h-9 border-b border-line text-xs font-medium text-ink-3 lg:grid"))}>
              <span>Assignment</span>
              <span className="text-right">Score</span>
              <span className="text-right">%</span>
            </div>

            <Plate i={8} first name="Quizzes" weight="10%" earned={quiz} of={100} percent={percent(quiz)} />
            <Assignment
              i={9}
              name={EDIT.name}
              due="Thu Aug 13"
              percent={percent(quiz)}
              edited={edited}
              field={
                <span className={cn(FIELD, focused ? "border-ink ring-[3px] ring-ink/10" : "border-line-2")}>
                  {typed === 0 ? PLACEHOLDER : EDIT.typed.slice(0, typed)}
                  {focused && <span className="ml-px h-[15px] w-px animate-[lp-blink_1s_steps(2)_infinite] bg-ink" />}
                </span>
              }
              // Always in the layout, so the row does not grow when the edit lands.
              note={<span className={cn("transition-opacity duration-300", !edited && "opacity-0")}>was {EDIT.was}</span>}
            />

            <Plate i={10} name="Projects" weight="40%" earned={177} of={200} percent="88.5%" />
            {PROJECTS.map((project, i) => (
              <Assignment
                key={project.name}
                i={11 + i}
                {...project}
                field={<span className={cn(FIELD, "border-line-2")}>{PLACEHOLDER}</span>}
              />
            ))}
          </div>
        </div>

        <aside className="hidden border-l border-line bg-sunken px-4 py-[18px] lg:block">
          <div {...row(2, "mb-2 flex items-baseline justify-between gap-3")}>
            <div className="text-[13px] font-semibold">To finish with</div>
            <span className="tabular text-[12px] text-ink-3">300 pts left</span>
          </div>
          {TARGETS.map((target, i) => {
            const below = i > TARGETS.findIndex((t) => t.letter === HERE);
            return (
              <div
                key={target.letter}
                {...row(
                  3 + i,
                  cn(
                    "grid grid-cols-[auto_1fr_auto] items-center gap-[10px] border-t border-line py-[7px] text-[13px]",
                    i === TARGETS.length - 1 && "border-b",
                  ),
                )}
              >
                <span className={cn("flex min-w-[30px] items-center gap-[6px] font-semibold whitespace-nowrap", below && "font-normal text-ink-3")}>
                  {target.letter}
                  {target.letter === HERE && <span className="size-[5px] rounded-full bg-ink" />}
                </span>
                <span className="truncate text-[12.5px] text-ink-3">≥ {target.cutoff}</span>
                <span className={cn("tabular text-right font-medium whitespace-nowrap", below && "font-normal text-ink-3")}>
                  {target.needs[edited ? 1 : 0]}
                </span>
              </div>
            );
          })}

          <div {...row(10, "")}>
            <Swap
              on={edited}
              className="mt-3 text-[12.5px] text-ink-3"
              from="No edits yet, so these are your real numbers. Cutoffs from the standard UW scale. The dot marks where the current average lands."
              to="With your 1 edit counted as real. Cutoffs from the standard UW scale. The dot marks where the current average lands."
            />
            <span className="mt-[10px] -ml-2 inline-flex h-8 items-center gap-[6px] rounded-lg px-2 text-[12.5px] font-medium text-ink-2">
              <SlidersHorizontal className="size-[13px]" />
              Edit cutoffs
            </span>
          </div>

          <div {...row(11, "")}>
            <div className="mt-7 mb-2 text-[13px] font-semibold">Edits</div>
            <Swap
              on={edited}
              from={<span className="text-[12.5px] text-ink-3">Type a score into any row and everything above moves.</span>}
              to={
                <span className="flex items-start gap-3 py-[3px] text-[13px]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{EDIT.name}</span>
                    <span className="block text-[12px] text-ink-3">was {EDIT.was}</span>
                  </span>
                  <span className="tabular font-medium">{EDIT.typed}</span>
                </span>
              }
            />
            <span
              className={cn(
                "mt-[14px] inline-flex h-8 items-center gap-[7px] rounded-lg border border-line-2 bg-surface px-3 text-[12.5px] font-medium text-ink-2 transition-opacity duration-300",
                !edited && "opacity-50",
              )}
            >
              <RotateCcw className="size-[13px]" />
              Reset all
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** A group's plate: its name and weight, then the subtotal and its percentage. */
function Plate({
  i, first, name, weight, earned, of, percent,
}: {
  i: number; first?: boolean; name: string; weight: string; earned: number; of: number; percent: string;
}) {
  return (
    <div
      {...row(
        i,
        cn(ROW, "-mx-2 rounded-lg bg-sunken px-2 py-[9px] text-[14px] font-semibold lg:h-10 lg:py-0 dark:bg-hover", first ? "mt-3" : "mt-6"),
      )}
    >
      <div className={cn(NAME_CELL, "flex min-w-0 flex-col gap-y-[1px] lg:flex-row lg:items-baseline lg:gap-x-2")}>
        <span className="min-w-0 truncate">{name}</span>
        <span className="min-w-0 truncate text-xs font-normal text-ink-3">{weight} of grade</span>
      </div>
      <div className={cn(SCORE_CELL, "tabular text-right whitespace-nowrap")}>
        {earned}
        <span className="font-normal text-ink-3"> / {of}</span>
        <span className="font-normal text-ink-3 lg:hidden"> · {percent}</span>
      </div>
      <span className="tabular hidden text-right lg:block">{percent}</span>
    </div>
  );
}

/** One assignment in what-if mode: every score cell is a field. */
function Assignment({
  i, name, due, percent, missing, edited, field, note,
}: {
  i: number; name: string; due: string; percent?: string; missing?: boolean; edited?: boolean;
  field: ReactNode;
  /** The quiet line under the field ("was 81"). */
  note?: ReactNode;
}) {
  return (
    <div {...row(i, cn(ROW, "border-b border-line py-[9px] text-[13px] lg:min-h-[46px] lg:py-[6px]"))}>
      <div className={cn(NAME_CELL, "flex min-w-0 items-center gap-2 max-lg:flex-wrap max-lg:gap-y-[2px]")}>
        <span className="truncate text-[14px] text-ink max-lg:basis-full">{name}</span>
        <span className="shrink-0 text-[12.5px] whitespace-nowrap text-ink-3 lg:pl-1">{due}</span>
        {missing && <span className="shrink-0 text-[12px] font-medium text-red">missing</span>}
        <span className={cn("size-[5px] shrink-0 rounded-full bg-ink-2 transition-opacity duration-300", !edited && "opacity-0")} />
      </div>
      <div className={cn(SCORE_CELL, "tabular flex flex-col items-end justify-center gap-[1px] text-right whitespace-nowrap")}>
        <span className="flex items-center gap-1">
          {field}
          <span className="shrink-0 font-normal text-ink-3">/ 100</span>
        </span>
        {note !== undefined && <span className="text-[11px] font-normal text-ink-3">{note}</span>}
      </div>
      <div className={cn(PERCENT_CELL, "tabular text-right text-xs text-ink-3 lg:text-[13px] lg:text-ink-2")}>{percent}</div>
    </div>
  );
}

/** Two states stacked in one cell, one fading out before the other fades in, so the swap never moves the layout. */
function Swap({ on, from, to, className }: { on: boolean; from: ReactNode; to: ReactNode; className?: string }) {
  const layer = "col-start-1 row-start-1 min-w-0 transition-opacity";
  return (
    <span className={cn("grid", className)}>
      <span className={cn(layer, "duration-150", on && "opacity-0")}>{from}</span>
      <span className={cn(layer, "duration-300", on ? "delay-150" : "opacity-0")}>{to}</span>
    </span>
  );
}
