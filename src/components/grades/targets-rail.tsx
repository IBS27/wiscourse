import { useMemo, useState } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import {
  letterFor,
  neededForTarget,
  type GradeCourse,
  type SchemeEntry,
  type Summary,
} from "../../../convex/lib/grades";
import type { WhatIf } from "./what-if";
import { CutoffsDialog } from "./cutoffs-dialog";
import {
  cutoffLabel,
  formatPoints,
  scoreParts,
  targetLabel,
} from "@/lib/grades-ui";
import { cn } from "@/lib/utils";

function sourceNote(course: GradeCourse): string {
  if (course.gradeCutoffs !== undefined) return "Cutoffs are your own for this course.";
  if (course.gradingScheme !== undefined) return "Cutoffs from the course grading scheme.";
  return "Cutoffs from the standard UW scale.";
}

/**
 * What every letter still needs, the edits that are in force, and the way
 * back out. Lives beside the table on a wide screen and under the summary on
 * a phone.
 */
export function TargetsRail({
  courseCanvasId,
  course,
  summary,
  scheme,
  whatIf,
  className,
}: {
  courseCanvasId: number;
  course: GradeCourse;
  /** The live summary, with what-if edits already applied. */
  summary: Summary;
  scheme: SchemeEntry[];
  whatIf: WhatIf;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);

  const targets = useMemo(
    () =>
      scheme.map((entry) => ({
        entry,
        needed: neededForTarget(summary, entry.value * 100),
      })),
    [scheme, summary],
  );
  const here =
    summary.score === undefined ? undefined : letterFor(summary.score, scheme);

  const edits = useMemo(() => {
    const byId = new Map(
      summary.groups.flatMap((group) => group.rows).map((result) => [result.row.canvasId, result.row]),
    );
    return [...whatIf.edits].map(([canvasId, score]) => ({
      canvasId,
      score,
      row: byId.get(canvasId),
    }));
  }, [summary, whatIf.edits]);

  return (
    <aside
      className={cn(
        "border-t border-line bg-sunken px-4 py-[18px] lg:border-t-0 lg:border-l lg:px-[18px]",
        className,
      )}
    >
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold">To finish with</h2>
        {summary.pointsRemaining > 0 && (
          <span className="tabular text-[12px] text-ink-3">
            {formatPoints(summary.pointsRemaining)} pts left
          </span>
        )}
      </div>
      <div>
        {targets.map(({ entry, needed }, index) => {
          const current = here === entry.name;
          const below = here !== undefined && index > scheme.findIndex((e) => e.name === here);
          return (
            <div
              key={`${entry.name}-${entry.value}`}
              className={cn(
                "grid grid-cols-[auto_1fr_auto] items-center gap-[10px] border-t border-line py-[7px] text-[13px]",
                index === targets.length - 1 && "border-b",
              )}
            >
              <span
                className={cn(
                  "flex min-w-[30px] items-center gap-[6px] font-semibold whitespace-nowrap",
                  below && "font-normal text-ink-3",
                )}
              >
                {entry.name}
                {current && (
                  <>
                    <span className="size-[5px] rounded-full bg-ink" aria-hidden />
                    <span className="sr-only">where you are now</span>
                  </>
                )}
              </span>
              <span className="truncate text-[12.5px] text-ink-3">
                {cutoffLabel(entry)}
              </span>
              <span
                className={cn(
                  "tabular text-right font-medium whitespace-nowrap",
                  below && "font-normal text-ink-3",
                )}
              >
                {targetLabel(needed)}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[12.5px] text-ink-3">
        {whatIf.edits.size === 0
          ? "No edits yet, so these are your real numbers."
          : `With your ${whatIf.edits.size} edit${whatIf.edits.size === 1 ? "" : "s"} counted as real.`}{" "}
        {sourceNote(course)} The dot marks where the current average lands.
      </p>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mt-[10px] -ml-2 inline-flex h-8 items-center gap-[6px] rounded-lg px-2 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:outline-none"
      >
        <SlidersHorizontal className="size-[13px]" />
        Edit cutoffs
      </button>
      <CutoffsDialog
        courseCanvasId={courseCanvasId}
        scheme={scheme}
        open={editing}
        onOpenChange={setEditing}
      />

      <h2 className="mt-7 mb-2 text-[13px] font-semibold">Edits</h2>
      {edits.length === 0 ? (
        <p className="text-[12.5px] text-ink-3">
          Type a score into any row and everything above moves.
        </p>
      ) : (
        <div className="flex flex-col gap-[2px]">
          {edits.map((edit) => (
            <div key={edit.canvasId} className="flex items-start gap-3 py-[3px] text-[13px]">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{edit.row?.name ?? "Assignment"}</span>
                <span className="block text-[12px] text-ink-3">
                  was {edit.row === undefined ? "—" : scoreParts(edit.row, edit.row.score).value}
                </span>
              </span>
              <span className="tabular font-medium">{formatPoints(edit.score)}</span>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={whatIf.reset}
        disabled={whatIf.edits.size === 0}
        className="mt-[14px] inline-flex h-8 items-center gap-[7px] rounded-lg border border-line-2 bg-surface px-3 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:outline-none disabled:opacity-50"
      >
        <RotateCcw className="size-[13px]" />
        Reset all
      </button>
    </aside>
  );
}
