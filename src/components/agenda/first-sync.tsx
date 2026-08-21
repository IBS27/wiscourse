import { useQuery } from "convex/react";
import { Check, Clock, RefreshCw } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { useCourses } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/** Shown on Home until the first full sync completes. */
export function FirstSyncCard({ syncing }: { syncing: boolean }) {
  const { courses } = useCourses();
  const items = useQuery(api.todos.list, {});
  const feed = useQuery(api.inbox.feed);
  const n = items?.length ?? 0;
  const steps = [
    { label: "Courses", done: courses.length > 0, detail: courses.length > 0 ? `${courses.length} active` : "queued" },
    { label: "Assignments", done: n > 0, detail: n > 0 ? String(n) : "queued" },
    { label: "Announcements and modules", done: (feed?.length ?? 0) > 0, detail: (feed?.length ?? 0) > 0 ? String(feed?.length) : "queued" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.max(8, Math.round((doneCount / steps.length) * 100));

  return (
    <div className="mx-4 mt-4 rounded-[10px] border border-line bg-surface p-4">
      <div className="text-[14px] font-semibold tracking-[-0.01em]">Setting up wiscourse</div>
      <div className="mt-[3px] text-[12.5px] text-ink-3">
        First sync from Canvas — start using the app now, items land as they arrive.
      </div>
      <div className="my-[14px] h-1 overflow-hidden rounded-full bg-chip">
        <div className="h-full rounded-full bg-ink transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      {steps.map((s, i) => {
        const active = !s.done && syncing && steps.slice(0, i).every((p) => p.done);
        const Icon = s.done ? Check : active ? RefreshCw : Clock;
        return (
          <div
            key={s.label}
            className={cn(
              "flex items-center gap-[9px] border-b border-line py-[7px] text-[13px] text-ink-2 last:border-b-0",
              !s.done && !active && "text-ink-3",
            )}
          >
            <Icon className={cn("size-[14px]", active && "animate-spin")} />
            {s.label}
            <span className="tabular ml-auto text-xs text-ink-3">{active ? "syncing…" : s.detail}</span>
          </div>
        );
      })}
    </div>
  );
}
