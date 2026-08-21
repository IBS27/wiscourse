import { useQuery } from "convex/react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Home,
  Inbox,
  ListChecks,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { buildAgenda } from "@/lib/agenda";
import { useNow, useToday } from "@/lib/hooks";

export const NAV = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/courses", label: "Courses", icon: BookOpen },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/grades", label: "Grades", icon: BarChart3 },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
] as const;

export const MOBILE_TABS = ["/", "/inbox", "/courses", "/calendar", "/tasks"] as const;

/** Badge counts for the nav: open items due/overdue today, unseen feed items. */
export function useNavCounts(): { home: number; inbox: number } {
  const items = useQuery(api.todos.list, {});
  const feed = useQuery(api.inbox.feed);
  const today = useToday();
  const now = useNow();
  let home = 0;
  if (items) {
    const buckets = buildAgenda(items, { todayKey: today, now });
    for (const b of buckets) {
      if (b.id === "overdue" || b.id === "today") {
        home += b.items.filter((i) => i.doneAt === undefined).length;
      }
    }
  }
  const inbox = feed?.filter((f) => !f.seen).length ?? 0;
  return { home, inbox };
}
