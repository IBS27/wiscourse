/**
 * Wording and number formatting for the Grades surfaces. The arithmetic all
 * lives in convex/lib/grades.ts; this module only decides how a result reads.
 */

import { dayKeyOf, formatDayShort, formatMonthDay } from "./dates";
import type {
  GradeGroup,
  GradeRow,
  GroupResult,
  RowResult,
  SchemeEntry,
  Summary,
} from "../../convex/lib/grades";

/** The one placeholder for "no number here". */
export const DASH = "—";

/** "92.7%", "100%" — one decimal, the precision Canvas reports. */
export function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded === 100 ? "100%" : `${rounded.toFixed(1)}%`;
}

/** "19", "9.5", "19.33" — points without trailing zeros. */
export function formatPoints(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** A weight chip: "50%". Zero-weight groups get no chip at all. */
export function weightLabel(weight: number): string | undefined {
  return weight > 0 ? `${formatPoints(weight)}%` : undefined;
}

/** "drops lowest 1", "drops lowest 1 · drops highest 1". */
export function dropRuleLabel(group: GradeGroup): string | undefined {
  const parts: string[] = [];
  if ((group.dropLowest ?? 0) > 0) parts.push(`drops lowest ${group.dropLowest}`);
  if ((group.dropHighest ?? 0) > 0) parts.push(`drops highest ${group.dropHighest}`);
  return parts.length === 0 ? undefined : parts.join(" · ");
}

export interface ScoreParts {
  /** "19", "EX", "—". */
  value: string;
  /** " / 20", or undefined when the assignment carries no points. */
  of?: string;
  /** Nothing was earned here, so the cell reads quiet. */
  muted: boolean;
}

/** The score cell for one row: "19 / 20", "EX / 10", "— / 100". */
export function scoreParts(row: GradeRow, score: number | undefined): ScoreParts {
  const possible = row.pointsPossible ?? 0;
  const of = possible > 0 ? ` / ${formatPoints(possible)}` : undefined;
  if (row.excused === true) return { value: "EX", of, muted: true };
  if (score === undefined) return { value: DASH, of, muted: true };
  return { value: formatPoints(score), of, muted: false };
}

/** The subtotal cell for a group; undefined means "not yet graded". */
export function groupScoreParts(group: GroupResult): ScoreParts | undefined {
  if (group.percent === undefined) return undefined;
  return {
    value: formatPoints(group.earned),
    of: group.gradedPossible > 0 ? ` / ${formatPoints(group.gradedPossible)}` : undefined,
    muted: false,
  };
}

/** A row's own percentage, when it has points to divide by. */
export function rowPercent(row: GradeRow, score: number | undefined): number | undefined {
  const possible = row.pointsPossible ?? 0;
  if (score === undefined || possible <= 0) return undefined;
  return (score / possible) * 100;
}

export interface RowState {
  label: string;
  /** Only "missing" gets the app's red; everything else is a quiet word. */
  tone: "red" | "quiet";
}

/** The word a row carries beside its name, if any. */
export function rowStateLabel(result: RowResult): RowState | undefined {
  const row = result.row;
  if (result.dropped) return { label: "dropped", tone: "quiet" };
  if (row.missing === true) return { label: "missing", tone: "red" };
  if (row.omitFromFinalGrade === true) return { label: "not counted", tone: "quiet" };
  if (row.excused === true) return { label: "excused", tone: "quiet" };
  if (row.late === true) return { label: "late", tone: "quiet" };
  return undefined;
}

/**
 * The middle column: the due date, or "submitted Sep 8" while a submission
 * waits to be posted — so the row does not look forgotten.
 */
export function dueLabel(row: GradeRow): string | undefined {
  if (row.postedAt === undefined && row.submittedAt !== undefined) {
    return `submitted ${formatMonthDay(row.submittedAt)}`;
  }
  return row.dueAt === undefined ? undefined : formatDayShort(dayKeyOf(row.dueAt));
}

/** Points already settled — dropped rows included, since they are decided. */
export function pointsSettled(summary: Summary): number {
  return summary.groups.reduce((n, group) => n + group.settledPossible, 0);
}

/** Every point the course can still award, settled or not. */
export function pointsTotal(summary: Summary): number {
  return pointsSettled(summary) + summary.pointsRemaining;
}

/** True when weights are in force and at least one group carries some. */
export function usesWeights(summary: Summary): boolean {
  return summary.weighted && summary.groups.some((group) => group.weight > 0);
}

/** "65% of grade" · "90 of 460 pts". Undefined when there is nothing to measure. */
export function coverageLabel(summary: Summary, long = false): string | undefined {
  if (usesWeights(summary)) {
    return `${Math.round(summary.coverage * 100)}% of ${long ? "the grade" : "grade"}`;
  }
  const total = pointsTotal(summary);
  if (total <= 0) return undefined;
  return `${formatPoints(pointsSettled(summary))} of ${formatPoints(total)} pts`;
}

/** "weighted · 4 groups" · "points · 460 possible". */
export function schemeLabel(summary: Summary): string {
  if (usesWeights(summary)) {
    const n = summary.groups.filter((group) => group.weight > 0).length;
    return `weighted · ${n} group${n === 1 ? "" : "s"}`;
  }
  const total = pointsTotal(summary);
  return total > 0 ? `points · ${formatPoints(total)} possible` : "points";
}

/**
 * Why the number is what it is: which weighted groups are still open, and
 * therefore that the rest were rescaled. Undefined when nothing is pending.
 */
export function rescaleNote(summary: Summary): string | undefined {
  if (!usesWeights(summary)) return undefined;
  const open = summary.groups.filter((g) => g.weight > 0 && g.percent === undefined);
  if (open.length === 0) return undefined;
  const weight = open.reduce((n, g) => n + g.weight, 0);
  const names =
    open.length === 1
      ? open[0].group.name
      : `${open[0].group.name} +${open.length - 1} more`;
  return `${names} (${formatPoints(weight)}%) not yet graded · weights rescaled across the rest`;
}

/** "an A", "a B" — the letters that start with a vowel take "an". */
export function withArticle(letter: string): string {
  return `${/^[AEIOU]/i.test(letter) ? "an" : "a"} ${letter}`;
}

/** What `neededForTarget` means in words. */
export function targetLabel(needed: number | undefined): string {
  if (needed === undefined) return DASH;
  if (needed > 100) return "not reachable";
  if (needed <= 0) return "already there";
  return formatPercent(needed);
}

/** "≥ 93%" for a cutoff entry. */
export function cutoffLabel(entry: SchemeEntry): string {
  return `≥ ${formatPercent(entry.value * 100)}`;
}

/** The first counted assignment still waiting on a grade — "nothing graded yet". */
export function firstExpected(summary: Summary): GradeRow | undefined {
  const pending = summary.groups
    .flatMap((group) => group.rows)
    .filter((r) => r.counted && !r.graded)
    .map((r) => r.row);
  return pending.sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity))[0];
}
