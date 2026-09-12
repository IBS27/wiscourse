import { describe, expect, it } from "vitest";
import {
  latestPosted,
  letterFor,
  neededForTarget,
  schemeFor,
  summarize,
  UW_SCALE,
  type Gradebook,
} from "../convex/lib/grades";

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
        { canvasId: 13, name: "P3", pointsPossible: 100 },
      ],
    },
    {
      canvasId: 2,
      name: "Exams",
      position: 2,
      groupWeight: 35,
      assignments: [{ canvasId: 21, name: "Midterm", pointsPossible: 100 }],
    },
    {
      canvasId: 3,
      name: "Homework",
      position: 3,
      groupWeight: 15,
      dropLowest: 1,
      assignments: [
        { canvasId: 31, name: "HW1", pointsPossible: 20, score: 20, postedAt: 3 },
        { canvasId: 32, name: "HW2", pointsPossible: 20, score: 17, postedAt: 4 },
        { canvasId: 33, name: "HW3", pointsPossible: 20, score: 19, postedAt: 5 },
        { canvasId: 34, name: "HW4", pointsPossible: 20 },
        { canvasId: 35, name: "Excused", pointsPossible: 20, excused: true },
        { canvasId: 36, name: "Syllabus quiz", pointsPossible: 5, score: 5, postedAt: 6, omitFromFinalGrade: true },
      ],
    },
  ],
};

describe("summarize (weighted)", () => {
  it("rescales weights across graded groups and applies drop rules", () => {
    const s = summarize(weighted);
    const [projects, exams, homework] = s.groups;
    expect(projects.percent).toBeCloseTo(91);
    expect(exams.percent).toBeUndefined();
    // HW2 (85%) is dropped; 39/40.
    expect(homework.rows.find((r) => r.row.canvasId === 32)?.dropped).toBe(true);
    expect(homework.percent).toBeCloseTo(97.5);
    // Excused and omitted rows are out of every sum.
    expect(homework.rows.find((r) => r.row.canvasId === 35)?.counted).toBe(false);
    expect(homework.rows.find((r) => r.row.canvasId === 36)?.counted).toBe(false);
    // (50*91 + 15*97.5) / 65
    expect(s.score).toBeCloseTo((50 * 91 + 15 * 97.5) / 65);
    // Coverage by points: projects 2/3, exams 0, homework 60/80.
    expect(s.coverage).toBeCloseTo((50 * (2 / 3) + 0 + 15 * (60 / 80)) / 100);
    expect(s.pointsRemaining).toBe(100 + 100 + 20);
  });

  it("recomputes drops and coverage under what-if", () => {
    const s = summarize(weighted, new Map([[21, 94], [34, 10]]));
    expect(s.edits).toBe(2);
    expect(s.groups[1].percent).toBeCloseTo(94);
    // HW4 at 50% is now the dropped one; HW2 counts again: 56/60.
    const hw = s.groups[2];
    expect(hw.rows.find((r) => r.row.canvasId === 34)?.dropped).toBe(true);
    expect(hw.rows.find((r) => r.row.canvasId === 32)?.dropped).toBe(false);
    expect(hw.percent).toBeCloseTo((20 + 17 + 19) / 60 * 100);
  });

  it("projects the score needed on remaining work", () => {
    const s = summarize(weighted);
    const needed = neededForTarget(s, 93)!;
    // Scoring `needed` on everything left should land exactly on 93.
    const whatIf = new Map<number, number>();
    for (const g of s.groups) {
      for (const r of g.rows) {
        if (r.counted && !r.graded) whatIf.set(r.row.canvasId, ((r.row.pointsPossible ?? 0) * needed) / 100);
      }
    }
    // HW4 at ~93% leaves HW2 (85%) as the dropped row, so the projection's
    // "drops as they stand" assumption holds and the answer is exact.
    expect(summarize(weighted, whatIf).score).toBeCloseTo(93, 5);
  });
});

describe("empty weighted groups", () => {
  it("leaves a group with no assignments out of every denominator", () => {
    const s = summarize({
      course: { applyAssignmentGroupWeights: true },
      groups: [
        {
          canvasId: 1, name: "Projects", position: 1, groupWeight: 50,
          assignments: [
            { canvasId: 1, name: "P1", pointsPossible: 100, score: 90, postedAt: 1 },
            { canvasId: 2, name: "P2", pointsPossible: 100 },
          ],
        },
        { canvasId: 2, name: "Exams", position: 2, groupWeight: 50, assignments: [] },
      ],
    });
    expect(s.score).toBeCloseTo(90);
    expect(s.coverage).toBeCloseTo(0.5);
    expect(neededForTarget(s, 93)).toBeCloseTo(96);
  });
});

describe("drop rules", () => {
  const group = (assignments: Gradebook["groups"][number]["assignments"], rules: Partial<Gradebook["groups"][number]> = {}) =>
    summarize({
      course: { applyAssignmentGroupWeights: false },
      groups: [{ canvasId: 1, name: "G", position: 1, assignments, ...rules }],
    }).groups[0];

  it("drops the row whose removal helps the most, not the lowest percentage", () => {
    const g = group(
      [
        { canvasId: 1, name: "a", pointsPossible: 10, score: 1, postedAt: 1 },
        { canvasId: 2, name: "b", pointsPossible: 100, score: 50, postedAt: 1 },
        { canvasId: 3, name: "c", pointsPossible: 100, score: 90, postedAt: 1 },
      ],
      { dropLowest: 1 },
    );
    expect(g.rows.find((r) => r.row.canvasId === 2)?.dropped).toBe(true);
    expect(g.percent).toBeCloseTo((91 / 110) * 100);
  });

  it("lets a protected row count toward the keep-one floor", () => {
    const g = group(
      [
        { canvasId: 1, name: "keep", pointsPossible: 100, score: 100, postedAt: 1 },
        { canvasId: 2, name: "zero", pointsPossible: 100, score: 0, postedAt: 1 },
      ],
      { dropLowest: 1, neverDrop: [1] },
    );
    expect(g.rows.find((r) => r.row.canvasId === 2)?.dropped).toBe(true);
    expect(g.percent).toBe(100);
    // But never everything.
    const only = group([{ canvasId: 2, name: "zero", pointsPossible: 100, score: 0, postedAt: 1 }], { dropLowest: 1 });
    expect(only.rows[0].dropped).toBe(false);
  });

  it("keeps the score on omitted rows for display while excluding it from sums", () => {
    const g = group([
      { canvasId: 1, name: "counted", pointsPossible: 10, score: 5, postedAt: 1 },
      { canvasId: 2, name: "omitted", pointsPossible: 10, score: 10, postedAt: 1, omitFromFinalGrade: true },
    ]);
    expect(g.rows[1].effectiveScore).toBe(10);
    expect(g.rows[1].counted).toBe(false);
    expect(g.percent).toBe(50);
  });
});

describe("summarize (points)", () => {
  const points: Gradebook = {
    course: { applyAssignmentGroupWeights: false },
    groups: [
      {
        canvasId: 1,
        name: "Problem sets",
        position: 1,
        groupWeight: 0,
        assignments: [
          { canvasId: 1, name: "PS1", pointsPossible: 25, score: 22, postedAt: 1 },
          { canvasId: 2, name: "PS2", pointsPossible: 25, score: 23, postedAt: 2 },
          { canvasId: 3, name: "PS3", pointsPossible: 25 },
        ],
      },
      {
        canvasId: 2,
        name: "Quizzes",
        position: 2,
        groupWeight: 0,
        assignments: [
          { canvasId: 4, name: "Q1", pointsPossible: 20, score: 18, postedAt: 3 },
          { canvasId: 5, name: "Q2", pointsPossible: 20, score: 15, postedAt: 4 },
          { canvasId: 6, name: "Q3", pointsPossible: 20 },
        ],
      },
    ],
  };

  it("sums points across groups", () => {
    const s = summarize(points);
    expect(s.weighted).toBe(false);
    expect(s.score).toBeCloseTo((78 / 90) * 100);
    expect(s.coverage).toBeCloseTo(90 / 135);
    expect(neededForTarget(s, 90)).toBeCloseTo(((0.9 * 135 - 78) / 45) * 100);
  });

  it("has nothing to project once everything is graded", () => {
    const all = new Map([[3, 25], [6, 20]]);
    expect(neededForTarget(summarize(points, all), 90)).toBeUndefined();
  });
});

describe("letters", () => {
  it("falls back to the UW scale and prefers the student's cutoffs", () => {
    expect(schemeFor({})).toEqual(UW_SCALE);
    expect(letterFor(92.7, UW_SCALE)).toBe("AB");
    expect(letterFor(93, UW_SCALE)).toBe("A");
    expect(letterFor(12, UW_SCALE)).toBe("F");
    const own = schemeFor({ gradingScheme: [{ name: "P", value: 0.5 }], gradeCutoffs: [{ name: "S", value: 0.9 }, { name: "U", value: 0 }] });
    expect(letterFor(95, own)).toBe("S");
  });

  it("finds the latest posted row", () => {
    expect(latestPosted(weighted)?.canvasId).toBe(36);
  });
});
