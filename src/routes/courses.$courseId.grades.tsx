import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/courses/$courseId/grades")({
  component: CourseGrades,
});

function CourseGrades() {
  return (
    <div className="min-w-0 flex-1 p-4 md:p-5">
      <p className="text-[13px] text-ink-3">
        Every posted grade you have is on the Grades page.
      </p>
      <Link
        to="/grades"
        className="mt-3 inline-flex h-[31px] items-center gap-[7px] rounded-lg border border-line px-3 text-[12.5px] font-medium text-ink-2 no-underline hover:bg-hover"
      >
        Open Grades
        <ArrowRight className="size-[14px]" />
      </Link>
    </div>
  );
}
