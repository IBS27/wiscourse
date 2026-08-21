import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Logo } from "@/components/logo";
import { CountBadge, Dot } from "./bits";
import { NAV, useNavCounts } from "./nav";
import { ProfileMenu } from "./profile-menu";
import { courseColorVar, courseStyle, shortCode, useCourses } from "@/lib/hooks";

export function Sidebar() {
  const { visible } = useCourses();
  const counts = useNavCounts();
  const term = visible.find((c) => c.term)?.term;

  return (
    <aside className="hidden h-dvh w-[238px] shrink-0 flex-col border-r border-line bg-sidebar px-[10px] pt-[14px] pb-3 md:flex">
      <div className="flex items-center justify-between px-[6px] pt-[2px] pb-4">
        <Link to="/" className="text-[16px]">
          <Logo />
        </Link>
        <Search className="size-[14px] text-ink-3" aria-hidden />
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
            {term && <span>{term}</span>}
          </div>
          <div className="flex flex-col">
            {visible.map((c) => (
              <Link
                key={c.canvasId}
                to="/courses"
                className="flex h-[29px] items-center gap-[9px] rounded-lg px-2 text-[13px] text-ink-2 hover:bg-hover"
                style={courseStyle(courseColorVar(c.color))}
              >
                <Dot />
                <span className="min-w-0 flex-1 truncate">{c.nickname ?? c.name}</span>
                {shortCode(c) && (
                  <span className="shrink-0 text-[11px] text-ink-3">{shortCode(c)}</span>
                )}
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="mt-auto">
        <ProfileMenu />
      </div>
    </aside>
  );
}
