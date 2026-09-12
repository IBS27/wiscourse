// Day keys are "YYYY-MM-DD" on the display clock (src/lib/time-zone.ts:
// the browser's zone unless the user overrode it). Everything that is a
// calendar day (planned day, agenda buckets) goes through these; instants
// (due dates) stay as epoch ms.
//
// No `Date` local-zone getters here: every conversion goes through the
// display zone so an override in Settings moves every date on screen.

import {
  addDaysKey,
  dayKeyIn,
  daysBetween,
  weekdayOfKey,
  zonedToUtc,
} from "../../convex/lib/zones";
import { displayTimeZone } from "./time-zone";

export const DAY_MS = 24 * 60 * 60 * 1000;

export function dayKey(date: Date): string {
  return dayKeyIn(date.getTime(), displayTimeZone());
}

export function dayKeyOf(ms: number): string {
  return dayKeyIn(ms, displayTimeZone());
}

/** Midnight at the start of the given day key, on the display clock. */
export function startOfDay(key: string): Date {
  return new Date(zonedToUtc(key, 0, displayTimeZone()));
}

/** The instant at `minute` past midnight on `key`, on the display clock. */
export function atMinute(key: string, minute: number): number {
  return zonedToUtc(key, minute, displayTimeZone());
}

export function addDays(key: string, days: number): string {
  return addDaysKey(key, days);
}

/** Whole days from `a` to `b`. */
export function dayDiff(a: string, b: string): number {
  return daysBetween(a, b);
}

export function today(): string {
  return dayKeyOf(Date.now());
}

/** 0 = Sunday. */
export function weekday(key: string): number {
  return weekdayOfKey(key);
}

/** The Sunday on or before the given day. */
export function startOfWeek(key: string): string {
  return addDays(key, -weekday(key));
}

/** The Monday on or before the given day — the teaching week. */
export function startOfMondayWeek(key: string): string {
  return addDays(key, -((weekday(key) + 6) % 7));
}

// ── Formatters ──────────────────────────────────────────────────────────────
// Built per zone and cached; the zone rarely changes.

type Fmt =
  | "weekday"
  | "weekdayLong"
  | "monthDay"
  | "monthDayLong"
  | "monthDayYear"
  | "dayNum"
  | "time"
  | "monthYear";

const OPTIONS: Record<Fmt, Intl.DateTimeFormatOptions> = {
  weekday: { weekday: "short" },
  weekdayLong: { weekday: "long" },
  monthDay: { month: "short", day: "numeric" },
  monthDayLong: { month: "long", day: "numeric" },
  monthDayYear: { month: "short", day: "numeric", year: "numeric" },
  dayNum: { day: "numeric" },
  time: { hour: "numeric", minute: "2-digit" },
  monthYear: { month: "long", year: "numeric" },
};

const cache = new Map<string, Intl.DateTimeFormat>();

function fmt(kind: Fmt): Intl.DateTimeFormat {
  const zone = displayTimeZone();
  const key = `${zone}|${kind}`;
  let f = cache.get(key);
  if (f === undefined) {
    f = new Intl.DateTimeFormat("en-US", { ...OPTIONS[kind], timeZone: zone });
    cache.set(key, f);
  }
  return f;
}

/** Noon on the day, so a day-key formats as itself in every zone. */
function noon(key: string): Date {
  return new Date(atMinute(key, 12 * 60));
}

/** "Fri, Aug 21" */
export function formatDay(key: string): string {
  const d = noon(key);
  return `${fmt("weekday").format(d)}, ${fmt("monthDay").format(d)}`;
}

/** "Friday, August 21" */
export function formatDayLong(key: string): string {
  const d = noon(key);
  return `${fmt("weekdayLong").format(d)}, ${fmt("monthDayLong").format(d)}`;
}

/** "Friday, Aug 21" */
export function formatDayMedium(key: string): string {
  const d = noon(key);
  return `${fmt("weekdayLong").format(d)}, ${fmt("monthDay").format(d)}`;
}

/** "Sun", "Mon", ... */
export function formatWeekday(key: string): string {
  return fmt("weekday").format(noon(key));
}

/** "September 2026" for the month containing `key`. */
export function formatMonthYear(key: string): string {
  return fmt("monthYear").format(noon(key));
}

/** "Aug 21" — an instant, not a day key; the one month-day label. */
export function formatMonthDay(ms: number): string {
  return fmt("monthDay").format(new Date(ms));
}

/** "Aug 21", carrying the year once the date is from another one. */
export function formatMonthDayYear(ms: number, now: number = Date.now()): string {
  const year = (t: number) => dayKeyOf(t).slice(0, 4);
  return year(ms) === year(now)
    ? fmt("monthDay").format(new Date(ms))
    : fmt("monthDayYear").format(new Date(ms));
}

/** "Aug 10 – 14", or "Aug 31 – Sep 4" across a month boundary. */
export function formatWeekRange(mondayKey: string, length = 5): string {
  const start = noon(mondayKey);
  const endKey = addDays(mondayKey, length - 1);
  const end = noon(endKey);
  const tail =
    mondayKey.slice(0, 7) === endKey.slice(0, 7)
      ? fmt("dayNum").format(end)
      : fmt("monthDay").format(end);
  return `${fmt("monthDay").format(start)} – ${tail}`;
}

/** "Fri Aug 21" */
export function formatDayShort(key: string): string {
  const d = noon(key);
  return `${fmt("weekday").format(d)} ${fmt("monthDay").format(d)}`;
}

/** "11:59 PM" */
export function formatTime(ms: number): string {
  return fmt("time").format(new Date(ms));
}

/**
 * Due-time label relative to `todayKey`: "11:59 PM" if on the reference
 * day, "Wed, 11:59 PM" within the week, "Mon Aug 24, 11:59 PM" beyond.
 */
export function formatDueRelative(ms: number, todayKey: string): string {
  const key = dayKeyOf(ms);
  if (key === todayKey) return formatTime(ms);
  const diff = dayDiff(todayKey, key);
  if (diff > 0 && diff < 7) return `${formatWeekday(key)}, ${formatTime(ms)}`;
  return `${formatDayShort(key)}, ${formatTime(ms)}`;
}

/** Planned-day label: "today", "tomorrow", "Sun", "Sun Aug 23". */
export function formatPlannedRelative(key: string, todayKey: string): string {
  if (key === todayKey) return "today";
  if (key === addDays(todayKey, 1)) return "tomorrow";
  const diff = dayDiff(todayKey, key);
  if (diff > 0 && diff < 7) return formatWeekday(key);
  return formatDayShort(key);
}

/** "2h", "Thu", "Aug 3" — for feed timestamps. */
export function formatAgo(ms: number, now: number = Date.now()): string {
  const diff = now - ms;
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < DAY_MS) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 7 * DAY_MS) return fmt("weekday").format(new Date(ms));
  return fmt("monthDay").format(new Date(ms));
}

/** "2 days late" / "1 day late" / "3 hours late". */
export function formatLate(dueAt: number, now: number = Date.now()): string {
  const diff = now - dueAt;
  const days = Math.floor(diff / DAY_MS);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} late`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"} late`;
  return "just past due";
}

/** "2 minutes ago", "just now", "3 hours ago". */
export function formatSince(ms: number, now: number = Date.now()): string {
  const diff = now - ms;
  if (diff < 60_000) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
