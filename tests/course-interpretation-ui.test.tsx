// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentType } from "react";
import { Route } from "../src/routes/courses.$courseId.interpretation";

const state = vi.hoisted(() => ({
  value: undefined as unknown,
  mutate: vi.fn().mockResolvedValue(null),
}));
vi.mock("convex/react", () => ({
  useQuery: () => state.value,
  useMutation: () => state.mutate,
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  state.mutate.mockClear();
});
function show(value: unknown) {
  state.value = value;
  vi.spyOn(Route, "useParams").mockReturnValue({ courseId: "1" });
  const Component = Route.options.component as ComponentType;
  return render(<Component />);
}
it("shows setup state and prevents unavailable runs", () => {
  show({ configured: false, state: null });
  expect(
    screen.getByText("AI interpretation isn’t configured yet."),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Interpret course" })
      .hasAttribute("disabled"),
  ).toBe(true);
});
it("requests the current course and supports stopping automatic refresh", async () => {
  show({ configured: true, state: { enabled: true, status: "ready" } });
  fireEvent.click(screen.getByRole("button", { name: "Interpret course" }));
  await waitFor(() =>
    expect(state.mutate).toHaveBeenCalledWith({ courseCanvasId: 1 }),
  );
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Stop automatic refresh" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
});
it("keeps the last map visible with stale status and links to evidence", () => {
  show({
    configured: true,
    state: {
      status: "failed",
      enabled: true,
      sourceRevision: 2,
      resultRevision: 1,
      error: "Failed",
      resources: [
        {
          id: "page:home",
          title: "Course homepage",
          href: "/courses/1/pages/home",
        },
      ],
      map: {
        organization: "resources",
        summary: "Original map",
        sections: [
          {
            id: "one",
            title: "Lecture materials",
            resourceIds: ["page:home"],
            teachingDates: null,
            evidence: [{ sourceId: "page:home", quote: "Lecture schedule" }],
          },
        ],
        essentials: [],
        conflicts: [],
        unresolvedResourceIds: [],
      },
    },
  });
  expect(screen.getByText("Original map")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("previous map");
  expect(screen.getAllByText("Course homepage")[0].getAttribute("href")).toBe(
    "/courses/1/pages/home",
  );
  expect(screen.getByText("“Lecture schedule”")).toBeTruthy();
});
