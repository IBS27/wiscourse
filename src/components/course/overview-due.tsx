/**
 * The overview's "Due" block: this course's slice of the unified todo
 * list, so it can never drift from Home or Tasks. Overdue first, then the
 * next seven days — anything further out belongs on Tasks, not here.
 */

import { CalendarCheck, CircleHelp, MessageSquare, ClipboardList } from "lucide-react";
import type { RowIcon } from "./overview-icons";
import { OverviewRow, SectionHead } from "./overview-row";
import type { TodoItem } from "../../../convex/todos";
import { Pill } from "@/components/app/bits";
import { isOverdue } from "@/lib/agenda";
import { DAY_MS, dayKeyOf, formatDayShort, formatTime, formatWeekday } from "@/lib/dates";

const ICON: Record<string, RowIcon> = {
  assignment: ClipboardList,
  quiz: CircleHelp,
  discussion: MessageSquare,
  local: ClipboardList,
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

  const detail =
    overdue.length === 0 && soon.length === 0 ? undefined : (
      <>
        {overdue.length > 0 && <span className="text-red">{overdue.length} overdue</span>}
        {overdue.length > 0 && soon.length > 0 && " · "}
        {soon.length > 0 && `${soon.length} this week`}
      </>
    );

  return (
    <section>
      <SectionHead title="Due" detail={detail} className="pt-5" />
      {items.length === 0 ? (
        <div className="flex items-center gap-[10px] px-4 py-2 text-[13px] text-ink-3 md:px-6">
          <CalendarCheck className="size-[14px] shrink-0" aria-hidden />
          Nothing due in the next week.
        </div>
      ) : (
        items.map((item) => (
          <OverviewRow
            key={item.key}
            icon={ICON[item.kind] ?? ClipboardList}
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
