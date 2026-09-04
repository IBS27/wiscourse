import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Search } from "lucide-react";
import { Logo } from "@/components/logo";
import { CountBadge, Dot, Kbd } from "./bits";
import { NAV, useNavCounts } from "./nav";
import { ProfileMenu } from "./profile-menu";
import { courseColorVar, courseStyle, shortCode, useCourses } from "@/lib/hooks";
import { openSearch } from "@/lib/search-context";
import { cn } from "@/lib/utils";
import type { Course } from "@/lib/hooks";

export function Sidebar() {
  const { visible, other, termName } = useCourses();
  const counts = useNavCounts();

  return (
    <aside className="hidden h-dvh w-[238px] shrink-0 flex-col border-r border-line bg-sidebar px-[10px] pt-[14px] pb-3 md:flex">
      <div className="flex items-center justify-between px-[6px] pt-[2px] pb-4">
        <Link to="/" className="text-[16px]">
          <Logo />
        </Link>
        <button
          type="button"
          onClick={() => openSearch()}
          aria-label="Search"
          className="group flex items-center gap-[6px] text-ink-3 hover:text-ink-2"
        >
          <Search className="size-[14px]" />
          <Kbd className="group-hover:text-ink-2">⌘K</Kbd>
        </button>
      </div>

      <nav className="flex flex-col gap-px">
        {NAV.map(({ to, label, icon: Icon, ...rest }) => {
          const n = to === "/" ? counts.home : to === "/inbox" ? counts.inbox : 0;
          return (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: "exact" in rest && rest.exact }}
              className="flex h-8 items-center gap-[10px] rounded-lg px-2 text-[13.5px] font-medium text-ink-2 hover:bg-hover"
              activeProps={{
                className: "bg-surface text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-surface",
              }}
            >
              <Icon className="size-4" />
              {label}
              <CountBadge n={n} className="ml-auto" />
            </Link>
          );
        })}
      </nav>

      {visible.length > 0 && (
        <>
          <div className="flex items-center justify-between px-2 pt-[22px] pb-[7px] text-[10.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
            <span>Courses</span>
            {termName && <span>{termName}</span>}
          </div>
          <div className="flex flex-col">
            {visible.map((c) => (
              <CourseLink key={c.canvasId} course={c} />
            ))}
          </div>
        </>
      )}
      {other.length > 0 && <OtherCourses courses={other} />}

      <div className="mt-auto">
        <ProfileMenu />
      </div>
    </aside>
  );
}

function CourseLink({ course: c }: { course: Course }) {
  return (
    <Link
      to="/courses/$courseId"
      params={{ courseId: String(c.canvasId) }}
      className="flex h-[29px] items-center gap-[9px] rounded-lg px-2 text-[13px] text-ink-2 hover:bg-hover"
      activeProps={{
        className: "bg-surface text-ink! shadow-[inset_0_0_0_1px_var(--line)] hover:bg-surface",
      }}
      style={courseStyle(courseColorVar(c.color))}
    >
      <Dot />
      <span className="min-w-0 flex-1 truncate">{c.nickname ?? c.name}</span>
      {shortCode(c) && <span className="shrink-0 text-[11px] text-ink-3">{shortCode(c)}</span>}
    </Link>
  );
}

// Orientation, advising and student-org courses Canvas keeps "active"
// forever, folded so the term's real courses own the sidebar.
function OtherCourses({ courses }: { courses: Course[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-[14px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-7 w-full items-center gap-[6px] rounded-lg px-2 text-[10.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase hover:bg-hover hover:text-ink-2"
      >
        <ChevronRight
          className={cn("size-[12px] transition-transform", open && "rotate-90")}
          aria-hidden
        />
        <span>Other</span>
        <span className="ml-auto text-[11px] font-medium tracking-normal normal-case">
          {courses.length}
        </span>
      </button>
      {open && (
        <div className="flex flex-col">
          {courses.map((c) => (
            <CourseLink key={c.canvasId} course={c} />
          ))}
        </div>
      )}
    </div>
  );
}
