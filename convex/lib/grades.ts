// Grade arithmetic, shared by the Grades index, the course gradebook and
// what-if. Canvas's own number is always what the page shows as "current";
// this module exists for the things Canvas does not report — coverage,
// group subtotals, hypotheticals and "needed on the rest".
//
// Rules (docs/overview.html, docs/grades.html):
// - A row counts only when posted (the query already withholds unposted
//   scores). Excused and `omitFromFinalGrade` rows never count.
// - Drop-lowest / drop-highest are applied per group by percentage, honouring
//   `neverDrop`; which row is dropped is recomputed for every what-if.
// - Weighted courses rescale weights across the groups that have a grade,
//   exactly as Canvas's "current" score does.

export interface GradeRow {
  canvasId: number;
  name: string;
  pointsPossible?: number;
  dueAt?: number;
  omitFromFinalGrade?: boolean;
  gradingType?: string;
  score?: number;
  grade?: string;
  postedAt?: number;
  submittedAt?: number;
  late?: boolean;
  missing?: boolean;
  excused?: boolean;
  median?: number;
}

export interface GradeGroup {
  canvasId: number;
  name: string;
  position: number;
  groupWeight?: number;
  dropLowest?: number;
  dropHighest?: number;
  neverDrop?: number[];
  assignments: GradeRow[];
}

export interface SchemeEntry {
  name: string;
  value: number; // lower bound as a fraction: 0.93 = 93%
}

export interface GradeCourse {
  currentScore?: number;
  currentGrade?: string;
  finalScore?: number;
  finalGrade?: string;
  hideFinalGrades?: boolean;
  applyAssignmentGroupWeights?: boolean;
  gradingScheme?: SchemeEntry[];
  gradeCutoffs?: SchemeEntry[];
}

export interface Gradebook {
  course: GradeCourse;
  groups: GradeGroup[];
}

/** UW–Madison's standard scale, used when Canvas exposes no scheme. */
export const UW_SCALE: SchemeEntry[] = [
  { name: "A", value: 0.93 },
  { name: "AB", value: 0.88 },
  { name: "B", value: 0.83 },
  { name: "BC", value: 0.78 },
  { name: "C", value: 0.7 },
  { name: "D", value: 0.6 },
  { name: "F", value: 0 },
];

/** The cutoffs in force: the student's own, else Canvas's, else UW's. */
export function schemeFor(course: GradeCourse): SchemeEntry[] {
  const scheme = course.gradeCutoffs ?? course.gradingScheme ?? UW_SCALE;
  return [...scheme].sort((a, b) => b.value - a.value);
}

/** Letter for a percentage score (0..100). */
export function letterFor(score: number, scheme: SchemeEntry[]): string | undefined {
  const fraction = score / 100;
  return scheme.find((entry) => fraction >= entry.value - 1e-9)?.name;
}

/** Hypothetical scores keyed by assignment canvasId. */
export type WhatIf = ReadonlyMap<number, number>;

export interface RowResult {
  row: GradeRow;
  /** Excluded from every sum: omitted, excused or not gradeable. */
  counted: boolean;
  /** Has a real or hypothetical score. */
  graded: boolean;
  hypothetical: boolean;
  dropped: boolean;
  /** The score in force (hypothetical over real). */
  effectiveScore?: number;
}

export interface GroupResult {
  group: GradeGroup;
  rows: RowResult[];
  /** Points earned on kept graded rows. */
  earned: number;
  /** Points possible on kept graded rows. */
  gradedPossible: number;
  /** Points possible on every graded row, dropped ones included. */
  settledPossible: number;
  /** Points possible on counted rows that have no score yet. */
  ungradedPossible: number;
  /** earned / gradedPossible, in percent; undefined with nothing graded. */
  percent?: number;
  /** How much of this group is settled, 0..1 by points. */
  coverage: number;
  gradedCount: number;
  countedCount: number;
  /** The weight in force (0 in a points course). */
  weight: number;
}

export interface Summary {
  weighted: boolean;
  groups: GroupResult[];
  /** Local percentage over graded work; undefined with nothing graded. */
  score?: number;
  /** Share of the final grade already decided, 0..1. */
  coverage: number;
  /** Points still to be graded across counted rows. */
  pointsRemaining: number;
  /** Number of hypothetical rows in force. */
  edits: number;
  /** Total possible points across counted rows (points courses). */
  pointsPossible: number;
  /** Points earned so far (points courses). */
  pointsEarned: number;
}

function pct(earned: number, possible: number): number | undefined {
  return possible > 0 ? (earned / possible) * 100 : undefined;
}

function summarizeGroup(group: GradeGroup, whatIf: WhatIf, weighted: boolean): GroupResult {
  const rows: RowResult[] = group.assignments.map((row) => {
    const hypothetical = whatIf.has(row.canvasId);
    const counted =
      row.omitFromFinalGrade !== true &&
      row.excused !== true &&
      row.gradingType !== "not_graded" &&
      (row.pointsPossible ?? 0) >= 0;
    const effectiveScore = hypothetical ? whatIf.get(row.canvasId) : row.score;
    return {
      row,
      counted,
      graded: counted && effectiveScore !== undefined,
      hypothetical: counted && hypothetical,
      dropped: false,
      // Kept for display even when the row is out of the arithmetic (an
      // omitted row still shows its 19 / 20 beside "not counted").
      effectiveScore,
    };
  });

  applyDropRules(group, rows);

  let earned = 0;
  let gradedPossible = 0;
  let settledPossible = 0;
  let ungradedPossible = 0;
  let gradedCount = 0;
  let countedCount = 0;
  for (const r of rows) {
    if (!r.counted) continue;
    countedCount++;
    const possible = r.row.pointsPossible ?? 0;
    if (r.graded) {
      gradedCount++;
      settledPossible += possible;
      if (r.dropped) continue;
      earned += r.effectiveScore ?? 0;
      gradedPossible += possible;
    } else {
      ungradedPossible += possible;
    }
  }
  // A dropped row is still settled work: coverage counts it, the average
  // does not.
  const total = settledPossible + ungradedPossible;
  return {
    group,
    rows,
    earned,
    gradedPossible,
    settledPossible,
    ungradedPossible,
    percent: pct(earned, gradedPossible),
    coverage: total > 0 ? settledPossible / total : 0,
    gradedCount,
    countedCount,
    weight: weighted ? (group.groupWeight ?? 0) : 0,
  };
}

/**
 * Canvas's drop rules pick the assignment whose removal moves the group
 * percentage the most — not the lowest percentage — so a 50/100 goes
 * before a 1/10. Greedy, one drop at a time, which is what Canvas does for
 * the common cases. `neverDrop` rows are never candidates but still count
 * toward the "keep at least one" floor.
 */
function applyDropRules(group: GradeGroup, rows: RowResult[]): void {
  const graded = rows.filter((r) => r.graded);
  const protectedIds = new Set(group.neverDrop ?? []);
  const kept = new Set(graded);
  const candidates = () => [...kept].filter((r) => !protectedIds.has(r.row.canvasId));
  const percentWithout = (excluded: RowResult) => {
    let earned = 0;
    let possible = 0;
    for (const r of kept) {
      if (r === excluded) continue;
      earned += r.effectiveScore ?? 0;
      possible += r.row.pointsPossible ?? 0;
    }
    return possible > 0 ? earned / possible : 0;
  };
  const drop = (count: number, pick: "lowest" | "highest") => {
    for (let i = 0; i < count; i++) {
      if (kept.size <= 1) return;
      const pool = candidates();
      if (pool.length === 0) return;
      let best: RowResult | undefined;
      let bestPercent = pick === "lowest" ? -Infinity : Infinity;
      for (const r of pool) {
        const p = percentWithout(r);
        if (pick === "lowest" ? p > bestPercent : p < bestPercent) {
          best = r;
          bestPercent = p;
        }
      }
      if (best === undefined) return;
      best.dropped = true;
      kept.delete(best);
    }
  };
  drop(group.dropLowest ?? 0, "lowest");
  drop(group.dropHighest ?? 0, "highest");
}

export function summarize(book: Gradebook, whatIf: WhatIf = new Map()): Summary {
  const weighted = book.course.applyAssignmentGroupWeights === true;
  const groups = book.groups.map((group) => summarizeGroup(group, whatIf, weighted));
  const edits = groups.reduce(
    (n, g) => n + g.rows.filter((r) => r.hypothetical).length,
    0,
  );
  const pointsRemaining = groups.reduce((n, g) => n + g.ungradedPossible, 0);
  const pointsEarned = groups.reduce((n, g) => n + g.earned, 0);
  const pointsGraded = groups.reduce((n, g) => n + g.gradedPossible, 0);
  const pointsSettled = groups.reduce((n, g) => n + g.settledPossible, 0);
  const pointsPossible = pointsGraded + pointsRemaining;

  if (!weighted) {
    return {
      weighted,
      groups,
      score: pct(pointsEarned, pointsGraded),
      coverage: pointsSettled + pointsRemaining > 0 ? pointsSettled / (pointsSettled + pointsRemaining) : 0,
      pointsRemaining,
      edits,
      pointsPossible,
      pointsEarned,
    };
  }

  // A weighted group with no assignments yet (the final exam Canvas has
  // not created) carries no points, so it is out of every denominator —
  // the same way Canvas rescales around it.
  const carrying = groups.filter((g) => g.weight > 0 && g.settledPossible + g.ungradedPossible > 0);
  const totalWeight = carrying.reduce((n, g) => n + g.weight, 0);
  const gradedWeight = carrying.filter((g) => g.percent !== undefined).reduce((n, g) => n + g.weight, 0);
  const weightedSum = carrying.reduce((n, g) => n + g.weight * (g.percent ?? 0), 0);
  return {
    weighted,
    groups,
    score: gradedWeight > 0 ? weightedSum / gradedWeight : undefined,
    coverage:
      totalWeight > 0
        ? carrying.reduce((n, g) => n + g.weight * g.coverage, 0) / totalWeight
        : 0,
    pointsRemaining,
    edits,
    pointsPossible,
    pointsEarned,
  };
}

/**
 * The percentage needed on every remaining point to finish at `target`
 * (0..100). Projects the final grade as a linear function of one uniform
 * score on all ungraded, counted work; drop rules are left as they stand.
 * Undefined when nothing is left to grade.
 */
export function neededForTarget(summary: Summary, target: number): number | undefined {
  if (summary.pointsRemaining <= 0) return undefined;
  let base = 0; // final score if the rest scores 0
  let slope = 0; // gain per 1% on the rest
  if (summary.weighted) {
    const carrying = summary.groups.filter(
      (g) => g.weight > 0 && g.gradedPossible + g.ungradedPossible > 0,
    );
    const totalWeight = carrying.reduce((n, g) => n + g.weight, 0);
    if (totalWeight <= 0) return undefined;
    for (const g of carrying) {
      const possible = g.gradedPossible + g.ungradedPossible;
      base += (g.weight / totalWeight) * (g.earned / possible) * 100;
      slope += (g.weight / totalWeight) * (g.ungradedPossible / possible);
    }
  } else {
    const possible = summary.pointsPossible;
    if (possible <= 0) return undefined;
    base = (summary.pointsEarned / possible) * 100;
    slope = summary.pointsRemaining / possible;
  }
  if (slope <= 0) return undefined;
  return (target - base) / slope;
}

/** The most recently posted graded row, for "latest posted". */
export function latestPosted(book: Gradebook): GradeRow | undefined {
  let best: GradeRow | undefined;
  for (const group of book.groups) {
    for (const row of group.assignments) {
      if (row.postedAt === undefined || row.score === undefined) continue;
      if (best === undefined || (best.postedAt ?? 0) < row.postedAt) best = row;
    }
  }
  return best;
}
