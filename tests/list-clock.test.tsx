// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useInboxFeed, useListTime, useTodoList } from "../src/lib/list-queries";
import { useNavCounts } from "../src/components/app/nav";
import { setDisplayTimeZone } from "../src/lib/time-zone";
import { getFunctionName } from "convex/server";

const state = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery: (...args: unknown[]) => state.query(...args) }));
afterEach(() => { cleanup(); setDisplayTimeZone(undefined); vi.useRealTimers(); state.query.mockReset(); vi.restoreAllMocks(); });

it("shares aligned query times across mounts and refreshes after a sleeping tab resumes", () => {
  vi.useFakeTimers(); vi.setSystemTime(120_001);
  const first = renderHook(() => useListTime());
  act(() => vi.advanceTimersByTime(20_000));
  const second = renderHook(() => useListTime());
  expect(first.result.current).toBe(120_000);
  expect(second.result.current).toBe(120_000);
  act(() => vi.advanceTimersByTime(40_000));
  expect(first.result.current).toBe(180_000);
  expect(second.result.current).toBe(180_000);
  act(() => { vi.setSystemTime(600_001); window.dispatchEvent(new Event("focus")); });
  expect(first.result.current).toBe(600_000);
  expect(second.result.current).toBe(600_000);
  first.unmount(); second.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("passes the same clock to inbox and default todos without changing explicit calendar ranges", () => {
  vi.useFakeTimers(); vi.setSystemTime(123_456);
  renderHook(() => { useInboxFeed(); useTodoList(); useTodoList({ from: 1, to: 2 }); });
  expect(state.query.mock.calls.map((call) => call[1])).toEqual([
    { now: 120_000 }, { now: 120_000 }, { from: 1, to: 2, now: 120_000 },
  ]);
});

it("does not drive clock-only queries in hidden tabs and catches up when shown", () => {
  vi.useFakeTimers(); vi.setSystemTime(120_001);
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  renderHook(() => useInboxFeed());
  state.query.mockClear();
  visibility.mockReturnValue("hidden");
  act(() => vi.advanceTimersByTime(180_000));
  expect(state.query).not.toHaveBeenCalled();
  visibility.mockReturnValue("visible");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(state.query.mock.lastCall?.[1]).toEqual({ now: 300_000 });
});

it("keeps navigation counts correct across midnight and a display-zone change", () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 8, 12, 4, 59)); // 23:59 in Chicago
  setDisplayTimeZone("America/Chicago");
  state.query.mockImplementation((ref) => getFunctionName(ref) === "todos:list" ? [{
    key: "local:1", kind: "local", title: "Planned tomorrow", submission: "none",
    subtasks: [], plannedDay: "2026-09-12",
  }] : []);
  const counts = renderHook(() => useNavCounts());
  expect(counts.result.current.home).toBe(0);
  act(() => vi.advanceTimersByTime(61_000));
  expect(counts.result.current.home).toBe(1);
  act(() => setDisplayTimeZone("America/Los_Angeles"));
  expect(counts.result.current.home).toBe(0);
});
