// Agenda rules (docs/overview.html):
//   A todo shows on its planned day, and on its due day only if not done.
//   A missed planned date rolls to today unless the Canvas due date has
//   passed — then it is Overdue.
// Each open item lands in exactly one bucket: the earliest day it should
// appear on. Done items show in Today only on the day they were done.

import type { TodoItem } from "../../convex/todos";
import { addDays, dayKeyOf, formatDay, startOfWeek } from "./dates";

export type BucketId = "overdue" | "today" | "tomorrow" | "week" | "later";

export type Bucket = {
  id: BucketId;
  title: string;
  /** Secondary label, e.g. the date. */
  detail?: string;
  items: TodoItem[];
};

export function isDone(item: TodoItem): boolean {
  return item.doneAt !== undefined;
}

/**
 * Items Canvas considers settled: submitted or graded, or an assignment
 * with nothing to submit (on paper, ungraded). No need to chase them.
 */
export function isSettled(item: TodoItem): boolean {
  return (
    isDone(item) ||
    item.submission === "submitted" ||
    item.submission === "graded" ||
    (item.kind === "assignment" && item.submission === "none")
  );
}

/** Past due and still open. */
export function isOverdue(item: TodoItem, now: number): boolean {
  return item.dueAt !== undefined && item.dueAt < now && !isSettled(item);
}

/**
 * The calendar day an open item belongs on, or "overdue", or null when it
 * has neither a plan nor a due date (undated personal task).
 */
export function agendaDay(
  item: TodoItem,
  todayKey: string,
  now: number,
): string | "overdue" | null {
  const dueDay = item.dueAt === undefined ? undefined : dayKeyOf(item.dueAt);
  const dueHasPassed = item.dueAt !== undefined && item.dueAt < now;

  if (isDone(item)) return null;
  // Submitted or graded work is never open, even before the due date.
  if (item.submission === "submitted" || item.submission === "graded") return null;
  if (dueHasPassed) return isSettled(item) ? null : "overdue";

  let planned = item.plannedDay;
  if (planned !== undefined && planned < todayKey) planned = todayKey; // roll forward
  if (planned === undefined) return dueDay ?? null;
  if (dueDay === undefined) return planned;
  return planned < dueDay ? planned : dueDay;
}

export type AgendaOptions = {
  todayKey: string;
  now: number;
};

export function buildAgenda(items: TodoItem[], opts: AgendaOptions): Bucket[] {
  const { todayKey, now } = opts;
  const tomorrowKey = addDays(todayKey, 1);
  const weekEndKey = addDays(todayKey, 7);

  const buckets: Record<BucketId, TodoItem[]> = {
    overdue: [],
    today: [],
    tomorrow: [],
    week: [],
    later: [],
  };

  for (const item of items) {
    if (isDone(item)) {
      if (item.doneAt !== undefined && dayKeyOf(item.doneAt) === todayKey) {
        buckets.today.push(item);
      }
      continue;
    }
    const day = agendaDay(item, todayKey, now);
    if (day === null) continue;
    if (day === "overdue") buckets.overdue.push(item);
    else if (day === todayKey) buckets.today.push(item);
    else if (day === tomorrowKey) buckets.tomorrow.push(item);
    else if (day <= weekEndKey) buckets.week.push(item);
    else buckets.later.push(item);
  }

  const byTime = (a: TodoItem, b: TodoItem) => {
    // Open before done; then by due time; undated last.
    const ad = isDone(a) ? 1 : 0;
    const bd = isDone(b) ? 1 : 0;
    if (ad !== bd) return ad - bd;
    return (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || a.title.localeCompare(b.title);
  };
  for (const list of Object.values(buckets)) list.sort(byTime);

  return [
    { id: "overdue", title: "Overdue", items: buckets.overdue },
    { id: "today", title: "Today", detail: formatDay(todayKey), items: buckets.today },
    { id: "tomorrow", title: "Tomorrow", detail: formatDay(tomorrowKey), items: buckets.tomorrow },
    { id: "week", title: "This week", detail: `through ${formatDay(weekEndKey)}`, items: buckets.week },
    { id: "later", title: "Later", items: buckets.later },
  ];
}

/** The days in the week strip, Sun..Sat containing `todayKey`. */
export function weekDays(todayKey: string): string[] {
  const start = startOfWeek(todayKey);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Items that appear on each day of the strip (due or planned, open only). */
export function itemsByDay(
  items: TodoItem[],
  days: string[],
  todayKey: string,
  now: number,
): Map<string, TodoItem[]> {
  const map = new Map<string, TodoItem[]>(days.map((d) => [d, []]));
  for (const item of items) {
    if (isDone(item)) {
      if (item.doneAt !== undefined) map.get(dayKeyOf(item.doneAt))?.push(item);
      continue;
    }
    const day = agendaDay(item, todayKey, now);
    if (day === "overdue") {
      if (item.dueAt !== undefined) map.get(dayKeyOf(item.dueAt))?.push(item);
      continue;
    }
    if (day !== null) map.get(day)?.push(item);
    // Also mark the due day when planned earlier: it shows on both.
    if (item.dueAt !== undefined) {
      const dueDay = dayKeyOf(item.dueAt);
      if (dueDay !== day) map.get(dueDay)?.push(item);
    }
  }
  return map;
}
