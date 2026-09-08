// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { Route } from "../src/routes/courses.$courseId.syllabus";

const state = vi.hoisted(() => ({ values: new Map<string, unknown>() }));
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">) =>
    state.values.get(getFunctionName(ref)),
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  Link: ({
    to,
    children,
    className,
  }: {
    to: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/hooks", () => ({
  useCourses: () => ({ byId: new Map() }),
  courseStyle: () => ({}),
  courseColorVar: () => "blue",
}));
vi.mock("@/components/course/syllabus-facts", () => ({
  SyllabusFacts: () => null,
}));
vi.mock("@/components/course/syllabus-grading", () => ({
  SyllabusGrading: () => null,
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
  state.values.set("courses:get", {});
  state.values.set("modules:listByCourse", []);
  state.values.set("pages:listByCourse", []);
  state.values.set("files:tree", { files: [], folders: [] });
  state.values.set("pages:front", null);
  return Route.options.component as ComponentType;
}
it("finds a syllabus PDF referenced by a module even with an empty file listing", () => {
  const Component = setup();
  state.values.set("modules:listByCourse", [
    {
      name: "Course Information",
      canvasId: 3,
      items: [
        { type: "File", title: "Course Syllabus.pdf", contentCanvasId: 9 },
      ],
    },
  ]);
  render(<Component />);
  expect(
    screen
      .getByRole("link", { name: "Course Syllabus.pdf" })
      .getAttribute("href"),
  ).toBe("/courses/1/files?file=9");
  expect(screen.queryByText("No syllabus.")).toBeNull();
});
it("links a multi-page syllabus module without mistaking a syllabus quiz for the syllabus", () => {
  const Component = setup();
  state.values.set("modules:listByCourse", [
    {
      name: "Module 0: Getting Started (Syllabus)",
      canvasId: 3,
      items: [{ type: "Quiz", title: "Syllabus Quiz", contentCanvasId: 4 }],
    },
  ]);
  render(<Component />);
  expect(
    screen
      .getByRole("link", { name: "Module 0: Getting Started (Syllabus)" })
      .getAttribute("href"),
  ).toBe("/courses/1/modules#module-3");
  expect(screen.queryByRole("link", { name: "Syllabus Quiz" })).toBeNull();
});
it("offers the instructor homepage when course information lives there", () => {
  const Component = setup();
  state.values.set("pages:front", { title: "Home", url: "home" });
  render(<Component />);
  expect(screen.getByRole("link", { name: "Home" }).getAttribute("href")).toBe(
    "/courses/1/pages/home",
  );
});
