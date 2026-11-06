import { useInboxFeed, useTodoList } from "@/lib/list-queries";
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
import { Info, Sparkles } from "lucide-react";
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
  const todos = useTodoList();
  const feed = useInboxFeed();
  const interpretation = useQuery(api.courseInterpretations.get, {
    courseCanvasId: canvasId,
  });
  const interpreted = usableInterpretation(interpretation?.state)
    ? interpretation.state
    : null;
  const staleMap =
    !!interpretation?.state?.map &&
    interpretation.state.resultRevision !== interpretation.state.sourceRevision;

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
            {staleMap && (
              <p className="mx-4 mt-5 flex items-start gap-[10px] rounded-[10px] border border-line bg-sunken px-3 py-[10px] text-[12.5px] leading-[1.5] text-ink-2 md:mx-6">
                <Info className="mt-[2px] size-[14px] shrink-0 text-ink-3" aria-hidden />
                <span>
                  Course material changed. Showing the original course
                  organization until its interpretation is refreshed.{" "}
                  <Link
                    to="/courses/$courseId/interpretation"
                    params={{ courseId }}
                    className="font-medium text-ink underline decoration-line-2 underline-offset-4 hover:decoration-ink-3"
                  >
                    Review AI grouping
                  </Link>
                </span>
              </p>
            )}
            {course?.defaultView === "wiki" && front && (
              <section className="px-4 pb-5 md:px-6">
                <SectionHead title="Course home" className="px-0 md:px-0" />
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
            {!staleMap && (
              <Link
                to="/courses/$courseId/interpretation"
                params={{ courseId }}
                className="mx-4 mt-6 inline-flex items-center gap-[6px] rounded-md px-2 py-1 text-[12.5px] text-ink-3 transition-colors hover:bg-hover hover:text-ink md:mx-[18px]"
              >
                <Sparkles className="size-[14px]" aria-hidden />
                {interpretation?.state?.map ? "Review AI grouping" : "Organize this course"}
              </Link>
            )}
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
