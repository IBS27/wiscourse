import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { ChevronLeft, ExternalLink, Search } from "lucide-react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { EDGE_FADE, revealInRow, useEdgeFade } from "./edge-fade";
import { canvasCourseUrl } from "@/lib/course-routes";
import { courseColorVar, courseStyle, courseTitle, shortCode, type Course } from "@/lib/hooks";
import { openSearch } from "@/lib/search-context";
import { formatTerm } from "@/lib/terms";
import { useSyncInfo } from "@/lib/sync-info";
import { cn } from "@/lib/utils";

type CourseFacts = NonNullable<FunctionReturnType<typeof api.courses.facts>>;

export function CourseHeader({
  course,
  courseId,
  facts,
}: {
  /** Undefined while `courses.list` is still in flight. */
  course: Course | undefined;
  /** The route param — the Canvas course id in string form. */
  courseId: string;
  facts?: CourseFacts;
}) {
  const canvasId = Number(courseId);
  const sync = useSyncInfo();
  const canvasHref = canvasCourseUrl(courseId, sync?.instance);
  const hub = useQuery(api.courses.hub, Number.isFinite(canvasId) ? { canvasId } : "skip");
  const tabsRef = useEdgeFade<HTMLElement>();
  const pathname = useLocation({ select: (location) => location.pathname });

  // On a phone the open tab can sit past the edge (Syllabus, Grades). The
  // Files count widens the row once the hub loads, so look again then.
  const badges = hub?.newFiles;
  useEffect(() => {
    const nav = tabsRef.current;
    const tab = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && tab) revealInRow(nav, tab);
  }, [pathname, badges, tabsRef]);

  const name = course === undefined ? "" : courseTitle(course);
  const code = course === undefined ? undefined : shortCode(course);
  const term = formatTerm(course?.term);
  const meta = [
    code,
    term,
    course?.verifiedInstructors?.[0]?.name,
    facts?.meets,
    facts?.location,
  ].filter((part): part is string => part !== undefined && part !== "");

  return (
    <header
      className="border-b border-line"
      style={courseStyle(courseColorVar(course?.color))}
    >
      <div className="flex items-center gap-[10px] px-4 pt-2 pb-[10px] md:hidden">
        <Link to="/courses" aria-label="All courses" className="shrink-0 text-ink-3">
          <ChevronLeft className="size-5" />
        </Link>
        <div className="min-w-0">
          <div className="line-clamp-2 text-[17px] leading-[1.25] font-semibold tracking-[-0.02em]">
            {name || <span className="text-ink-3">Course</span>}
          </div>
          <div className="mt-[2px] truncate text-[12.5px] text-ink-3">
            {code !== undefined && <span className="font-medium text-ink-2">{code}</span>}
            {code !== undefined && term !== undefined && " · "}
            {term}
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-[10px] text-ink-3">
          <button
            type="button"
            aria-label="Search this course"
            onClick={() => openSearch({ courseId: canvasId })}
          >
            <Search className="size-[18px]" />
          </button>
          <a href={canvasHref} target="_blank" rel="noreferrer" aria-label="Open in Canvas">
            <ExternalLink className="size-[18px]" />
          </a>
        </div>
      </div>

      <div className="hidden items-start gap-3 px-6 pt-5 md:flex">
        <span className="mt-[9px] size-[10px] shrink-0 rounded-full bg-c" aria-hidden />
        <div className="min-w-0">
          <h1 className="truncate text-[22px] leading-[1.2] font-semibold tracking-[-0.02em]">
            {name || <span className="text-ink-3">Course</span>}
          </h1>
          <div className="mt-1 flex items-center gap-[7px] text-[12.5px] text-ink-3">
            {meta.map((part, i) => (
              <span key={`${i}-${part}`} className="contents">
                {i > 0 && <span aria-hidden>·</span>}
                <span className={cn("truncate", i === 0 && code !== undefined && "font-medium text-ink-2")}>
                  {part}
                </span>
              </span>
            ))}
          </div>
        </div>
        <a
          href={canvasHref}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex h-8 shrink-0 items-center gap-[7px] rounded-lg border border-line px-3 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-line-2 hover:bg-hover hover:text-ink"
        >
          <ExternalLink className="size-[14px]" />
          Open in Canvas
        </a>
      </div>

      <nav
        ref={tabsRef}
        className={cn(
          "mt-1 flex scroll-px-4 gap-5 overflow-x-auto px-4 md:mt-4 md:scroll-px-6 md:gap-6 md:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          EDGE_FADE,
        )}
      >
        <Tab to="/courses/$courseId" courseId={courseId} label="Overview" exact />
        <Tab to="/courses/$courseId/modules" courseId={courseId} label="Modules" />
        <Tab
          to="/courses/$courseId/files"
          courseId={courseId}
          label="Files"
          badge={
            hub !== undefined && hub !== null && hub.newFiles > 0 && <TabCount n={hub.newFiles} />
          }
        />
        <Tab to="/courses/$courseId/announcements" courseId={courseId} label="Announcements" />
        <Tab to="/courses/$courseId/syllabus" courseId={courseId} label="Syllabus" />
        <Tab to="/courses/$courseId/grades" courseId={courseId} label="Grades" />
      </nav>
    </header>
  );
}

type TabPath =
  | "/courses/$courseId"
  | "/courses/$courseId/modules"
  | "/courses/$courseId/files"
  | "/courses/$courseId/announcements"
  | "/courses/$courseId/syllabus"
  | "/courses/$courseId/grades"
  | "/courses/$courseId/interpretation";

function Tab({
  to,
  courseId,
  label,
  exact = false,
  badge,
}: {
  to: TabPath;
  courseId: string;
  label: string;
  exact?: boolean;
  badge?: ReactNode;
}) {
  return (
    <Link
      to={to}
      params={{ courseId }}
      activeOptions={{ exact, includeSearch: false, includeHash: false }}
      className="group -mb-px flex shrink-0 items-center gap-[6px] border-b-2 border-transparent pt-2 pb-[10px] text-[13px] font-medium text-ink-3 transition-colors outline-none hover:border-line-2 hover:text-ink focus-visible:text-ink"
      activeProps={{ className: "border-ink! text-ink!" }}
    >
      {label}
      {badge}
    </Link>
  );
}

function TabCount({ n }: { n: number }) {
  return (
    <span className="tabular rounded-full bg-chip px-[6px] py-px text-[10.5px] font-semibold text-ink-3">
      {n} new
    </span>
  );
}
