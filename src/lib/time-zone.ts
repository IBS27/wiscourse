// The display time zone: the browser's, unless the user set an override in
// Settings. Every formatter in src/lib/dates.ts reads it, so switching the
// zone re-renders every date on screen through `useDisplayTimeZone()`.

import { useEffect, useSyncExternalStore } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CAMPUS_TIME_ZONE, isValidTimeZone } from "../../convex/lib/zones";

export { CAMPUS_TIME_ZONE };

let override: string | undefined;
const listeners = new Set<() => void>();

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** The zone in force for display: the override, else the browser's. */
export function displayTimeZone(): string {
  return override ?? browserTimeZone();
}

export function setDisplayTimeZone(timeZone: string | undefined): void {
  const next = timeZone !== undefined && isValidTimeZone(timeZone) ? timeZone : undefined;
  if (next === override) return;
  override = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Subscribes the component to zone changes and returns the zone in force. */
export function useDisplayTimeZone(): string {
  return useSyncExternalStore(subscribe, displayTimeZone, displayTimeZone);
}

/** Mounted once at the root: mirrors the saved preference into the store. */
export function useTimeZonePreference(): void {
  const prefs = useQuery(api.prefs.get);
  useEffect(() => {
    if (prefs === undefined) return;
    setDisplayTimeZone(prefs?.timeZone);
  }, [prefs]);
}

/** Zones worth offering: the browser's, the campus, and the US bands. */
export const TIME_ZONE_CHOICES = [
  "America/Chicago",
  "America/New_York",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const;
