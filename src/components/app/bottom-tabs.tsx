import { Link } from "@tanstack/react-router";
import { MOBILE_TABS, NAV, useNavCounts } from "./nav";

export function BottomTabs() {
  const counts = useNavCounts();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface px-[6px] pt-2 pb-[max(16px,env(safe-area-inset-bottom))] md:hidden">
      {MOBILE_TABS.map((to) => {
        const item = NAV.find((n) => n.to === to);
        if (!item) return null;
        const Icon = item.icon;
        const badge = to === "/inbox" && counts.inbox > 0;
        return (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === "/" }}
            className="flex flex-col items-center gap-1 text-[10.5px] text-ink-3"
            activeProps={{ className: "text-ink font-medium" }}
          >
            <span className="relative">
              <Icon className="size-5" />
              {badge && (
                <span className="absolute -top-[2px] -right-1 size-[7px] rounded-full border-[1.5px] border-surface bg-red" />
              )}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
