// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { CourseMap } from "../convex/lib/courseMap";
import { InterpretedOverview } from "../src/components/course/interpreted-overview";
import {
  instructorSection,
  sectionResources,
  usableInterpretation,
} from "../src/lib/interpreted-course";
import type { ModuleWithItems } from "../src/components/course/module-utils";

const state = vi.hoisted(() => ({ pages: new Map<string, unknown>() }));
vi.mock("convex/react", () => ({
  useQuery: (_ref: unknown, args: { url: string }) => state.pages.get(args.url),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={to} className={props.className}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/reader/canvas-html", () => ({
  CanvasHtml: ({ html }: { html: string }) => (
    <div data-testid="source-html">{html}</div>
  ),
}));
afterEach(() => {
  cleanup();
  state.pages.clear();
});
const proof = [{ sourceId: "page:home", quote: "Lecture schedule" }];
const map: CourseMap = {
  organization: "mixed",
  summary: "Course",
  sections: [
    {
      id: "lectures",
      title: "Lectures",
      kind: "resources",
      resourceIds: ["page:home"],
      teachingDates: null,
      evidence: proof,
    },
    {
      id: "projects",
      title: "Projects",
      kind: "resources",
      resourceIds: ["page:home"],
      teachingDates: null,
      evidence: proof,
    },
  ],
  essentials: [],
  conflicts: [],
  unresolvedResourceIds: ["page:extra"],
};
const resources = [
  { id: "page:home", title: "Homepage", href: "/courses/1/pages/home" },
  { id: "page:extra", title: "Extra reading", href: "/courses/1/pages/extra" },
];
const html =
  '<p><span style="font-size: 24pt;">Lectures:</span></p><table><tr><td>September 8</td><td>Processes</td></tr></table><p><span style="font-size: 24pt;">Projects:</span></p><table><tr><td>Write a shell</td></tr></table>';
it("shows the instructor schedule in Overview and switches between source sections", () => {
  state.pages.set("home", { body: html, published: true });
  render(
    <InterpretedOverview
      map={map}
      resources={resources}
      modules={[]}
      courseId="1"
      today="2026-09-08"
    />,
  );
  expect(screen.getByTestId("source-html").textContent).toContain("Processes");
  expect(screen.getByTestId("source-html").textContent).not.toContain(
    "Write a shell",
  );
  fireEvent.click(screen.getByRole("button", { name: "Projects" }));
  expect(screen.getByTestId("source-html").textContent).toContain(
    "Write a shell",
  );
  expect(screen.getByRole("link", { name: "Extra reading" })).toBeTruthy();
});
it("selects a chapter and reads a resource inline without showing an unrelated schedule", () => {
  const chapters = {
    ...map,
    sections: [
      {
        ...map.sections[0],
        id: "chapter",
        title: "Chapter 12: Vectors",
        resourceIds: ["page:extra"],
      },
    ],
  };
  state.pages.set("home", { body: html, published: true });
  state.pages.set("extra", { body: "Vector learning goals", published: true });
  render(
    <InterpretedOverview
      map={chapters}
      resources={resources}
      modules={[]}
      courseId="1"
      today="2026-09-08"
    />,
  );
  expect(
    screen.getByRole("navigation", { name: "Chapter navigation" }),
  ).toBeTruthy();
  expect(screen.queryByTestId("source-html")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Read Extra reading" }));
  expect(screen.getByTestId("source-html").textContent).toBe(
    "Vector learning goals",
  );
});
it("selects the current instructional week and never renders locked page bodies", () => {
  const weeks = {
    ...map,
    organization: "weekly" as const,
    sections: [
      map.sections[0],
      {
        ...map.sections[1],
        teachingDates: { start: "2026-09-07", end: "2026-09-11" },
      },
    ],
  };
  state.pages.set("home", {
    body: "Hidden content",
    published: true,
    lockedForUser: true,
  });
  render(
    <InterpretedOverview
      map={weeks}
      resources={resources}
      modules={[]}
      courseId="1"
      today="2026-09-08"
    />,
  );
  expect(
    screen
      .getByRole("button", { name: /Projects/ })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(screen.queryByText("Hidden content")).toBeNull();
});
it("uses only fresh validated maps and isolates instructor HTML sections", () => {
  expect(
    usableInterpretation({
      map,
      resources,
      sourceRevision: 2,
      resultRevision: 1,
    }),
  ).toBe(false);
  expect(
    usableInterpretation({
      map,
      resources,
      sourceRevision: 2,
      resultRevision: 2,
    }),
  ).toBe(true);
  expect(instructorSection(html, "Lectures")).not.toContain("Projects");
  expect(instructorSection(html, "Unknown")).toBeNull();
});
it("expands native modules, keeps ordering and removes duplicate page pointers", () => {
  const modules = [
    {
      canvasId: 1,
      state: "unlocked",
      items: [
        {
          canvasId: 2,
          title: "Read vectors",
          type: "Page",
          pageUrl: "vectors",
        },
      ],
    },
  ] as ModuleWithItems[];
  const list = sectionResources(
    ["module:1", "page:vectors"],
    [
      {
        id: "page:vectors",
        title: "Vectors",
        href: "/courses/1/pages/vectors",
      },
    ],
    modules,
    "1",
  );
  expect(list).toEqual([
    {
      id: "page:vectors",
      title: "Read vectors",
      href: "/courses/1/pages/vectors",
    },
  ]);
});
it("shows the upcoming week's dated entries with their linked materials", () => {
  const entry = (title: string, date: string, resourceIds: string[] = []) => ({
    title,
    date,
    resourceIds,
    evidence: proof,
  });
  const weeks: CourseMap = {
    ...map,
    sections: [
      {
        ...map.sections[0],
        id: "w1",
        title: "Week 1",
        kind: "week",
        resourceIds: [],
        teachingDates: { start: "2026-09-01", end: "2026-09-03" },
        entries: [entry("Introduction", "2026-09-03")],
      },
      {
        ...map.sections[0],
        id: "w2",
        title: "Week 2",
        kind: "week",
        resourceIds: [],
        teachingDates: { start: "2026-09-08", end: "2026-09-10" },
        entries: [
          entry("Processes", "2026-09-08", ["page:extra"]),
          entry("Scheduling", "2026-09-10"),
        ],
      },
    ],
  };
  render(
    <InterpretedOverview
      map={weeks}
      resources={resources}
      modules={[]}
      courseId="1"
      today="2026-09-05"
    />,
  );
  expect(screen.getByText("Weekly course plan")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: /Week 2/ }).getAttribute("aria-pressed"),
  ).toBe("true");
  const schedule = screen.getByRole("list", { name: "Week 2 schedule" });
  expect(schedule.textContent).toContain("Tue, Sep 8");
  expect(schedule.textContent).toContain("Scheduling");
  expect(
    screen.getByRole("link", { name: "Extra reading" }).getAttribute("href"),
  ).toBe("/courses/1/pages/extra");
});
it("keeps the original Overview when every section only restates a page", () => {
  const flat: CourseMap = {
    ...map,
    sections: [{ ...map.sections[0], id: "home", title: "Homepage" }],
  };
  const fresh = { resources, sourceRevision: 1, resultRevision: 1 };
  expect(usableInterpretation({ ...fresh, map: flat })).toBe(false);
  expect(usableInterpretation({ ...fresh, map })).toBe(true);
});
