// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ModuleAccordion } from "../src/components/course/module-accordion";
import type { ModuleWithItems } from "../src/components/course/module-utils";
import type { ModuleRowContext } from "../src/components/course/module-context";
import type { Id } from "../convex/_generated/dataModel";

afterEach(cleanup);
const modules: ModuleWithItems[] = [1, 2].map((canvasId) => ({
  _id: String(canvasId) as Id<"modules">,
  _creationTime: 0,
  userId: "student",
  courseCanvasId: 1,
  canvasId,
  syncedAt: 0,
  name: `Module ${canvasId}`,
  position: canvasId,
  state: "unlocked",
  items: [],
  prerequisiteModuleCanvasIds: [],
  requireSequentialProgress: false,
}));
const ctx: ModuleRowContext = {
  courseId: "1",
  canvasId: 1,
  files: new Map(),
  isSeen: () => false,
  seenLoading: false,
  open: () => {},
  status: {
    files: new Map(),
    todos: new Map(),
    assignmentOf: new Map(),
    todayKey: "2026-09-04",
    now: 0,
  },
};

it("opens a new deep-link target after toggling and still lets the user close it", () => {
  const { rerender } = render(
    <ModuleAccordion modules={modules} ctx={ctx} focusModuleId={1} />,
  );
  const first = screen.getByRole("button", { name: "Module 1" });
  fireEvent.click(first);
  expect(first.getAttribute("aria-expanded")).toBe("false");
  rerender(<ModuleAccordion modules={modules} ctx={ctx} focusModuleId={2} />);
  const second = screen.getByRole("button", { name: "Module 2" });
  expect(second.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(second);
  expect(second.getAttribute("aria-expanded")).toBe("false");
  rerender(<ModuleAccordion modules={modules} ctx={ctx} focusModuleId={1} />);
  expect(first.getAttribute("aria-expanded")).toBe("true");
});
