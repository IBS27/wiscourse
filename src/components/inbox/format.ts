import type { FeedItem } from "../../../convex/inbox";
import { formatMonthDay, formatTime } from "@/lib/dates";

/** "Aug 28, 5:00 PM" */
export function shortDateTime(ms: number): string {
  return `${formatMonthDay(ms)}, ${formatTime(ms)}`;
}

export type FeedChange = NonNullable<FeedItem["change"]>;

/** One reading of a due-date or points change: the verb, both sides, and both together. */
export function formatChange(change: FeedChange) {
  const due = change.field === "dueAt";
  const side = (value: number | undefined) =>
    value === undefined
      ? due
        ? "no due date"
        : "no points"
      : due
        ? shortDateTime(value)
        : `${value} points`;
  const before = side(change.before);
  const after = side(change.after);
  return {
    verb: due ? "due date moved" : "points changed",
    before,
    after,
    summary: `${before} → ${after}`,
  };
}

/** "94%" — rounded to one place, trailing ".0" dropped. */
export function percent(score: number, pointsPossible: number): string | undefined {
  if (pointsPossible <= 0) return undefined;
  return `${Number(((score / pointsPossible) * 100).toFixed(1))}%`;
}

/** "47/50", trailing zeros trimmed. */
export function scoreOf(score: number, pointsPossible: number): string {
  return `${round2(score)}/${round2(pointsPossible)}`;
}

function round2(n: number): string {
  return String(Number(n.toFixed(2)));
}

/** "40 points" / "1 point"; undefined when Canvas gives no points. */
export function pointsLabel(pointsPossible: number | undefined): string | undefined {
  if (pointsPossible === undefined) return undefined;
  return `${round2(pointsPossible)} point${pointsPossible === 1 ? "" : "s"}`;
}
