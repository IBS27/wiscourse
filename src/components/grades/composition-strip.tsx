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
 * The weights drawn once, to scale, each filled in the course colour to the
 * share of that group that is graded — so an empty block says "this much is
 * still entirely open" without a sentence.
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
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[12.5px] font-medium text-ink-3">
          How the grade is built
          {note !== undefined && <span className="font-normal"> · {note}</span>}
        </h2>
        <div className="flex items-center gap-3 text-[11.5px] text-ink-3" aria-hidden>
          <span className="inline-flex items-center gap-[5px]">
            <span className="size-2 rounded-full bg-c" />
            graded
          </span>
          <span className="inline-flex items-center gap-[5px]">
            <span className="size-2 rounded-full bg-ink/12" />
            still to come
          </span>
        </div>
      </div>
      <div className="mt-3 flex h-2.5 gap-[3px]">
        {segments.map((segment) => (
          <span
            key={segment.key}
            className="relative block h-full min-w-[6px] shrink grow-0 overflow-hidden rounded-full bg-ink/8"
            style={{ flexBasis: `${segment.share * 100}%` }}
          >
            <span
              className="absolute inset-y-0 left-0 bg-c"
              style={{ width: `${Math.max(0, Math.min(1, segment.fill)) * 100}%` }}
            />
          </span>
        ))}
      </div>
      <ul
        className={cn(
          "mt-4 grid list-none grid-cols-2 gap-x-6 gap-y-3 p-0",
          segments.length >= 4 ? "@2xl:grid-cols-4" : segments.length === 3 ? "@lg:grid-cols-3" : undefined,
        )}
      >
        {segments.map((segment) => {
          const open = segment.percent === undefined;
          return (
            <li key={segment.key} className="min-w-0">
              <div className="flex items-center gap-2 text-[13px]">
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    open ? "bg-ink/12" : "bg-c",
                  )}
                  aria-hidden
                />
                <span className="truncate font-medium text-ink" title={segment.name}>
                  {segment.name}
                </span>
                {!open && (
                  <span className="tabular ml-auto shrink-0 font-semibold">
                    {formatPercent(segment.percent ?? 0)}
                  </span>
                )}
              </div>
              <div className="tabular mt-[2px] truncate pl-4 text-[12px] text-ink-3">
                <span>{segment.size} of the grade</span>
                {open && (
                  <>
                    {" · "}
                    <span>not yet graded</span>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
