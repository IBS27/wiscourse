// Day keys are "YYYY-MM-DD" in the browser's zone. Everything that is a
// calendar day (planned day, agenda buckets) goes through these; instants
// (due dates) stay as epoch ms.

export const DAY_MS = 24 * 60 * 60 * 1000;

export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function dayKeyOf(ms: number): string {
  return dayKey(new Date(ms));
}

/** Local midnight at the start of the given day key. */
export function startOfDay(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, days: number): string {
  const date = startOfDay(key);
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

export function today(): string {
  return dayKey(new Date());
}

/** 0 = Sunday. */
export function weekday(key: string): number {
  return startOfDay(key).getDay();
}

/** The Sunday on or before the given day. */
export function startOfWeek(key: string): string {
  return addDays(key, -weekday(key));
}

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const WEEKDAY_LONG = new Intl.DateTimeFormat("en-US", { weekday: "long" });
const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const MONTH_DAY_LONG = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" });
const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

/** "Fri, Aug 21" */
export function formatDay(key: string): string {
  const d = startOfDay(key);
  return `${WEEKDAY.format(d)}, ${MONTH_DAY.format(d)}`;
}

/** "Friday, August 21" */
export function formatDayLong(key: string): string {
  const d = startOfDay(key);
  return `${WEEKDAY_LONG.format(d)}, ${MONTH_DAY_LONG.format(d)}`;
}

/** "Friday, Aug 21" */
export function formatDayMedium(key: string): string {
  const d = startOfDay(key);
  return `${WEEKDAY_LONG.format(d)}, ${MONTH_DAY.format(d)}`;
}

/** "Fri Aug 21" */
/** "Sun", "Mon", ... */
export function formatWeekday(key: string): string {
  return WEEKDAY.format(startOfDay(key));
}

export function formatDayShort(key: string): string {
  const d = startOfDay(key);
  return `${WEEKDAY.format(d)} ${MONTH_DAY.format(d)}`;
}

/** "11:59 PM" */
export function formatTime(ms: number): string {
  return TIME.format(new Date(ms));
}

/**
 * Due-time label relative to `todayKey`: "11:59 PM" if on the reference
 * day, "Wed, 11:59 PM" within the week, "Mon Aug 24, 11:59 PM" beyond.
 */
export function formatDueRelative(ms: number, todayKey: string): string {
  const key = dayKeyOf(ms);
  if (key === todayKey) return formatTime(ms);
  const diff = Math.round((startOfDay(key).getTime() - startOfDay(todayKey).getTime()) / DAY_MS);
  if (diff > 0 && diff < 7) return `${WEEKDAY.format(new Date(ms))}, ${formatTime(ms)}`;
  return `${formatDayShort(key)}, ${formatTime(ms)}`;
}

/** Planned-day label: "today", "tomorrow", "Sun", "Sun Aug 23". */
export function formatPlannedRelative(key: string, todayKey: string): string {
  if (key === todayKey) return "today";
  if (key === addDays(todayKey, 1)) return "tomorrow";
  const diff = Math.round((startOfDay(key).getTime() - startOfDay(todayKey).getTime()) / DAY_MS);
  if (diff > 0 && diff < 7) return WEEKDAY.format(startOfDay(key));
  return formatDayShort(key);
}

/** "2h", "Thu", "Aug 3" — for feed timestamps. */
export function formatAgo(ms: number, now: number = Date.now()): string {
  const diff = now - ms;
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < DAY_MS) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 7 * DAY_MS) return WEEKDAY.format(new Date(ms));
  return MONTH_DAY.format(new Date(ms));
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
