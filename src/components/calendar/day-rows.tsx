// One row shape for "a day, read in full": the month popover uses the
// compact variant, the mobile Day view the roomier one. Same grammar as
// src/components/agenda/agenda-item.tsx — mark, time, title, meta — tuned
// for a calendar column instead of the agenda.

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { TodoItem } from "../../../convex/todos";
import { Mark, type MarkKind } from "./marks";
import { Pill } from "@/components/app/bits";
import {
  blockLabel,
  clockTimeMeridiem,
  eventCourseId,
  isDoneOrSubmitted,
  minuteOf,
  minuteRange,
  minuteRangeTight,
  type CalendarEvent,
  type TimeBlock,
} from "@/lib/calendar";
import { formatDueRelative, formatLate, formatTime } from "@/lib/dates";
import { isOverdue } from "@/lib/agenda";
import { courseStyle, useCourses } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export type RowVariant = "popover" | "list";

export function DayRow({
  variant,
  mark,
  color,
  time,
  title,
  meta,
  done,
  trailing,
  todoKey,
  onClick,
}: {
  variant: RowVariant;
  mark: MarkKind;
  color: string;
  /** Left time column; "—" when the item has no time. */
  time: string;
  title: string;
  meta?: ReactNode;
  done?: boolean;
  trailing?: ReactNode;
  todoKey?: string;
  onClick?: () => void;
}) {
  const list = variant === "list";
  const shell = cn(
    "flex w-full items-start gap-[9px] text-left hover:bg-hover",
    list ? "gap-[10px] border-b border-line px-4 pt-[9px] pb-[10px]" : "px-4 pt-[7px] pb-2",
  );
  const body = (
    <>
      <Mark kind={mark} className={cn("mt-[3px]")} />
      <span
        className={cn(
          "shrink-0 tabular whitespace-nowrap text-ink-3",
          list ? "w-[70px] pt-px text-[12.5px]" : "w-[70px] pt-px text-xs",
        )}
      >
        {time}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate font-medium tracking-[-0.005em]",
            list ? "text-[13.5px]" : "text-[13px]",
            done && "text-ink-3 line-through decoration-line-2",
          )}
        >
          {title}
        </span>
        {meta !== undefined && (
          <span
            className={cn(
              "mt-[2px] block truncate text-ink-3",
              list ? "text-xs" : "text-[11.5px]",
            )}
          >
            {meta}
          </span>
        )}
      </span>
      {trailing}
    </>
  );

  if (todoKey !== undefined) {
    return (
      <Link to="/todo/$key" params={{ key: todoKey }} className={shell} style={courseStyle(color)}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={shell} style={courseStyle(color)}>
      {body}
    </button>
  );
}

function Sep() {
  return <span className="mx-[5px] opacity-55">·</span>;
}

export function DueRow({
  item,
  variant,
  zone,
  now,
}: {
  item: TodoItem;
  variant: RowVariant;
  zone: string;
  now: number;
}) {
  const { color, label } = useCourses();
  const done = item.doneAt !== undefined;
  const settled = isDoneOrSubmitted(item);
  const code = label(item.courseCanvasId);
  const overdue = isOverdue(item, now);
  const meta: ReactNode[] = [];
  if (code !== undefined) meta.push(<span key="code" className="font-medium text-c">{code}</span>);
  if (item.kind === "local" && code === undefined) meta.push(<span key="personal">Personal</span>);
  if (item.submittedAt !== undefined && settled) {
    meta.push(<span key="state">Submitted {formatTime(item.submittedAt)}</span>);
  } else if (done && item.doneAt !== undefined) {
    meta.push(<span key="state">Done {formatTime(item.doneAt)}</span>);
  } else if (overdue && item.dueAt !== undefined) {
    meta.push(<span key="state" className="text-red">{formatLate(item.dueAt, now)}</span>);
  } else if (item.submission === "unsubmitted") {
    meta.push(<span key="state">Not submitted</span>);
  }

  return (
    <DayRow
      variant={variant}
      mark={settled ? "done" : "due"}
      color={color(item.courseCanvasId)}
      time={item.dueAt === undefined ? "—" : clockTimeMeridiem(minuteOf(item.dueAt, zone))}
      title={item.title}
      meta={joinMeta(meta)}
      done={settled}
      todoKey={item.key}
    />
  );
}

export function PlannedRow({
  item,
  variant,
  todayKey,
}: {
  item: TodoItem;
  variant: RowVariant;
  todayKey: string;
}) {
  const { color, label } = useCourses();
  const code = label(item.courseCanvasId);
  const meta: ReactNode[] = [
    code === undefined ? (
      <span key="code">Personal</span>
    ) : (
      <span key="code" className="font-medium text-c">{code}</span>
    ),
    <span key="due">
      {item.dueAt === undefined ? "No due date" : `Due ${formatDueRelative(item.dueAt, todayKey)}`}
    </span>,
  ];
  return (
    <DayRow
      variant={variant}
      mark="planned"
      color={color(item.courseCanvasId)}
      time="—"
      title={item.title}
      meta={joinMeta(meta)}
      todoKey={item.key}
    />
  );
}

export function BlockRow({
  block,
  variant,
  now,
  onOpen,
}: {
  block: TimeBlock;
  variant: RowVariant;
  now: number;
  onOpen: (block: TimeBlock) => void;
}) {
  const { color } = useCourses();
  const live = now >= block.startAt && now < block.endAt;
  const meta: ReactNode[] = [];
  if (block.subtitle !== undefined) meta.push(<span key="where">{block.subtitle}</span>);
  return (
    <DayRow
      variant={variant}
      mark={block.kind === "meeting" ? "meeting" : "event"}
      color={color(block.courseCanvasId)}
      time={
        variant === "popover"
          ? minuteRangeTight(block.startMinute, block.endMinute)
          : minuteRange(block.startMinute, block.endMinute)
      }
      title={blockLabel(block)}
      meta={joinMeta(meta)}
      trailing={live ? <Pill>now</Pill> : undefined}
      onClick={() => onOpen(block)}
    />
  );
}

export function AllDayRow({
  event,
  variant,
  onOpen,
}: {
  event: CalendarEvent;
  variant: RowVariant;
  onOpen: (event: CalendarEvent) => void;
}) {
  const { color } = useCourses();
  return (
    <DayRow
      variant={variant}
      mark="event"
      color={color(eventCourseId(event))}
      // The group heading already says "All day"; the column stays quiet.
      time="—"
      title={event.title}
      meta={event.location === undefined ? undefined : <span>{event.location}</span>}
      onClick={() => onOpen(event)}
    />
  );
}

function joinMeta(parts: ReactNode[]): ReactNode | undefined {
  if (parts.length === 0) return undefined;
  return parts.map((part, i) => (
    <span key={i}>
      {i > 0 && <Sep />}
      {part}
    </span>
  ));
}
