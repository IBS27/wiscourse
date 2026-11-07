// The one-line items that ride above the time grid: due times, all-day
// events and planned todos. They are never blocks — an 11:59 PM deadline is
// not a one-minute meeting (docs/calendar.html, section A).

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { TodoItem } from "../../../convex/todos";
import { Mark } from "./marks";
import {
  clockTimeMeridiem,
  denseTime,
  eventCourseId,
  isDoneOrSubmitted,
  minuteOf,
  type CalendarEvent,
} from "@/lib/calendar";
import { courseStyle, useCourses } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/**
 * The shared band row: mark, then the title. In the week's narrow columns
 * the title wraps to two lines, led by a small time, so an item reads
 * without opening it; the Day band has the width for one line and a
 * right-aligned time instead. The tooltip always carries the full title.
 */
function Line({
  color,
  onClick,
  todoKey,
  title,
  roomy,
  compact,
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
  className?: string;
  children: ReactNode;
}) {
  const shell = cn(
    "flex gap-[5px] rounded-[5px] text-left font-medium text-ink transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:outline-none",
    compact
      ? "size-[22px] items-center justify-center"
      : roomy
        ? "h-[28px] w-full items-center gap-[6px] px-[6px] text-[12.5px] whitespace-nowrap"
        : "w-full shrink-0 items-start py-[3px] pr-1 pl-[3px] text-[12.5px] leading-[16px]",
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
 * The title's text: one truncated line in the roomy Day band, otherwise up
 * to two wrapped lines.
 */
function Title({
  done,
  roomy,
  children,
}: {
  done?: boolean;
  roomy?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "min-w-0 flex-1",
        roomy ? "truncate" : "line-clamp-2 break-words",
        done && "text-ink-3",
      )}
    >
      {children}
    </span>
  );
}

/** The mark beside a wrapping title sits level with its first line. */
const markFor = (roomy?: boolean, compact?: boolean) =>
  roomy || compact ? undefined : "h-4";

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
  const { color } = useCourses();
  const done = isDoneOrSubmitted(item);
  const minute = item.dueAt === undefined ? undefined : minuteOf(item.dueAt, zone);
  // In the week's narrow columns the time leads the title, as in a month
  // view ("11:00a Exam 2"), and the end-of-day default is left out so the
  // title keeps the room. The tooltip always carries it.
  const lead = !roomy && minute !== undefined && minute !== END_OF_DAY;
  return (
    <Line
      todoKey={item.key}
      color={color(item.courseCanvasId)}
      title={minute === undefined ? item.title : `${item.title} · due ${clockTimeMeridiem(minute)}`}
      roomy={roomy}
      compact={compact}
      className={cn(done && "text-ink-3")}
    >
      <Mark kind={done ? "done" : "due"} className={markFor(roomy, compact)} />
      {!compact && (
        <Title done={done} roomy={roomy}>
          {lead && (
            <>
              <span className="text-[11.5px] font-normal tabular text-ink-3">
                {denseTime(minute)}
              </span>{" "}
            </>
          )}
          {item.title}
        </Title>
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
  return (
    <Line
      todoKey={item.key}
      color={color(item.courseCanvasId)}
      title={item.title}
      roomy={roomy}
      compact={compact}
    >
      <Mark kind="planned" className={markFor(roomy, compact)} />
      {!compact && <Title roomy={roomy}>{item.title}</Title>}
    </Line>
  );
}

/** All-day events (holidays, "no classes") sit in the Due band, unstyled. */
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
  return (
    <Line
      color={color(eventCourseId(event))}
      onClick={() => onOpen(event)}
      title={event.title}
      roomy={roomy}
      compact={compact}
      className="font-medium text-ink-2"
    >
      <Mark kind="event" className={markFor(roomy, compact)} />
      {!compact && <Title roomy={roomy}>{event.title}</Title>}
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
