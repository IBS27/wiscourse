// Direction A: a time grid for the things that occupy time, with two thin
// bands above it for the things that do not (Due and Plan). The grid runs
// the whole day and scrolls under the headers and bands, opening at 8 AM or
// an hour before the week's first block, whichever is earlier.

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CalendarClock, ChevronUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DayModel, LaidOutBlock, TimeBlock } from "@/lib/calendar";
import {
  blockGeometry,
  blockLabel,
  blockTimeLabel,
  clockTime,
  firstBlockMinute,
  GRID_BOUNDS,
  gridScrollTop,
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
import { blockFill, BLOCK_SUBTITLE, NOW_LABEL_CLEARANCE, TODAY_TINT } from "./block-styles";
import { useTimelineScroll } from "./use-timeline-scroll";
import { formatWeekday } from "@/lib/dates";
import { courseStyle, useCourses } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/** The hour gutter, narrower on a phone where every pixel goes to the days. */
const gutter = (compact: boolean) => (compact ? 44 : 56);
const columns = (compact: boolean): CSSProperties => ({
  gridTemplateColumns: `${gutter(compact)}px repeat(7, minmax(0, 1fr))`,
});

// The headers and bands sit outside the scrolling body but share its column
// template, so they reserve the same scrollbar gutter (a no-op with overlay
// scrollbars) to keep the weekday columns aligned.
const GUTTER = "shrink-0 overflow-hidden [scrollbar-gutter:stable]";

const HOUR_LINES: CSSProperties = {
  backgroundImage: `repeating-linear-gradient(to bottom, var(--line) 0 1px, transparent 1px ${PX_PER_HOUR}px)`,
  backgroundPosition: `0 ${GRID_TOP_PAD}px`,
};

/** A day's band shows this many rows before folding the rest into "+N more". */
const BAND_ROWS = 3;

export function WeekGrid({
  days,
  models,
  todayKey,
  now,
  zone,
  compact = false,
  onAddClassTimes,
  onOpenBlock,
  onOpenEvent,
}: {
  days: string[];
  models: Map<string, DayModel>;
  todayKey: string;
  now: number;
  zone: string;
  /** Phone layout: band items shrink to their marks. */
  compact?: boolean;
  /** Set when no class times exist yet: the grid nudges for them. */
  onAddClassTimes?: () => void;
  onOpenBlock: (block: TimeBlock) => void;
  onOpenEvent: (event: CalendarEvent) => void;
}) {
  const bounds = GRID_BOUNDS;
  const nowMinute = minuteOf(now, zone);
  const nowTop = minuteOffset(nowMinute, bounds);
  const showNow = days.includes(todayKey);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  useTimelineScroll(scrollRef, gridScrollTop(firstBlockMinute(days, models)), PX_PER_HOUR);

  const due = days.map((day) => {
    const model = models.get(day);
    return [
      ...(model?.allDay ?? []).map((event) => (
        <AllDayLine key={event._id} event={event} onOpen={onOpenEvent} compact={compact} />
      )),
      ...(model?.due ?? []).map((item) => (
        <DueLine key={item.key} item={item} zone={zone} compact={compact} />
      )),
    ];
  });
  const planned = days.map((day) =>
    (models.get(day)?.planned ?? []).map((item) => (
      <PlanLine key={item.key} item={item} compact={compact} />
    )),
  );
  const grid = columns(compact);
  // Marks alone are small enough that a phone shows them all.
  const fold = !compact && !expanded;
  const overflows = !compact && [...due, ...planned].some((rows) => rows.length > BAND_ROWS + 1);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {onAddClassTimes !== undefined && <ClassTimesStrip onOpen={onAddClassTimes} />}

      <div className={cn("grid border-b border-line", GUTTER)} style={grid}>
        <div className="border-r border-line" />
        {days.map((day) => (
          <DayHeader key={day} day={day} todayKey={todayKey} />
        ))}
      </div>

      <Band
        label="Due"
        days={days}
        todayKey={todayKey}
        rows={due}
        columns={grid}
        fold={fold}
        compact={compact}
        tall
        onExpand={() => setExpanded(true)}
        collapse={expanded && overflows ? () => setExpanded(false) : undefined}
      />
      <Band
        label="Plan"
        days={days}
        todayKey={todayKey}
        rows={planned}
        columns={grid}
        fold={fold}
        compact={compact}
        onExpand={() => setExpanded(true)}
      />

      <div
        ref={scrollRef}
        className="relative grid min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
        style={grid}
      >
        <div
          className="relative border-r border-line text-[10.5px] tabular text-ink-3"
          style={{ height: bounds.height }}
        >
          {bounds.hours.map((hour) =>
            // The now label takes the place of an hour it would collide with.
            showNow && Math.abs(nowMinute - hour * 60) < NOW_LABEL_CLEARANCE ? null : (
              <span
                key={hour}
                className="absolute right-2 -translate-y-1/2"
                style={{ top: minuteOffset(hour * 60, bounds) }}
              >
                {hourLabel(hour)}
              </span>
            ),
          )}
          {showNow && <NowLabel top={nowTop} minute={nowMinute} className="right-[4px]" />}
        </div>

        {days.map((day) => {
          const isToday = day === todayKey;
          const isPast = day < todayKey;
          const blocks = layoutBlocks(models.get(day)?.blocks ?? []);
          return (
            <div
              key={day}
              className={cn("relative overflow-hidden border-l border-line", isToday && TODAY_TINT)}
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
              {isToday && showNow && <NowLine top={nowTop} className="left-[4px]" />}
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
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-[2px] border-l border-line py-[7px] md:flex-row md:gap-[6px] md:py-[11px]",
        isToday && TODAY_TINT,
      )}
    >
      <span className={cn("text-[12px] font-medium", isToday ? "text-ink" : "text-ink-3")}>
        {formatWeekday(day)}
      </span>
      <span
        className={cn(
          "grid h-6 min-w-6 place-items-center rounded-full px-[5px] text-[14px] font-semibold tabular tracking-[-0.01em]",
          isPast ? "text-ink-3" : "text-ink",
          isToday && "bg-today text-today-fg",
        )}
      >
        {Number(day.slice(-2))}
      </span>
    </div>
  );
}

function Band({
  label,
  days,
  todayKey,
  rows,
  columns,
  fold,
  compact,
  tall,
  onExpand,
  collapse,
}: {
  label: string;
  days: string[];
  todayKey: string;
  /** Each day's rows, in `days` order. */
  rows: ReactNode[][];
  columns: CSSProperties;
  /** Long days fold into "+N more" (until expanded). */
  fold: boolean;
  compact: boolean;
  /** The Due band keeps a steady height, so wrapped titles have room. */
  tall?: boolean;
  onExpand: () => void;
  /** Set while expanded: the fold-back control under the label. */
  collapse?: () => void;
}) {
  return (
    <div className={cn("grid border-b border-line", GUTTER)} style={columns}>
      <div className="flex flex-col items-end gap-1 border-r border-line pt-[6px] pr-2 text-[11.5px] font-medium text-ink-3">
        {label}
        {collapse !== undefined && (
          <button
            type="button"
            onClick={collapse}
            aria-label="Show fewer"
            title="Show fewer"
            className="-mr-1 grid size-5 place-items-center rounded-[5px] transition-colors hover:bg-hover hover:text-ink"
          >
            <ChevronUp className="size-[13px]" />
          </button>
        )}
      </div>
      {days.map((day, i) => {
        const all = rows[i];
        // Fold only what would take more than one extra row to show.
        const folded = fold && all.length > BAND_ROWS + 1;
        const shown = folded ? all.slice(0, BAND_ROWS) : all;
        return (
          <div
            key={day}
            className={cn(
              "flex min-h-[30px] min-w-0 border-l border-line p-1",
              tall && !compact && "min-h-[132px]",
              compact ? "flex-wrap content-start justify-center" : "flex-col gap-px",
              day === todayKey && TODAY_TINT,
            )}
          >
            {shown}
            {folded && (
              <button
                type="button"
                onClick={onExpand}
                className="h-[21px] rounded-[5px] pl-[22px] text-left text-[11px] font-medium text-ink-3 transition-colors hover:bg-hover hover:text-ink"
              >
                +{all.length - shown.length} more
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Above the day headers while no class times exist: an inline row, never an
 * overlay, so it cannot cover the grid it is asking to fill.
 */
function ClassTimesStrip({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4 text-[12.5px] md:px-6">
      <CalendarClock className="size-[14px] shrink-0 text-ink-3" />
      <span className="shrink-0 font-medium text-ink-2">No class times yet</span>
      <span className="hidden min-w-0 truncate text-ink-3 sm:inline">
        Add your class times so lectures show here
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={onOpen}
        className="ml-auto h-7 shrink-0 rounded-md px-[10px] text-[12.5px]"
      >
        <Plus className="size-[13px]" />
        Add class times
      </Button>
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

/** The current time: an ink dot on the day's edge and a 2px ink rule (red is kept for overdue). */
export function NowLine({ top, className }: { top: number; className?: string }) {
  return (
    <div
      className={cn("pointer-events-none absolute right-0 left-0 z-[2] -translate-y-1/2", className)}
      style={{ top }}
      aria-hidden
    >
      <span className="absolute top-1/2 -left-[4px] block size-2 -translate-y-1/2 rounded-full bg-ink" />
      <span className="block h-[2px] bg-ink" />
    </div>
  );
}

/** "4:30" in the hour gutter, level with the now-line. */
export function NowLabel({
  top,
  minute,
  className,
}: {
  top: number;
  minute: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute z-[2] -translate-y-1/2 rounded-[4px] bg-today px-[4px] py-px text-[10px] leading-[13px] font-semibold tabular text-today-fg",
        className,
      )}
      style={{ top }}
    >
      {clockTime(minute)}
    </span>
  );
}
