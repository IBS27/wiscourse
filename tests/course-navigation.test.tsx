// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  RouterProvider,
} from "@tanstack/react-router";
import {
  announcementsHref,
  fileHref,
  folderHref,
  moduleHref,
} from "../src/lib/course-routes";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each([
  { to: fileHref(42, 123, 9), path: "/courses/42/files", search: { file: 123, folder: 9 }, hash: "" },
  { to: folderHref(42, 9), path: "/courses/42/files", search: { folder: 9 }, hash: "" },
  { to: announcementsHref(42, 123), path: "/courses/42/announcements", search: { item: "announcement:123" }, hash: "" },
  { to: moduleHref(42, 7), path: "/courses/42/modules", search: {}, hash: "module-7" },
])("preserves search and hash when clicking $to", async ({ to, path, search, hash }) => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const root = createRootRoute({ component: () => <Link to={to}>Open target</Link> });
  const routeTree = root.addChildren([
    createRoute({ getParentRoute: () => root, path: "/" }),
    createRoute({ getParentRoute: () => root, path: "/courses/$courseId/files" }),
    createRoute({ getParentRoute: () => root, path: "/courses/$courseId/announcements" }),
    createRoute({ getParentRoute: () => root, path: "/courses/$courseId/modules" }),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  fireEvent.click(screen.getByRole("link", { name: "Open target" }));
  await waitFor(() => {
    expect(router.state.location.pathname).toBe(path);
    expect(router.state.location.search).toEqual(search);
    expect(router.state.location.hash).toBe(hash);
    expect(router.state.matches.at(-1)?.status).toBe("success");
  });
});
