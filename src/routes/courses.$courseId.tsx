import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CourseHeader } from "@/components/course/course-header";
import { useCourses } from "@/lib/hooks";

export const Route = createFileRoute("/courses/$courseId")({
  component: CourseLayout,
});

function CourseLayout() {
  const { courseId } = Route.useParams();
  const canvasId = Number(courseId);
  const valid = Number.isInteger(canvasId) && canvasId > 0;
  const { byId, loading } = useCourses();
  const course = valid ? byId.get(canvasId) : undefined;
  // Only the parsed facts for the meta line — the syllabus HTML that
  // `courses.get` carries belongs to the Syllabus tab alone.
  const facts = useQuery(api.courses.facts, valid ? { canvasId } : "skip");

  if (!valid || (!loading && course === undefined)) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-[13px] text-ink-3">Course not found.</p>
        <Link to="/courses" className="text-[13px] font-medium text-ink underline underline-offset-4">
          All courses
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CourseHeader course={course} courseId={courseId} facts={facts ?? undefined} />
      <Outlet />
    </div>
  );
}
