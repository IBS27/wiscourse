import { useEffect } from "react";
import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { FolderOpen, Layers } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { ModuleAccordion } from "@/components/course/module-accordion";
import { ModuleTimeline } from "@/components/course/module-timeline";
import { useModuleRowContext } from "@/components/course/module-context";
import { shouldUseTimeline, type ModuleWithItems } from "@/components/course/module-utils";
import { dayKeyOf } from "@/lib/dates";
import { courseColorVar, courseStyle, useCourses, useToday } from "@/lib/hooks";

export const Route = createFileRoute("/courses/$courseId/modules")({
  component: CourseModules,
});

/**
 * Two readings of the same data: a week timeline (2-C) when the instructor
 * dated the course, an accordion (1-A) when they did not. The data decides,
 * never a setting — see `shouldUseTimeline`.
 */
function CourseModules() {
  const { courseId } = Route.useParams();
  const canvasId = Number(courseId);
  const valid = Number.isFinite(canvasId);
  const modules = useQuery(api.modules.listByCourse, valid ? { courseCanvasId: canvasId } : "skip");
  const { byId, loading: coursesLoading } = useCourses();
  const ctx = useModuleRowContext(courseId);
  const todayKey = useToday();
  const focus = useHashFocus(modules);

  const course = byId.get(canvasId);
  const startKey = course?.startAt === undefined ? undefined : dayKeyOf(course.startAt);

  return (
    // A list page: 960px of content at the 24px gutter, rules inset with it.
    <div className="w-full max-w-[1008px] flex-1" style={courseStyle(courseColorVar(course?.color))}>
      {/* The course row decides the week numbers, and so decides whether the
          timeline is worth showing at all. */}
      {modules === undefined || coursesLoading || ctx.seenLoading ? (
        <ModulesSkeleton />
      ) : modules.length === 0 ? (
        <EmptyModules courseId={courseId} />
      ) : shouldUseTimeline(modules, startKey) ? (
        // Keyed on the course: the router reuses this component across a
        // param change, so open modules would otherwise carry over.
        <ModuleTimeline
          key={courseId}
          modules={modules}
          ctx={ctx}
          courseStartKey={startKey}
          todayKey={todayKey}
        />
      ) : (
        <ModuleAccordion key={courseId} modules={modules} ctx={ctx} focusModuleId={focus} />
      )}
    </div>
  );
}

/**
 * `#module-<id>` and `#item-<id>` are how every other surface links into
 * this one. Both open the module holding the target and scroll to it.
 */
function useHashFocus(modules: ModuleWithItems[] | undefined): number | undefined {
  const hash = useRouterState({ select: (state) => state.location.hash });
  const moduleMatch = /^module-(\d+)$/.exec(hash);
  const itemMatch = /^item-(\d+)$/.exec(hash);
  const itemId = itemMatch === null ? undefined : Number(itemMatch[1]);

  let moduleCanvasId = moduleMatch === null ? undefined : Number(moduleMatch[1]);
  if (itemId !== undefined && modules !== undefined) {
    moduleCanvasId = modules.find((m) => m.items.some((i) => i.canvasId === itemId))?.canvasId;
  }
  const elementId = hash === "" ? undefined : hash;

  const ready = modules !== undefined;
  useEffect(() => {
    if (elementId === undefined || !ready) return;
    // One frame so the accordion has opened the target module first.
    const frame = requestAnimationFrame(() => {
      document.getElementById(elementId)?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [elementId, ready, moduleCanvasId]);

  return moduleCanvasId;
}

function EmptyModules({ courseId }: { courseId: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-20 text-center">
      <Layers className="size-5 text-ink-3" aria-hidden />
      <p className="text-[13px] text-ink-2">This course has no modules.</p>
      <p className="mb-2 text-[12.5px] text-ink-3">Its material may live in Files instead.</p>
      <Link
        to="/courses/$courseId/files"
        params={{ courseId }}
        className="inline-flex h-8 items-center gap-[7px] rounded-lg border border-line px-3 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-line-2 hover:bg-hover hover:text-ink"
      >
        <FolderOpen className="size-[14px]" />
        Browse files
      </Link>
    </div>
  );
}

function ModulesSkeleton() {
  return (
    <div className="animate-pulse">
      {[0, 1, 2].map((section) => (
        <div key={section} className="relative px-4 py-[15px] after:absolute after:right-4 after:bottom-0 after:left-4 after:h-px after:bg-line md:px-6 md:after:right-6 md:after:left-6">
          <div className="h-[15px] w-52 rounded bg-chip" />
          {section === 0 &&
            [0, 1, 2, 3].map((row) => (
              <div key={row} className="mt-[14px] flex items-center gap-[10px] pl-[26px]">
                <div className="size-[14px] rounded bg-chip" />
                <div className="h-[13px] max-w-[340px] flex-1 rounded bg-chip" />
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
