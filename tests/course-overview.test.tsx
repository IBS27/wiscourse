// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { Route } from "../src/routes/courses.$courseId.index";

const state = vi.hoisted(() => ({ values: new Map<string, unknown>() }));
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">) =>
    state.values.get(getFunctionName(ref)),
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/lib/hooks", () => ({
  useCourses: () => ({
    byId: new Map([
      [1, { defaultView: "wiki", startAt: Date.parse("2026-09-02") }],
    ]),
  }),
  courseStyle: () => ({}),
  courseColorVar: () => "blue",
  useToday: () => "2026-09-08",
  useNow: () => Date.parse("2026-09-08"),
}));
vi.mock("@/lib/seen", () => ({
  useSeen: () => ({ has: () => false, mark: () => {} }),
}));
vi.mock("@/components/course/overview-due", () => ({
  OverviewDue: () => null,
}));
vi.mock("@/components/course/overview-rail", () => ({
  OverviewRail: () => null,
}));
vi.mock("@/components/reader/canvas-html", () => ({
  CanvasHtml: ({ html }: { html: string }) => <div>{html}</div>,
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  state.values.clear();
});
function setup() {
  vi.spyOn(Route, "useParams").mockReturnValue({ courseId: "1" });
  state.values.set("modules:listByCourse", []);
  state.values.set("todos:list", []);
  return Route.options.component as ComponentType;
}
it("renders a homepage-based course with no modules", () => {
  const Component = setup();
  state.values.set("pages:front", {
    body: "Lecture schedule and readings",
    htmlUrl: "https://canvas.wisc.edu/courses/1/pages/home",
  });
  render(<Component />);
  expect(screen.getByText("Lecture schedule and readings")).toBeDefined();
  expect(screen.queryByText("This week")).toBeNull();
});
it("does not render stale homepage content when Canvas access is unavailable", () => {
  const Component = setup();
  state.values.set("pages:front", {
    body: "Stale content",
    contentUnavailable: true,
    htmlUrl: "https://canvas.wisc.edu/courses/1/pages/home",
  });
  render(<Component />);
  expect(screen.queryByText("Stale content")).toBeNull();
  expect(
    screen.getByRole("link", { name: "Open course home in Canvas" }),
  ).toBeDefined();
});
it("uses a fresh interpretation in the main overview and falls back when sources change", () => {
  const Component = setup();
  const stateValue = {
    sourceRevision: 1,
    resultRevision: 1,
    resources: [
      { id: "file:1", title: "Lecture notes", href: "/courses/1/files?file=1" },
    ],
    map: {
      organization: "resources",
      summary: "Materials",
      sections: [
        {
          id: "lectures",
          title: "Lectures",
          kind: "resources",
          resourceIds: ["file:1"],
          teachingDates: null,
          evidence: [],
        },
      ],
      essentials: [],
      conflicts: [],
      unresolvedResourceIds: [],
    },
  };
  state.values.set("courseInterpretations:get", { state: stateValue });
  state.values.set("pages:front", {
    body: "Original course home",
    htmlUrl: "",
  });
  const view = render(<Component />);
  expect(screen.getByRole("link", { name: "Lecture notes" })).toBeTruthy();
  expect(screen.queryByText("Original course home")).toBeNull();
  state.values.set("courseInterpretations:get", {
    state: { ...stateValue, sourceRevision: 2 },
  });
  view.rerender(<Component />);
  expect(screen.getByText("Original course home")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Lecture notes" })).toBeNull();
});
