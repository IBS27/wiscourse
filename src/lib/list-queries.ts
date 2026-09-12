import { useSyncExternalStore } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const MINUTE = 60_000;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
const snapshot = () => Math.floor(Date.now() / MINUTE) * MINUTE;

function notify() {
  // Hidden tabs still receive real database updates. Avoid clock-only query
  // executions while nothing is visible; visibilitychange catches up on return.
  if (document.visibilityState === "hidden") return;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    const tick = () => {
      notify();
      timer = setTimeout(tick, MINUTE - Date.now() % MINUTE);
    };
    timer = setTimeout(tick, MINUTE - Date.now() % MINUTE);
    window.addEventListener("focus", notify);
    document.addEventListener("visibilitychange", notify);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearTimeout(timer);
      window.removeEventListener("focus", notify);
      document.removeEventListener("visibilitychange", notify);
    }
  };
}

/** One aligned clock for all list subscribers, including after tab sleep.
 * Shared arguments preserve subscription deduplication. Window membership
 * updates within one minute without relying on an unrelated sync write. */
export function useListTime() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function useInboxFeed() {
  const now = useListTime();
  return useQuery(api.inbox.feed, { now });
}

export function useTodoList(range: { from?: number; to?: number } = {}) {
  const now = useListTime();
  return useQuery(api.todos.list, { ...range, now });
}
