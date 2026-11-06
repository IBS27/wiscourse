import { ChevronDown } from "lucide-react";
import { courseLabel, useCourses } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import type { InboxSearch, InboxType } from "./search";

export type TypeCounts = Record<InboxType | "all", number>;

const TABS: { key: InboxType | undefined; label: string; count: keyof TypeCounts }[] = [
  { key: undefined, label: "All", count: "all" },
  { key: "announcement", label: "Announcements", count: "announcement" },
  { key: "grade", label: "Grades", count: "grade" },
  { key: "change", label: "Changes", count: "change" },
  { key: "assignment", label: "New", count: "assignment" },
];

type FilterProps = {
  search: InboxSearch;
  onChange: (patch: Partial<InboxSearch>) => void;
};

/** Type tabs over the list. The scope controls ride along below lg, where the page header has no room. */
export function InboxFilters({ search, counts, onChange }: FilterProps & { counts: TypeCounts }) {
  return (
    <div className="border-b border-line px-4 py-2 md:px-6">
      <div
        role="group"
        aria-label="Type"
        className="-mx-1 flex items-center gap-[2px] overflow-x-auto py-px pr-6 pl-1 [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((tab) => {
          const on = search.type === tab.key;
          const n = counts[tab.count];
          return (
            <button
              key={tab.label}
              type="button"
              aria-pressed={on}
              onClick={() => onChange({ type: tab.key })}
              className={cn(
                "inline-flex h-7 shrink-0 cursor-pointer items-center gap-[6px] rounded-md px-[9px] text-[12.5px] font-medium whitespace-nowrap transition-colors",
                "focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:outline-none",
                on ? "bg-chip text-ink" : "text-ink-3 hover:bg-hover hover:text-ink",
              )}
            >
              {tab.label}
              <span className={cn("tabular text-[11.5px] font-normal", on ? "text-ink-2" : "text-ink-3", n === 0 && "opacity-60")}>
                {n}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 lg:hidden">
        <CourseSelect search={search} onChange={onChange} />
        <UnreadToggle search={search} onChange={onChange} />
      </div>
    </div>
  );
}

/** Course scope: a quiet outlined control that reads like the tabs. */
export function CourseSelect({ search, onChange }: FilterProps) {
  const { filterable } = useCourses();
  return (
    <div className="relative flex min-w-0 items-center">
      <select
        aria-label="Course"
        value={search.course === undefined ? "" : String(search.course)}
        onChange={(e) => onChange({ course: e.target.value === "" ? undefined : Number(e.target.value) })}
        className={cn(
          "h-7 max-w-[180px] min-w-0 cursor-pointer appearance-none truncate rounded-md bg-surface py-0 pr-7 pl-[10px] text-[12.5px] font-medium text-ink-2 transition-colors",
          "shadow-[inset_0_0_0_1px_var(--line-2)] hover:bg-hover hover:text-ink",
          "focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:outline-none",
          search.course !== undefined && "text-ink",
        )}
      >
        <option value="">All courses</option>
        {filterable.map((c) => (
          <option key={c.canvasId} value={c.canvasId}>
            {courseLabel(c)}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-[9px] size-[13px] text-ink-3" aria-hidden />
    </div>
  );
}

export function UnreadToggle({ search, onChange }: FilterProps) {
  const on = search.unread === true;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange({ unread: on ? undefined : true })}
      className={cn(
        "flex h-7 shrink-0 cursor-pointer items-center gap-[9px] rounded-md px-1 text-[12.5px] font-medium whitespace-nowrap text-ink-2 transition-colors hover:text-ink",
        "focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:outline-none",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "relative block h-4 w-7 rounded-full transition-colors",
          on ? "bg-today" : "bg-line-2",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] block size-3 rounded-full bg-surface shadow-[0_1px_1px_rgba(0,0,0,0.12)] transition-[left]",
            on ? "left-[14px]" : "left-[2px]",
          )}
        />
      </span>
      Unread only
    </button>
  );
}
