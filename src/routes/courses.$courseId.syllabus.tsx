import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Link } from "@tanstack/react-router";
import { isSyllabusTitle } from "@/lib/course-structure";
import { fileHref, moduleHref, pageHref } from "@/lib/course-routes";
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

  const modules = useQuery(api.modules.listByCourse, {
    courseCanvasId: canvasId,
  });
  const pages = useQuery(api.pages.listByCourse, { courseCanvasId: canvasId });
  const files = useQuery(api.files.tree, { courseCanvasId: canvasId });
  const front = useQuery(api.pages.front, { courseCanvasId: canvasId });
  const sources = new Map<string, string>();
  for (const module of modules ?? []) {
    if (isSyllabusTitle(module.name))
      sources.set(moduleHref(courseId, module.canvasId), module.name);
    for (const item of module.items) {
      if (!isSyllabusTitle(item.title)) continue;
      if (item.type === "Page" && item.pageUrl)
        sources.set(pageHref(courseId, item.pageUrl), item.title);
      if (item.type === "File" && item.contentCanvasId !== undefined)
        sources.set(fileHref(courseId, item.contentCanvasId), item.title);
    }
  }
  for (const page of pages ?? []) {
    if (isSyllabusTitle(page.title))
      sources.set(pageHref(courseId, page.url), page.title);
  }
  for (const file of files?.files ?? []) {
    if (
      isSyllabusTitle(file.displayName) &&
      !file.lockedForUser &&
      !file.hidden
    )
      sources.set(fileHref(courseId, file.canvasId), file.displayName);
  }
  const loading =
    modules === undefined ||
    pages === undefined ||
    files === undefined ||
    front === undefined;
  const body = detail?.syllabusBody;
  const hasBody = body !== undefined && body.trim() !== "";

  return (
    <div
      className="min-w-0 flex-1 pb-8"
      style={courseStyle(courseColorVar(course?.color))}
    >
      <SyllabusFacts course={course} facts={facts ?? undefined} />
      <SyllabusGrading canvasId={canvasId} />
      {detail === undefined ? null : hasBody ? (
        <div className="max-w-[760px] px-4 pt-5 md:px-5">
          <CanvasHtml html={body} courseId={canvasId} />
        </div>
      ) : loading ? null : sources.size > 0 ? (
        <div className="space-y-3 px-4 pt-5 md:px-5">
          <p className="text-[13px] text-ink-3">
            Syllabus and course information
          </p>
          {[...sources].map(([to, title]) => (
            <Link key={to} to={to} className="block text-sm underline">
              {title}
            </Link>
          ))}
        </div>
      ) : front ? (
        <div className="px-4 pt-5 md:px-5">
          <p className="mb-3 text-[13px] text-ink-3">
            Check the instructor’s course home for policies and course
            information.
          </p>
          <Link
            to={pageHref(courseId, front.url)}
            className="text-sm underline"
          >
            {front.title}
          </Link>
        </div>
      ) : (
        <p className="px-4 pt-5 text-[13px] text-ink-3 md:px-5">
          No syllabus link found in synced course content.
        </p>
      )}
    </div>
  );
}
