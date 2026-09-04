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

export function InboxFilters({
  search,
  counts,
  onChange,
}: {
  search: InboxSearch;
  counts: TypeCounts;
  onChange: (patch: Partial<InboxSearch>) => void;
}) {
  const { filterable } = useCourses();

  return (
    <div className="flex flex-wrap items-center gap-x-[6px] gap-y-2 border-b border-line px-4 py-[10px]">
      <div className="-mx-1 flex min-w-0 flex-1 items-center gap-[6px] overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((tab) => {
          const on = search.type === tab.key;
          return (
            <button
              key={tab.label}
              type="button"
              aria-pressed={on}
              onClick={() => onChange({ type: tab.key })}
              className={cn(
                "inline-flex h-[26px] shrink-0 items-center gap-[5px] rounded-md px-[9px] text-xs font-medium whitespace-nowrap",
                on
                  ? "bg-today text-today-fg"
                  : "text-ink-2 shadow-[inset_0_0_0_1px_var(--line)] hover:text-ink",
              )}
            >
              {tab.label}
              <span className={cn("text-[11px] tabular", on ? "opacity-70" : "text-ink-3")}>
                {counts[tab.count]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 text-xs text-ink-3">
        <div className="relative flex items-center">
          <select
            aria-label="Course"
            value={search.course === undefined ? "" : String(search.course)}
            onChange={(e) => onChange({ course: e.target.value === "" ? undefined : Number(e.target.value) })}
            className="h-[26px] max-w-[168px] appearance-none truncate bg-transparent pr-[18px] text-xs font-medium text-ink-2 outline-none hover:text-ink"
          >
            <option value="">All courses</option>
            {filterable.map((c) => (
              <option key={c.canvasId} value={c.canvasId}>
                {courseLabel(c)}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-0 size-[13px]" />
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={search.unread === true}
          onClick={() => onChange({ unread: search.unread === true ? undefined : true })}
          className="flex items-center gap-[9px] text-xs text-ink-2 hover:text-ink"
        >
          <span
            className={cn(
              "relative block h-4 w-7 rounded-full transition-colors",
              search.unread === true ? "bg-today" : "bg-line-2",
            )}
          >
            <span
              className={cn(
                "absolute top-[2px] block size-3 rounded-full bg-surface transition-[left]",
                search.unread === true ? "left-[14px]" : "left-[2px]",
              )}
            />
          </span>
          Unread only
        </button>
      </div>
    </div>
  );
}
