import { createFileRoute, Link } from "@tanstack/react-router";
import { CourseGradebook } from "@/components/grades/gradebook";

export const Route = createFileRoute("/grades/$courseId")({
  component: GradesCourse,
});

function GradesCourse() {
  const { courseId } = Route.useParams();
  const canvasId = Number(courseId);

  if (!Number.isInteger(canvasId) || canvasId <= 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-[13px] text-ink-3">Course not found.</p>
        <Link to="/grades" className="text-[13px] font-medium text-ink underline underline-offset-4">
          All grades
        </Link>
      </div>
    );
  }

  // Keyed so what-if edits never leak from one course into the next.
  return <CourseGradebook key={canvasId} courseCanvasId={canvasId} />;
}
