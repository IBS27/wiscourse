import { Link, useRouterState } from "@tanstack/react-router";
import { MOBILE_TABS, NAV, useNavCounts } from "./nav";
import { cn } from "@/lib/utils";

export function BottomTabs() {
  const counts = useNavCounts();
  // A to-do opens from Home's agenda, so Home stays lit while it's open.
  const underHome = useRouterState({ select: (st) => st.location.pathname.startsWith("/todo") });
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-line bg-surface px-1 pt-[6px] pb-[max(16px,env(safe-area-inset-bottom))] md:hidden">
      {MOBILE_TABS.map((to) => {
        const item = NAV.find((n) => n.to === to);
        if (!item) return null;
        const Icon = item.icon;
        const unread = to === "/inbox" ? counts.inbox : 0;
        return (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === "/" }}
            className={cn(
              "group flex flex-col items-center gap-[3px] text-[11.5px] leading-4 font-medium text-ink-3",
              underHome && to === "/" && "text-ink",
            )}
            activeProps={{ className: "text-ink" }}
          >
            <span
              className={cn(
                "relative grid h-7 w-12 place-items-center rounded-full transition-colors group-data-[status=active]:bg-chip",
                underHome && to === "/" && "bg-chip",
              )}
            >
              <Icon className="size-[19px]" />
              {unread > 0 && (
                <span
                  aria-hidden
                  className="tabular absolute -top-[5px] left-[calc(50%+8px)] grid h-4 min-w-4 place-items-center rounded-full bg-chip px-1 text-[10.5px] leading-none font-semibold text-ink-2 ring-2 ring-surface"
                >
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </span>
            {item.label}
            {unread > 0 && <span className="sr-only">, {unread} unread</span>}
          </Link>
        );
      })}
    </nav>
  );
}
