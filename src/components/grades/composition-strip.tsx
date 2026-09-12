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
 * The weights drawn once, to scale, each filled to the share of that group
 * that is graded — so an empty block says "this much is still entirely open"
 * without a sentence. Ink only: the course colour is carried elsewhere.
 */
export function CompositionStrip({
  summary,
  note,
}: {
  summary: Summary;
  /** Appended to the heading, e.g. "+25% from your edits". */
  note?: string;
}) {
  const segments = segmentsOf(summary);
  if (segments.length === 0) return null;

  return (
    <section className="pb-2">
      <div className="eyebrow">
        How the grade is built
        <span className="ml-[6px] font-medium tracking-normal normal-case text-ink-3">
          · {Math.round(summary.coverage * 100)}% graded so far
          {note !== undefined && ` · ${note}`}
        </span>
      </div>
      <div className="mt-2 flex h-3 gap-[3px] overflow-hidden rounded-[3px]">
        {segments.map((segment) => (
          <span
            key={segment.key}
            className="relative block h-full min-w-[3px] shrink grow-0 overflow-hidden rounded-[2px] bg-chip"
            style={{ flexBasis: `${segment.share * 100}%` }}
          >
            <span
              className="absolute inset-y-0 left-0 bg-ink-2"
              style={{ width: `${Math.max(0, Math.min(1, segment.fill)) * 100}%` }}
            />
          </span>
        ))}
      </div>
      <ul className="mt-[10px] flex list-none flex-wrap gap-x-[22px] gap-y-1 p-0 text-xs text-ink-3">
        {segments.map((segment) => (
          <li key={segment.key} className="inline-flex items-center gap-[7px] whitespace-nowrap">
            <span
              className={cn(
                "size-2 shrink-0 rounded-[2px]",
                segment.percent === undefined ? "bg-chip" : "bg-ink-2",
              )}
              aria-hidden
            />
            <span className="font-medium text-ink">{segment.name}</span>
            <span>{segment.size} ·</span>
            <span className={segment.percent === undefined ? undefined : "tabular text-ink-2"}>
              {segment.percent === undefined ? "not yet graded" : formatPercent(segment.percent)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
