// Direction A: a time grid for the things that occupy time, with two thin
// bands above it for the things that do not (Due and Plan). The grid runs
// the whole day and scrolls under the headers and bands, opening at 8 AM or
// an hour before the week's first block, whichever is earlier. A week with
// nothing timed draws shorter hours and opens an hour above now.

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CalendarClock, ChevronUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TodoItem } from "../../../convex/todos";
import type { DayModel, LaidOutBlock, TimeBlock } from "@/lib/calendar";
import {
  blockGeometry,
  blockLabel,
  blockTimeLabel,
  clockTime,
  EMPTY_GRID_BOUNDS,
  emptyGridScrollTop,
  firstBlockMinute,
  GRID_BOUNDS,
  gridScrollTop,
  hourLabel,
  isDoneOrSubmitted,
  layoutBlocks,
  minuteOf,
  minuteOffset,
  type CalendarEvent,
  type GridBounds,
} from "@/lib/calendar";
import { AllDayLine, DoneLine, DueLine, PlanLine } from "./bands";
import { blockFill, BLOCK_SUBTITLE, HOUR_LABEL, TODAY_TINT } from "./block-styles";
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
// template. The body hides its scrollbar (wheel, touch and keys still scroll
// it), so no gutter is reserved and the hour lines run to the edge.
const ROW = "shrink-0 overflow-hidden";
const NO_SCROLLBAR = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

// Each hour's line is the last pixel of the hour before it, so the line at
// the top of the view tucks under the band's border and midnight's under the
// footer's: one rule at each edge, never two.
const hourLines = (pxPerHour: number, height: number): CSSProperties => ({
  backgroundImage: `repeating-linear-gradient(to bottom, var(--line) 0 1px, transparent 1px ${pxPerHour}px)`,
  backgroundPosition: "0 -1px",
  backgroundSize: `100% ${height - 1}px`,
  backgroundRepeat: "no-repeat",
});

/** A day's band shows this many rows before folding the rest into "+N more". */
const BAND_ROWS = 2;

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
  const first = firstBlockMinute(days, models);
  const scrollRef = useRef<HTMLDivElement>(null);
  // A week with nothing timed draws shorter hours and opens an hour above
  // now, so the empty grid reads as the rest of today, not a void.
  const empty = first === undefined;
  const bounds = empty ? EMPTY_GRID_BOUNDS : GRID_BOUNDS;
  const nowMinute = minuteOf(now, zone);
  const nowTop = minuteOffset(nowMinute, bounds);
  const showNow = days.includes(todayKey);
  const [expanded, setExpanded] = useState(false);
  useTimelineScroll(
    scrollRef,
    empty
      ? emptyGridScrollTop(showNow ? nowMinute : undefined, bounds)
      : gridScrollTop(first, bounds),
    bounds.pxPerHour,
  );

  const dueLine = (item: TodoItem) => (
    <DueLine key={item.key} item={item} zone={zone} now={now} compact={compact} />
  );
  // Open items lead; finished ones fold into one "✓ N done" line until the
  // bands are expanded.
  const dueDone = days.map((day) => (models.get(day)?.due ?? []).filter(isDoneOrSubmitted));
  const due = days.map((day, i) => {
    const model = models.get(day);
    return [
      ...(model?.allDay ?? []).map((event) => (
        <AllDayLine key={event._id} event={event} onOpen={onOpenEvent} compact={compact} />
      )),
      ...(model?.due ?? []).filter((item) => !isDoneOrSubmitted(item)).map(dueLine),
      ...(expanded ? dueDone[i].map(dueLine) : []),
    ];
  });
  const doneLines = dueDone.map((done) =>
    expanded || done.length === 0 ? undefined : (
      <DoneLine count={done.length} compact={compact} onClick={() => setExpanded(true)} />
    ),
  );
  const planned = days.map((day) =>
    (models.get(day)?.planned ?? []).map((item) => (
      <PlanLine key={item.key} item={item} compact={compact} />
    )),
  );
  const anyPlanned = planned.some((rows) => rows.length > 0);
  const grid = columns(compact);
  // Marks alone are small enough that a phone shows them all.
  const fold = !compact && !expanded;
  const expandable =
    dueDone.some((done) => done.length > 0) ||
    (!compact && [...due, ...planned].some((rows) => rows.length > BAND_ROWS));

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {onAddClassTimes !== undefined && <ClassTimesStrip onOpen={onAddClassTimes} />}

      <div className={cn("grid border-b border-line", ROW)} style={grid}>
        <div />
        {days.map((day) => (
          <DayHeader key={day} day={day} todayKey={todayKey} />
        ))}
      </div>

      <Band
        label="Due"
        days={days}
        todayKey={todayKey}
        rows={due}
        footers={doneLines}
        columns={grid}
        fold={fold}
        compact={compact}
        onExpand={() => setExpanded(true)}
        collapse={expanded && expandable ? () => setExpanded(false) : undefined}
      />
      {anyPlanned && (
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
      )}

      <div
        ref={scrollRef}
        className={cn("relative grid min-h-0 flex-1 overflow-y-auto", NO_SCROLLBAR)}
        style={grid}
      >
        {/* Nothing else lives in the gutter (the now pill sits in today's
            column), so every hour keeps its label. */}
        <div className="relative" style={{ height: bounds.height }}>
          {bounds.hours.map((hour) => (
            <span
              key={hour}
              className={cn(HOUR_LABEL, "right-2")}
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
              className={cn("relative overflow-hidden border-l border-line", isToday && TODAY_TINT)}
              style={{ ...hourLines(bounds.pxPerHour, bounds.height), height: bounds.height }}
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
  footers,
  columns,
  fold,
  compact,
  onExpand,
  collapse,
}: {
  label: string;
  days: string[];
  todayKey: string;
  /** Each day's rows, in `days` order. */
  rows: ReactNode[][];
  /** A day's closing line under its rows (the Due band's "✓ N done"). */
  footers?: (ReactNode | undefined)[];
  columns: CSSProperties;
  /** Long days fold into "+N more" (until expanded). */
  fold: boolean;
  compact: boolean;
  onExpand: () => void;
  /** Set while expanded: the fold-back control under the label. */
  collapse?: () => void;
}) {
  return (
    <div className={cn("grid border-b border-line", ROW)} style={columns}>
      <div className="flex flex-col items-end gap-1 pt-[6px] pr-2 text-[12px] font-medium text-ink-3">
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
        const folded = fold && all.length > BAND_ROWS;
        const shown = folded ? all.slice(0, BAND_ROWS) : all;
        return (
          <div
            key={day}
            className={cn(
              "flex min-h-8 min-w-0 border-l border-line px-[3px] py-1",
              compact ? "flex-wrap content-start justify-center" : "flex-col gap-[3px]",
              day === todayKey && TODAY_TINT,
            )}
          >
            {shown}
            {folded && (
              <button
                type="button"
                onClick={onExpand}
                className="h-[22px] shrink-0 rounded-[5px] pl-[9px] text-left text-[12px] font-medium text-ink-3 transition-colors hover:bg-hover hover:text-ink"
              >
                +{all.length - shown.length} more
              </button>
            )}
            {footers?.[i]}
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
  const pxPerHour = bounds.pxPerHour;
  return (
    <button
      type="button"
      onClick={() => onOpen(block)}
      aria-label={`${blockLabel(block)}, ${blockTimeLabel(block)}`}
      className={cn(
        "absolute overflow-hidden rounded-md px-2 pt-1 text-left text-[12px] leading-[1.3] whitespace-nowrap",
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
      {height >= pxPerHour * 0.75 && (
        <div className={cn("truncate text-[11px] tabular", BLOCK_SUBTITLE)}>{subtitle}</div>
      )}
    </button>
  );
}

/**
 * The current time: a 2px ink rule across the day (red is kept for overdue),
 * led by a small ink pill with the time, sitting on the line at its start.
 */
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
      {/* Inset from the column edge so the pill never straddles the day divider. */}
      <span className="ml-1 shrink-0 rounded-[4px] bg-today px-[4px] py-px text-[10.5px] leading-[13px] font-semibold tabular text-today-fg">
        {clockTime(minute)}
      </span>
      <span className="h-[1.5px] flex-1 bg-today" aria-hidden />
    </div>
  );
}
