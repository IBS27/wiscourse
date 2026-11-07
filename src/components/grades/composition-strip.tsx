import type { Summary } from "../../../convex/lib/grades";
import { formatPercent, formatPoints, usesWeights } from "@/lib/grades-ui";
import { Meter } from "./bits";
import { cn } from "@/lib/utils";

interface Segment {
  key: number;
  name: string;
  /** Share of the whole grade, 0..1: by weight, or by points possible. */
  share: number;
  /** Share of this block already settled, 0..1. */
  fill: number;
  /** The block's size in words: "50%" or "200 pts". */
  size: string;
  percent?: number;
}

function segmentsOf(summary: Summary): Segment[] {
  const weighted = usesWeights(summary);
  const carrying = summary.groups.filter((group) =>
    weighted ? group.weight > 0 : group.settledPossible + group.ungradedPossible > 0,
  );
  const total = carrying.reduce(
    (n, group) =>
      n + (weighted ? group.weight : group.settledPossible + group.ungradedPossible),
    0,
  );
  if (total <= 0) return [];
  return carrying.map((group) => {
    const size = weighted ? group.weight : group.settledPossible + group.ungradedPossible;
    return {
      key: group.group.canvasId,
      name: group.group.name,
      share: size / total,
      fill: group.coverage,
      size: weighted ? `${formatPoints(group.weight)}%` : `${formatPoints(size)} pts`,
      percent: group.percent,
    };
  });
}

/**
 * One compact row per group: the name with its share and how much is graded
 * beneath it, then the score bar (at most 240px), then the % right after it,
 * so each score reads with its label rather than across the page.
 */
const COLUMNS =
  "grid-cols-[minmax(0,1fr)_72px_52px] @2xl:grid-cols-[200px_minmax(120px,240px)_64px]";

export function CompositionStrip({
  summary,
  note,
}: {
  summary: Summary;
  /** Shown beside the heading, e.g. "+25% from your edits". */
  note?: string;
}) {
  const segments = segmentsOf(summary);
  if (segments.length === 0) return null;

  return (
    <section className="@container min-w-0">
      <h2 className="text-[12.5px] font-medium text-ink-3">
        How the grade is built
        {note !== undefined && <span className="font-normal"> · {note}</span>}
      </h2>
      <ul className="mt-1 grid list-none grid-cols-1 p-0">
        {/* A column label, so the bar reads as the score, not the share graded. */}
        <li
          aria-hidden
          className={cn("hidden min-w-0 gap-x-4 pt-1 text-[12.5px] text-ink-3 @2xl:grid", COLUMNS)}
        >
          <span />
          <span />
          <span className="text-right">Score</span>
        </li>
        {segments.map((segment) => {
          // The bar is the score, so it always agrees with the number beside it;
          // how much is graded so far is said in words.
          const graded = `${Math.round(Math.max(0, Math.min(1, segment.fill)) * 100)}% graded`;
          const score = segment.percent === undefined ? 0 : Math.max(0, Math.min(1, segment.percent / 100));
          return (
            <li
              key={segment.key}
              className={cn("grid min-w-0 items-center gap-x-4 py-[6px] text-[13px]", COLUMNS)}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink" title={segment.name}>
                  {segment.name}
                </span>
                <span className="tabular block truncate text-[12.5px] text-ink-2">
                  {segment.size} of grade<span className="text-ink-3"> · {graded}</span>
                </span>
              </span>
              <span
                role="img"
                aria-label={`${segment.name}: ${segment.percent === undefined ? "not yet graded" : formatPercent(segment.percent)}`}
                className="block"
              >
                {/* Neutral ink like the Grades index and course rail meters, at score
                    weight, on a stronger track so an empty group still shows one. */}
                <Meter fraction={score} tone="neutral" className="h-[6px] bg-line-2" />
              </span>
              {segment.percent === undefined ? (
                <span className="text-right text-ink-3" title="not yet graded">
                  —<span className="sr-only"> not yet graded</span>
                </span>
              ) : (
                <span className="tabular text-right font-semibold text-ink">
                  {formatPercent(segment.percent)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
