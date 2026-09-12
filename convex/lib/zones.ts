// Time-zone arithmetic without a library. Shared by the client (display
// zone override), the meeting expander and the ICS feed, so it must run in
// the browser, Node (tests) and the Convex runtime — Intl only, no Date
// local-zone getters.
//
// Day keys are "YYYY-MM-DD"; minutes are minutes past midnight on that
// day's clock in the zone in question.

/** Where the campus clock ticks. Class meetings are entered in this zone. */
export const CAMPUS_TIME_ZONE = "America/Chicago";

export interface ZonedParts {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
  weekday: number; // 0 = Sunday
  hour: number;
  minute: number;
  second: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsFormatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    partsFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** True when the runtime knows the zone. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    partsFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** The wall clock in `timeZone` at instant `ms`. */
export function zonedParts(ms: number, timeZone: string): ZonedParts {
  const out: Partial<ZonedParts> = {};
  for (const part of partsFormatter(timeZone).formatToParts(new Date(ms))) {
    switch (part.type) {
      case "year":
        out.year = Number(part.value);
        break;
      case "month":
        out.month = Number(part.value);
        break;
      case "day":
        out.day = Number(part.value);
        break;
      case "weekday":
        out.weekday = WEEKDAYS.indexOf(part.value);
        break;
      case "hour":
        out.hour = Number(part.value) % 24;
        break;
      case "minute":
        out.minute = Number(part.value);
        break;
      case "second":
        out.second = Number(part.value);
        break;
    }
  }
  return out as ZonedParts;
}

export function formatDayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseDayKey(key: string): { year: number; month: number; day: number } {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

/** The day key of instant `ms` on the clock in `timeZone`. */
export function dayKeyIn(ms: number, timeZone: string): string {
  const p = zonedParts(ms, timeZone);
  return formatDayKey(p.year, p.month, p.day);
}

/** Minutes past midnight of instant `ms` on the clock in `timeZone`. */
export function minuteOfDayIn(ms: number, timeZone: string): number {
  const p = zonedParts(ms, timeZone);
  return p.hour * 60 + p.minute;
}

/** Offset of `timeZone` from UTC at instant `ms`, in ms (Chicago: negative). */
function offsetAt(ms: number, timeZone: string): number {
  const p = zonedParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant at `minute` past midnight on day `key` in `timeZone`. Two
 * passes so a guess made with yesterday's offset is corrected across a
 * DST change; inside the spring-forward gap either side is acceptable.
 */
export function zonedToUtc(key: string, minute: number, timeZone: string): number {
  const { year, month, day } = parseDayKey(key);
  const wall = Date.UTC(year, month - 1, day, 0, minute);
  const first = wall - offsetAt(wall, timeZone);
  return wall - offsetAt(first, timeZone);
}

// ── Pure day-key arithmetic (no zone involved) ────────────────────────────

export function addDaysKey(key: string, days: number): string {
  const { year, month, day } = parseDayKey(key);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return formatDayKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** 0 = Sunday. */
export function weekdayOfKey(key: string): number {
  const { year, month, day } = parseDayKey(key);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: string, b: string): number {
  const pa = parseDayKey(a);
  const pb = parseDayKey(b);
  return Math.round(
    (Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day)) / 86_400_000,
  );
}
