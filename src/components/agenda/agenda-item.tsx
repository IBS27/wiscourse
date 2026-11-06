import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Check, ListTree, StickyNote, Undo2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { TodoItem } from "../../../convex/todos";
import { Pill, CourseTag } from "@/components/app/bits";
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
  if (code) {
    meta.push(
      <CourseTag key="code">{code}</CourseTag>,
    );
  }
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
        "group relative flex items-start gap-3 bg-surface py-[11px] pr-5 pl-5 transition-colors hover:bg-hover",
        // Hairline between rows, inset to the title column.
        "after:absolute after:right-0 after:bottom-0 after:left-[49px] after:h-px after:bg-line",
        first && "before:absolute before:top-0 before:right-0 before:left-[49px] before:h-px before:bg-line",
        compact && "pr-[14px] pl-[14px] after:left-[43px] before:left-[43px]",
      )}
      style={courseStyle(color(item.courseCanvasId))}
    >
      <button
        type="button"
        aria-label={done ? "Mark not done" : "Mark done"}
        onClick={() => void setDone({ ref: refOf(item), done: !done })}
        className={cn(
          "mt-[2px] grid size-[17px] shrink-0 place-items-center rounded-full border-[1.5px] border-line-2 transition-colors group-hover:border-ink-3 hover:bg-chip",
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
        <div className={cn("mt-[3px] flex flex-wrap items-center gap-x-[6px] gap-y-[2px] text-[12.5px] text-ink-3", done && "opacity-75")}>
          {meta.map((m, i) => (
            <span key={i} className="flex items-center gap-[6px]">
              {i > 0 && <span className="text-line-2" aria-hidden>·</span>}
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
      return <Pill tone="quiet">Not submitted</Pill>;
    case "none":
      if (item.dueAt === undefined) return <Pill tone="quiet">No due date</Pill>;
      if (item.plannedDay === undefined && dayKeyOf(item.dueAt) !== dayKeyOf(now)) {
        return <Pill tone="quiet">Not planned</Pill>;
      }
      return null;
  }
}
