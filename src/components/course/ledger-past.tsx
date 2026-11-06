import type { ReactNode } from "react";
import { LedgerFold } from "./ledger-fold";
import { LedgerPastRow } from "./ledger-row";
import type { Course } from "@/lib/hooks";
import { formatTerm, termSortKey } from "@/lib/terms";

export function LedgerPastTerms({
  courses,
  color,
  renderRow,
}: {
  courses: Course[];
  color: (canvasId: number) => string;
  /** Grades reads the same folds with a final-letter row of its own. */
  renderRow?: (course: Course) => ReactNode;
}) {
  const groups = groupByTerm(courses);
  if (groups.length === 0) return null;
  return (
    <section aria-labelledby="past-terms" className="pt-6">
      <h2
        id="past-terms"
        className="px-4 pb-1 text-[13px] font-semibold tracking-[-0.005em] text-ink md:px-6"
      >
        Past terms
      </h2>
      {groups.map((group) => (
        <LedgerFold
          key={group.term}
          label={formatTerm(group.term) ?? group.term}
          count={group.courses.length}
        >
          {group.courses.map((course) =>
            renderRow !== undefined ? (
              renderRow(course)
            ) : (
              <LedgerPastRow key={course.canvasId} course={course} color={color(course.canvasId)} />
            ),
          )}
        </LedgerFold>
      ))}
    </section>
  );
}

// Seasonal terms sort newest first by their real calendar season; terms with
// no season ("Ongoing") follow, by the latest end date they contain.
function groupByTerm(courses: Course[]): { term: string; courses: Course[] }[] {
  const byTerm = new Map<string, Course[]>();
  for (const course of courses) {
    const term = course.term ?? "Earlier";
    const bucket = byTerm.get(term);
    if (bucket) bucket.push(course);
    else byTerm.set(term, [course]);
  }
  return [...byTerm.entries()]
    .map(([term, list]) => ({
      term,
      courses: list,
      endAt: Math.max(...list.map((c) => c.endAt ?? c.startAt ?? 0)),
    }))
    .sort((a, b) => {
      const ka = termSortKey(a.term);
      const kb = termSortKey(b.term);
      if (ka !== undefined && kb !== undefined) return kb - ka;
      if (ka !== undefined) return -1;
      if (kb !== undefined) return 1;
      return b.endAt - a.endAt;
    });
}
