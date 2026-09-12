// Direction A: a time grid for the things that occupy time, with two thin
// bands above it for the things that do not (Due and Plan). The grid runs
// 8 AM – 6 PM and grows to fit the earliest and latest block; it never
// scrolls inside the page.

import { type CSSProperties, type ReactNode } from "react";
import type { DayModel, LaidOutBlock, TimeBlock } from "@/lib/calendar";
import {
  blockGeometry,
  blockLabel,
  blockTimeLabel,
  clockTime,
  gridBounds,
  hourLabel,
  layoutBlocks,
  minuteOf,
  minuteOffset,
  PX_PER_HOUR,
  GRID_TOP_PAD,
  type CalendarEvent,
  type GridBounds,
} from "@/lib/calendar";
import { AllDayLine, DueLine, PlanLine } from "./bands";
import { blockFill, BLOCK_SUBTITLE } from "./block-styles";
import { formatWeekday } from "@/lib/dates";
import { courseStyle, useCourses } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const COLUMNS: CSSProperties = { gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" };

const HOUR_LINES: CSSProperties = {
  backgroundImage: `repeating-linear-gradient(to bottom, var(--line) 0 1px, transparent 1px ${PX_PER_HOUR}px)`,
  backgroundPosition: `0 ${GRID_TOP_PAD}px`,
};

export function WeekGrid({
  days,
  models,
  todayKey,
  now,
  zone,
  prompt,
  onOpenBlock,
  onOpenEvent,
}: {
  days: string[];
  models: Map<string, DayModel>;
  todayKey: string;
  now: number;
  zone: string;
  /** Quiet one-liner above the grid, e.g. the add-class-times nudge. */
  prompt?: ReactNode;
  onOpenBlock: (block: TimeBlock) => void;
  onOpenEvent: (event: CalendarEvent) => void;
}) {
  const dayModels = days.map((day) => models.get(day));
  const bounds = gridBounds(dayModels.flatMap((m) => m?.blocks ?? []));
  const nowMinute = minuteOf(now, zone);
  const nowTop = minuteOffset(nowMinute, bounds);
  const showNow = days.includes(todayKey) && nowTop >= 0 && nowTop <= bounds.height;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {prompt}

      <div className="grid border-b border-line" style={COLUMNS}>
        <div className="border-r border-line" />
        {days.map((day) => (
          <DayHeader key={day} day={day} todayKey={todayKey} />
        ))}
      </div>

      <Band label="Due" days={days} todayKey={todayKey}>
        {(day) => {
          const model = models.get(day);
          return (
            <>
              {model?.allDay.map((event) => (
                <AllDayLine key={event._id} event={event} onOpen={onOpenEvent} />
              ))}
              {model?.due.map((item) => (
                <DueLine key={item.key} item={item} zone={zone} />
              ))}
            </>
          );
        }}
      </Band>

      <Band label="Plan" days={days} todayKey={todayKey}>
        {(day) => <>{models.get(day)?.planned.map((item) => <PlanLine key={item.key} item={item} />)}</>}
      </Band>

      <div className="relative grid" style={COLUMNS}>
        <div
          className="relative border-r border-line text-[10.5px] tabular text-ink-3"
          style={{ height: bounds.height }}
        >
          {bounds.hours.map((hour) => (
            <span
              key={hour}
              className="absolute right-2 -translate-y-1/2"
              style={{ top: minuteOffset(hour * 60, bounds) }}
            >
              {hourLabel(hour)}
            </span>
          ))}
        </div>

        {days.map((day) => {
          const isToday = day === todayKey;
          const isPast = day < todayKey;
          const blocks = layoutBlocks(models.get(day)?.blocks ?? []);
          return (
            <div
              key={day}
              className={cn("relative overflow-hidden border-l border-line", isToday && "bg-sunken")}
              style={{ ...HOUR_LINES, height: bounds.height }}
            >
              {blocks.map((block) => (
                <Block
                  key={block.id}
                  block={block}
                  bounds={bounds}
                  past={isPast}
                  onOpen={onOpenBlock}
                />
              ))}
              {isToday && showNow && <NowLine top={nowTop} minute={nowMinute} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayHeader({ day, todayKey }: { day: string; todayKey: string }) {
  const isToday = day === todayKey;
  const isPast = day < todayKey;
  return (
    <div className="border-l border-line pt-[10px] pb-[9px] text-center">
      <div
        className={cn(
          "text-[10.5px] font-semibold tracking-[0.08em] uppercase",
          isToday ? "text-ink" : "text-ink-3",
        )}
      >
        {formatWeekday(day)}
      </div>
      <div
        className={cn(
          "mx-auto mt-[3px] grid size-6 place-items-center rounded-[7px] text-[14px] font-semibold tracking-[-0.02em]",
          isPast && "text-ink-3",
          isToday && "bg-today text-today-fg",
        )}
      >
        {Number(day.slice(-2))}
      </div>
    </div>
  );
}

function Band({
  label,
  days,
  todayKey,
  children,
}: {
  label: string;
  days: string[];
  todayKey: string;
  children: (day: string) => ReactNode;
}) {
  return (
    <div className="grid border-b border-line" style={COLUMNS}>
      <div className="border-r border-line pt-[7px] pr-2 text-right text-[10px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
        {label}
      </div>
      {days.map((day) => (
        <div
          key={day}
          className={cn(
            "flex min-h-[34px] flex-col gap-[2px] border-l border-line px-[5px] pt-[5px] pb-1",
            day === todayKey && "bg-sunken",
          )}
        >
          {children(day)}
        </div>
      ))}
    </div>
  );
}

function Block({
  block,
  bounds,
  past,
  onOpen,
}: {
  block: LaidOutBlock;
  bounds: GridBounds;
  past: boolean;
  onOpen: (block: TimeBlock) => void;
}) {
  const { color } = useCourses();
  const { top, height } = blockGeometry(block, bounds);
  const subtitle = block.subtitle ?? blockTimeLabel(block);
  return (
    <button
      type="button"
      onClick={() => onOpen(block)}
      aria-label={`${blockLabel(block)}, ${blockTimeLabel(block)}`}
      className={cn(
        "absolute overflow-hidden rounded-md px-2 pt-1 text-left text-[11.5px] leading-[1.3] whitespace-nowrap",
        blockFill(block.local),
        past && "opacity-50",
      )}
      style={{
        ...courseStyle(color(block.courseCanvasId)),
        top,
        height,
        left: `calc(3px + (100% - 6px) * ${block.lane} / ${block.lanes})`,
        width: `calc((100% - 6px) / ${block.lanes} - ${block.lanes > 1 ? 2 : 0}px)`,
      }}
    >
      <div className="truncate font-medium text-c">
        {block.code !== undefined && <b className="font-semibold">{block.code}</b>}
        {block.code !== undefined && " "}
        {block.title}
      </div>
      {height >= PX_PER_HOUR * 0.75 && (
        <div className={cn("truncate text-[11px] tabular", BLOCK_SUBTITLE)}>{subtitle}</div>
      )}
    </button>
  );
}

export function NowLine({
  top,
  minute,
  className,
}: {
  top: number;
  minute: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute right-0 left-0 z-[2] flex -translate-y-1/2 items-center",
        className,
      )}
      style={{ top }}
    >
      <span className="-ml-[3px] block size-[6px] shrink-0 rounded-full bg-red" />
      <span className="h-px flex-1 bg-red" />
      <span className="pl-[3px] pr-[3px] text-[10px] font-semibold tabular text-red">
        {clockTime(minute)}
      </span>
    </div>
  );
}
