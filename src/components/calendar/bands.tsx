// The one-line items that ride above the time grid: due times, all-day
// events and planned todos. They are never blocks — an 11:59 PM deadline is
// not a one-minute meeting (docs/calendar.html, section A).

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { TodoItem } from "../../../convex/todos";
import { Mark } from "./marks";
import {
  clockTimeMeridiem,
  eventCourseId,
  isDoneOrSubmitted,
  minuteOf,
  type CalendarEvent,
} from "@/lib/calendar";
import { courseStyle, useCourses } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/**
 * The shared band item. In the week's columns it is a small event chip: a
 * course-colour wash with a 2px bar on its left, the time on its own line
 * above a title of up to three lines. The Day band has the width for one
 * line and a right-aligned time instead, and the phone's week shows the
 * mark alone. The tooltip always carries the full title.
 */
function Line({
  color,
  onClick,
  todoKey,
  title,
  roomy,
  compact,
  muted,
  className,
  children,
}: {
  color: string;
  onClick?: () => void;
  /** When set the row links to the todo detail instead of firing `onClick`. */
  todoKey?: string;
  /** Tooltip; the row itself clamps. */
  title?: string;
  /** The Day view's band gives each line more room than the week grid. */
  roomy?: boolean;
  /** The phone's week: the mark alone, named by its tooltip and label. */
  compact?: boolean;
  /** A finished item: the same chip, quieter. */
  muted?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const shell = cn(
    "rounded-[5px] text-left font-medium text-ink transition-colors focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:outline-none",
    compact
      ? "flex size-[22px] items-center justify-center hover:bg-hover"
      : roomy
        ? "flex h-[28px] w-full items-center gap-[6px] px-[6px] text-[12.5px] whitespace-nowrap hover:bg-hover"
        : cn(CHIP, muted && "opacity-60 hover:opacity-100"),
    className,
  );
  const label = compact ? title : undefined;
  if (todoKey !== undefined) {
    return (
      <Link
        to="/todo/$key"
        params={{ key: todoKey }}
        className={shell}
        style={courseStyle(color)}
        title={title}
        aria-label={label}
      >
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={shell}
      style={courseStyle(color)}
      title={title}
      aria-label={label}
    >
      {children}
    </button>
  );
}

/** The week's event chip: a ~11% course-colour wash (deeper in dark) and a 2px course bar. */
const CHIP = cn(
  "block w-full shrink-0 rounded-[6px] border-l-2 border-c py-[4px] pr-[6px] pl-[7px] text-[12.5px] leading-[16px]",
  "bg-[color-mix(in_srgb,var(--c)_11%,var(--surface))] hover:bg-[color-mix(in_srgb,var(--c)_17%,var(--surface))]",
  "dark:bg-[color-mix(in_srgb,var(--c)_18%,var(--surface))] dark:hover:bg-[color-mix(in_srgb,var(--c)_25%,var(--surface))]",
);

/**
 * A chip's body: an optional time line, then the title (up to three lines),
 * led by a check when the item is done.
 */
function ChipBody({
  time,
  done,
  children,
}: {
  time?: string;
  done?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      {time !== undefined && (
        <span className="block text-[12px] leading-[15px] font-normal tabular text-ink-3">{time}</span>
      )}
      <span className="flex items-start gap-[3px]">
        {done && <Mark kind="done" className="h-4 w-3" />}
        <span className="line-clamp-3 min-w-0 flex-1 break-words">{children}</span>
      </span>
    </>
  );
}

/** 11:59 PM — Canvas's default deadline, which the Due band already implies. */
const END_OF_DAY = 23 * 60 + 59;

export function DueLine({
  item,
  zone,
  roomy,
  compact,
}: {
  item: TodoItem;
  zone: string;
  roomy?: boolean;
  compact?: boolean;
}) {
  const { color, label } = useCourses();
  const done = isDoneOrSubmitted(item);
  const minute = item.dueAt === undefined ? undefined : minuteOf(item.dueAt, zone);
  const tooltip =
    minute === undefined ? item.title : `${item.title} · due ${clockTimeMeridiem(minute)}`;
  if (!roomy && !compact) {
    // The end-of-day default is left out so the title keeps the room; the
    // tooltip always carries it.
    // The small line says when and for which course; the title gets the room.
    const when = minute === undefined || minute === END_OF_DAY ? undefined : `Due ${clockTimeMeridiem(minute)}`;
    const time = [when, label(item.courseCanvasId)].filter(Boolean).join(" · ") || undefined;
    return (
      <Line todoKey={item.key} color={color(item.courseCanvasId)} title={tooltip} muted={done}>
        <ChipBody time={time} done={done}>
          {item.title}
        </ChipBody>
      </Line>
    );
  }
  return (
    <Line
      todoKey={item.key}
      color={color(item.courseCanvasId)}
      title={tooltip}
      roomy={roomy}
      compact={compact}
      className={cn(done && "text-ink-3")}
    >
      <Mark kind={done ? "done" : "due"} />
      {roomy && (
        <span className={cn("min-w-0 flex-1 truncate", done && "text-ink-3")}>{item.title}</span>
      )}
      {roomy && minute !== undefined && (
        <span className="shrink-0 text-xs font-normal tabular text-ink-3">
          {clockTimeMeridiem(minute)}
        </span>
      )}
    </Line>
  );
}

export function PlanLine({
  item,
  roomy,
  compact,
}: {
  item: TodoItem;
  roomy?: boolean;
  compact?: boolean;
}) {
  const { color } = useCourses();
  if (!roomy && !compact) {
    return (
      <Line todoKey={item.key} color={color(item.courseCanvasId)} title={item.title}>
        <ChipBody>{item.title}</ChipBody>
      </Line>
    );
  }
  return (
    <Line
      todoKey={item.key}
      color={color(item.courseCanvasId)}
      title={item.title}
      roomy={roomy}
      compact={compact}
    >
      <Mark kind="planned" />
      {roomy && <span className="min-w-0 flex-1 truncate">{item.title}</span>}
    </Line>
  );
}

/** All-day events (holidays, "no classes") ride in the Due band. */
export function AllDayLine({
  event,
  onOpen,
  roomy,
  compact,
}: {
  event: CalendarEvent;
  onOpen: (event: CalendarEvent) => void;
  roomy?: boolean;
  compact?: boolean;
}) {
  const { color } = useCourses();
  const chip = !roomy && !compact;
  return (
    <Line
      color={color(eventCourseId(event))}
      onClick={() => onOpen(event)}
      title={event.title}
      roomy={roomy}
      compact={compact}
      className={chip ? undefined : "text-ink-2"}
    >
      {chip ? (
        <ChipBody time="All day">{event.title}</ChipBody>
      ) : (
        <>
          <Mark kind="event" />
          {roomy && <span className="min-w-0 flex-1 truncate">{event.title}</span>}
        </>
      )}
    </Line>
  );
}

/**
 * A day's finished items, folded into one muted line ("✓ 3 done"); on the
 * phone's narrow columns just the check and the count. Opens the full list.
 */
export function DoneLine({
  count,
  compact,
  onClick,
}: {
  count: number;
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${count} done`}
      aria-label={`Show ${count} done`}
      className={cn(
        "flex h-[22px] shrink-0 items-center gap-[5px] rounded-[5px] text-left text-ink-3 tabular transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:outline-none",
        compact ? "gap-px px-[3px] text-[11px]" : "w-full pr-1 pl-[3px] text-[12px]",
      )}
    >
      <Mark kind="done" />
      {compact ? count : `${count} done`}
    </button>
  );
}
