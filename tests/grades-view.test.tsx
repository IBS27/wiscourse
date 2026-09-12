// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { getFunctionName, type FunctionReference } from "convex/server";
import type { Gradebook } from "../convex/lib/grades";
import { CourseGradebook } from "../src/components/grades/gradebook";

const state = vi.hoisted(() => ({ values: new Map<string, unknown>() }));
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">) => state.values.get(getFunctionName(ref)),
  useMutation: () => () => Promise.resolve(null),
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/seen", () => ({
  useSeen: () => ({ loading: false, has: () => true, seenAt: () => undefined, mark: () => {} }),
}));
vi.mock("@/lib/sync-info", () => ({ useSyncInfo: () => undefined }));
vi.mock("@clerk/clerk-react", () => ({ useAuth: () => ({ userId: "user_test" }) }));

const KEY = "whatif:user_test:7";

afterEach(() => {
  cleanup();
  state.values.clear();
  localStorage.clear();
});

const book: Gradebook = {
  course: { applyAssignmentGroupWeights: true, currentScore: 92.7, currentGrade: "AB" },
  groups: [
    {
      canvasId: 1,
      name: "Projects",
      position: 1,
      groupWeight: 50,
      assignments: [
        { canvasId: 11, name: "Project 1", pointsPossible: 100, score: 94, postedAt: 1, median: 89 },
        { canvasId: 12, name: "Project 2", pointsPossible: 100 },
      ],
    },
    {
      canvasId: 2,
      name: "Exams",
      position: 2,
      groupWeight: 50,
      assignments: [{ canvasId: 21, name: "Midterm 1", pointsPossible: 100 }],
    },
  ],
};

function mount(gradebook: Gradebook | null = book) {
  state.values.set("grades:course", gradebook);
  state.values.set("courses:list", []);
  return render(<CourseGradebook courseCanvasId={7} />);
}

it("shows Canvas's number, the group that is still open and the median column", () => {
  mount();
  // The headline and the table footer both carry Canvas's number.
  expect(screen.getAllByText("92.7%")).toHaveLength(2);
  expect(screen.getAllByText("AB")).toHaveLength(2);
  // The group header row and the composition strip's legend both say it.
  expect(screen.getAllByText("not yet graded")).toHaveLength(2);
  expect(screen.getByText(/Exams \(50%\) not yet graded/)).toBeTruthy();
  expect(screen.getByText("89")).toBeTruthy();
  // An ungraded row keeps its denominator, so the size of what is left
  // shows without a column of its own.
  expect(screen.getByText("Project 2").closest("div.grid")?.textContent).toContain("— / 100");
});

it("recomputes the total from a what-if score and remembers it", () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: /What-if/ }));
  const field = screen.getByLabelText("What-if score for Midterm 1");
  fireEvent.change(field, { target: { value: "80" } });
  // Projects 94% at 50 and Exams 80% at 50 → 87.0%.
  expect(screen.getAllByText("87.0%")).toHaveLength(2);
  // Kept in the row and listed again in the rail.
  expect(screen.getAllByText("was —")).toHaveLength(2);
  expect(localStorage.getItem(KEY)).toBe('{"21":80}');

  fireEvent.click(screen.getByRole("button", { name: "Reset all" }));
  expect(localStorage.getItem(KEY)).toBeNull();
  expect((screen.getByLabelText("What-if score for Midterm 1") as HTMLInputElement).value).toBe("");
});

it("hides every total when the instructor does, and offers no what-if", () => {
  mount({ ...book, course: { hideFinalGrades: true, applyAssignmentGroupWeights: true } });
  expect(screen.getByText("Hidden")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /What-if/ })).toBeNull();
  // Group subtotals still list.
  expect(screen.getAllByText("94").length).toBeGreaterThan(0);
});

it("estimates the letter from the scale when Canvas sends none, and says so", () => {
  mount({ ...book, course: { applyAssignmentGroupWeights: true, currentScore: 92.7 } });
  expect(screen.getAllByText("92.7%")).toHaveLength(2);
  // 92.7% is an AB on the UW scale; the chip is marked as an estimate.
  // Header and footer both carry the chip; every one is marked.
  const chips = screen.getAllByText("AB");
  expect(chips.length).toBeGreaterThan(0);
  for (const chip of chips) {
    expect(chip.getAttribute("title")).toMatch(/Estimated/);
    expect(chip.textContent).toContain("(estimated)");
  }
});

it("uses Canvas's letter verbatim, unmarked, when it sends one", () => {
  mount();
  for (const chip of screen.getAllByText("AB")) {
    expect(chip.getAttribute("title")).toBeNull();
  }
});

it("ignores a stored edit for an assignment the course no longer has", () => {
  localStorage.setItem(KEY, '{"999":50,"21":80}');
  mount();
  // The count beside the toggle only admits to the edit that can be shown.
  expect(screen.getByRole("button", { name: /What-if/ }).textContent).toContain("1");
  fireEvent.click(screen.getByRole("button", { name: /What-if/ }));
  // The one live edit shows in its row and again in the rail's list.
  expect(screen.getAllByText("was —")).toHaveLength(2);
  // Writing again drops the orphan from storage for good.
  fireEvent.change(screen.getByLabelText("What-if score for Project 2"), {
    target: { value: "90" },
  });
  expect(JSON.parse(localStorage.getItem(KEY) ?? "{}")).toEqual({ 12: 90, 21: 80 });
});

it("does not enter what-if on its own when edits are stored", () => {
  localStorage.setItem(KEY, '{"21":80}');
  mount();
  expect(screen.queryByText("87.0%")).toBeNull();
  expect(screen.getAllByText("92.7%")).toHaveLength(2);
});

it("refuses a score it cannot read instead of storing a silent zero", () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: /What-if/ }));
  const field = screen.getByLabelText("What-if score for Midterm 1");
  fireEvent.change(field, { target: { value: "80" } });
  expect(localStorage.getItem(KEY)).toBe('{"21":80}');

  fireEvent.change(field, { target: { value: "-3" } });
  expect((field as HTMLInputElement).value).toBe("-3");
  expect(field.getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByText("needs a number")).toBeTruthy();
  // The hypothetical is gone, so the page is back on Canvas's number.
  expect(localStorage.getItem(KEY)).toBeNull();
  expect(screen.getAllByText("92.7%").length).toBeGreaterThan(0);

  for (const bad of ["abc", "9e", "-"]) {
    fireEvent.change(field, { target: { value: bad } });
    expect(localStorage.getItem(KEY)).toBeNull();
  }
});
