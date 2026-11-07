import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, ArrowUpRight, ExternalLink, Search } from "lucide-react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { COURSE_CONTENT } from "./content-width";
import { revealInRow, useEdgeFade } from "./edge-fade";
import { canvasCourseUrl } from "@/lib/course-routes";
import {
  courseColorVar,
  courseLabel,
  courseStyle,
  courseTitle,
  shortCode,
  type Course,
} from "@/lib/hooks";
import { openSearch } from "@/lib/search-context";
import { CourseTag } from "@/components/app/bits";
import { HeaderTitle } from "@/components/app/page-header";
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
  // A phone leads with the short code; the full title is one quiet line under it.
  const label = course === undefined ? "" : courseLabel(course);
  const code = course === undefined ? undefined : shortCode(course);
  const term = formatTerm(course?.term);
  const subtitle = [name !== label ? name : undefined, term].filter(Boolean).join(" · ");
  const meta = [
    code,
    term,
    course?.verifiedInstructors?.[0]?.name,
    facts?.meets,
    facts?.location,
  ].filter((part): part is string => part !== undefined && part !== "");

  return (
    <header
      className="border-b border-line bg-surface"
      style={courseStyle(courseColorVar(course?.color))}
    >
      {/* Phones: code as the title (its dot carries the course colour) on the
          row with back, search and Canvas; the long title and term share one
          truncated line under it, so the tabs stay near the top. */}
      <div className="flex items-start gap-[10px] px-4 pt-[max(16px,env(safe-area-inset-top))] pb-3 md:hidden">
        <Link to="/courses" aria-label="All courses" className="-ml-1 mt-[2px] shrink-0 text-ink-3">
          <ChevronLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="flex min-w-0 items-center gap-2 text-[20px] leading-6 font-semibold tracking-[-0.02em]">
            {label === "" ? (
              <span className="text-ink-3">Course</span>
            ) : (
              <>
                <span className="size-2 shrink-0 rounded-full bg-c" aria-hidden />
                <span className="truncate">{label}</span>
                {name !== label && <span className="sr-only">: {name}</span>}
              </>
            )}
          </h1>
          {subtitle !== "" && (
            <p className="mt-[2px] truncate text-[13px] leading-[18px] text-ink-3">
              {name !== label && <span aria-hidden>{name}</span>}
              {name !== label && term !== undefined && <span aria-hidden> · </span>}
              {term}
            </p>
          )}
        </div>
        <div className="mt-[3px] ml-auto flex shrink-0 items-center gap-[14px] text-ink-3">
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

      {/* The page frame's 64px bar; the tabs sit below it. The course colour
          rides on the code tag, so the title starts at the gutter like every page's.
          Bar and tabs take the tab content's width, so "Open in Canvas" ends
          on the same right edge as every course tab's content. */}
      <div className={cn(COURSE_CONTENT, "hidden h-16 items-center gap-5 px-6 md:flex")}>
        <HeaderTitle
          className="flex-1"
          title={name || <span className="text-ink-3">Course</span>}
          subtitle={meta.map((part, i) => (
            <span key={`${i}-${part}`}>
              {i > 0 && (
                <span className="mx-[7px]" aria-hidden>
                  ·
                </span>
              )}
              {i === 0 && code !== undefined ? <CourseTag>{part}</CourseTag> : part}
            </span>
          ))}
        />
        <a
          href={canvasHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 shrink-0 items-center gap-[7px] rounded-lg border border-line px-3 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-line-2 hover:bg-hover hover:text-ink"
        >
          Open in Canvas
          <ArrowUpRight className="size-[14px] text-ink-3" />
        </a>
      </div>

      {/* A tab past either edge fades into the surface, so the row reads as
          "scroll for more". Phones run tighter gaps and a bare count on Files,
          so at common widths the next tab's first letters peek past the fade
          instead of the row ending in a gap. */}
      <div className={cn(COURSE_CONTENT, "group/tabs relative")}>
        <nav
          ref={tabsRef}
          className="flex scroll-px-4 gap-4 overflow-x-auto px-4 md:scroll-px-6 md:gap-6 md:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
        {/* Each edge covers the tab it would cut mid-word (`--cover-*`, set
            by useEdgeFade), so the visible row ends on whole tabs; a short
            fade softens the cover's inner edge. */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 bottom-[2px] left-0 w-[max(var(--cover-start,0px),16px)] bg-linear-to-r from-surface from-[calc(100%-12px)] to-transparent opacity-0 transition-[opacity,width] group-has-[[data-fade-start=true]]/tabs:opacity-100 md:w-6"
        />
        {/* "More this way": a 24px fade at the very edge, so a clipped tab's
            visible letters stay full strength. A tap brings the rest in. */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={() =>
            tabsRef.current?.scrollBy({ left: tabsRef.current.clientWidth * 0.6, behavior: "smooth" })
          }
          className="invisible absolute top-0 right-0 bottom-[2px] flex w-6 items-center justify-end bg-linear-to-l from-surface from-15% to-transparent pr-[6px] text-ink-3 group-has-[[data-fade-end=true]]/tabs:visible md:pointer-events-none [&>svg]:hidden"
        >
          <ChevronRight className="size-[14px]" />
        </button>
      </div>
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
      {n}
      {/* "new" from md up; on a phone the pill alone carries it, as the tab bar's counts do. */}
      <span className="sr-only md:not-sr-only"> new</span>
    </span>
  );
}
