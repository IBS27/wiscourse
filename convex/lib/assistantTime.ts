// The assistant speaks wall-clock time in the student's zone: tools accept
// and return "YYYY-MM-DDTHH:mm" (or a bare "YYYY-MM-DD"), never instants,
// so the model does no offset arithmetic.

import { dayKeyIn, minuteOfDayIn, weekdayOfKey, zonedToUtc } from "./zones";

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL = /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})$/;
const CLOCK = /^(\d{1,2}):(\d{2})$/;

export function isDayKey(value: string): boolean {
  const m = DAY_KEY.exec(value);
  if (m === null) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export function assertDayKey(value: string): string {
  if (!isDayKey(value)) throw new Error(`"${value}" is not a date; use YYYY-MM-DD`);
  return value;
}

/** Minutes past midnight for "HH:mm". */
export function parseClock(value: string): number {
  const m = CLOCK.exec(value.trim());
  const minute = m === null ? NaN : Number(m[1]) * 60 + Number(m[2]);
  if (!Number.isInteger(minute) || minute < 0 || minute > 24 * 60 || Number(m?.[2]) > 59) {
    throw new Error(`"${value}" is not a time; use HH:mm (24-hour)`);
  }
  return minute;
}

/** "YYYY-MM-DDTHH:mm" (or "YYYY-MM-DD" for midnight) in `timeZone` to an instant. */
export function parseLocal(value: string, timeZone: string): number {
  const text = value.trim();
  if (isDayKey(text)) return zonedToUtc(text, 0, timeZone);
  const m = LOCAL.exec(text);
  if (m === null || !isDayKey(m[1])) {
    throw new Error(`"${value}" is not a local date-time; use YYYY-MM-DDTHH:mm`);
  }
  return zonedToUtc(m[1], parseClock(`${m[2]}:${m[3]}`), timeZone);
}

/** A due time; a bare date means the end of that day, as Canvas does. */
export function parseDue(value: string, timeZone: string): number {
  const text = value.trim();
  return isDayKey(text) ? zonedToUtc(text, 23 * 60 + 59, timeZone) : parseLocal(text, timeZone);
}

/** An exact time; a bare date is rejected so nothing lands at midnight by accident. */
export function parseTime(value: string, timeZone: string): number {
  if (isDayKey(value.trim())) throw new Error(`"${value}" needs a time; use YYYY-MM-DDTHH:mm`);
  return parseLocal(value, timeZone);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "YYYY-MM-DDTHH:mm" on the clock in `timeZone`. */
export function localIso(ms: number, timeZone: string): string {
  const minute = minuteOfDayIn(ms, timeZone);
  return `${dayKeyIn(ms, timeZone)}T${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
}

export function clock(minute: number): string {
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
}

export function weekdayName(dayKey: string): string {
  return WEEKDAYS[weekdayOfKey(dayKey)];
}

/** "Wednesday, September 23, 2026, 2:14 PM" for the prompt. */
export function describeNow(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}
