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
import { isOverdue } from "@/lib/agenda";
import { courseStyle, useCourses } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/**
 * The shared band item. In the week's columns it is a small event chip: a
 * course-colour wash with a 2px bar on its left, a title of up to two lines
 * and one meta line under it. The Day band has the width for one line, with
 * the same meta right-aligned, and the phone's week shows the mark alone.
 * The tooltip always carries the full title.
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

/**
 * The week's event chip: a ~11% course-colour wash and a 2px course bar. Dark
 * mode's wash sits nearer the surface, so a chip weighs the same in both.
 */
const CHIP = cn(
  "block w-full shrink-0 rounded-[6px] border-l-2 border-c py-[3px] pr-[5px] pl-[6px] text-[13px] leading-[16px]",
  "bg-[color-mix(in_srgb,var(--c)_11%,var(--surface))] hover:bg-[color-mix(in_srgb,var(--c)_17%,var(--surface))]",
  "dark:bg-[color-mix(in_srgb,var(--c)_13%,var(--surface))] dark:hover:bg-[color-mix(in_srgb,var(--c)_19%,var(--surface))]",
);

/** Past due: the theme red, a brighter red in dark so it reads on the wash. */
const LATE = "text-red dark:text-[#ff7b7b]";

/** "11 AM" on the hour, else "11:30 AM": short enough that the course code fits a chip. */
function shortClock(minute: number): string {
  const full = clockTimeMeridiem(minute);
  return minute % 60 === 0 ? full.replace(":00", "") : full;
}

/**
 * The quiet meta line ("11 AM · ASTRON 103"), the time in red when past due;
 * a late chip with no time reads "Late · ASTRON 103".
 * It never wraps: the time stays whole and the course truncates.
 */
function ChipMeta({
  time,
  course,
  late,
  className,
}: {
  time?: string;
  course?: string;
  late?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-[4px] font-normal whitespace-nowrap tabular text-ink-3",
        className,
      )}
    >
      {late && time !== undefined && <span className="sr-only">Past due</span>}
      {/* Without a time (the 11:59 PM default), a late chip still says so. */}
      {(time ?? (late ? "Late" : undefined)) !== undefined && (
        <span className={cn("shrink-0", late && LATE)}>{time ?? "Late"}</span>
      )}
      {(time !== undefined || late) && course !== undefined && (
        <span className="shrink-0" aria-hidden>
          ·
        </span>
      )}
      {course !== undefined && <span className="min-w-0 truncate">{course}</span>}
    </span>
  );
}

/**
 * A chip's body: the title (three lines at most, so typical titles show in
 * full), led by a check when the item is done, then one quiet meta line
 * ("11:00 AM · ASTRON 103") that truncates rather than wraps. `late` turns
 * the time red.
 */
function ChipBody({
  time,
  course,
  done,
  late,
  children,
}: {
  time?: string;
  course?: string;
  done?: boolean;
  late?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <span className="flex items-start gap-[3px]">
        {done && <Mark kind="done" className="h-4 w-3" />}
        <span className="line-clamp-3 min-w-0 flex-1 break-words">{children}</span>
      </span>
      {(time !== undefined || course !== undefined || late) && (
        <ChipMeta
          time={time}
          course={course}
          late={late}
          className="mt-px text-[12px] leading-[14px]"
        />
      )}
    </>
  );
}

/** 11:59 PM — Canvas's default deadline, which the Due band already implies. */
const END_OF_DAY = 23 * 60 + 59;

export function DueLine({
  item,
  zone,
  now,
  roomy,
  compact,
}: {
  item: TodoItem;
  zone: string;
  /** Marks a past-due, unfinished chip with a red clock. */
  now?: number;
  roomy?: boolean;
  compact?: boolean;
}) {
  const { color, label } = useCourses();
  const course = label(item.courseCanvasId) || undefined;
  const done = isDoneOrSubmitted(item);
  const late = !done && now !== undefined && isOverdue(item, now);
  const minute = item.dueAt === undefined ? undefined : minuteOf(item.dueAt, zone);
  const tooltip =
    minute === undefined ? item.title : `${item.title} · due ${clockTimeMeridiem(minute)}`;
  if (!roomy && !compact) {
    // The meta line says when and for which course. The end-of-day default
    // is left out (the Due band implies it); the tooltip always carries it.
    const when = minute === undefined || minute === END_OF_DAY ? undefined : shortClock(minute);
    return (
      <Line todoKey={item.key} color={color(item.courseCanvasId)} title={tooltip} muted={done}>
        <ChipBody time={when} course={course} done={done} late={late}>
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
      {roomy && (minute !== undefined || course !== undefined) && (
        <ChipMeta
          time={minute === undefined ? undefined : clockTimeMeridiem(minute)}
          course={course}
          late={late}
          className="max-w-[50%] text-xs"
        />
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
