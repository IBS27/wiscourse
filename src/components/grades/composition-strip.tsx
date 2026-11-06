import type { Summary } from "../../../convex/lib/grades";
import { formatPercent, formatPoints, usesWeights } from "@/lib/grades-ui";
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
      <ul
        className={cn(
          "mt-2 grid list-none grid-cols-1 gap-x-10 p-0",
          segments.length > 1 && "@2xl:grid-cols-2",
        )}
      >
        {segments.map((segment) => {
          const fill = Math.max(0, Math.min(1, segment.fill));
          const graded = `${Math.round(fill * 100)}% graded`;
          return (
            <li
              key={segment.key}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_72px_48px] items-center gap-x-3 py-[7px] text-[13px] @md:grid-cols-[minmax(0,1fr)_auto_96px_52px]"
            >
              <span className="truncate font-medium text-ink" title={segment.name}>
                {segment.name}
              </span>
              <span className="tabular text-[12.5px] whitespace-nowrap text-ink-3">
                {segment.size} of grade
              </span>
              <span
                role="img"
                aria-label={`${segment.name}: ${graded}`}
                title={graded}
                className="relative block h-1.5 overflow-hidden rounded-full"
                style={{ background: "color-mix(in oklab, var(--c) 20%, var(--surface))" }}
              >
                <span className="absolute inset-y-0 left-0 rounded-full bg-c" style={{ width: `${fill * 100}%` }} />
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
