import type { ReactNode } from "react";
import { DASH, formatPercent } from "@/lib/grades-ui";
import { cn } from "@/lib/utils";

/** The letter chip that sits beside every score. */
export const ESTIMATED_LETTER_NOTE =
  "Estimated from the grading scale — Canvas did not send a letter";

/**
 * A letter chip. `estimated` marks one derived from the grading scale
 * because Canvas sent only a score: dashed edge and a tooltip, so it never
 * passes for the instructor's word.
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
        "relative shrink-0 rounded-[5px] border border-line-2 font-semibold text-ink-2",
        size === "sm" ? "-top-[2px] px-[6px] py-px text-xs" : "-top-[4px] rounded-md px-[7px] py-[2px] text-sm",
        estimated && "border-dashed text-ink-3",
      )}
    >
      {letter}
      {estimated && <span className="sr-only"> (estimated)</span>}
    </span>
  );
}

/** A percentage and its letter: the row-sized version. */
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
    return <span className={cn("tabular text-[17px] font-medium text-ink-3", className)}>{placeholder}</span>;
  }
  return (
    <span className={cn("inline-flex items-baseline gap-2", className)}>
      <span className="tabular text-[17px] font-semibold tracking-[-0.02em]">
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
}: {
  score: number | undefined;
  letter?: string;
  estimated?: boolean;
  /** The Canvas number, shown struck through the arrow in what-if mode. */
  was?: number;
  placeholder?: string;
}) {
  return (
    <div className="flex items-baseline gap-[10px]">
      {was !== undefined && (
        <>
          <span className="tabular text-[32px] leading-none font-medium tracking-[-0.03em] text-ink-3">
            {formatPercent(was)}
          </span>
          <span className="relative -top-[2px] text-xl font-normal text-ink-3" aria-hidden>
            →
          </span>
        </>
      )}
      {score === undefined ? (
        <span className="tabular text-[32px] leading-none font-medium tracking-[-0.03em] text-ink-3">
          {placeholder}
        </span>
      ) : (
        <span className="tabular text-[32px] leading-none font-semibold tracking-[-0.03em]">
          {formatPercent(score)}
        </span>
      )}
      {score !== undefined && letter !== undefined && (
        <Letter letter={letter} size="lg" estimated={estimated} />
      )}
    </div>
  );
}

/** "65% of grade" with the thin bar that makes the share visible. */
export function Coverage({
  fraction,
  label,
  trackClassName,
  className,
}: {
  /** 0..1. */
  fraction: number;
  label: string;
  trackClassName?: string;
  className?: string;
}) {
  const percent = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <div className={cn("flex items-center gap-[10px] text-[12.5px] text-ink-2", className)}>
      <span className={cn("h-1 w-24 shrink-0 overflow-hidden rounded-sm bg-chip", trackClassName)}>
        <span className="block h-full rounded-sm bg-ink-2" style={{ width: `${percent}%` }} />
      </span>
      {label}
    </div>
  );
}

/** One block of the summary strip: an eyebrow, a number, a quiet line under it. */
export function Fact({
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
      <div className="eyebrow mb-[6px]">{label}</div>
      {children}
      {meta !== undefined && <div className="mt-[7px] text-[12.5px] text-ink-3">{meta}</div>}
    </div>
  );
}
