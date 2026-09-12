// The Day view — the phone's default, and the third desktop view. The week
// strip from Home sits on top, the Due band above the fold, then the
// timeline. Swipe the strip for the next week, the body for the next day.

import { useRef, type TouchEvent } from "react";
import type { DayModel, CalendarEvent, TimeBlock } from "@/lib/calendar";
import {
  blockGeometry,
  blockTimeLabel,
  eventCourseId,
  gridBounds,
  hourLabel,
  layoutBlocks,
  minuteOf,
  minuteOffset,
  PX_PER_HOUR,
} from "@/lib/calendar";
import { AllDayLine, DueLine, PlanLine } from "./bands";
import { blockFill, BLOCK_SUBTITLE } from "./block-styles";
import { NowLine } from "./week-grid";
import { formatDayLong, formatWeekday } from "@/lib/dates";
import { courseStyle, useCourses } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export function DayView({
  day,
  days,
  models,
  todayKey,
  now,
  zone,
  onSelectDay,
  onShiftWeek,
  onShiftDay,
  onOpenBlock,
  onOpenEvent,
}: {
  day: string;
  /** The week the strip shows, Monday first. */
  days: string[];
  models: Map<string, DayModel>;
  todayKey: string;
  now: number;
  zone: string;
  onSelectDay: (day: string) => void;
  onShiftWeek: (delta: number) => void;
  onShiftDay: (delta: number) => void;
  onOpenBlock: (block: TimeBlock) => void;
  onOpenEvent: (event: CalendarEvent) => void;
}) {
  const model = models.get(day);
  const bodySwipe = useSwipe((delta) => onShiftDay(delta));
  const stripSwipe = useSwipe((delta) => onShiftWeek(delta));
  const band = [
    ...(model?.allDay ?? []).map((event) => (
      <AllDayLine key={`all:${event._id}`} event={event} onOpen={onOpenEvent} roomy />
    )),
    ...(model?.due ?? []).map((item) => (
      <DueLine key={item.key} item={item} zone={zone} roomy />
    )),
    ...(model?.planned ?? []).map((item) => (
      <PlanLine key={`plan:${item.key}`} item={item} roomy />
    )),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div {...stripSwipe} className="shrink-0">
        <CalendarWeekStrip
          days={days}
          models={models}
          selected={day}
          todayKey={todayKey}
          onSelect={onSelectDay}
        />
      </div>

      <div {...bodySwipe} className="flex min-h-0 flex-1 flex-col">
        {band.length > 0 && (
          <div className="flex shrink-0 flex-col gap-[2px] border-b border-line bg-sunken px-3 py-2">
            {band}
          </div>
        )}
        {/* The strip and the Due band stay put; the hours scroll under them. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DayTimeline
            model={model}
            todayKey={todayKey}
            day={day}
            now={now}
            zone={zone}
            onOpenBlock={onOpenBlock}
          />
        </div>
      </div>
    </div>
  );
}

export function DayTimeline({
  model,
  day,
  todayKey,
  now,
  zone,
  onOpenBlock,
}: {
  model: DayModel | undefined;
  day: string;
  todayKey: string;
  now: number;
  zone: string;
  onOpenBlock: (block: TimeBlock) => void;
}) {
  const { color } = useCourses();
  const bounds = gridBounds(model?.blocks ?? []);
  const blocks = layoutBlocks(model?.blocks ?? []);
  const nowMinute = minuteOf(now, zone);
  const nowTop = minuteOffset(nowMinute, bounds);
  const showNow = day === todayKey && nowTop >= 0 && nowTop <= bounds.height;

  return (
    <div className="relative pr-3" style={{ height: bounds.height + 8 }}>
      {bounds.hours.map((hour) => (
        <div
          key={hour}
          className="absolute right-0 left-[52px] border-t border-line"
          style={{ top: minuteOffset(hour * 60, bounds) }}
        >
          <span className="absolute -top-[7px] -left-[52px] w-11 text-right text-[10.5px] tabular text-ink-3">
            {hourLabel(hour)}
          </span>
        </div>
      ))}

      {blocks.map((block) => {
        const { top, height } = blockGeometry(block, bounds);
        return (
          <button
            key={block.id}
            type="button"
            onClick={() => onOpenBlock(block)}
            aria-label={`${block.title}, ${blockTimeLabel(block)}`}
            className={cn(
              "absolute overflow-hidden rounded-md px-[9px] pt-[6px] text-left text-[12.5px] leading-[1.3] whitespace-nowrap",
              blockFill(block.local),
            )}
            style={{
              ...courseStyle(color(block.courseCanvasId)),
              top,
              height,
              left: `calc(58px + (100% - 70px) * ${block.lane} / ${block.lanes})`,
              width: `calc((100% - 70px) / ${block.lanes} - ${block.lanes > 1 ? 2 : 0}px)`,
            }}
          >
            <div className="truncate font-medium text-c">
              {block.code !== undefined && <b className="font-semibold">{block.code}</b>}
              {block.code !== undefined && " "}
              {block.title}
            </div>
            {height >= PX_PER_HOUR * 0.75 && (
              <div className={cn("truncate text-[11.5px] tabular", BLOCK_SUBTITLE)}>
                {[blockTimeLabel(block), block.subtitle]
                  .filter((s) => s !== undefined)
                  .join(" · ")}
              </div>
            )}
          </button>
        );
      })}

      {showNow && <NowLine top={nowTop} minute={nowMinute} className="left-[52px]" />}
    </div>
  );
}

/** The Home week strip, keyed to the calendar week and its own dots. */
export function CalendarWeekStrip({
  days,
  models,
  selected,
  todayKey,
  onSelect,
}: {
  days: string[];
  models: Map<string, DayModel>;
  selected: string;
  todayKey: string;
  onSelect: (day: string) => void;
}) {
  const { color } = useCourses();
  return (
    <div className="grid grid-cols-7 gap-1 border-b border-line px-3 pt-[2px] pb-3">
      {days.map((day) => {
        const model = models.get(day);
        const isToday = day === todayKey;
        const isPast = day < todayKey;
        // One dot per colour, in first-seen order: what is due, what is
        // planned, and any event. Class meetings are left out — they repeat
        // every week and would dot every weekday the same.
        const colors: string[] = [];
        const add = (canvasId: number | undefined) => {
          const c = color(canvasId);
          if (!colors.includes(c)) colors.push(c);
        };
        for (const item of model?.due ?? []) add(item.courseCanvasId);
        for (const item of model?.planned ?? []) add(item.courseCanvasId);
        for (const block of model?.blocks ?? []) {
          if (block.kind !== "meeting") add(block.courseCanvasId);
        }
        for (const event of model?.allDay ?? []) add(eventCourseId(event));
        return (
          <button
            key={day}
            type="button"
            onClick={() => onSelect(day)}
            aria-pressed={selected === day}
            aria-label={formatDayLong(day)}
            className={cn(
              "rounded-lg border border-transparent px-1 pt-[7px] pb-2 text-center hover:bg-hover",
              isToday && "border-line-2 bg-hover",
              selected === day && !isToday && "border-line-2",
            )}
          >
            <div
              className={cn(
                "text-[10.5px] font-semibold tracking-[0.08em] uppercase",
                isToday ? "text-ink-2" : "text-ink-3",
              )}
            >
              {formatWeekday(day)}
            </div>
            <div
              className={cn(
                "mx-auto mt-[3px] grid size-[26px] place-items-center rounded-[7px] text-[14px] font-semibold tracking-[-0.02em]",
                isPast && "text-ink-3",
                isToday && "bg-today text-today-fg",
                selected === day && !isToday && "bg-chip",
              )}
            >
              {Number(day.slice(-2))}
            </div>
            <div className="mt-[5px] flex h-[11px] items-center justify-center gap-[3px]">
              {colors.slice(0, 3).map((c) => (
                <i
                  key={c}
                  className={cn("block size-[5px] rounded-full", isPast && "opacity-45")}
                  style={{ background: c }}
                />
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Horizontal swipe: -1 for a swipe right (back), +1 for a swipe left. */
function useSwipe(onSwipe: (delta: number) => void): {
  onTouchStart: (e: TouchEvent) => void;
  onTouchEnd: (e: TouchEvent) => void;
} {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e) => {
      const touch = e.touches[0];
      start.current = { x: touch.clientX, y: touch.clientY };
    },
    onTouchEnd: (e) => {
      const from = start.current;
      start.current = null;
      if (from === null) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - from.x;
      const dy = touch.clientY - from.y;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      onSwipe(dx < 0 ? 1 : -1);
    },
  };
}
