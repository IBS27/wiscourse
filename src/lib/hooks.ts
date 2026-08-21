import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { dayKey, startOfDay, addDays } from "./dates";

export type Course = NonNullable<
  ReturnType<typeof useQuery<typeof api.courses.list>>
>[number];

/** Course list plus a lookup by canvasId and the CSS colour for each. */
export function useCourses() {
  const courses = useQuery(api.courses.list);
  return useMemo(() => {
    const list = courses ?? [];
    const byId = new Map(list.map((c) => [c.canvasId, c]));
    return {
      loading: courses === undefined,
      courses: list,
      visible: list.filter((c) => !c.hidden),
      byId,
      /** Short label: nickname, else a short course code, else the name. */
      label: (canvasId: number | undefined) => {
        if (canvasId === undefined) return undefined;
        const c = byId.get(canvasId);
        return c === undefined ? undefined : courseLabel(c);
      },
      color: (canvasId: number | undefined) => courseColorVar(byId.get(canvasId ?? -1)?.color),
    };
  }, [courses]);
}

/**
 * UW's Canvas often puts the full title in `courseCode` ("Career Fair
 * Preparation"); only a genuinely short code ("COMP SCI 537") is worth
 * showing beside the name.
 */
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

/** Today's day key; re-renders when the calendar day rolls over. */
export function useToday(): string {
  const [key, setKey] = useState(() => dayKey(new Date()));
  useEffect(() => {
    const next = startOfDay(addDays(key, 1)).getTime() - Date.now() + 1000;
    const t = setTimeout(() => setKey(dayKey(new Date())), next);
    return () => clearTimeout(t);
  }, [key]);
  return key;
}

/** Current time, ticking once a minute. */
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
