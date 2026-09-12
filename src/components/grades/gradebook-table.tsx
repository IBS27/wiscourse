import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { GroupResult, RowResult, Summary } from "../../../convex/lib/grades";
import type { WhatIf } from "./what-if";
import { Letter } from "./bits";
import { Pill } from "@/components/app/bits";
import { UnreadDot } from "@/components/course/unread-dot";
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
 * Assignment · Due · Score · % · Class median. Below `md` the median and the
 * due column fold away and score/percent stack on the right.
 */
const ROW =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-[1px] px-2 md:grid-cols-[minmax(0,1fr)_150px_120px_72px_96px] md:gap-x-[14px] md:gap-y-0 md:pr-[10px] md:pl-4";
const MOBILE_1 = "col-start-1 row-start-1 md:col-auto md:row-auto";
const MOBILE_2 = "col-start-1 row-start-2 md:col-auto md:row-auto";
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
  return (
    <div role="table" aria-label="Grades">
      <div
        role="row"
        className={cn(
          ROW,
          "hidden h-8 border-b border-line text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase md:grid",
        )}
      >
        <span role="columnheader">Assignment</span>
        <span role="columnheader">Due</span>
        <span role="columnheader" className="text-right">
          Score
        </span>
        <span role="columnheader" className="text-right">
          %
        </span>
        <span role="columnheader" className="text-right">
          Class median
        </span>
      </div>

      {summary.groups.map((group) => (
        <GroupSection key={group.group.canvasId} group={group} whatIf={whatIf} seen={seen} />
      ))}

      {footer !== undefined && (
        <div
          role="row"
          className={cn(
            ROW,
            "mt-[14px] flex items-center justify-between border-t border-ink py-3 text-[13px] font-semibold md:grid md:h-[46px] md:py-0",
          )}
        >
          <div role="rowheader" className="min-w-0 truncate">
            {footer.label}
            <span className="ml-2 text-[12.5px] font-normal text-ink-3">{footer.sub}</span>
          </div>
          <span role="cell" className="hidden md:block" />
          <span role="cell" className="hidden md:block" />
          <span
            role="cell"
            aria-colspan={2}
            className="tabular flex items-baseline justify-end gap-2 whitespace-nowrap md:col-span-2"
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
  whatIf,
  seen,
}: {
  group: GroupResult;
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
          "mt-3 border-b border-line-2 py-[9px] text-[13px] font-semibold md:h-10 md:py-0",
        )}
      >
        <div role="rowheader" className={cn(MOBILE_1, "flex min-w-0 items-center gap-2")}>
          <span className="truncate">{group.group.name}</span>
          {weight !== undefined && <Pill className="h-[19px] px-[6px] text-[11px]">{weight}</Pill>}
          {drops !== undefined && (
            <Pill tone="outline" className="h-[19px] px-[6px] text-[11px] font-normal">
              {drops}
            </Pill>
          )}
        </div>
        <span role="cell" className="hidden md:block" />
        <div
          role="cell"
          className={cn(
            MOBILE_3,
            "tabular text-right whitespace-nowrap",
            subtotal === undefined && "font-medium text-ink-3",
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
  const unseen =
    row.postedAt !== undefined &&
    row.score !== undefined &&
    !seen.has(row.canvasId, String(row.postedAt));

  return (
    <div
      role="row"
      className={cn(
        ROW,
        "border-b border-line py-[7px] text-[13px] hover:bg-hover md:py-0",
        whatIf === undefined ? "md:h-9" : "md:min-h-[42px] md:py-[6px]",
        result.dropped && "opacity-55",
      )}
    >
      <div role="rowheader" className={cn(MOBILE_1, "flex min-w-0 items-center gap-2")}>
        {unseen && <UnreadDot />}
        <Link
          to={todoHref("assignment", row.canvasId)}
          onClick={() => {
            if (row.postedAt !== undefined) seen.mark(row.canvasId, String(row.postedAt));
          }}
          className="truncate text-inherit no-underline hover:underline hover:underline-offset-4"
        >
          {row.name}
        </Link>
        {state !== undefined && (
          <span
            className={cn(
              "shrink-0 text-[11.5px] font-normal",
              state.tone === "red" ? "text-red" : "text-ink-3",
            )}
          >
            {state.label}
          </span>
        )}
        {edited && (
          <>
            <span className="size-[5px] shrink-0 rounded-full bg-ink-2" aria-hidden />
            <span className="sr-only">edited</span>
          </>
        )}
      </div>

      <div role="cell" className={cn(MOBILE_2, "truncate text-xs text-ink-3 md:text-[12.5px]")}>
        {due}
      </div>

      <div
        role="cell"
        className={cn(
          MOBILE_3,
          "tabular flex flex-col items-end justify-center gap-[1px] text-right font-medium whitespace-nowrap",
        )}
      >
        {whatIf === undefined ? (
          <span className={cn(result.dropped && "line-through decoration-ink-3")}>
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
          "tabular text-right text-xs text-ink-3 md:text-[13px] md:text-ink",
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
            "tabular h-[26px] w-[68px] shrink-0 rounded-md border bg-surface px-2 text-right text-[13px] font-medium text-ink outline-none placeholder:text-[11.5px] placeholder:font-normal placeholder:text-ink-3 focus:ring-[3px] disabled:border-line disabled:bg-transparent disabled:opacity-60",
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
