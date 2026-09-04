import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { OverviewDue } from "@/components/course/overview-due";
import { OverviewRail } from "@/components/course/overview-rail";
import { OverviewWeek } from "@/components/course/overview-week";
import { useFeed } from "@/lib/feed";
import { courseColorVar, courseStyle, useCourses, useNow, useToday } from "@/lib/hooks";

export const Route = createFileRoute("/courses/$courseId/")({
  component: CourseOverview,
});

function CourseOverview() {
  const { courseId } = Route.useParams();
  const canvasId = Number(courseId);
  const today = useToday();
  const now = useNow();
  const { byId } = useCourses();
  const course = byId.get(canvasId);

  const facts = useQuery(api.courses.facts, { canvasId });
  const hub = useQuery(api.courses.hub, { canvasId });
  const modules = useQuery(api.modules.listByCourse, { courseCanvasId: canvasId });
  const todos = useQuery(api.todos.list, {});
  const feed = useFeed();

  return (
    <div
      className="flex min-h-0 flex-1 flex-col lg:flex-row"
      style={courseStyle(courseColorVar(course?.color))}
    >
      <div className="min-w-0 flex-1 pb-6">
        <OverviewDue todos={todos} canvasId={canvasId} now={now} />
        <OverviewWeek
          courseId={courseId}
          canvasId={canvasId}
          modules={modules}
          todos={todos}
          todayKey={today}
        />
      </div>
      <OverviewRail
        courseId={courseId}
        canvasId={canvasId}
        course={course}
        facts={facts ?? undefined}
        hub={hub}
        feed={feed}
        now={now}
      />
    </div>
  );
}
