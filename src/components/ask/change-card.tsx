import { useState, type ReactNode } from "react";
import { useMutation } from "convex/react";
import { Check, Undo2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { MEETING_KIND_LABELS } from "../../../convex/lib/meetings";
import { WEEKDAYS } from "../../../convex/lib/assistantTime";
import { allDayKey } from "@/lib/calendar";
import { dayKeyOf, formatDay, formatDueRelative, formatTime } from "@/lib/dates";
import { errorMessage } from "@/lib/ask";
import { courseStyle, useCourses, useToday } from "@/lib/hooks";
import { cn } from "@/lib/utils";

type Change = Doc<"assistantChanges">;
type Op = Change["ops"][number];
type Mark = "task" | "event" | "meeting" | "course";

interface Row {
  mark: Mark;
  course: number | undefined;
  title: string;
  gone?: boolean;
  added?: boolean;
  meta: ReactNode[];
  was?: string;
  now?: string;
}

function clock(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function eventWhen(e: { startAt: number; endAt?: number; allDay?: boolean }): string {
  if (e.allDay) return `${formatDay(allDayKey(e.startAt))}, all day`;
  const day = formatDay(dayKeyOf(e.startAt));
  if (e.endAt === undefined) return `${day}, ${formatTime(e.startAt)}`;
  const sameDay = dayKeyOf(e.endAt) === dayKeyOf(e.startAt);
  return sameDay
    ? `${day}, ${formatTime(e.startAt)} – ${formatTime(e.endAt)}`
    : `${day}, ${formatTime(e.startAt)} – ${formatDay(dayKeyOf(e.endAt))}, ${formatTime(e.endAt)}`;
}

function planned(day: string | undefined): string {
  return day === undefined ? "not planned" : formatDay(day);
}

/** What one op looks like as a row: the thing, and what happens to it. */
function describe(op: Op, todayKey: string): Row {
  switch (op.type) {
    case "createTask": {
      const meta: ReactNode[] = ["New task"];
      if (op.plannedDay) meta.push(`Planned ${formatDay(op.plannedDay)}`);
      if (op.dueAt !== undefined) meta.push(`Due ${formatDueRelative(op.dueAt, todayKey)}`);
      if (op.subtasks?.length) meta.push(`${op.subtasks.length} subtask${op.subtasks.length === 1 ? "" : "s"}`);
      return { mark: "task", course: op.courseCanvasId, title: op.title, added: true, meta };
    }
    case "updateTask": {
      const { set, before } = op;
      const meta: ReactNode[] = [];
      let was: string | undefined;
      let now: string | undefined;
      if (set.plannedDay !== undefined) {
        was = planned(before.plannedDay);
        now = set.plannedDay === null ? "Unplanned" : `Planned ${formatDay(set.plannedDay)}`;
      }
      if (set.dueAt !== undefined) {
        meta.push(set.dueAt === null ? "Due date cleared" : `Due ${formatDueRelative(set.dueAt, todayKey)}`);
      }
      if (set.done !== undefined) meta.push(set.done ? "Marked done" : "Reopened");
      if (set.title !== undefined && set.title !== before.title) meta.push(`Renamed from “${before.title}”`);
      if (set.notes !== undefined) meta.push(set.notes === null ? "Notes cleared" : "Notes updated");
      if (set.addSubtasks?.length) {
        meta.push(`${set.addSubtasks.length} subtask${set.addSubtasks.length === 1 ? "" : "s"} added`);
      }
      if (set.courseCanvasId !== undefined) meta.push(set.courseCanvasId === null ? "Course removed" : "Course changed");
      return {
        mark: "task",
        course: set.courseCanvasId ?? before.courseCanvasId,
        title: set.title ?? before.title,
        meta,
        was,
        now,
      };
    }
    case "deleteTask":
      return { mark: "task", course: op.before.courseCanvasId, title: op.before.title, gone: true, meta: ["Delete task"] };
    case "createEvent":
      return {
        mark: "event",
        course: op.event.courseCanvasId,
        title: op.event.title,
        added: true,
        meta: ["New event", ...(op.event.location ? [op.event.location] : [])],
        now: eventWhen(op.event),
      };
    case "updateEvent": {
      const moved =
        op.event.startAt !== op.before.startAt || op.event.endAt !== op.before.endAt || op.event.allDay !== op.before.allDay;
      const meta: ReactNode[] = [];
      if (op.event.title !== op.before.title) meta.push(`Renamed from “${op.before.title}”`);
      if (op.event.location !== op.before.location) meta.push(op.event.location ? `At ${op.event.location}` : "Location cleared");
      if (op.event.description !== op.before.description) meta.push("Details updated");
      return {
        mark: "event",
        course: op.event.courseCanvasId,
        title: op.event.title,
        meta,
        was: moved ? eventWhen(op.before) : undefined,
        now: eventWhen(op.event),
      };
    }
    case "deleteEvent":
      return { mark: "event", course: op.before.courseCanvasId, title: op.before.title, gone: true, meta: ["Delete event"], now: eventWhen(op.before) };
    case "createMeeting":
    case "deleteMeeting": {
      const m = op.type === "createMeeting" ? op.meeting : op.before;
      return {
        mark: "meeting",
        course: m.courseCanvasId,
        title: m.label ?? MEETING_KIND_LABELS[m.kind],
        added: op.type === "createMeeting",
        gone: op.type === "deleteMeeting",
        meta: [op.type === "createMeeting" ? "New class meeting" : "Remove class meeting", ...(m.location ? [m.location] : [])],
        now: `${m.days.map((d) => WEEKDAYS[d]).join(", ")} ${clock(m.startMinute)} – ${clock(m.endMinute)}`,
      };
    }
    case "setCoursePrefs": {
      const meta: ReactNode[] = [];
      if (op.set.nickname !== undefined) meta.push(op.set.nickname === null ? "Nickname cleared" : `Nickname “${op.set.nickname}”`);
      if (op.set.color !== undefined) meta.push(`Colour ${op.set.color}`);
      if (op.set.hidden !== undefined) meta.push(op.set.hidden ? "Hidden from the sidebar" : "Shown in the sidebar");
      return { mark: "course", course: op.courseCanvasId, title: "Course display", meta };
    }
  }
}

function MarkIcon({ mark, added }: { mark: Mark; added?: boolean }) {
  return (
    <span className="grid size-[14px] shrink-0 place-items-center" aria-hidden>
      {mark === "event" ? (
        <i className={cn("block size-[7px] rounded-full shadow-[inset_0_0_0_1.5px_var(--c)]")} />
      ) : mark === "meeting" ? (
        <i className="block h-3 w-[3px] rounded-[2px] bg-c" />
      ) : mark === "course" ? (
        <i className="block size-[7px] rounded-full bg-c" />
      ) : (
        <i className={cn("block size-[11px] rounded-[3px] border-[1.5px] border-c opacity-85", added && "border-dashed")} />
      )}
    </span>
  );
}

function OpRow({ row }: { row: Row }) {
  const { label, color } = useCourses();
  const code = label(row.course);
  const meta = [...(code ? [<span key="code" className="font-medium text-c">{code}</span>] : []), ...row.meta];
  return (
    <div className="flex items-center gap-[10px] border-b border-line py-2 pr-[11px] pl-[10px] last:border-b-0" style={courseStyle(color(row.course))}>
      <MarkIcon mark={row.mark} added={row.added} />
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-[13px] font-medium tracking-[-0.005em]", row.gone && "text-ink-3 line-through decoration-line-2")}>
          {row.title}
        </div>
        {(meta.length > 0 || row.was) && (
          <div className="mt-px flex flex-wrap items-center gap-x-[6px] text-[11.5px] text-ink-3">
            {meta.map((m, i) => (
              <span key={i} className="flex items-center gap-[6px]">
                {i > 0 && <span className="opacity-55">·</span>}
                {m}
              </span>
            ))}
            {row.was && (
              <span className="flex items-center gap-[6px]">
                {meta.length > 0 && <span className="opacity-55">·</span>}
                <span className="line-through decoration-line-2">{row.was}</span>
              </span>
            )}
          </div>
        )}
      </div>
      {row.now && (
        <span className={cn("shrink-0 text-right text-[12px] tabular whitespace-nowrap", row.was ? "font-medium text-ink" : "text-ink-2", row.gone && "text-ink-3")}>
          {row.now}
        </span>
      )}
    </div>
  );
}

function confirmLabel(ops: Op[]): string {
  const n = ops.length;
  const plural = (word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (ops.every((op) => op.type === "deleteEvent")) return `Delete ${plural("event")}`;
  if (ops.every((op) => op.type === "deleteTask")) return `Delete ${plural("task")}`;
  if (ops.every((op) => op.type === "createTask")) return `Add ${plural("task")}`;
  if (ops.every((op) => op.type === "createEvent")) return `Add ${plural("event")}`;
  return `Apply ${plural("change")}`;
}

/** A change the assistant made (with Undo) or proposed (with Confirm). */
export function ChangeCard({ change }: { change: Change | undefined }) {
  const todayKey = useToday();
  const confirm = useMutation(api.assistantChanges.confirm);
  const dismiss = useMutation(api.assistantChanges.dismiss);
  const undo = useMutation(api.assistantChanges.undo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (change === undefined) {
    return <div className="my-2 h-[76px] animate-pulse rounded-[10px] border border-line bg-sunken" />;
  }

  const run = async (action: () => Promise<null>) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const rows = change.ops.map((op) => describe(op, todayKey));
  const destructive = change.ops.some((op) => op.type.startsWith("delete"));
  const settled = change.status === "undone" || change.status === "dismissed";

  if (change.status === "proposed") {
    return (
      <div className="my-2 overflow-hidden rounded-[10px] border border-line-2 bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="border-b border-line px-3 pt-[10px] pb-[9px]">
          <div className="text-[13px] font-semibold tracking-[-0.01em]">{change.summary}</div>
          <div className="mt-px text-[12px] text-ink-3">Nothing changes until you confirm.</div>
        </div>
        <div>{rows.map((row, i) => <OpRow key={i} row={row} />)}</div>
        <div className="flex flex-wrap items-center gap-[6px] border-t border-line bg-sunken px-[10px] py-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => confirm({ changeId: change._id }))}
            className={cn(
              "inline-flex h-[26px] items-center rounded-lg px-[10px] text-[12px] font-medium disabled:opacity-60",
              destructive ? "border border-line-2 bg-surface text-red" : "bg-today text-today-fg",
            )}
          >
            {confirmLabel(change.ops)}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => dismiss({ changeId: change._id }))}
            className="inline-flex h-[26px] items-center rounded-lg border border-line-2 bg-surface px-[10px] text-[12px] font-medium disabled:opacity-60"
          >
            Dismiss
          </button>
          {error && <span className="text-[12px] text-red">{error}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("my-2 overflow-hidden rounded-[10px] border border-line bg-surface", settled && "opacity-60")}>
      <div className="flex h-9 items-center gap-2 border-b border-line bg-sunken pr-[6px] pl-[11px] text-[12.5px] font-medium">
        {change.status === "applied" ? (
          <span className="grid size-4 place-items-center rounded-full bg-ink-2 text-surface">
            <Check className="size-[10px] stroke-[2.6]" />
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate">
          {change.status === "applied" ? change.summary : change.status === "undone" ? `Undone: ${change.summary}` : `Dismissed: ${change.summary}`}
        </span>
        {error && <span className="text-[12px] font-normal text-red">{error}</span>}
        {change.status === "applied" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => undo({ changeId: change._id }))}
            className="inline-flex h-[26px] items-center gap-[6px] rounded-md px-[6px] text-[12px] text-ink-3 hover:bg-hover hover:text-ink disabled:opacity-60"
          >
            <Undo2 className="size-[13px]" />
            Undo
          </button>
        )}
      </div>
      <div>{rows.map((row, i) => <OpRow key={i} row={row} />)}</div>
    </div>
  );
}
