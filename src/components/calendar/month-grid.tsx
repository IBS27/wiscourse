// Direction B: one line per item, no blocks, no fills. Class meetings are
// hidden behind a toggle so the month shows only what changes week to week.
// Clicking a day opens it in a popover beside the cell; on a phone the same
// grid uses dots and a tap drops into the Day view.

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { DayModel, CalendarEvent, TimeBlock } from "@/lib/calendar";
import { blockLabel, eventCourseId, isDoneOrSubmitted, sameMonth } from "@/lib/calendar";
import { Mark, type MarkKind } from "./marks";
import { DayPopover } from "./day-popover";
import { formatDayLong, formatWeekday } from "@/lib/dates";
import { courseStyle, useCourses } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const MAX_LINES = 4;
const POPOVER_WIDTH = 324;
const POPOVER_GAP = 8;

interface CellLine {
  key: string;
  /** Holidays and other all-day events read as plain text, with no mark. */
  mark: MarkKind | "none";
  color: string;
  title: string;
}

export function MonthGrid({
  days,
  models,
  monthKey,
  todayKey,
  now,
  zone,
  compact,
  showClasses,
  selected,
  onSelect,
  onOpenBlock,
  onOpenEvent,
}: {
  days: string[];
  models: Map<string, DayModel>;
  /** Any day in the month being shown; days outside it read as "out". */
  monthKey: string;
  todayKey: string;
  now: number;
  zone: string;
  /** Phone layout: dots instead of lines, tap opens the Day view. */
  compact?: boolean;
  /** Class meetings are hidden by default; the popover always shows them. */
  showClasses?: boolean;
  selected: string | null;
  onSelect: (day: string | null) => void;
  onOpenBlock: (block: TimeBlock) => void;
  onOpenEvent: (event: CalendarEvent) => void;
}) {
  const { color } = useCourses();
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef(new Map<string, HTMLElement>());
  const weeks = days.length / 7;
  const selectedModel = selected === null ? undefined : models.get(selected);

  // Positioned by writing to the node rather than through state: the
  // popover has to be measured before it can be placed, and a render pass
  // in between would cost a frame.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const pop = popRef.current;
    const cell = selected === null ? undefined : cellRefs.current.get(selected);
    if (wrap === null || pop === null || cell === undefined) return;
    const w = wrap.getBoundingClientRect();
    const c = cell.getBoundingClientRect();
    let left = c.right - w.left + POPOVER_GAP;
    if (left + POPOVER_WIDTH > w.width) left = c.left - w.left - POPOVER_WIDTH - POPOVER_GAP;
    if (left < 0) left = Math.max(0, (w.width - POPOVER_WIDTH) / 2);
    const top = Math.max(0, Math.min(c.top - w.top, w.height - pop.offsetHeight - POPOVER_GAP));
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }, [selected, compact, models, weeks]);

  // The cell takes back the focus it lent to the popover.
  const restoreFocus = useCallback((day: string) => {
    cellRefs.current.get(day)?.focus();
  }, []);

  // A click anywhere outside the month (the toolbar, the page) closes it;
  // clicking another cell selects that one instead.
  useEffect(() => {
    if (selected === null) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (popRef.current?.contains(target) === true) return;
      if (wrapRef.current?.contains(target) === true) return;
      onSelect(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [selected, onSelect]);

  return (
    <div ref={wrapRef} className="relative flex min-h-0 flex-1">
      <div
        className="grid min-h-0 flex-1"
        style={{
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gridTemplateRows: `30px repeat(${weeks}, minmax(0, 1fr))`,
        }}
      >
        {days.slice(0, 7).map((day) => (
          <div
            key={`head-${day}`}
            className="flex h-[30px] items-center border-r border-b border-line px-[9px] text-[10.5px] font-semibold tracking-[0.08em] text-ink-3 uppercase last:border-r-0"
          >
            {formatWeekday(day)}
          </div>
        ))}

        {days.map((day, index) => {
          const model = models.get(day);
          const lines = model === undefined ? [] : cellLines(model, color, showClasses === true);
          const shown = lines.slice(0, MAX_LINES);
          const more = lines.length - shown.length;
          const isToday = day === todayKey;
          return (
            <button
              key={day}
              type="button"
              ref={(node) => {
                if (node === null) cellRefs.current.delete(day);
                else cellRefs.current.set(day, node);
              }}
              aria-label={cellLabel(day, model)}
              aria-pressed={selected === day}
              onClick={() => onSelect(selected === day ? null : day)}
              className={cn(
                "min-h-0 min-w-0 border-r border-b border-line px-[6px] pt-[6px] pb-2 text-left hover:bg-hover",
                (index + 1) % 7 === 0 && "border-r-0",
                selected === day && "bg-sunken shadow-[inset_0_0_0_1px_var(--line-2)]",
              )}
            >
              <div
                className={cn(
                  "mb-1 ml-px grid size-[22px] place-items-center rounded-md text-[12.5px] font-semibold tracking-[-0.02em]",
                  !sameMonth(day, monthKey) && "font-medium text-ink-3",
                  day < todayKey && "text-ink-3",
                  isToday && "bg-today text-today-fg",
                )}
              >
                {Number(day.slice(-2))}
              </div>
              {compact === true ? (
                <div aria-hidden className="flex flex-wrap gap-[3px] px-px">
                  {dotColors(lines).map((c) => (
                    <i key={c} className="block size-[5px] rounded-full" style={{ background: c }} />
                  ))}
                </div>
              ) : (
                <>
                  {shown.map((line) => (
                    <div
                      key={line.key}
                      style={courseStyle(line.color)}
                      className={cn(
                        "flex h-5 items-center gap-[5px] overflow-hidden rounded-[5px] px-1 text-[11.5px] font-medium whitespace-nowrap",
                        line.mark === "none" && "text-ink-3",
                        day < todayKey && "text-ink-3",
                      )}
                    >
                      {line.mark !== "none" && <Mark kind={line.mark} />}
                      <span className="min-w-0 flex-1 truncate">{line.title}</span>
                    </div>
                  ))}
                  {more > 0 && (
                    <div className="px-1 pt-[2px] text-[11px] font-medium text-ink-3">+{more} more</div>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>

      {selected !== null && selectedModel !== undefined && compact !== true && (
        <DayPopover
          popoverRef={popRef}
          model={selectedModel}
          todayKey={todayKey}
          now={now}
          zone={zone}
          onClose={() => onSelect(null)}
          onRestoreFocus={restoreFocus}
          onOpenBlock={onOpenBlock}
          onOpenEvent={onOpenEvent}
        />
      )}
    </div>
  );
}

/**
 * Meetings first (they are the day's skeleton), then all-day events, due
 * times, timed events and plans — the order a day is read in.
 */
function cellLines(
  model: DayModel,
  color: (id: number | undefined) => string,
  showClasses: boolean,
): CellLine[] {
  const lines: CellLine[] = [];
  for (const block of showClasses ? model.blocks : []) {
    if (block.kind !== "meeting") continue;
    lines.push({
      key: block.id,
      mark: "meeting",
      color: color(block.courseCanvasId),
      title: blockLabel(block),
    });
  }
  for (const event of model.allDay) {
    lines.push({
      key: `all:${event._id}`,
      mark: "none",
      color: color(eventCourseId(event)),
      title: event.title,
    });
  }
  for (const item of model.due) {
    const done = isDoneOrSubmitted(item);
    lines.push({
      key: item.key,
      mark: done ? "done" : "due",
      color: color(item.courseCanvasId),
      title: item.title,
    });
  }
  for (const block of model.blocks) {
    if (block.kind !== "event") continue;
    lines.push({
      key: block.id,
      mark: "event",
      color: color(block.courseCanvasId),
      title: block.title,
    });
  }
  for (const item of model.planned) {
    lines.push({
      key: `plan:${item.key}`,
      mark: "planned",
      color: color(item.courseCanvasId),
      title: item.title,
    });
  }
  return lines;
}

/** "Thursday, September 10, 2 classes, 2 due, 1 planned". */
function cellLabel(day: string, model: DayModel | undefined): string {
  const counts = [
    plural(model?.blocks.filter((b) => b.kind === "meeting").length ?? 0, "class", "classes"),
    plural(model?.blocks.filter((b) => b.kind === "event").length ?? 0, "event", "events"),
    plural(model?.allDay.length ?? 0, "all-day event", "all-day events"),
    plural(model?.due.length ?? 0, "due", "due"),
    plural(model?.planned.length ?? 0, "planned", "planned"),
  ].filter((part) => part !== undefined);
  return [formatDayLong(day), ...counts].join(", ");
}

function plural(n: number, one: string, many: string): string | undefined {
  return n === 0 ? undefined : `${n} ${n === 1 ? one : many}`;
}

/** One dot per colour on the phone grid, in first-seen order. */
function dotColors(lines: CellLine[]): string[] {
  const seen: string[] = [];
  for (const line of lines) {
    if (!seen.includes(line.color)) seen.push(line.color);
  }
  return seen.slice(0, 4);
}
