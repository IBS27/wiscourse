import type { TodoItem } from "../../../convex/todos";
import { itemsByDay, weekDays } from "@/lib/agenda";
import { formatWeekday } from "@/lib/dates";
import { useCourses } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export function WeekStrip({
  items,
  todayKey,
  now,
  selected,
  onSelect,
  compact = false,
}: {
  items: TodoItem[];
  todayKey: string;
  now: number;
  selected: string | null;
  onSelect: (day: string | null) => void;
  compact?: boolean;
}) {
  const { color } = useCourses();
  const days = weekDays(todayKey);
  const byDay = itemsByDay(items, days, todayKey, now);

  return (
    <div className={cn("grid grid-cols-7 gap-1 border-b border-line px-3 py-[10px] md:px-5", compact && "gap-1 px-3 pt-[2px]")}>
      {days.map((day) => {
        const isToday = day === todayKey;
        const isPast = day < todayKey;
        const isSelected = selected === day;
        const dayItems = byDay.get(day) ?? [];
        // One dot per course, in first-seen order.
        const colors: string[] = [];
        for (const it of dayItems) {
          const c = color(it.courseCanvasId);
          if (!colors.includes(c)) colors.push(c);
        }
        const shown = colors.slice(0, 4);
        const more = colors.length - shown.length;
        const dow = formatWeekday(day);
        return (
          <button
            key={day}
            type="button"
            onClick={() => onSelect(isSelected ? null : day)}
            className={cn(
              "rounded-[10px] px-1 pt-[6px] pb-[7px] text-center transition-colors hover:bg-hover",
              isSelected && "bg-hover shadow-[inset_0_0_0_1px_var(--line-2)]",
            )}
          >
            <div className={cn("text-[11px] font-medium text-ink-3", isToday && "font-semibold text-ink")}>
              {compact ? dow[0] : dow}
            </div>
            <div
              className={cn(
                "mx-auto mt-[3px] grid size-7 place-items-center rounded-full text-[14px] font-semibold tracking-[-0.02em] tabular",
                compact && "size-[26px]",
                isPast && "font-medium text-ink-3",
                isToday && "bg-today text-today-fg",
              )}
            >
              {Number(day.slice(-2))}
            </div>
            <div className="mt-[5px] flex h-[11px] items-center justify-center gap-[3px]">
              {shown.map((c) => (
                <i
                  key={c}
                  className={cn("block size-[5px] rounded-full", isPast && "opacity-45")}
                  style={{ background: c }}
                />
              ))}
              {more > 0 && (
                <span className="ml-px text-[10px] font-semibold tracking-[-0.02em] text-ink-3">+{more}</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
