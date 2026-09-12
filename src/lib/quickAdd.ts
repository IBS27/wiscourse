// Natural-language quick add: "read ch 4 fri #cs537".
//
// Grammar (all optional, any order, case-insensitive):
//   #course        matches courseCode with spaces stripped ("#cs537"), or
//                  a nickname, or a word of the course name
//   <day>          today | tomorrow | tmrw | mon..sun | monday..sunday |
//                  next <day> | in N days | 8/25 | aug 25 | 25 aug
//                  ("fri" on a Friday is today; "next fri" is a week out)
//   due <day>      the same forms, but set the due date (11:59 PM) instead
//                  of the planned day
//   <time>         3pm | 3:30pm | 15:00 — attaches a due *time* to a due day
//                  (or, with no "due", turns the planned day into a due day
//                  at that time; a time without any day means today)
// Everything left over is the title.

import { addDays, atMinute, dayKey, weekday } from "./dates";

export type QuickAddCourse = {
  canvasId: number;
  courseCode: string;
  name: string;
  nickname?: string;
};

export type QuickAddToken =
  | { kind: "text"; text: string }
  | { kind: "course"; text: string; course: QuickAddCourse }
  | { kind: "day"; text: string; day: string; due: boolean }
  | { kind: "time"; text: string; minutes: number };

export type QuickAddResult = {
  title: string;
  plannedDay?: string;
  dueAt?: number;
  course?: QuickAddCourse;
  tokens: QuickAddToken[];
};

const DAY_NAMES: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

export function normalizeCode(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** "fri" = this Friday (today if it is Friday); "next fri" = the one after. */
function nextWeekday(todayKey: string, target: number, next = false): string {
  const current = weekday(todayKey);
  let diff = (target - current + 7) % 7;
  if (next) diff += 7;
  return addDays(todayKey, diff);
}

function monthDay(todayKey: string, month: number, day: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const year = Number(todayKey.slice(0, 4));
  const build = (y: number) => `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  // Pure day-key arithmetic: a day that overflows its month (Feb 30) rolls.
  const valid = (key: string) => addDays(key, 0) === key;
  const thisYear = build(year);
  if (!valid(thisYear)) return undefined;
  // A month/day already past this year means next year.
  return thisYear < todayKey ? build(year + 1) : thisYear;
}

/** Parse a day phrase starting at words[i]; returns [dayKey, wordsConsumed]. */
function parseDay(words: string[], i: number, todayKey: string): [string, number] | null {
  const w = words[i].toLowerCase();
  if (w === "today" || w === "tod") return [todayKey, 1];
  if (w === "tomorrow" || w === "tmrw" || w === "tmr") return [addDays(todayKey, 1), 1];
  if (w === "next" && i + 1 < words.length) {
    const n = words[i + 1].toLowerCase();
    if (n in DAY_NAMES) return [nextWeekday(todayKey, DAY_NAMES[n], true), 2];
    if (n === "week") return [addDays(todayKey, 7), 2];
  }
  if (w in DAY_NAMES) return [nextWeekday(todayKey, DAY_NAMES[w]), 1];
  if (w === "in" && i + 2 < words.length) {
    const n = Number(words[i + 1]);
    const unit = words[i + 2].toLowerCase();
    if (Number.isInteger(n) && n > 0) {
      if (unit.startsWith("day")) return [addDays(todayKey, n), 3];
      if (unit.startsWith("week")) return [addDays(todayKey, 7 * n), 3];
    }
  }
  const slash = /^(\d{1,2})\/(\d{1,2})$/.exec(w);
  if (slash) {
    const key = monthDay(todayKey, Number(slash[1]), Number(slash[2]));
    if (key) return [key, 1];
  }
  if (w in MONTHS && i + 1 < words.length) {
    const d = /^(\d{1,2})(st|nd|rd|th)?$/.exec(words[i + 1].toLowerCase());
    if (d) {
      const key = monthDay(todayKey, MONTHS[w], Number(d[1]));
      if (key) return [key, 2];
    }
  }
  const dm = /^(\d{1,2})(st|nd|rd|th)?$/.exec(w);
  if (dm && i + 1 < words.length && words[i + 1].toLowerCase() in MONTHS) {
    const key = monthDay(todayKey, MONTHS[words[i + 1].toLowerCase()], Number(dm[1]));
    if (key) return [key, 2];
  }
  return null;
}

/** "3pm" | "3:30pm" | "15:00" | "noon" | "midnight" → minutes since midnight. */
function parseTime(word: string): number | null {
  const w = word.toLowerCase();
  if (w === "noon") return 12 * 60;
  if (w === "midnight") return 23 * 60 + 59;
  const m = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/.exec(w);
  if (!m || (!m[2] && !m[3])) return null; // bare numbers are not times
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  if (m[3] === "pm" && h < 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  return h * 60 + min;
}

/**
 * Ways a course code can be abbreviated: "COMP SCI 537" answers to
 * "compsci537", "cs537" (initials), "comp537" (first word), and "537".
 */
function codeAliases(code: string): string[] {
  const words = code.toLowerCase().match(/[a-z]+|\d+[a-z]?/g) ?? [];
  const letters = words.filter((w) => /^[a-z]+$/.test(w));
  const numbers = words.filter((w) => /^\d/.test(w)).join("");
  const out = new Set<string>([letters.join("") + numbers, numbers]);
  if (letters.length > 1) {
    out.add(letters.map((w) => w[0]).join("") + numbers);
    out.add(letters[0] + numbers);
  }
  out.delete("");
  return [...out];
}

export function matchCourse(
  tag: string,
  courses: QuickAddCourse[],
  opts: { exact?: boolean } = {},
): QuickAddCourse | undefined {
  const q = normalizeCode(tag);
  if (q.length === 0) return undefined;
  const exact =
    courses.find((c) => c.nickname !== undefined && normalizeCode(c.nickname) === q) ??
    courses.find((c) => codeAliases(c.courseCode).includes(q));
  if (exact !== undefined || opts.exact) return exact;
  return (
    courses.find((c) => codeAliases(c.courseCode).some((a) => a.startsWith(q))) ??
    courses.find((c) => normalizeCode(c.name).includes(q))
  );
}

export function parseQuickAdd(
  input: string,
  courses: QuickAddCourse[],
  todayKey: string = dayKey(new Date()),
): QuickAddResult {
  const words = input.trim().split(/\s+/).filter((w) => w.length > 0);
  const tokens: QuickAddToken[] = [];
  const title: string[] = [];
  let plannedDay: string | undefined;
  let dueDay: string | undefined;
  let dueMinutes: number | undefined;
  let course: QuickAddCourse | undefined;

  for (let i = 0; i < words.length; ) {
    const w = words[i];

    if (w.startsWith("#") && w.length > 1 && course === undefined) {
      const match = matchCourse(w.slice(1), courses);
      if (match) {
        course = match;
        tokens.push({ kind: "course", text: w, course: match });
        i += 1;
        continue;
      }
    }

    if ((w.toLowerCase() === "due" || w.toLowerCase() === "by") && i + 1 < words.length) {
      const day = parseDay(words, i + 1, todayKey);
      if (day) {
        dueDay = day[0];
        tokens.push({ kind: "day", text: words.slice(i, i + 1 + day[1]).join(" "), day: day[0], due: true });
        i += 1 + day[1];
        continue;
      }
    }

    if (plannedDay === undefined) {
      const day = parseDay(words, i, todayKey);
      if (day) {
        plannedDay = day[0];
        tokens.push({ kind: "day", text: words.slice(i, i + day[1]).join(" "), day: day[0], due: false });
        i += day[1];
        continue;
      }
    }

    if (dueMinutes === undefined) {
      const at = w.toLowerCase() === "at" && i + 1 < words.length ? parseTime(words[i + 1]) : null;
      if (at !== null) {
        dueMinutes = at;
        tokens.push({ kind: "time", text: `${w} ${words[i + 1]}`, minutes: at });
        i += 2;
        continue;
      }
      const t = parseTime(w);
      if (t !== null) {
        dueMinutes = t;
        tokens.push({ kind: "time", text: w, minutes: t });
        i += 1;
        continue;
      }
    }

    title.push(w);
    tokens.push({ kind: "text", text: w });
    i += 1;
  }

  // A time implies a due date: on the explicit due day, else the planned
  // day (which then stops being a plan), else today.
  if (dueMinutes !== undefined && dueDay === undefined) {
    dueDay = plannedDay ?? todayKey;
    if (plannedDay !== undefined) plannedDay = undefined;
  }
  let dueAt: number | undefined;
  if (dueDay !== undefined) {
    dueAt = atMinute(dueDay, dueMinutes ?? 23 * 60 + 59);
  }

  return { title: title.join(" "), plannedDay, dueAt, course, tokens };
}
