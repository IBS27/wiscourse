import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { dayKeyOf, startOfDay, addDays } from "./dates";
import { classifyCourses, formatTerm } from "./terms";
import { useDisplayTimeZone } from "./time-zone";

export type Course = NonNullable<
  ReturnType<typeof useQuery<typeof api.courses.list>>
>[number];

/**
 * Every consumer says which set it means: `visible` (this term, not hidden),
 * `other` (active but outside it: orientation, advising, student orgs),
 * `filterable` (visible + other — what a course picker offers), `past`,
 * `active` (hidden included) or `courses` for all of them.
 */
export function useCourses() {
  const courses = useQuery(api.courses.list);
  // Term boundaries move by days, so one reading per mount is plenty.
  const [now] = useState(() => Date.now());
  return useMemo(() => {
    const list = courses ?? [];
    const byId = new Map(list.map((c) => [c.canvasId, c]));
    const sets = classifyCourses(list, now);
    const visible = sets.current.filter((c) => !c.hidden);
    const other = sets.other.filter((c) => !c.hidden);
    return {
      loading: courses === undefined,
      courses: list,
      current: sets.current,
      active: [...sets.current, ...sets.other],
      past: sets.past,
      termName: formatTerm(sets.termName),
      visible,
      other,
      filterable: [...visible, ...other],
      byId,
      label: (canvasId: number | undefined) => {
        const c = canvasId === undefined ? undefined : byId.get(canvasId);
        return c === undefined ? undefined : courseLabel(c);
      },
      color: (canvasId: number | undefined) => courseColorVar(byId.get(canvasId ?? -1)?.color),
    };
  }, [courses, now]);
}

// UW's Canvas often puts the full title in `courseCode` ("Career Fair
// Preparation"); only a genuinely short code is worth showing beside a name.
export function shortCode(c: { name: string; courseCode: string }): string | undefined {
  const code = c.courseCode.trim();
  if (code.length === 0 || code.length > 14 || code === c.name.trim()) return undefined;
  return code;
}

export function courseLabel(c: { name: string; courseCode: string; nickname?: string }): string {
  return c.nickname ?? shortCode(c) ?? c.name;
}

/** Sets the `--c` course colour for a subtree. */
export function courseStyle(color: string): CSSProperties {
  return { "--c": color } as CSSProperties;
}

export function courseColorVar(color: string | undefined): string {
  return color === undefined ? "var(--course-none)" : `var(--course-${color})`;
}

// Today's day key as an external store: `getSnapshot` reads the clock
// through the display zone (so a zone override moves "today"), and the
// subscription wakes every subscriber at the next midnight.
function todaySnapshot(): string {
  return dayKeyOf(Date.now());
}
function subscribeToday(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    const next = startOfDay(addDays(todaySnapshot(), 1)).getTime() - Date.now() + 1000;
    timer = setTimeout(() => {
      onChange();
      arm();
    }, Math.max(next, 1000));
  };
  arm();
  return () => clearTimeout(timer);
}

/** Today's day key; re-renders when the calendar day rolls over or the zone changes. */
export function useToday(): string {
  useDisplayTimeZone(); // a zone change re-renders, and the snapshot re-reads through it
  return useSyncExternalStore(subscribeToday, todaySnapshot, todaySnapshot);
}

export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** True below Tailwind's `md` breakpoint. */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 767px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setMobile(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return mobile;
}
