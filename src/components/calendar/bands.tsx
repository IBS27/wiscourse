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

/** The shared `.li` row: mark, title, optional right-aligned time. */
function Line({
  color,
  onClick,
  todoKey,
  title,
  roomy,
  className,
  children,
}: {
  color: string;
  onClick?: () => void;
  /** When set the row links to the todo detail instead of firing `onClick`. */
  todoKey?: string;
  /** Tooltip; the row itself truncates. */
  title?: string;
  /** The phone's Due band gives each line more room than the week grid. */
  roomy?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const shell = cn(
    "flex h-[22px] w-full items-center gap-[6px] overflow-hidden rounded-[5px] pr-[6px] pl-1 text-left text-[11.5px] font-medium whitespace-nowrap text-ink hover:bg-hover",
    roomy && "h-[26px] px-[6px] text-[12.5px]",
    className,
  );
  if (todoKey !== undefined) {
    return (
      <Link to="/todo/$key" params={{ key: todoKey }} className={shell} style={courseStyle(color)} title={title}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={shell} style={courseStyle(color)} title={title}>
      {children}
    </button>
  );
}

export function DueLine({
  item,
  zone,
  roomy,
}: {
  item: TodoItem;
  zone: string;
  roomy?: boolean;
}) {
  const { color } = useCourses();
  const done = isDoneOrSubmitted(item);
  return (
    <Line
      todoKey={item.key}
      color={color(item.courseCanvasId)}
      title={item.title}
      roomy={roomy}
      className={cn(done && "text-ink-3")}
    >
      <Mark kind={done ? "done" : "due"} />
      <span className={cn("min-w-0 flex-1 truncate", done && "line-through decoration-line-2")}>
        {item.title}
      </span>
      {item.dueAt !== undefined && (
        <span className={cn("tabular font-normal text-ink-3", roomy ? "text-xs" : "text-[11px]")}>
          {roomy
            ? clockTimeMeridiem(minuteOf(item.dueAt, zone))
            : denseTime(minuteOf(item.dueAt, zone))}
        </span>
      )}
    </Line>
  );
}

export function PlanLine({ item, roomy }: { item: TodoItem; roomy?: boolean }) {
  const { color } = useCourses();
  return (
    <Line todoKey={item.key} color={color(item.courseCanvasId)} title={item.title} roomy={roomy}>
      <Mark kind="planned" />
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
    </Line>
  );
}

/** All-day events (holidays, "no classes") sit in the Due band, unstyled. */
export function AllDayLine({
  event,
  onOpen,
  roomy,
}: {
  event: CalendarEvent;
  onOpen: (event: CalendarEvent) => void;
  roomy?: boolean;
}) {
  const { color } = useCourses();
  return (
    <Line
      color={color(eventCourseId(event))}
      onClick={() => onOpen(event)}
      title={event.title}
      roomy={roomy}
      className="font-medium text-ink-2"
    >
      <Mark kind="event" />
      <span className="min-w-0 flex-1 truncate">{event.title}</span>
    </Line>
  );
}
