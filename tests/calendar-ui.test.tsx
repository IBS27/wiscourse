// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { zonedToUtc } from "../convex/lib/zones";
import { Route, type CalendarSearch } from "../src/routes/calendar";

const ZONE = "America/Chicago";
const at = (day: string, minute: number) => zonedToUtc(day, minute, ZONE);

const state = vi.hoisted(() => ({ values: new Map<string, unknown>() }));


vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">) => state.values.get(getFunctionName(ref)),
  useMutation: () => async () => undefined,
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  Link: ({ to, children }: { to?: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock("@/lib/time-zone", () => ({
  CAMPUS_TIME_ZONE: "America/Chicago",
  displayTimeZone: () => "America/Chicago",
  useDisplayTimeZone: () => "America/Chicago",
  browserTimeZone: () => "America/Chicago",
  setDisplayTimeZone: () => {},
  useTimeZonePreference: () => {},
  TIME_ZONE_CHOICES: ["America/Chicago"],
}));

// Hoisted with the mocks that read it; the term window covers the fixture.
const COURSES = vi.hoisted(() => [
  {
    canvasId: 1,
    name: "Linear Algebra",
    courseCode: "MATH 340",
    termStartAt: Date.UTC(2026, 8, 2, 5),
    termEndAt: Date.UTC(2026, 11, 20, 6),
  },
  {
    canvasId: 2,
    name: "Microeconomics",
    courseCode: "ECON 101",
    termStartAt: Date.UTC(2026, 8, 2, 5),
    termEndAt: Date.UTC(2026, 11, 20, 6),
  },
]);

vi.mock("@/lib/hooks", () => ({
  useCourses: () => ({
    loading: false,
    courses: COURSES,
    current: COURSES,
    active: COURSES,
    past: [],
    termName: "Fall 2026",
    visible: COURSES,
    other: [],
    filterable: COURSES,
    byId: new Map(COURSES.map((c) => [c.canvasId, c])),
    label: (id?: number) => COURSES.find((c) => c.canvasId === id)?.courseCode,
    color: () => "var(--course-indigo)",
  }),
  courseStyle: () => ({}),
  courseColorVar: () => "var(--course-none)",
  courseLabel: (c: { courseCode: string }) => c.courseCode,
  useToday: () => "2026-09-10",
  useNow: () => at("2026-09-10", 14 * 60 + 14),
  useIsMobile: () => false,
}));
// The phone header's account menu needs Clerk and the theme store; neither
// is what these tests are about.
vi.mock("@/components/app/profile-menu", () => ({ ProfileMenu: () => null }));
vi.mock("@/lib/sync-info", () => ({
  useSyncInfo: () => ({ connected: true, syncing: false, firstSync: false, invalid: false }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  state.values.clear();
});

beforeEach(() => {
  state.values.set("todos:list", [
    {
      key: "assignment:1",
      kind: "assignment",
      canvasId: 1,
      courseCanvasId: 2,
      title: "Problem Set 3",
      dueAt: at("2026-09-10", 17 * 60),
      submission: "unsubmitted",
      subtasks: [],
    },
    {
      key: "local:1",
      kind: "local",
      title: "Email prof re: office hours",
      plannedDay: "2026-09-10",
      submission: "none",
      subtasks: [],
    },
  ]);
  state.values.set("calendar:range", [
    {
      _id: "e1",
      source: "local",
      title: "Study group — P3",
      startAt: at("2026-09-13", 16 * 60),
      endAt: at("2026-09-13", 18 * 60),
      location: "College Library",
    },
    {
      _id: "e2",
      source: "local",
      title: "Office hours · Arpaci-Dusseau",
      startAt: at("2026-09-10", 16 * 60),
      endAt: at("2026-09-10", 17 * 60),
      location: "CS 7361",
      courseCanvasId: 1,
    },
    {
      _id: "e3",
      source: "canvas",
      title: "Advising day",
      startAt: at("2026-09-10", 0),
      allDay: true,
      contextCode: "course_1",
    },
  ]);
  state.values.set("meetings:list", [
    {
      _id: "m1",
      courseCanvasId: 1,
      kind: "lecture",
      days: [2, 4],
      startMinute: 11 * 60,
      endMinute: 12 * 60 + 15,
      location: "Van Vleck B102",
    },
  ]);
});

function setup(search: CalendarSearch) {
  vi.spyOn(Route, "useSearch").mockReturnValue(search);
  vi.spyOn(Route, "useNavigate").mockReturnValue(vi.fn() as never);
  return Route.options.component as ComponentType;
}

it("renders the week as bands over a time grid", () => {
  const Calendar = setup({ view: "week", date: "2026-09-10" });
  render(<Calendar />);

  expect(screen.getByText("Due")).toBeDefined();
  expect(screen.getByText("Plan")).toBeDefined();
  // Due times are one-liners in the band, never blocks.
  expect(screen.getByText("Problem Set 3")).toBeDefined();
  expect(screen.getByText("5:00p")).toBeDefined();
  expect(screen.getByText("Email prof re: office hours")).toBeDefined();
  // Two lecture occurrences this week (Tue and Thu), each with its location.
  expect(screen.getAllByText("MATH 340")).toHaveLength(2);
  expect(screen.getAllByText("Van Vleck B102")).toHaveLength(2);
  // The local event is in the grid, lighter and dashed.
  expect(screen.getByText("Study group — P3")).toBeDefined();
  expect(screen.getByText(`Times in ${ZONE}`)).toBeDefined();
  // Exactly one new-event affordance per layout: the desktop button carries
  // its own label, the phone FAB is the only one named "New event".
  expect(screen.getAllByLabelText("New event")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Event" })).toBeDefined();
});

it("nudges for class times only when there are none", () => {
  state.values.set("meetings:list", []);
  const Calendar = setup({ view: "week", date: "2026-09-10" });
  render(<Calendar />);
  expect(screen.getByText("Add your class times so lectures show here")).toBeDefined();
});

it("hides class meetings in the month until they are asked for", () => {
  const Calendar = setup({ view: "month", date: "2026-09-10" });
  render(<Calendar />);

  expect(screen.getByText("Show classes")).toBeDefined();
  expect(screen.queryByText("MATH 340 Lecture")).toBeNull();
  expect(screen.getByText("Problem Set 3")).toBeDefined();

  fireEvent.click(screen.getByText("Show classes"));
  expect(screen.getAllByText("MATH 340 Lecture").length).toBeGreaterThan(0);
});

it("opens a day in a popover beside its cell", () => {
  const Calendar = setup({ view: "month", date: "2026-09-10" });
  render(<Calendar />);

  fireEvent.click(screen.getByRole("button", { name: /^Thursday, September 10/ }));
  const popover = screen.getByRole("dialog", { name: "Thursday, September 10" });
  expect(popover).toBeDefined();
  expect(screen.getByText("Classes")).toBeDefined();
  expect(screen.getByText("Planned")).toBeDefined();
  expect(screen.getByPlaceholderText("Plan something for Thursday…")).toBeDefined();
  // The popover shows the class even though the month cell hides it.
  expect(screen.getByText("11:00–12:15")).toBeDefined();
});

it("walks the month with the arrow keys and closes on Escape", () => {
  const Calendar = setup({ view: "month", date: "2026-09-10" });
  render(<Calendar />);

  fireEvent.click(screen.getByRole("button", { name: /^Thursday, September 10/ }));
  expect(screen.getByRole("dialog", { name: "Thursday, September 10" })).toBeDefined();

  fireEvent.keyDown(window, { key: "ArrowRight" });
  expect(screen.getByRole("dialog", { name: "Friday, September 11" })).toBeDefined();

  fireEvent.keyDown(window, { key: "ArrowDown" });
  expect(screen.getByRole("dialog", { name: "Friday, September 18" })).toBeDefined();

  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("splits the popover into all-day, classes, events, due and planned", () => {
  const Calendar = setup({ view: "month", date: "2026-09-10" });
  render(<Calendar />);
  fireEvent.click(screen.getByRole("button", { name: /^Thursday, September 10/ }));

  const dialog = screen.getByRole("dialog", { name: "Thursday, September 10" });
  expect(within(dialog).getByText("All day")).toBeDefined();
  expect(within(dialog).getByText("Classes")).toBeDefined();
  expect(within(dialog).getByText("Events")).toBeDefined();
  expect(within(dialog).getByText("Due")).toBeDefined();
  expect(within(dialog).getByText("Planned")).toBeDefined();
  // The summary counts have to agree with the groups below it.
  expect(within(dialog).getByText("Today · 1 class · 2 events · 1 due · 1 planned")).toBeDefined();
});

it("takes focus into the popover and hands it back to the cell", () => {
  const Calendar = setup({ view: "month", date: "2026-09-10" });
  render(<Calendar />);
  const cell = screen.getByRole("button", { name: /^Thursday, September 10/ });

  fireEvent.click(cell);
  expect(document.activeElement?.textContent).toBe("Thursday, September 10");

  fireEvent.click(screen.getByLabelText("Close day"));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(cell);
});

it("stands down while something else is modal", () => {
  const Calendar = setup({ view: "month", date: "2026-09-10" });
  render(<Calendar />);
  fireEvent.click(screen.getByRole("button", { name: /^Thursday, September 10/ }));

  // A repeat is a held key, not an intent to walk the month.
  fireEvent.keyDown(window, { key: "ArrowRight", repeat: true });
  expect(screen.getByRole("dialog", { name: "Thursday, September 10" })).toBeDefined();

  const palette = document.createElement("div");
  palette.setAttribute("role", "dialog");
  document.body.append(palette);
  fireEvent.keyDown(window, { key: "ArrowRight" });
  expect(screen.getByRole("dialog", { name: "Thursday, September 10" })).toBeDefined();

  palette.remove();
  fireEvent.keyDown(window, { key: "ArrowRight" });
  expect(screen.getByRole("dialog", { name: "Friday, September 11" })).toBeDefined();
});

it("shows the day view with its week strip and timeline", () => {
  const Calendar = setup({ view: "day", date: "2026-09-10" });
  render(<Calendar />);
  expect(screen.getByText("Thursday, Sep 10")).toBeDefined();
  expect(screen.getByRole("button", { name: /^Monday, September 7/ })).toBeDefined();
  expect(screen.getByText("MATH 340")).toBeDefined();
  expect(screen.getByText("11:00 – 12:15 · Van Vleck B102")).toBeDefined();
});
