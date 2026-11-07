/**
 * The overview's "Due" block: this course's slice of the unified todo
 * list, so it can never drift from Home or Tasks. Overdue first, then the
 * next seven days — anything further out belongs on Tasks, not here. Rows
 * are Home's own AgendaItem, so the anatomy (completion circle, title, meta
 * line, late status) is the same everywhere.
 */

import { CalendarCheck } from "lucide-react";
import { SectionHead } from "./overview-row";
import { SECTION_COUNT } from "./overview-icons";
import type { TodoItem } from "../../../convex/todos";
import { AgendaItem } from "@/components/agenda/agenda-item";
import { isOverdue } from "@/lib/agenda";
import { DAY_MS } from "@/lib/dates";

export function OverviewDue({
  todos,
  canvasId,
  now,
  todayKey,
}: {
  todos: TodoItem[] | undefined;
  canvasId: number;
  now: number;
  todayKey: string;
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

  // The total sits at the right; the detail names the window, and the
  // overdue share when there is one.
  const detail = (
    <>
      Next 7 days
      {overdue.length > 0 && (
        <>
          {" · "}
          <span className="text-red">{overdue.length} overdue</span>
        </>
      )}
    </>
  );

  return (
    <section>
      <SectionHead
        title="Due"
        detail={detail}
        right={<span className={SECTION_COUNT}>{items.length}</span>}
      />
      {items.length === 0 ? (
        <div className="flex items-center gap-[10px] px-4 py-2 text-[13px] text-ink-3 md:px-6">
          <CalendarCheck className="size-[14px] shrink-0" aria-hidden />
          Nothing due in the next week.
        </div>
      ) : (
        items.map((item, i) => (
          <AgendaItem key={item.key} item={item} first={i === 0} todayKey={todayKey} now={now} hideCourse />
        ))
      )}
    </section>
  );
}
