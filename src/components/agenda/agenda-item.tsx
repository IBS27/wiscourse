import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Check, ListTree, StickyNote, Undo2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { TodoItem } from "../../../convex/todos";
import { Pill } from "@/components/app/bits";
import { refOf } from "@/lib/todo-ref";
import {
  dayKeyOf,
  formatDueRelative,
  formatLate,
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
}: {
  item: TodoItem;
  first?: boolean;
  todayKey: string;
  now: number;
  compact?: boolean;
}) {
  const { label, color } = useCourses();
  const setDone = useMutation(api.todos.setDone);
  const done = item.doneAt !== undefined;
  const code = label(item.courseCanvasId);
  const overdue = isOverdue(item, now);
  const subDone = item.subtasks.filter((s) => s.done).length;

  const meta: ReactNode[] = [];
  if (code) meta.push(<span key="code" className="font-medium text-c">{code}</span>);
  if (item.kind === "local" && !code) meta.push(<span key="personal">Personal</span>);
  if (done && item.doneAt !== undefined) {
    meta.push(<span key="done">Done {formatTime(item.doneAt)}</span>);
  } else if (item.dueAt !== undefined) {
    const label = compact && overdue ? formatLate(item.dueAt, now) : `Due ${formatDueRelative(item.dueAt, todayKey)}`;
    meta.push(<span key="due" className={cn(compact && overdue && "text-red")}>{label}</span>);
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
        "group flex items-start gap-[11px] border-b border-l-4 border-b-line border-l-c bg-surface py-[9px] pr-5 pl-4 hover:bg-hover",
        first && "border-t border-t-line",
        compact && "pr-[14px] pl-3",
      )}
      style={courseStyle(color(item.courseCanvasId))}
    >
      <button
        type="button"
        aria-label={done ? "Mark not done" : "Mark done"}
        onClick={() => void setDone({ ref: refOf(item), done: !done })}
        className={cn(
          "mt-px grid size-[17px] shrink-0 place-items-center rounded-full border-[1.5px] border-line-2 group-hover:border-ink-3",
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
            "text-[13.5px] font-medium tracking-[-0.005em]",
            done && "text-ink-3 line-through decoration-line-2",
          )}
        >
          {item.title}
        </div>
        <div className={cn("mt-[3px] flex flex-wrap items-center gap-[6px] text-xs text-ink-3", done && "opacity-75")}>
          {meta.map((m, i) => (
            <span key={i} className="flex items-center gap-[6px]">
              {i > 0 && <span className="opacity-55">·</span>}
              {m}
            </span>
          ))}
        </div>
      </Link>

      {!compact && (
        <div className="mt-px flex shrink-0 items-center gap-2">
          <StatusPill item={item} done={done} overdue={overdue} now={now} />
        </div>
      )}
    </div>
  );
}

function StatusPill({ item, done, overdue, now }: { item: TodoItem; done: boolean; overdue: boolean; now: number }) {
  if (done) {
    return (
      <Pill tone="outline">
        <Undo2 />
        Undo
      </Pill>
    );
  }
  if (overdue && item.dueAt !== undefined) return <Pill tone="red">{formatLate(item.dueAt, now)}</Pill>;
  switch (item.submission) {
    case "graded":
      return (
        <Pill>
          <Check />
          Graded{item.score !== undefined && item.pointsPossible !== undefined ? ` ${item.score}/${item.pointsPossible}` : ""}
        </Pill>
      );
    case "submitted":
      return (
        <Pill>
          <Check />
          Submitted{item.submittedAt !== undefined ? ` ${formatTime(item.submittedAt)}` : ""}
        </Pill>
      );
    case "missing":
      return <Pill tone="red">Missing</Pill>;
    case "late":
      return <Pill tone="red">Late</Pill>;
    case "unsubmitted":
      return <Pill tone="outline">Not submitted</Pill>;
    case "none":
      if (item.dueAt === undefined) return <Pill tone="outline">No due date</Pill>;
      if (item.plannedDay === undefined && dayKeyOf(item.dueAt) !== dayKeyOf(now)) {
        return <Pill tone="outline">Not planned</Pill>;
      }
      return null;
  }
}
