import type { ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import type { Course } from "@/lib/hooks";
import { leadInstructor } from "@/lib/instructors";

type CourseFacts = NonNullable<FunctionReturnType<typeof api.courses.facts>>;

// Parsed heuristically out of the syllabus, so any cell may be missing —
// and a labelled empty cell is worse than no cell.

export function SyllabusFacts({
  course,
  facts,
}: {
  course: Course | undefined;
  facts: CourseFacts | undefined;
}) {
  const lead = leadInstructor(course);

  const cells: { label: string; value: ReactNode; sub?: ReactNode }[] = [];
  if (lead !== undefined) {
    cells.push({
      label: "Instructor",
      value: lead.name,
      sub:
        lead.email === undefined ? undefined : (
          <a href={`mailto:${lead.email}`} className="hover:text-ink">
            {lead.email}
          </a>
        ),
    });
  }
  if (facts?.meets !== undefined) {
    cells.push({ label: "Meets", value: facts.meets, sub: facts.location });
  }
  if (facts?.officeHours !== undefined) {
    cells.push({ label: "Office hours", value: facts.officeHours });
  }
  if (facts?.textbook !== undefined) {
    cells.push({ label: "Textbook", value: facts.textbook });
  }
  if (cells.length === 0) return null;

  return (
    <div className="grid gap-3 border-b border-line px-4 py-4 sm:grid-cols-2 md:px-5 lg:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.label} className="min-w-0 text-[12.5px] text-ink-2">
          <div className="eyebrow mb-1">{cell.label}</div>
          {cell.value}
          {cell.sub !== undefined && <div className="text-ink-3">{cell.sub}</div>}
        </div>
      ))}
    </div>
  );
}
