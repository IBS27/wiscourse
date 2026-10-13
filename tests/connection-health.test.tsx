// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useActivityHeartbeat } from "../src/lib/activity";
import { ConnectionBanner } from "../src/components/app/connection-banner";
import { isSyncDelayed, type SyncInfo } from "../src/lib/sync-info";
import { HEARTBEAT_MS, SYNC_DELAYED_MS } from "../convex/lib/syncCadence";

const beat = vi.hoisted(() => vi.fn(() => Promise.resolve(null)));
const connection = vi.hoisted(() => ({ hasEverConnected: true, isWebSocketConnected: true }));
vi.mock("convex/react", () => ({
  useMutation: () => beat,
  useConvexConnectionState: () => connection,
}));
const signOut = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("@clerk/clerk-react", () => ({ useClerk: () => ({ signOut }) }));

let visibility: DocumentVisibilityState = "visible";
let online = true;
beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  online = true;
  Object.assign(connection, { hasEverConnected: true, isWebSocketConnected: true });
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
});
afterEach(() => { cleanup(); beat.mockClear(); vi.useRealTimers(); vi.restoreAllMocks(); });

function Heartbeat() {
  useActivityHeartbeat();
  return null;
}

it("beats on open, then at most every heartbeat period while the user is active", () => {
  render(<Heartbeat />);
  expect(beat).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(window);
  fireEvent.pointerDown(window);
  expect(beat).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(HEARTBEAT_MS);
  expect(beat).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(window);
  expect(beat).toHaveBeenCalledTimes(2);
});

it("beats promptly on return, never while hidden or offline", () => {
  render(<Heartbeat />);
  vi.advanceTimersByTime(2 * 60_000);
  visibility = "hidden";
  fireEvent(document, new Event("visibilitychange"));
  vi.advanceTimersByTime(HEARTBEAT_MS);
  fireEvent.keyDown(window);
  expect(beat).toHaveBeenCalledTimes(1);
  online = false;
  visibility = "visible";
  fireEvent(document, new Event("visibilitychange"));
  expect(beat).toHaveBeenCalledTimes(1);
  online = true;
  fireEvent(window, new Event("online"));
  expect(beat).toHaveBeenCalledTimes(2);
});

it("never beats more often than the heartbeat period, however often the user switches back", () => {
  render(<Heartbeat />);
  for (let n = 0; n < 6; n++) {
    vi.advanceTimersByTime(90_000);
    fireEvent(window, new Event("focus"));
    fireEvent.keyDown(window);
  }
  // Nine minutes of tab switching: the opening beat plus one past five minutes.
  expect(beat).toHaveBeenCalledTimes(2);
});

it("reports a lost connection only after a grace period, and clears on reconnect", () => {
  const view = render(<ConnectionBanner />);
  Object.assign(connection, { isWebSocketConnected: false });
  view.rerender(<ConnectionBanner />);
  act(() => { vi.advanceTimersByTime(3_000); });
  expect(screen.queryByRole("status")).toBeNull();
  act(() => { vi.advanceTimersByTime(1_000); });
  expect(screen.getByRole("status").textContent).toContain("Reconnecting");

  online = false;
  act(() => { fireEvent(window, new Event("offline")); });
  expect(screen.getByRole("status").textContent).toContain("offline");

  online = true;
  Object.assign(connection, { isWebSocketConnected: true });
  act(() => { fireEvent(window, new Event("online")); });
  expect(screen.queryByRole("status")).toBeNull();
});

it("reports auth recovery under an open app, with the action each state needs", () => {
  const retry = vi.fn();
  const view = render(<ConnectionBanner auth={{ kind: "retrying", retry }} />);
  act(() => { vi.advanceTimersByTime(3_000); });
  expect(screen.queryByRole("status")).toBeNull();
  act(() => { vi.advanceTimersByTime(1_000); });
  expect(screen.getByRole("status").textContent).toContain("Reconnecting");
  expect(screen.queryByRole("button")).toBeNull();

  view.rerender(<ConnectionBanner auth={{ kind: "stalled", retry }} />);
  expect(screen.getByRole("status").textContent).toContain("couldn't reconnect");
  expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(retry).toHaveBeenCalledOnce();

  view.rerender(<ConnectionBanner auth={{ kind: "unverified", retry }} />);
  expect(screen.getByRole("status").textContent).toContain("couldn't verify your account");
  expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();

  view.rerender(<ConnectionBanner auth={{ kind: "expired", retry }} />);
  expect(screen.getByRole("status").textContent).toContain("Your session ended");
  expect(screen.queryByRole("button", { name: "Reload" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Sign in again" }));
  expect(signOut).toHaveBeenCalledOnce();

  // Offline explains the rest, and nothing can be retried until it ends.
  online = false;
  act(() => { fireEvent(window, new Event("offline")); });
  expect(screen.getByRole("status").textContent).toContain("offline");
  expect(screen.queryByRole("button")).toBeNull();

  online = true;
  act(() => { fireEvent(window, new Event("online")); });
  view.rerender(<ConnectionBanner auth={null} />);
  expect(screen.queryByRole("status")).toBeNull();
});

it("stays quiet before the first connection", () => {
  Object.assign(connection, { hasEverConnected: false, isWebSocketConnected: false });
  render(<ConnectionBanner />);
  act(() => { vi.advanceTimersByTime(10_000); });
  expect(screen.queryByRole("status")).toBeNull();
});

it("calls sync delayed only when nothing else explains the silence", () => {
  const now = Date.UTC(2026, 8, 30, 15);
  const info: SyncInfo = { connected: true, syncing: false, firstSync: false, invalid: false, lastSyncedAt: now - SYNC_DELAYED_MS - 1 };
  expect(isSyncDelayed(info, now)).toBe(true);
  expect(isSyncDelayed({ ...info, lastSyncedAt: now - SYNC_DELAYED_MS }, now)).toBe(false);
  expect(isSyncDelayed({ ...info, syncing: true }, now)).toBe(false);
  expect(isSyncDelayed({ ...info, error: "Canvas 500" }, now)).toBe(false);
  expect(isSyncDelayed({ ...info, invalid: true }, now)).toBe(false);
});
