import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Check, Clock, ListTree, StickyNote, Undo2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { TodoItem } from "../../../convex/todos";
import { Pill, CourseTag } from "@/components/app/bits";
import { refOf } from "@/lib/todo-ref";
import {
  formatDueCompact,
  formatDueRelative,
  formatLate,
  formatLateShort,
  formatPlannedRelative,
  formatTime,
} from "@/lib/dates";
import { isOverdue } from "@/lib/agenda";
import { courseStyle, useCourses } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export function AgendaItem({
  item,
  first,
  todayKey,
  now,
  compact = false,
  hideCourse = false,
}: {
  item: TodoItem;
  first?: boolean;
  todayKey: string;
  now: number;
  compact?: boolean;
  /** Inside a course page the course tag would only repeat the page. */
  hideCourse?: boolean;
}) {
  const { label, color } = useCourses();
  const setDone = useMutation(api.todos.setDone);
  const done = item.doneAt !== undefined;
  const code = label(item.courseCanvasId);
  const overdue = isOverdue(item, now);
  const subDone = item.subtasks.filter((s) => s.done).length;

  const meta: ReactNode[] = [];
  if (code && !hideCourse) {
    meta.push(
      <CourseTag key="code">{code}</CourseTag>,
    );
  }
  if (item.kind === "local" && !code) meta.push(<span key="personal">Personal</span>);
  if (done && item.doneAt !== undefined) {
    meta.push(<span key="done">Done {formatTime(item.doneAt)}</span>);
  } else if (item.dueAt !== undefined) {
    if (compact && overdue) {
      meta.push(<span key="due" className="text-red">{formatLate(item.dueAt, now)}</span>);
    } else {
      // Lateness reads next to the title it belongs to, before the due date
      // (which may truncate on a phone), not at the far edge of the row.
      if (overdue) {
        meta.push(
          <span key="late" className="flex items-center gap-1 font-medium text-red">
            <Clock className="size-[12px]" aria-hidden />
            <span className="sm:hidden">{formatLateShort(item.dueAt, now)}</span>
            <span className="max-sm:hidden">{formatLate(item.dueAt, now)}</span>
          </span>,
        );
      }
      meta.push(
        <span key="due">
          <span className="sm:hidden">Due {formatDueCompact(item.dueAt, todayKey)}</span>
          <span className="max-sm:hidden">Due {formatDueRelative(item.dueAt, todayKey)}</span>
        </span>,
      );
    }
  }
  if (!done && item.plannedDay !== undefined) {
    meta.push(<span key="plan">Planned {formatPlannedRelative(item.plannedDay < todayKey ? todayKey : item.plannedDay, todayKey)}</span>);
  }
  if (item.kind === "local" && code) meta.push(<span key="personal">Personal</span>);
  if (item.subtasks.length > 0) {
    meta.push(
      <span key="sub" className="flex items-center gap-1">
        <ListTree className="size-[13px]" />
        {subDone}/{item.subtasks.length}
      </span>,
    );
  }
  if (item.notes) meta.push(<StickyNote key="notes" className="size-[13px]" />);

  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 bg-surface py-[11px] pr-4 pl-4 transition-colors hover:bg-hover md:pr-6 md:pl-6",
        // Hairline between rows, inset to the title column.
        "after:absolute after:right-4 after:bottom-0 after:left-[45px] after:h-px after:bg-line md:after:right-6 md:after:left-[53px]",
        first && "before:absolute before:top-0 before:right-4 before:left-[45px] before:h-px before:bg-line md:before:right-6 md:before:left-[53px]",
        compact && "pr-[14px] pl-[14px] after:left-[43px] before:left-[43px] md:pr-[14px] md:pl-[14px] md:after:left-[43px] md:before:left-[43px]",
      )}
      style={courseStyle(color(item.courseCanvasId))}
    >
      <button
        type="button"
        aria-label={done ? "Mark not done" : "Mark done"}
        onClick={() => void setDone({ ref: refOf(item), done: !done })}
        className={cn(
          "mt-[2px] grid size-[17px] shrink-0 place-items-center rounded-full border-[1.5px] border-ink-3/70 transition-colors group-hover:border-ink-2 hover:bg-chip",
          done && "border-ink-3 bg-ink-3",
        )}
      >
        <Check className={cn("size-[11px] stroke-[2.2] text-today-fg", !done && "opacity-0")} />
      </button>

      <Link
        to="/todo/$key"
        params={{ key: item.key }}
        className="min-w-0 flex-1 outline-none"
      >
        <div
          className={cn(
            "text-[14px] leading-[1.4] font-medium tracking-[-0.006em] text-ink",
            done && "text-ink-3 line-through decoration-line-2",
          )}
        >
          {item.title}
        </div>
        <div className={cn("mt-[3px] flex min-w-0 items-center gap-x-[6px] overflow-hidden text-[13px] whitespace-nowrap text-ink-3")}>
          {meta.map((m, i) => (
            <span key={i} className={cn("flex items-center gap-[6px]", i === meta.length - 1 ? "min-w-0" : "shrink-0")}>
              {i > 0 && <span className="text-line-2" aria-hidden>·</span>}
              {i === meta.length - 1 ? <span className="min-w-0 truncate">{m}</span> : m}
            </span>
          ))}
        </div>
      </Link>

      {!compact && (
        <div className="mt-px flex shrink-0 items-center gap-2">
          <StatusPill item={item} done={done} overdue={overdue} />
        </div>
      )}
    </div>
  );
}

function StatusPill({ item, done, overdue }: { item: TodoItem; done: boolean; overdue: boolean }) {
  if (done) {
    return (
      <Pill tone="outline">
        <Undo2 />
        Undo
      </Pill>
    );
  }
  // Lateness lives on the meta line; nothing at the far edge.
  if (overdue) return null;

  switch (item.submission) {
    case "graded":
      return (
        <Pill tone="quiet">
          <Check />
          Graded{item.score !== undefined && item.pointsPossible !== undefined ? ` ${item.score}/${item.pointsPossible}` : ""}
        </Pill>
      );
    case "submitted":
      return (
        <Pill tone="quiet">
          <Check />
          Submitted{item.submittedAt !== undefined ? ` ${formatTime(item.submittedAt)}` : ""}
        </Pill>
      );
    case "missing":
      return <Pill tone="red">Missing</Pill>;
    case "late":
      return <Pill tone="red">Late</Pill>;
    case "unsubmitted":
      // Not submitted is the default for open work; saying it on every row is noise.
      return null;
    case "none":
      if (item.dueAt === undefined) return <Pill tone="quiet">No due date</Pill>;
      return null;
  }
}
