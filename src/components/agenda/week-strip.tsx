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
    <div className={cn("grid grid-cols-7 gap-[6px] border-b border-line px-4 pt-3 pb-[13px]", compact && "gap-1 px-3 pt-[2px]")}>
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
              "rounded-lg border border-transparent px-1 pt-[7px] pb-2 text-center hover:bg-hover",
              isToday && "border-line-2 bg-hover",
              isSelected && !isToday && "border-line-2",
            )}
          >
            <div className={cn("text-[10.5px] font-semibold tracking-[0.08em] uppercase", isPast ? "text-ink-3" : isToday ? "text-ink-2" : "text-ink-3")}>
              {compact ? dow[0] : dow}
            </div>
            <div
              className={cn(
                "mx-auto mt-[3px] grid size-6 place-items-center rounded-[7px] text-[14px] font-semibold tracking-[-0.02em]",
                compact && "size-[26px]",
                isPast && "text-ink-3",
                isToday && "bg-today text-today-fg",
                isSelected && !isToday && "bg-chip",
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
