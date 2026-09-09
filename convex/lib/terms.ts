// Canvas marks every enrollment "active", including orientation, advising
// and student-org courses that sit in catch-all terms forever. Academic
// terms are the ones with dates, so the current term is the dated term
// containing today — or, between terms, the one that ended most recently
// (finals-week grace) or starts next.

import { DAY_MS } from "./time";

const RECENTLY_ENDED_MS = 21 * DAY_MS;

interface TermCourse {
  term?: string;
  termId?: number;
  termStartAt?: number;
  termEndAt?: number;
  enrollmentState?: "active" | "completed";
}

function isDated(course: TermCourse): boolean {
  return course.termStartAt !== undefined && course.termEndAt !== undefined;
}

function currentTermId(courses: TermCourse[], now: number): number | undefined {
  const terms = new Map<number, { startAt: number; endAt: number }>();
  for (const c of courses) {
    const { termId, termStartAt: startAt, termEndAt: endAt } = c;
    if (termId === undefined || startAt === undefined || endAt === undefined) continue;
    terms.set(termId, { startAt, endAt });
  }
  const entries = [...terms.entries()];
  if (entries.length === 0) return undefined;
  return (
    entries.find(([, t]) => t.startAt <= now && now <= t.endAt) ??
    entries
      .filter(([, t]) => t.endAt < now && now - t.endAt <= RECENTLY_ENDED_MS)
      .sort((a, b) => b[1].endAt - a[1].endAt)[0] ??
    entries.filter(([, t]) => t.startAt > now).sort((a, b) => a[1].startAt - b[1].startAt)[0] ??
    entries.sort((a, b) => b[1].endAt - a[1].endAt)[0]
  )[0];
}

// With nothing dated every active course counts as current, so a sync from
// before term dates existed degrades gracefully.
export function classifyCourses<C extends TermCourse>(courses: C[], now: number) {
  const active = courses.filter((c) => (c.enrollmentState ?? "active") === "active");
  const past = courses.filter((c) => c.enrollmentState === "completed");
  const termId = currentTermId(active, now);
  if (termId === undefined) {
    return { termName: active.find((c) => c.term)?.term, current: active, other: [], past };
  }
  const inTerm = (c: C) => c.termId === termId && isDated(c);
  const current = active.filter(inTerm);
  return { termName: current[0]?.term, current, other: active.filter((c) => !inTerm(c)), past };
}

