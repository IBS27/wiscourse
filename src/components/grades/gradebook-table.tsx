import type { CSSProperties } from "react";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { GroupResult, RowResult, Summary } from "../../../convex/lib/grades";
import type { WhatIf } from "./what-if";
import { Letter } from "./bits";
import { todoHref } from "@/lib/course-routes";
import {
  DASH,
  dropRuleLabel,
  dueLabel,
  formatPercent,
  formatPoints,
  groupScoreParts,
  rowPercent,
  rowStateLabel,
  scoreParts,
  weightLabel,
  type ScoreParts,
} from "@/lib/grades-ui";
import type { Seen } from "@/lib/seen";
import { cn } from "@/lib/utils";

/**
 * Assignment · Score · % · Class median. A row's due date rides after its
 * name, so no column is ever blank. Below `md` the median column folds away
 * and score/percent stack on the right. On desktop the median column
 * collapses to zero width when no row in the whole table has one, so every
 * group keeps the same columns. Score fits a what-if field plus "/100".
 */
const ROW =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-[2px] px-2 md:grid-cols-[minmax(0,1fr)_128px_72px_var(--median-col,96px)] md:gap-x-4 md:gap-y-0";
const MOBILE_1 = "col-start-1 row-start-1 md:col-auto md:row-auto";
const MOBILE_3 = "col-start-2 row-start-1 md:col-auto md:row-auto";
const MOBILE_4 = "col-start-2 row-start-2 md:col-auto md:row-auto";

export interface TableFooter {
  label: string;
  sub: string;
  score?: number;
  letter?: string;
  /** The letter is derived from the scale, not sent by Canvas. */
  letterEstimated?: boolean;
}

export function GradebookTable({
  summary,
  whatIf,
  seen,
  footer,
}: {
  summary: Summary;
  /** Present only in what-if mode; every score cell becomes a field. */
  whatIf?: WhatIf;
  seen: Seen;
  /** Omitted when the instructor hides totals. */
  footer?: TableFooter;
}) {
  // Canvas only sends medians for some courses; an all-empty column is noise.
  const hasMedian = summary.groups.some((g) => g.rows.some((r) => r.row.median !== undefined));
  const columns = (hasMedian ? {} : { "--median-col": "0px" }) as CSSProperties;
  return (
    <div role="table" aria-label="Grades" style={columns}>
      <div
        role="row"
        className={cn(
          ROW,
          "hidden h-9 border-b border-line text-xs font-medium text-ink-3 md:grid",
        )}
      >
        <span role="columnheader">Assignment</span>
        <span role="columnheader" className="text-right">
          Score
        </span>
        <span role="columnheader" className="text-right">
          %
        </span>
        <span role="columnheader" className="text-right">
          {hasMedian ? "Class median" : ""}
        </span>
      </div>

      {summary.groups.map((group, index) => (
        <GroupSection
          key={group.group.canvasId}
          group={group}
          first={index === 0}
          whatIf={whatIf}
          seen={seen}
        />
      ))}

      {footer !== undefined && (
        <div
          role="row"
          className={cn(
            ROW,
            "mt-4 flex items-center justify-between border-t border-line-2 py-3 text-[13.5px] font-semibold md:grid md:h-12 md:py-0",
          )}
        >
          <div role="rowheader" className="min-w-0 truncate">
            {footer.label}
            <span className="ml-2 text-[12.5px] font-normal text-ink-3">{footer.sub}</span>
          </div>
          <span role="cell" className="hidden md:block" />
          <span
            role="cell"
            aria-colspan={2}
            className="tabular flex items-center justify-end gap-[10px] whitespace-nowrap md:col-span-2"
          >
            {footer.score === undefined ? DASH : formatPercent(footer.score)}
            {footer.letter !== undefined && (
              <Letter letter={footer.letter} estimated={footer.letterEstimated === true} />
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function GroupSection({
  group,
  first,
  whatIf,
  seen,
}: {
  group: GroupResult;
  first: boolean;
  whatIf?: WhatIf;
  seen: Seen;
}) {
  const weight = weightLabel(group.weight);
  const drops = dropRuleLabel(group.group);
  const subtotal = groupScoreParts(group);

  return (
    <>
      <div
        role="row"
        className={cn(
          ROW,
          "rounded-lg bg-sunken py-[9px] dark:bg-hover text-[14px] font-semibold md:h-10 md:py-0",
          first ? "mt-3" : "mt-6",
        )}
      >
        <div
          role="rowheader"
          className={cn(MOBILE_1, "flex min-w-0 flex-col gap-y-[1px] md:flex-row md:items-baseline md:gap-x-2")}
        >
          <span className="min-w-0 truncate">{group.group.name}</span>
          {(weight !== undefined || drops !== undefined) && (
            <span className="min-w-0 truncate text-xs font-normal text-ink-3">
              {[weight === undefined ? undefined : `${weight} of grade`, drops]
                .filter((part): part is string => part !== undefined)
                .join(" · ")}
            </span>
          )}
        </div>
        <div
          role="cell"
          className={cn(
            MOBILE_3,
            "tabular text-right whitespace-nowrap",
            subtotal === undefined && "text-xs font-normal text-ink-3",
          )}
        >
          {subtotal === undefined ? "not yet graded" : <Score parts={subtotal} />}
          {group.percent !== undefined && (
            <span className="font-normal text-ink-3 md:hidden"> · {formatPercent(group.percent)}</span>
          )}
        </div>
        <span role="cell" className="tabular hidden text-right md:block">
          {group.percent === undefined ? "" : formatPercent(group.percent)}
        </span>
        <span role="cell" className="hidden md:block" />
      </div>

      {group.rows.map((result) => (
        <AssignmentRow key={result.row.canvasId} result={result} whatIf={whatIf} seen={seen} />
      ))}
    </>
  );
}

function AssignmentRow({
  result,
  whatIf,
  seen,
}: {
  result: RowResult;
  whatIf?: WhatIf;
  seen: Seen;
}) {
  const row = result.row;
  const state = rowStateLabel(result);
  const due = dueLabel(row);
  const percent = rowPercent(row, result.effectiveScore);
  const edited = whatIf !== undefined && whatIf.edits.has(row.canvasId);

  return (
    <div
      role="row"
      className={cn(
        ROW,
        "border-b border-line py-[9px] text-[13px] transition-colors hover:bg-hover md:py-0",
        whatIf === undefined ? "md:h-10" : "md:min-h-[46px] md:py-[6px]",
      )}
    >
      <div role="rowheader" className={cn(MOBILE_1, "flex min-w-0 items-center gap-2")}>
        <Link
          to={todoHref("assignment", row.canvasId)}
          onClick={() => {
            if (row.postedAt !== undefined) seen.mark(row.canvasId, String(row.postedAt));
          }}
          // A grade table has no unread state: every row is one regular weight.
          className="truncate text-[14px] text-ink no-underline hover:underline hover:underline-offset-4"
        >
          {row.name}
        </Link>
        {due !== undefined && (
          <span className="shrink-0 pl-1 text-[12.5px] whitespace-nowrap text-ink-3">{due}</span>
        )}
        {state !== undefined &&
          (result.dropped ? (
            // A dropped score is decided, not wrong: a quiet pill, never a strike.
            <span className="inline-flex h-[18px] shrink-0 items-center rounded-full bg-chip px-[7px] text-[12px] text-ink-3">
              {state.label}
            </span>
          ) : (
            <span
              className={cn(
                "shrink-0 text-[12px] font-medium",
                state.tone === "red" ? "text-red" : "text-ink-3",
              )}
            >
              {state.label}
            </span>
          ))}
        {edited && (
          <>
            <span className="size-[5px] shrink-0 rounded-full bg-ink-2" aria-hidden />
            <span className="sr-only">edited</span>
          </>
        )}
      </div>

      <div
        role="cell"
        className={cn(
          MOBILE_3,
          "tabular flex flex-col items-end justify-center gap-[1px] text-right whitespace-nowrap",
        )}
      >
        {whatIf === undefined ? (
          <span className={cn(result.dropped && "font-normal text-ink-3")}>
            <Score parts={scoreParts(row, result.effectiveScore)} />
          </span>
        ) : (
          <WhatIfCell key={whatIf.version} result={result} whatIf={whatIf} />
        )}
      </div>

      <div
        role="cell"
        className={cn(
          MOBILE_4,
          "tabular text-right text-xs text-ink-3 md:text-[13px]",
          !result.dropped && "md:text-ink-2",
        )}
      >
        {percent === undefined ? "" : formatPercent(percent)}
        {row.median !== undefined && (
          <span className="text-ink-3 md:hidden"> · med {formatPoints(row.median)}</span>
        )}
      </div>

      <div role="cell" className="tabular hidden text-right text-[12.5px] text-ink-3 md:block">
        {row.median === undefined ? "" : formatPoints(row.median)}
      </div>
    </div>
  );
}

function Score({ parts }: { parts: ScoreParts }) {
  return (
    <span className={parts.muted ? "font-normal text-ink-3" : undefined}>
      {parts.value}
      {parts.of !== undefined && <span className="font-normal text-ink-3">{parts.of}</span>}
    </span>
  );
}

/**
 * A plain non-negative decimal. `Number()` alone would swallow "-3", " 9e2"
 * and "" into numbers nobody typed, so the field parses its own text.
 */
const SCORE = /^(\d+(\.\d*)?|\.\d+)$/;

function parseScore(text: string): number | undefined {
  const trimmed = text.trim();
  if (!SCORE.test(trimmed)) return undefined;
  const value = Number(trimmed);
  // No upper bound: extra credit is a real thing instructors award.
  return Number.isFinite(value) ? value : undefined;
}

/** A score cell in what-if mode: a field, plus what Canvas actually says. */
function WhatIfCell({ result, whatIf }: { result: RowResult; whatIf: WhatIf }) {
  const row = result.row;
  const edit = whatIf.edits.get(row.canvasId);
  // Controlled, and remounted by `key={whatIf.version}` when "Reset all"
  // clears everything — so a half-typed "9." survives its own round trip.
  const [draft, setDraft] = useState(() => (edit === undefined ? "" : String(edit)));
  const invalid = draft.trim() !== "" && parseScore(draft) === undefined;

  const commit = (text: string) => {
    setDraft(text);
    // Anything we cannot read is not a hypothetical: the row falls back to
    // Canvas rather than keeping a stale number the student can no longer see.
    whatIf.set(row.canvasId, parseScore(text));
  };

  const original = scoreParts(row, row.score);
  return (
    <>
      <span className="flex items-center gap-1">
        <input
          type="text"
          inputMode="decimal"
          aria-label={`What-if score for ${row.name}`}
          aria-invalid={invalid || undefined}
          value={draft}
          disabled={!result.counted}
          placeholder={result.counted ? "try a score" : original.value}
          onChange={(event) => commit(event.target.value)}
          className={cn(
            "tabular h-7 w-[84px] shrink-0 rounded-md border bg-surface px-2 transition-colors text-right text-[13px] font-medium text-ink outline-none placeholder:text-[12px] placeholder:font-normal placeholder:text-ink-3 focus:ring-[3px] disabled:border-line disabled:bg-transparent disabled:opacity-60",
            invalid
              ? "border-red text-red focus:border-red focus:ring-red/20"
              : "border-line-2 focus:border-ink focus:ring-ink/10",
          )}
        />
        {original.of !== undefined && (
          <span className="shrink-0 font-normal text-ink-3">{original.of}</span>
        )}
      </span>
      {invalid ? (
        <span className="text-[11px] font-normal text-red">needs a number</span>
      ) : (
        edit !== undefined && (
          <span className="text-[11px] font-normal text-ink-3">was {original.value}</span>
        )
      )}
    </>
  );
}
