import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  Clock,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { TodoItem } from "../../../convex/todos";
import { Chip, Dot, Kbd, Pill } from "@/components/app/bits";
import { refOf } from "@/lib/todo-ref";
import {
  addDays,
  dayKeyOf,
  formatDayLong,
  formatDayShort,
  formatLate,
  formatPlannedRelative,
  formatTime,
} from "@/lib/dates";
import { isOverdue } from "@/lib/agenda";
import { courseStyle, useCourses, useNow, useToday } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const KIND_LABEL = { assignment: "Assignment", quiz: "Quiz", discussion: "Discussion", local: "Personal task" } as const;

export function TodoDetail({ item }: { item: TodoItem }) {
  const { label, color, byId } = useCourses();
  const today = useToday();
  const now = useNow();
  const navigate = useNavigate();
  const ref = refOf(item);

  const setDone = useMutation(api.todos.setDone);
  const setPlannedDay = useMutation(api.todos.setPlannedDay);
  const setNotes = useMutation(api.todos.setNotes);
  const addSubtask = useMutation(api.todos.addSubtask);
  const setSubtaskDone = useMutation(api.todos.setSubtaskDone);
  const removeSubtask = useMutation(api.todos.removeSubtask);
  const updateLocal = useMutation(api.todos.updateLocal);
  const deleteLocal = useMutation(api.todos.deleteLocal);

  const description = useQuery(
    api.todos.description,
    item.kind === "local" ? "skip" : { kind: item.kind, canvasId: item.canvasId! },
  );

  const done = item.doneAt !== undefined;
  const overdue = isOverdue(item, now);
  const course = item.courseCanvasId === undefined ? undefined : byId.get(item.courseCanvasId);
  const isLocal = item.kind === "local";

  // Keyboard: P focuses the plan field, D toggles done.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        document.getElementById("plan-date")?.focus();
      }
      if (e.key.toLowerCase() === "d") {
        e.preventDefault();
        void setDone({ ref, done: !done });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ref, done, setDone]);

  return (
    <div className="mx-auto w-full max-w-[760px] md:my-6 md:rounded-[10px] md:border md:border-line md:bg-surface" style={courseStyle(color(item.courseCanvasId))}>
      {/* Header */}
      <div className="border-b border-l-4 border-b-line border-l-c px-[18px] pt-4 pb-[14px] md:rounded-tl-[10px]">
        <div className="flex items-center gap-[7px] text-[11.5px] text-ink-3">
          <Dot />
          {course ? (
            <>
              <span className="font-medium text-c">{label(course.canvasId)}</span>
              <span>·</span>
            </>
          ) : null}
          <span>
            {KIND_LABEL[item.kind]}
            {item.pointsPossible !== undefined ? ` · ${item.pointsPossible} points` : ""}
          </span>
        </div>
        {isLocal ? (
          <EditableTitle key={item.title} title={item.title} onSave={(title) => void updateLocal({ todoId: item.todoId!, title })} />
        ) : (
          <h1 className="mt-[7px] mb-[11px] text-[17px] leading-[1.25] font-semibold tracking-[-0.02em]">{item.title}</h1>
        )}
        <div className="flex flex-wrap items-center gap-[7px]">
          {done ? (
            <Pill>
              <Check />
              Done {formatDayShort(dayKeyOf(item.doneAt!))}, {formatTime(item.doneAt!)}
              {item.doneBySubmission ? " · on submission" : ""}
            </Pill>
          ) : overdue && item.dueAt !== undefined ? (
            <Pill tone="red">
              <Clock />
              Overdue — due {formatDayShort(dayKeyOf(item.dueAt))}, {formatTime(item.dueAt)} · {formatLate(item.dueAt, now)}
            </Pill>
          ) : item.dueAt !== undefined ? (
            <Chip>
              <Clock />
              Due {formatDayShort(dayKeyOf(item.dueAt))}, {formatTime(item.dueAt)}
            </Chip>
          ) : (
            <Chip>No due date</Chip>
          )}
          {item.plannedDay !== undefined && (
            <Chip>
              <CalendarDays />
              Planned {formatPlannedRelative(item.plannedDay, today)}
            </Chip>
          )}
          {isLocal && !course && <Chip>No course</Chip>}
          <SubmissionChip item={item} />
        </div>
      </div>

      {/* Plan */}
      <Block title="Plan">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-8 items-center gap-[9px] rounded-lg border border-line bg-surface px-[10px] text-[13px] text-ink-2">
            <CalendarDays className="size-[14px]" />
            <input
              id="plan-date"
              type="date"
              value={item.plannedDay ?? ""}
              onChange={(e) => void setPlannedDay({ ref, plannedDay: e.target.value || null })}
              className="bg-transparent text-ink outline-none"
            />
            <Kbd>P</Kbd>
          </label>
          <QuickPlan label="Today" onClick={() => void setPlannedDay({ ref, plannedDay: today })} />
          <QuickPlan label="Tomorrow" onClick={() => void setPlannedDay({ ref, plannedDay: addDays(today, 1) })} />
          {item.plannedDay !== undefined && (
            <QuickPlan label="Clear" onClick={() => void setPlannedDay({ ref, plannedDay: null })} />
          )}
          {item.plannedDay !== undefined && (
            <span className="text-xs text-ink-3">{formatDayLong(item.plannedDay)}</span>
          )}
        </div>

        <div className="mt-3">
          {item.subtasks.map((s) => (
            <div key={s.id} className="group flex items-center gap-[9px] py-[7px] text-[13px]">
              <button
                type="button"
                onClick={() => void setSubtaskDone({ ref, subtaskId: s.id, done: !s.done })}
                className={cn(
                  "grid size-[15px] shrink-0 place-items-center rounded border-[1.5px] border-line-2",
                  s.done && "border-ink-3 bg-ink-3",
                )}
                aria-label={s.done ? "Mark subtask not done" : "Mark subtask done"}
              >
                <Check className={cn("size-[10px] stroke-[2.4] text-today-fg", !s.done && "opacity-0")} />
              </button>
              <span className={cn(s.done && "text-ink-3 line-through decoration-line-2")}>{s.title}</span>
              <button
                type="button"
                onClick={() => void removeSubtask({ ref, subtaskId: s.id })}
                className="ml-auto text-ink-3 opacity-0 group-hover:opacity-100 hover:text-ink"
                aria-label="Remove subtask"
              >
                <X className="size-[13px]" />
              </button>
            </div>
          ))}
          <AddSubtask onAdd={(title) => void addSubtask({ ref, title })} />
        </div>
      </Block>

      {/* Notes */}
      <Block title="Notes">
        <Notes key={item.notes ?? ""} value={item.notes ?? ""} onSave={(notes) => void setNotes({ ref, notes })} />
      </Block>

      {/* Description (Canvas) */}
      {!isLocal && description && (
        <Block title="Description">
          <div
            className="prose-sm max-w-none text-[13px] leading-[1.55] text-ink-2 [&_a]:text-ink [&_a]:underline [&_img]:max-w-full [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5"
            dangerouslySetInnerHTML={{ __html: sanitize(description) }}
          />
        </Block>
      )}

      {/* Submission (Canvas) */}
      {!isLocal && (
        <Block title="Submission">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-sunken px-3 py-[11px]">
            <div>
              <div className="text-[13px] font-medium">{submissionTitle(item)}</div>
              <div className="mt-[2px] text-xs text-ink-3">
                {item.submittedAt !== undefined
                  ? `Submitted ${formatDayShort(dayKeyOf(item.submittedAt))}, ${formatTime(item.submittedAt)}`
                  : "Submitting from wiscourse is coming; for now, submit in Canvas."}
              </div>
            </div>
          </div>
          {item.htmlUrl && (
            <a
              href={item.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex items-center gap-2 pt-2 text-[12.5px] text-ink-3 hover:text-ink"
            >
              <ArrowUpRight className="size-[13px]" />
              Open in Canvas
            </a>
          )}
        </Block>
      )}

      {/* Actions */}
      <Block>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void setDone({ ref, done: !done })}
            className={cn(
              "flex h-[31px] items-center gap-[7px] rounded-lg border px-3 text-[12.5px] font-medium",
              done ? "border-line-2 bg-surface text-ink" : "border-transparent bg-today text-today-fg",
            )}
          >
            <Check className="size-[14px]" />
            {done ? "Mark not done" : "Mark done"}
            <Kbd className={cn(!done && "border-today-fg/30 bg-transparent text-today-fg/80")}>D</Kbd>
          </button>
          {!done && (
            <button
              type="button"
              onClick={() => void setPlannedDay({ ref, plannedDay: addDays(today, 1) })}
              className="flex h-[31px] items-center rounded-lg border border-line-2 bg-surface px-3 text-[12.5px] font-medium"
            >
              Move to tomorrow
            </button>
          )}
          {isLocal && (
            <button
              type="button"
              onClick={() => {
                if (confirm("Delete this task?")) {
                  void deleteLocal({ todoId: item.todoId! }).then(() => navigate({ to: "/" }));
                }
              }}
              className="ml-auto flex h-[31px] items-center gap-[7px] rounded-lg px-[6px] text-[12.5px] font-medium text-ink-3 hover:text-red"
            >
              <Trash2 className="size-[14px]" />
              Delete
            </button>
          )}
        </div>
      </Block>
      {!isLocal && (
        <Block>
          <div className="text-[12.5px] text-ink-3">Canvas todos can't be deleted — only re-planned. Personal tasks can.</div>
        </Block>
      )}
    </div>
  );
}

function Block({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="border-b border-line px-[18px] py-[14px] last:border-b-0">
      {title && <div className="eyebrow mb-[10px]">{title}</div>}
      {children}
    </div>
  );
}

function QuickPlan({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 rounded-lg border border-line bg-surface px-[10px] text-[12.5px] font-medium text-ink-2 hover:bg-hover"
    >
      {label}
    </button>
  );
}

function SubmissionChip({ item }: { item: TodoItem }) {
  switch (item.submission) {
    case "graded":
      return (
        <Chip>
          <Check />
          Graded{item.score !== undefined && item.pointsPossible !== undefined ? ` ${item.score}/${item.pointsPossible}` : ""}
        </Chip>
      );
    case "submitted":
      return (
        <Chip>
          <Check />
          Submitted
        </Chip>
      );
    case "missing":
      return <Pill tone="red">Missing</Pill>;
    default:
      return null;
  }
}

function submissionTitle(item: TodoItem): string {
  switch (item.submission) {
    case "graded":
      return item.score !== undefined && item.pointsPossible !== undefined
        ? `Graded — ${item.score}/${item.pointsPossible}`
        : "Graded";
    case "submitted":
      return "Submitted";
    case "missing":
      return "Missing";
    case "late":
      return "Late";
    case "unsubmitted":
      return "Not submitted";
    case "none":
      return "Open in Canvas";
  }
}

// Keyed on the incoming value by the caller, so a server update resets the draft.
function EditableTitle({ title, onSave }: { title: string; onSave: (t: string) => void }) {
  const [value, setValue] = useState(title);
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const t = value.trim();
        if (t.length > 0 && t !== title) onSave(t);
        else setValue(title);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setValue(title);
      }}
      className="mt-[7px] mb-[11px] w-full bg-transparent text-[17px] leading-[1.25] font-semibold tracking-[-0.02em] outline-none"
      aria-label="Title"
    />
  );
}

function AddSubtask({ onAdd }: { onAdd: (title: string) => void }) {
  const [value, setValue] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = value.trim();
    if (t.length === 0) return;
    onAdd(t);
    setValue("");
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-2 pt-2 text-[12.5px] text-ink-3">
      <Plus className="size-[13px]" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add subtask"
        className="flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
      />
    </form>
  );
}

function Notes({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft.trim() !== value.trim()) onSave(draft);
      }}
      placeholder="Add notes…"
      rows={Math.max(2, Math.min(10, draft.split("\n").length + 1))}
      className="w-full resize-none bg-transparent text-[13px] leading-[1.55] text-ink-2 outline-none placeholder:text-ink-3"
    />
  );
}

/** Minimal sanitizer for Canvas HTML: strips scripts, handlers and styles. */
function sanitize(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const el of doc.querySelectorAll("script, style, iframe, object, embed, link, meta")) el.remove();
  for (const el of doc.body.querySelectorAll("*")) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "style") el.removeAttribute(attr.name);
      if ((name === "href" || name === "src") && /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
    }
    if (el.tagName === "A") {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noreferrer");
    }
  }
  return doc.body.innerHTML;
}
