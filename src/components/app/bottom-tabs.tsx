import { Link } from "@tanstack/react-router";
import { MOBILE_TABS, NAV, useNavCounts } from "./nav";

export function BottomTabs() {
  const counts = useNavCounts();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-line bg-surface px-1 pt-[6px] pb-[max(16px,env(safe-area-inset-bottom))] md:hidden">
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
            className="group flex flex-col items-center gap-[3px] text-[10.5px] font-medium text-ink-3"
            activeProps={{ className: "text-ink" }}
          >
            <span className="relative grid h-7 w-12 place-items-center rounded-full transition-colors group-data-[status=active]:bg-chip">
              <Icon className="size-[19px]" />
              {badge && (
                <span className="absolute top-[3px] right-[11px] size-[8px] rounded-full border-[1.5px] border-surface bg-unread" />
              )}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
