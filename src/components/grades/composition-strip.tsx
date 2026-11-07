import type { Summary } from "../../../convex/lib/grades";
import { formatPercent, formatPoints, usesWeights } from "@/lib/grades-ui";
import { Meter } from "./bits";

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
 * One compact row per group: its name, its share of the grade, a small bar
 * of how much of it is graded, and its score. Every row reads on its own, so
 * there is no legend to map back to.
 */
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
      {/* Fills the content width, so its right edge meets the table's below. */}
      <ul className="mt-1 grid list-none grid-cols-1 p-0">
        {segments.map((segment) => {
          // The bar is the score, so it always agrees with the number beside it;
          // how much is graded so far is said in words.
          const graded = `${Math.round(Math.max(0, Math.min(1, segment.fill)) * 100)}% graded`;
          const score = segment.percent === undefined ? 0 : Math.max(0, Math.min(1, segment.percent / 100));
          return (
            <li
              key={segment.key}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_72px_52px] items-center gap-x-4 gap-y-[2px] py-[6px] text-[13px] @md:grid-cols-[minmax(130px,1fr)_auto_160px_56px]"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink" title={segment.name}>
                  {segment.name}
                </span>
                <span className="tabular block truncate text-[12.5px] text-ink-3 @md:hidden">
                  {segment.size} of grade · {graded}
                </span>
              </span>
              <span className="tabular hidden text-[12.5px] whitespace-nowrap text-ink-3 @md:block">
                {segment.size} of grade · {graded}
              </span>
              <span
                role="img"
                aria-label={`${segment.name}: ${segment.percent === undefined ? "not yet graded" : formatPercent(segment.percent)}`}
                className="block"
              >
                <Meter fraction={score} />
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
