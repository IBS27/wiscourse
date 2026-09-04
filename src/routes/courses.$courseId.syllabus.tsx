import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CanvasHtml } from "@/components/reader/canvas-html";
import { SyllabusFacts } from "@/components/course/syllabus-facts";
import { SyllabusGrading } from "@/components/course/syllabus-grading";
import { courseColorVar, courseStyle, useCourses } from "@/lib/hooks";

export const Route = createFileRoute("/courses/$courseId/syllabus")({
  component: CourseSyllabus,
});

function CourseSyllabus() {
  const { courseId } = Route.useParams();
  const canvasId = Number(courseId);
  const { byId } = useCourses();
  const course = byId.get(canvasId);
  const detail = useQuery(api.courses.get, { canvasId });
  const facts = useQuery(api.courses.facts, { canvasId });

  const body = detail?.syllabusBody;
  const hasBody = body !== undefined && body.trim() !== "";

  return (
    <div className="min-w-0 flex-1 pb-8" style={courseStyle(courseColorVar(course?.color))}>
      <SyllabusFacts course={course} facts={facts ?? undefined} />
      <SyllabusGrading canvasId={canvasId} />
      {detail === undefined ? null : hasBody ? (
        <div className="max-w-[760px] px-4 pt-5 md:px-5">
          <CanvasHtml html={body} courseId={canvasId} />
        </div>
      ) : (
        <p className="px-4 pt-5 text-[13px] text-ink-3 md:px-5">No syllabus.</p>
      )}
    </div>
  );
}
