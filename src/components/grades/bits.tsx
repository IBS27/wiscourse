import type { ReactNode } from "react";
import { DASH, formatPercent } from "@/lib/grades-ui";
import { cn } from "@/lib/utils";

/** The letter chip that sits beside every score. */
export const ESTIMATED_LETTER_NOTE =
  "Estimated from the grading scale — Canvas did not send a letter";

/**
 * A letter chip, fixed-width so a column of them lines up. `estimated` marks
 * one derived from the grading scale because Canvas sent only a score: it
 * reads quieter and carries a tooltip, so it never passes for the
 * instructor's word.
 */
export function Letter({
  letter,
  size = "sm",
  estimated = false,
}: {
  letter: string;
  size?: "sm" | "lg";
  estimated?: boolean;
}) {
  return (
    <span
      title={estimated ? ESTIMATED_LETTER_NOTE : undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center bg-chip leading-none font-semibold whitespace-nowrap",
        size === "sm"
          ? "h-[20px] min-w-[26px] rounded-[5px] px-[5px] text-[12px]"
          : "h-[28px] min-w-[34px] rounded-[7px] px-[7px] text-[15px]",
        estimated ? "font-medium text-ink-3" : "text-ink-2",
      )}
    >
      {letter}
      {estimated && <span className="sr-only"> (estimated)</span>}
    </span>
  );
}

/** A percentage and its letter: the row-sized version, right-aligned. */
export function GradeNumber({
  score,
  letter,
  estimated = false,
  placeholder = DASH,
  className,
}: {
  score: number | undefined;
  letter?: string;
  estimated?: boolean;
  /** What stands in when there is no number: "—", or "Hidden". */
  placeholder?: string;
  className?: string;
}) {
  if (score === undefined) {
    return (
      <span className={cn("tabular text-[13px] font-medium text-ink-3", className)}>
        {placeholder}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center justify-end gap-[10px]", className)}>
      <span className="tabular text-[15px] font-semibold tracking-[-0.01em]">
        {formatPercent(score)}
      </span>
      {letter !== undefined && <Letter letter={letter} estimated={estimated} />}
    </span>
  );
}

/** The headline number on a gradebook, optionally showing what it moved from. */
export function BigGrade({
  score,
  letter,
  estimated = false,
  was,
  placeholder = DASH,
  className,
}: {
  score: number | undefined;
  letter?: string;
  estimated?: boolean;
  /** The Canvas number, shown before the arrow in what-if mode. */
  was?: number;
  placeholder?: string;
  className?: string;
}) {
  const number = "tabular text-[40px] leading-none tracking-[-0.035em]";
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", className)}>
      {was !== undefined && (
        <span className="flex items-center gap-3">
          <span className={cn(number, "text-[28px] font-medium text-ink-3")}>{formatPercent(was)}</span>
          <span className="text-lg text-ink-3" aria-hidden>
            →
          </span>
        </span>
      )}
      {score === undefined ? (
        <span className={cn(number, "font-medium text-ink-3")}>{placeholder}</span>
      ) : (
        <span className={cn(number, "font-semibold")}>{formatPercent(score)}</span>
      )}
      {score !== undefined && letter !== undefined && (
        <Letter letter={letter} size="lg" estimated={estimated} />
      )}
    </div>
  );
}

/** A thin bar for "how much is graded", in the course colour (`--c`). */
export function CoverageBar({ fraction, className }: { fraction: number; className?: string }) {
  const percent = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <span
      className={cn("block h-[5px] overflow-hidden rounded-full bg-ink/8", className)}
      aria-hidden
    >
      <span className="block h-full rounded-full bg-c" style={{ width: `${percent}%` }} />
    </span>
  );
}

/** One cell of the summary grid: a quiet label, a value, a quiet line under it. */
export function Stat({
  label,
  meta,
  className,
  children,
}: {
  label: ReactNode;
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[12.5px] font-medium text-ink-3">{label}</dt>
      <dd className="mt-[6px] min-w-0">
        {children}
        {meta !== undefined && meta !== "" && (
          <div className="mt-[3px] text-[12.5px] text-ink-3">{meta}</div>
        )}
      </dd>
    </div>
  );
}
