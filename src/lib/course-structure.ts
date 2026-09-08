import type { ModuleWithItems } from "@/components/course/module-utils";
import { addDays, startOfMondayWeek } from "./dates";

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

/** Instructor-authored date ranges, independent of when Canvas unlocks content. */
export function teachingRange(
  title: string,
  year: number,
): { start: string; end: string } | undefined {
  if (!/^\s*week\s+\d+\b/i.test(title)) return undefined;
  const match =
    /\b(Jan\w*|Feb\w*|Mar\w*|Apr\w*|May|Jun\w*|Jul\w*|Aug\w*|Sep\w*|Oct\w*|Nov\w*|Dec\w*)\s+(\d{1,2})\s*(?:([-–—&])\s*(?:(Jan\w*|Feb\w*|Mar\w*|Apr\w*|May|Jun\w*|Jul\w*|Aug\w*|Sep\w*|Oct\w*|Nov\w*|Dec\w*)\s+)?(\d{1,2}))?/i.exec(
      title,
    );
  if (!match) return undefined;
  const month = MONTHS.indexOf(match[1].slice(0, 3).toLowerCase()) + 1;
  const endMonth = match[4]
    ? MONTHS.indexOf(match[4].slice(0, 3).toLowerCase()) + 1
    : month;
  const key = (y: number, m: number, d: number) =>
    `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const valid = (y: number, m: number, d: number) =>
    new Date(Date.UTC(y, m - 1, d)).getUTCDate() === d;
  const day = Number(match[2]);
  const endDay = Number(match[5] ?? day);
  const endYear = year + (endMonth < month ? 1 : 0);
  if (!valid(year, month, day) || !valid(endYear, endMonth, endDay))
    return undefined;
  let start = key(year, month, day);
  let end = key(endYear, endMonth, endDay);
  if (end < start) return undefined;
  // A pair of lecture dates or a single lecture date identifies a calendar
  // week; explicit ranges retain their boundaries, including Wed–Tue weeks.
  if (!match[3] || match[3] === "&") {
    start = startOfMondayWeek(start);
    end = addDays(startOfMondayWeek(end), 6);
  }
  return { start, end };
}

export function currentCourseSections(
  modules: ModuleWithItems[],
  today: string,
  year: number,
): ModuleWithItems[] {
  const current = (title: string) => {
    const range = teachingRange(title, year);
    return range !== undefined && range.start <= today && today <= range.end;
  };
  return modules.flatMap((module) => {
    if (module.state === "locked") return [];
    if (current(module.name)) return [module];
    const items = module.items.filter(
      (item) => item.type === "Page" && current(item.title),
    );
    return items.length === 0 ? [] : [{ ...module, items }];
  });
}

export function isSyllabusTitle(title: string): boolean {
  return /\bsyllabus\b/i.test(title);
}
