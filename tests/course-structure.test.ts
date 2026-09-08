import { describe, expect, it } from "vitest";
import {
  currentCourseSections,
  teachingRange,
} from "../src/lib/course-structure";
import {
  shouldUseTimeline,
  type ModuleWithItems,
} from "../src/components/course/module-utils";
import type { Id } from "../convex/_generated/dataModel";

function module(
  name: string,
  id: number,
  pages: string[] = [],
): ModuleWithItems {
  return {
    _id: String(id) as Id<"modules">,
    _creationTime: 0,
    userId: "student",
    courseCanvasId: 1,
    canvasId: id,
    syncedAt: 0,
    name,
    position: id,
    state: "completed",
    prerequisiteModuleCanvasIds: [],
    requireSequentialProgress: false,
    items: pages.map((title, index) => ({
      _id: String(index) as Id<"moduleItems">,
      _creationTime: 0,
      userId: "student",
      courseCanvasId: 1,
      canvasId: index,
      syncedAt: 0,
      moduleCanvasId: id,
      position: index,
      indent: 0,
      type: "Page",
      title,
      pageUrl: `page-${index}`,
    })),
  };
}

describe("course organization", () => {
  it("chooses Journalism's current dated week even when the entire term is published", () => {
    const modules = [
      module("Syllabus and Instructional Material", 1),
      module("Week 1 (Sept 2 & 4)", 2),
      module("Week 2 (Sep 7-11): The Information Environment", 3),
      module("Week 15 (Dec 7-12): Wrapping Up", 16),
    ];
    expect(
      currentCourseSections(modules, "2026-09-08", 2026).map((m) => m.canvasId),
    ).toEqual([3]);
  });
  it("preserves Astronomy's Wednesday–Tuesday teaching weeks inside a topic module", () => {
    const modules = [
      module("Module 1: Astronomical Fundamentals", 1, [
        "Week 1 (Sep 2 - Sep 8): Our Place in the Universe",
        "Week 2 (Sep 9 - Sep 15): The Night Sky",
      ]),
    ];
    expect(
      currentCourseSections(modules, "2026-09-08", 2026)[0].items[0].title,
    ).toContain("Week 1");
    expect(
      currentCourseSections(modules, "2026-09-09", 2026)[0].items[0].title,
    ).toContain("Week 2");
  });
  it("does not invent a current chapter for Math or use availability dates as teaching dates", () => {
    const modules = [
      module("Chapter 12: Vectors", 1),
      module("Chapter 16: Vector Calculus", 2),
    ].map((m) => ({ ...m, unlockAt: Date.parse("2026-09-08") }));
    expect(currentCourseSections(modules, "2026-09-08", 2026)).toEqual([]);
    expect(shouldUseTimeline(modules, "2026-08-27")).toBe(false);
  });
  it("uses the course year and excludes locked sections", () => {
    const m = { ...module("Week 2 (Sep 7-11)", 1), state: "locked" as const };
    expect(currentCourseSections([m], "2026-09-08", 2026)).toEqual([]);
    expect(
      currentCourseSections([module(m.name, 2)], "2027-09-08", 2026),
    ).toEqual([]);
  });
  it("handles month boundaries, lecture-date pairs, and invalid dates", () => {
    expect(teachingRange("Week 5 (Sept 28-Oct 2)", 2026)).toEqual({
      start: "2026-09-28",
      end: "2026-10-02",
    });
    expect(teachingRange("Week 1 (Sept 2 & 4)", 2026)).toEqual({
      start: "2026-08-31",
      end: "2026-09-06",
    });
    expect(teachingRange("Week 1 (Feb 30-Mar 2)", 2026)).toBeUndefined();
  });
});
