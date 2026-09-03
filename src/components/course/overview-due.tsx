/**
 * The overview's "Due" block: this course's slice of the unified todo
 * list, so it can never drift from Home or Tasks. Overdue first, then the
 * next seven days — anything further out belongs on Tasks, not here.
 */

import { CircleHelp, MessageSquare, SquareCheck } from "lucide-react";
import type { RowIcon } from "./overview-icons";
import { OverviewRow, SectionHead } from "./overview-row";
import type { TodoItem } from "../../../convex/todos";
import { Pill } from "@/components/app/bits";
import { isOverdue } from "@/lib/agenda";
import { DAY_MS, dayKeyOf, formatDayShort, formatTime, formatWeekday } from "@/lib/dates";

const ICON: Record<string, RowIcon> = {
  assignment: SquareCheck,
  quiz: CircleHelp,
  discussion: MessageSquare,
  local: SquareCheck,
};

export function OverviewDue({
  todos,
  canvasId,
  now,
}: {
  todos: TodoItem[] | undefined;
  canvasId: number;
  now: number;
}) {
  if (todos === undefined) return null;
  const open = todos.filter(
    (t) =>
      t.courseCanvasId === canvasId &&
      t.doneAt === undefined &&
      t.submission !== "submitted" &&
      t.submission !== "graded",
  );
  const overdue = open.filter((t) => isOverdue(t, now));
  const soon = open.filter(
    (t) => t.dueAt !== undefined && t.dueAt >= now && t.dueAt < now + 7 * DAY_MS,
  );
  const items = [...overdue, ...soon].sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));

  const detail = [
    overdue.length > 0 ? `${overdue.length} overdue` : undefined,
    soon.length > 0 ? `${soon.length} this week` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section>
      <SectionHead title="Due" detail={detail === "" ? undefined : detail} red={overdue.length > 0} />
      {items.length === 0 ? (
        <div className="px-4 pb-3 text-[12.5px] text-ink-3 md:px-5">
          Nothing due in the next week.
        </div>
      ) : (
        items.map((item) => (
          <OverviewRow
            key={item.key}
            icon={ICON[item.kind] ?? SquareCheck}
            title={item.title}
            to={`/todo/${item.key}`}
            meta={dueMeta(item, now)}
          />
        ))
      )}
    </section>
  );
}

function dueMeta(item: TodoItem, now: number) {
  if (item.dueAt === undefined) return item.plannedDay === undefined ? "No due date" : undefined;
  if (isOverdue(item, now)) {
    return <Pill tone="red">Overdue · was {formatWeekday(dayKeyOf(item.dueAt))}</Pill>;
  }
  const parts = [
    `${formatDayShort(dayKeyOf(item.dueAt))} · ${formatTime(item.dueAt)}`,
    item.pointsPossible === undefined ? undefined : `${item.pointsPossible} pts`,
  ].filter(Boolean);
  return parts.join(" · ");
}
