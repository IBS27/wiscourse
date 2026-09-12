import type { ReactNode } from "react";
import { LedgerFold } from "./ledger-fold";
import { LedgerPastRow } from "./ledger-row";
import type { Course } from "@/lib/hooks";
import { formatTerm } from "@/lib/terms";

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
  return (
    <>
      {groupByTerm(courses).map((group) => (
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
    </>
  );
}

// Canvas terms carry no ordering field we can trust, so groups sort by the
// latest course end date they contain.
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
    .sort((a, b) => b.endAt - a.endAt);
}
