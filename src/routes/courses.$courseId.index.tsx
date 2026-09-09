import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { CanvasHtml } from "@/components/reader/canvas-html";
import { SectionHead } from "@/components/course/overview-row";
import { OverviewDue } from "@/components/course/overview-due";
import { OverviewRail } from "@/components/course/overview-rail";
import { InterpretedOverview } from "@/components/course/interpreted-overview";
import { usableInterpretation } from "@/lib/interpreted-course";
import { Link } from "@tanstack/react-router";
import { OverviewWeek } from "@/components/course/overview-week";
import {
  courseColorVar,
  courseStyle,
  useCourses,
  useNow,
  useToday,
} from "@/lib/hooks";

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

  const front = useQuery(api.pages.front, { courseCanvasId: canvasId });
  const facts = useQuery(api.courses.facts, { canvasId });
  const hub = useQuery(api.courses.hub, { canvasId });
  const modules = useQuery(api.modules.listByCourse, {
    courseCanvasId: canvasId,
  });
  const todos = useQuery(api.todos.list, {});
  const feed = useQuery(api.inbox.feed);
  const interpretation = useQuery(api.courseInterpretations.get, {
    courseCanvasId: canvasId,
  });
  const interpreted = usableInterpretation(interpretation?.state)
    ? interpretation.state
    : null;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col lg:flex-row"
      style={courseStyle(courseColorVar(course?.color))}
    >
      <div className="min-w-0 flex-1 pb-6">
        <OverviewDue todos={todos} canvasId={canvasId} now={now} />
        {interpreted ? (
          <InterpretedOverview
            key={courseId}
            map={interpreted.map}
            resources={interpreted.resources}
            modules={modules ?? []}
            courseId={courseId}
            today={today}
          />
        ) : (
          <>
            {interpretation?.state?.map && (
              <p className="px-5 pb-4 text-xs text-ink-3">
                Course material changed. Showing the original course
                organization until its interpretation is refreshed.{" "}
                <Link
                  to="/courses/$courseId/interpretation"
                  params={{ courseId }}
                  className="underline"
                >
                  Review interpretation
                </Link>
              </p>
            )}
            {!interpretation?.state?.map && (
              <div className="px-5 pb-4">
                <Link
                  to="/courses/$courseId/interpretation"
                  params={{ courseId }}
                  className="text-xs text-ink-3 underline"
                >
                  Organize this course
                </Link>
              </div>
            )}
            {course?.defaultView === "wiki" && front && (
              <section className="px-4 pb-5 md:px-5">
                <SectionHead title="Course home" />
                {front.contentUnavailable || front.lockedForUser ? (
                  <a
                    href={front.htmlUrl}
                    className="text-sm underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open course home in Canvas
                  </a>
                ) : (
                  <CanvasHtml html={front.body ?? ""} courseId={canvasId} />
                )}
              </section>
            )}
            <OverviewWeek
              courseId={courseId}
              canvasId={canvasId}
              modules={modules}
              todos={todos}
              todayKey={today}
              courseYear={new Date(
                course?.startAt ?? course?.termStartAt ?? now,
              ).getFullYear()}
            />
          </>
        )}
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
