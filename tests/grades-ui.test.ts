import { describe, expect, it } from "vitest";
import { summarize, type Gradebook, type RowResult } from "../convex/lib/grades";
import {
  coverageLabel,
  cutoffLabel,
  dropRuleLabel,
  dueLabel,
  firstExpected,
  formatPercent,
  formatPoints,
  groupScoreParts,
  pointsSettled,
  rescaleNote,
  rowPercent,
  rowStateLabel,
  schemeLabel,
  scoreParts,
  targetLabel,
  usesWeights,
  weightLabel,
  withArticle,
} from "../src/lib/grades-ui";

const weighted: Gradebook = {
  course: { applyAssignmentGroupWeights: true, currentScore: 92.7 },
  groups: [
    {
      canvasId: 1,
      name: "Projects",
      position: 1,
      groupWeight: 50,
      assignments: [
        { canvasId: 11, name: "P1", pointsPossible: 100, score: 94, postedAt: 1 },
        { canvasId: 12, name: "P2", pointsPossible: 100, score: 88, postedAt: 2 },
        { canvasId: 13, name: "P3", pointsPossible: 100, dueAt: 500 },
      ],
    },
    {
      canvasId: 2,
      name: "Exams",
      position: 2,
      groupWeight: 50,
      assignments: [{ canvasId: 21, name: "Midterm", pointsPossible: 100, dueAt: 400 }],
    },
  ],
};

const points: Gradebook = {
  course: { currentScore: 90 },
  groups: [
    {
      canvasId: 1,
      name: "Problem Sets",
      position: 1,
      dropLowest: 1,
      assignments: [
        { canvasId: 11, name: "PS1", pointsPossible: 50, score: 45, postedAt: 1 },
        { canvasId: 12, name: "PS2", pointsPossible: 50 },
      ],
    },
  ],
};

describe("numbers", () => {
  it("keeps one decimal and collapses a clean 100", () => {
    expect(formatPercent(92.65)).toBe("92.7%");
    expect(formatPercent(100)).toBe("100%");
    expect(formatPercent(99.99)).toBe("100%");
    expect(formatPercent(0)).toBe("0.0%");
  });

  it("drops trailing zeros from points", () => {
    expect(formatPoints(19)).toBe("19");
    expect(formatPoints(9.5)).toBe("9.5");
    expect(formatPoints(19.333)).toBe("19.33");
  });

  it("hides the chip on a zero-weight group", () => {
    expect(weightLabel(50)).toBe("50%");
    expect(weightLabel(0)).toBeUndefined();
  });

  it("spells out drop rules", () => {
    expect(dropRuleLabel({ canvasId: 1, name: "HW", position: 1, assignments: [] })).toBeUndefined();
    expect(
      dropRuleLabel({ canvasId: 1, name: "HW", position: 1, dropLowest: 1, assignments: [] }),
    ).toBe("drops lowest 1");
    expect(
      dropRuleLabel({
        canvasId: 1,
        name: "HW",
        position: 1,
        dropLowest: 1,
        dropHighest: 2,
        assignments: [],
      }),
    ).toBe("drops lowest 1 · drops highest 2");
  });
});

describe("score cells", () => {
  it("shows the denominator only when there are points", () => {
    expect(scoreParts({ canvasId: 1, name: "A", pointsPossible: 20 }, 19)).toEqual({
      value: "19",
      of: " / 20",
      muted: false,
    });
    expect(scoreParts({ canvasId: 1, name: "A" }, 19)).toEqual({
      value: "19",
      of: undefined,
      muted: false,
    });
    expect(scoreParts({ canvasId: 1, name: "A", pointsPossible: 0 }, undefined).of).toBeUndefined();
  });

  it("reads EX for excused and a dash for ungraded", () => {
    expect(scoreParts({ canvasId: 1, name: "Lab", pointsPossible: 10, excused: true }, undefined))
      .toEqual({ value: "EX", of: " / 10", muted: true });
    expect(scoreParts({ canvasId: 1, name: "Lab", pointsPossible: 10 }, undefined).value).toBe("—");
  });

  it("only divides when there is something to divide by", () => {
    expect(rowPercent({ canvasId: 1, name: "A", pointsPossible: 20 }, 19)).toBeCloseTo(95);
    expect(rowPercent({ canvasId: 1, name: "A", pointsPossible: 0 }, 0)).toBeUndefined();
    expect(rowPercent({ canvasId: 1, name: "A", pointsPossible: 20 }, undefined)).toBeUndefined();
  });

  it("leaves a group with nothing graded without a subtotal", () => {
    const summary = summarize(weighted);
    expect(groupScoreParts(summary.groups[0])).toEqual({
      value: "182",
      of: " / 200",
      muted: false,
    });
    expect(groupScoreParts(summary.groups[1])).toBeUndefined();
  });
});

describe("row states", () => {
  const state = (row: RowResult["row"], patch: Partial<RowResult> = {}) =>
    rowStateLabel({
      row,
      counted: true,
      graded: true,
      hypothetical: false,
      dropped: false,
      ...patch,
    });

  it("puts the drop rule first and reddens only 'missing'", () => {
    expect(state({ canvasId: 1, name: "HW2", missing: true }, { dropped: true })).toEqual({
      label: "dropped",
      tone: "quiet",
    });
    expect(state({ canvasId: 1, name: "Quiz", missing: true })).toEqual({
      label: "missing",
      tone: "red",
    });
    expect(state({ canvasId: 1, name: "Syllabus", omitFromFinalGrade: true })?.label).toBe(
      "not counted",
    );
    expect(state({ canvasId: 1, name: "PS2", late: true })).toEqual({
      label: "late",
      tone: "quiet",
    });
    expect(state({ canvasId: 1, name: "P1" })).toBeUndefined();
  });

  it("replaces the due date while a submission waits to be posted", () => {
    expect(dueLabel({ canvasId: 1, name: "HW", submittedAt: 1_694_000_000_000 })).toMatch(
      /^submitted /,
    );
    expect(
      dueLabel({ canvasId: 1, name: "HW", submittedAt: 1, postedAt: 2, score: 5, dueAt: 3 }),
    ).not.toMatch(/^submitted /);
    expect(dueLabel({ canvasId: 1, name: "HW" })).toBeUndefined();
  });
});

describe("coverage and scheme wording", () => {
  it("measures a weighted course in weight and a points course in points", () => {
    const w = summarize(weighted);
    expect(usesWeights(w)).toBe(true);
    expect(coverageLabel(w)).toBe("33% of grade"); // Projects is 2/3 graded at half the weight
    expect(coverageLabel(w, true)).toBe("33% of the grade");
    expect(schemeLabel(w)).toBe("weighted · 2 groups");

    const p = summarize(points);
    expect(usesWeights(p)).toBe(false);
    expect(pointsSettled(p)).toBe(50);
    expect(coverageLabel(p)).toBe("50 of 100 pts");
    expect(schemeLabel(p)).toBe("points · 100 possible");
  });

  it("names the groups the current number leaves out", () => {
    expect(rescaleNote(summarize(weighted))).toBe(
      "Exams (50%) not yet graded · weights rescaled across the rest",
    );
    expect(rescaleNote(summarize(points))).toBeUndefined();
  });

  it("points at the next thing to be graded", () => {
    expect(firstExpected(summarize(weighted))?.name).toBe("Midterm");
  });
});

describe("targets", () => {
  it("turns a needed percentage into words", () => {
    expect(targetLabel(undefined)).toBe("—");
    expect(targetLabel(120)).toBe("not reachable");
    expect(targetLabel(0)).toBe("already there");
    expect(targetLabel(-4)).toBe("already there");
    expect(targetLabel(93.42)).toBe("93.4%");
  });

  it("writes cutoffs and articles the way a sentence needs them", () => {
    expect(cutoffLabel({ name: "A", value: 0.93 })).toBe("≥ 93.0%");
    expect(withArticle("A")).toBe("an A");
    expect(withArticle("AB")).toBe("an AB");
    expect(withArticle("B")).toBe("a B");
  });
});
