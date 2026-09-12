import { createFileRoute } from "@tanstack/react-router";
import { CourseGradebook } from "@/components/grades/gradebook";

export const Route = createFileRoute("/courses/$courseId/grades")({
  component: CourseGrades,
});

function CourseGrades() {
  const { courseId } = Route.useParams();
  const canvasId = Number(courseId);
  if (!Number.isInteger(canvasId) || canvasId <= 0) {
    return <div className="p-4 text-[13px] text-ink-3 md:p-5">Course not found.</div>;
  }
  // The hub header is already overhead, so the gradebook renders without its own.
  return <CourseGradebook key={canvasId} courseCanvasId={canvasId} embedded />;
}
