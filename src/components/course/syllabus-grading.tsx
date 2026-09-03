/**
 * The grading breakdown, taken from Canvas's assignment-group weights
 * rather than from whatever table the instructor typed into the syllabus.
 * Only shown when the course actually grades by weighted groups.
 */

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export function SyllabusGrading({ canvasId }: { canvasId: number }) {
  const grades = useQuery(api.grades.course, { courseCanvasId: canvasId });
  if (grades === undefined || grades === null) return null;
  if (grades.course.applyAssignmentGroupWeights !== true) return null;

  const rows = grades.groups.filter(
    (group): group is typeof group & { groupWeight: number } => group.groupWeight !== undefined,
  );
  if (rows.length === 0) return null;

  return (
    <section className="px-4 pt-5 md:px-5">
      <h2 className="mb-[6px] text-[15px] font-semibold tracking-[-0.01em]">Grading</h2>
      <table className="w-full max-w-[520px] border-collapse text-[13px]">
        <thead>
          <tr>
            <th className="border-b border-line px-2 py-[6px] text-left font-medium text-ink-2">
              Component
            </th>
            <th className="w-24 border-b border-line px-2 py-[6px] text-right font-medium text-ink-2">
              Weight
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((group) => (
            <tr key={group.canvasId}>
              <td className="border-b border-line px-2 py-[6px]">{group.name}</td>
              <td className="tabular border-b border-line px-2 py-[6px] text-right">
                {group.groupWeight}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
