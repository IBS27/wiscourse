// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { ProfileMenu } from "../src/components/app/profile-menu";

const signOut = vi.hoisted(() => vi.fn<() => Promise<void>>());
vi.mock("@clerk/clerk-react", () => ({
  useClerk: () => ({ signOut }),
  useUser: () => ({ user: { fullName: "Test Student", firstName: "Test", lastName: "Student" } }),
}));
vi.mock("convex/react", () => ({ useMutation: () => async () => null }));
vi.mock("@/lib/sync-info", () => ({ useSyncInfo: () => undefined }));
vi.mock("@/lib/hooks", () => ({ useNow: () => 0 }));
vi.mock("@/lib/theme", () => ({ useTheme: () => "system", setTheme: () => {} }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, ...props }: ComponentProps<"a"> & { to: string }) => <a {...props} href={to} />,
}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("keeps the profile menu open to show a failed sign-out and allow a retry", async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  let reject: (error: Error) => void = () => {};
  signOut.mockReturnValue(new Promise<void>((_, fail) => { reject = fail; }));
  render(<ProfileMenu />);
  fireEvent.keyDown(screen.getByRole("button", { name: /Test Student/ }), { key: "Enter" });
  fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
  expect(screen.getByRole("menuitem", { name: "Signing out…" })).toBeTruthy();
  await act(async () => reject(new Error("network unavailable")));
  expect(screen.getByRole("alert").textContent).toContain("Couldn't sign out");
  signOut.mockResolvedValue(undefined);
  await act(async () => fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" })));
  expect(signOut).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).toBeNull();
});
