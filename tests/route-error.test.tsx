// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { RouteError } from "../src/components/app/route-error";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("replaces a route that fails to render, without its error text, and lets the user try again", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  let broken = true;
  function Page() {
    if (broken) throw new Error("Not signed in");
    return <p>Courses</p>;
  }
  const router = createRouter({
    routeTree: createRootRoute({ component: Page }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
    defaultErrorComponent: RouteError,
  });
  render(<RouterProvider router={router} />);
  expect((await screen.findByRole("alert")).textContent).toContain("Something went wrong");
  expect(screen.queryByText(/Not signed in/)).toBeNull();
  broken = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Courses")).toBeTruthy();
});
