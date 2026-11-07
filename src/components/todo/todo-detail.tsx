import { useDraft, useSourcedDraft } from "@/lib/drafts";
import { useEffect, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
  AlertCircle,
  ArrowUpRight,
  CalendarDays,
  Check,
  Circle,
  Clock,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { TodoItem } from "../../../convex/todos";
import { CourseTag, Kbd } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { SubmissionPanel } from "@/components/todo/submission-panel";
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
    // Left-aligned at the header's gutter; 720px of content (768 incl. padding).
    <div className="w-full max-w-[688px] px-4 pb-10 md:px-6" style={courseStyle(color(item.courseCanvasId))}>
      {/* Header */}
      <div className="pt-4 pb-4 md:pt-8 md:pb-6">
        <div className="flex flex-wrap items-center gap-x-[7px] gap-y-1 text-[12.5px] text-ink-3">
          {course ? (
            <>
              <CourseTag>{label(course.canvasId)}</CourseTag>
              <span className="text-line-2" aria-hidden>·</span>
            </>
          ) : null}
          <span>{KIND_LABEL[item.kind]}</span>
          {item.pointsPossible !== undefined && (
            <>
              <span className="text-line-2" aria-hidden>·</span>
              <span className="tabular">{item.pointsPossible} {item.pointsPossible === 1 ? "point" : "points"}</span>
            </>
          )}
        </div>
        {isLocal ? (
          <EditableTitle title={item.title} onSave={(title) => updateLocal({ todoId: item.todoId!, title })} />
        ) : (
          <h1 className="mt-2 text-[22px] leading-[1.25] font-semibold tracking-[-0.022em] text-ink text-pretty">{item.title}</h1>
        )}
        <div className="mt-[14px] flex flex-wrap items-center gap-[6px]">
          {done ? (
            <StatusChip>
              <Check />
              Done {formatDayShort(dayKeyOf(item.doneAt!))}, {formatTime(item.doneAt!)}
              {item.doneBySubmission ? " · on submission" : ""}
            </StatusChip>
          ) : overdue && item.dueAt !== undefined ? (
            <StatusChip alarm>
              <Clock />
              Overdue · {formatLate(item.dueAt, now)}
            </StatusChip>
          ) : null}
          {item.dueAt !== undefined ? (
            <StatusChip>
              {!overdue || done ? <Clock /> : null}
              Due {formatDayShort(dayKeyOf(item.dueAt))}, {formatTime(item.dueAt)}
            </StatusChip>
          ) : (
            <StatusChip>No due date</StatusChip>
          )}
          {item.plannedDay !== undefined && (
            <StatusChip>
              <CalendarDays />
              Planned {formatPlannedRelative(item.plannedDay, today)}
            </StatusChip>
          )}
          {isLocal && !course && <StatusChip>No course</StatusChip>}
          <SubmissionChip item={item} overdue={overdue && !done} />
          {!isLocal && item.htmlUrl && (
            // The page's primary action: flows after the chips and sits at
            // the content's right edge, the same edge the description ends at.
            <div className="ml-auto">
              <Button asChild size="sm" className="h-8 rounded-lg px-3 text-[13px]">
                <a href={item.htmlUrl} target="_blank" rel="noreferrer">
                  Open in Canvas
                  <ArrowUpRight className="size-[14px]" />
                </a>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Plan and Notes: compact property rows, so the description starts high. */}
      <PropertyRow title="Plan">
        <div className="flex flex-wrap items-center gap-[6px]">
          <QuickPlan label="Today" active={item.plannedDay === today} onClick={() => void setPlannedDay({ ref, plannedDay: today })} />
          <QuickPlan
            label="Tomorrow"
            active={item.plannedDay === addDays(today, 1)}
            onClick={() => void setPlannedDay({ ref, plannedDay: addDays(today, 1) })}
          />
          <PlanDate value={item.plannedDay} onChange={(plannedDay) => void setPlannedDay({ ref, plannedDay })} />
          {item.plannedDay !== undefined && (
            <button
              type="button"
              onClick={() => void setPlannedDay({ ref, plannedDay: null })}
              className="h-7 rounded-lg px-[9px] text-[12.5px] font-medium text-ink-3 transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:outline-none"
            >
              Clear
            </button>
          )}
        </div>

        <div className="mt-[6px]">
          {item.subtasks.map((s) => (
            <div key={s.id} className="group -mx-2 flex items-center gap-[10px] rounded-md px-2 py-[5px] text-[13.5px] transition-colors hover:bg-hover">
              <button
                type="button"
                onClick={() => void setSubtaskDone({ ref, subtaskId: s.id, done: !s.done })}
                className={cn(
                  "grid size-[15px] shrink-0 place-items-center rounded-[4px] border-[1.5px] border-line-2 transition-colors hover:border-ink-3",
                  s.done && "border-ink-3 bg-ink-3",
                )}
                aria-label={s.done ? "Mark subtask not done" : "Mark subtask done"}
              >
                <Check className={cn("size-[10px] stroke-[2.4] text-today-fg", !s.done && "opacity-0")} />
              </button>
              <span className={cn("text-ink", s.done && "text-ink-3 line-through decoration-line-2")}>{s.title}</span>
              <button
                type="button"
                onClick={() => void removeSubtask({ ref, subtaskId: s.id })}
                className="ml-auto text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink focus-visible:opacity-100"
                aria-label="Remove subtask"
              >
                <X className="size-[13px]" />
              </button>
            </div>
          ))}
          <AddSubtask onAdd={(title) => void addSubtask({ ref, title })} />
        </div>
      </PropertyRow>

      <PropertyRow title="Notes">
        <Notes value={item.notes ?? ""} onSave={(notes) => setNotes({ ref, notes })} />
      </PropertyRow>

      {/* Description (Canvas) */}
      {!isLocal && description && (
        <Block title="Description">
          <div className={PROSE} dangerouslySetInnerHTML={{ __html: sanitize(description) }} />
        </Block>
      )}

      {/* Submission (Canvas) */}
      {!isLocal && (
        <Block title="Submission">
          <div className="flex items-start gap-[10px]">
            <SubmissionIcon item={item} />
            <div className="min-w-0">
              <div className={cn("text-[13.5px] font-medium text-ink", (item.submission === "missing" || item.submission === "late") && "text-red")}>
                {submissionTitle(item)}
              </div>
              <div className="mt-[2px] text-[12.5px] text-ink-3">
                {item.submittedAt !== undefined
                  ? `Submitted ${formatDayShort(dayKeyOf(item.submittedAt))}, ${formatTime(item.submittedAt)}`
                  : item.kind === "assignment" ? "As Canvas last reported it." : "Submit this in Canvas."}
              </div>
            </div>
          </div>
          {item.kind === "assignment" && (
            <div className="pl-[34px]">
              <SubmissionPanel item={item} />
            </div>
          )}
        </Block>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-line py-5">
        <button
          type="button"
          onClick={() => void setDone({ ref, done: !done })}
          className={cn(
            "flex h-8 items-center gap-[7px] rounded-lg border px-3 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:ring-offset-1 focus-visible:outline-none",
            done ? "border-line-2 bg-surface text-ink hover:bg-hover" : "border-transparent bg-today text-today-fg hover:opacity-90",
          )}
        >
          <Check className="size-[14px]" />
          {done ? "Mark not done" : "Mark done"}
          <Kbd className={cn("max-md:hidden", !done && "border-today-fg/25 bg-transparent text-today-fg/75")}>D</Kbd>
        </button>
        {!done && (
          <button
            type="button"
            onClick={() => void setPlannedDay({ ref, plannedDay: addDays(today, 1) })}
            className="flex h-8 items-center rounded-lg border border-line-2 bg-surface px-3 text-[13px] font-medium text-ink transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:outline-none"
          >
            Move to tomorrow
          </button>
        )}
        {isLocal ? (
          <button
            type="button"
            onClick={() => {
              if (confirm("Delete this task?")) {
                void deleteLocal({ todoId: item.todoId! }).then(() => navigate({ to: "/" }));
              }
            }}
            className="ml-auto flex h-8 items-center gap-[7px] rounded-lg px-[10px] text-[13px] font-medium text-ink-3 transition-colors hover:bg-red-bg hover:text-red focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:outline-none"
          >
            <Trash2 className="size-[14px]" />
            Delete
          </button>
        ) : (
          <span className="text-[12px] text-ink-3 md:ml-auto">Canvas todos can't be deleted — only re-planned.</span>
        )}
      </div>
    </div>
  );
}

/** Reading typography for Canvas-authored HTML. */
const PROSE = cn(
  "text-[14px] leading-[1.65] text-ink-2 [overflow-wrap:anywhere]",
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_p]:my-3 [&_strong]:font-semibold [&_strong]:text-ink [&_b]:font-semibold [&_b]:text-ink",
  "[&_h1]:mt-6 [&_h1]:mb-2 [&_h1]:text-[16px] [&_h1]:font-semibold [&_h1]:tracking-[-0.01em] [&_h1]:text-ink",
  "[&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:tracking-[-0.01em] [&_h2]:text-ink",
  "[&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-[14px] [&_h3]:font-semibold [&_h3]:text-ink",
  "[&_h4]:mt-5 [&_h4]:mb-2 [&_h4]:text-[14px] [&_h4]:font-semibold [&_h4]:text-ink",
  "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_li]:pl-1 [&_li::marker]:text-ink-3",
  "[&_a]:font-medium [&_a]:text-ink [&_a]:underline [&_a]:decoration-line-2 [&_a]:underline-offset-[3px] [&_a]:transition-colors hover:[&_a]:decoration-ink",
  "[&_img]:my-4 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border [&_img]:border-line",
  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-line-2 [&_blockquote]:pl-4 [&_blockquote]:text-ink-3",
  "[&_hr]:my-6 [&_hr]:border-line",
  "[&_code]:rounded [&_code]:bg-chip [&_code]:px-1 [&_code]:py-px [&_code]:text-[12.5px]",
  "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-sunken [&_pre]:p-3",
  "[&_table]:my-4 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-[13px]",
  "[&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-[6px] [&_th]:border [&_th]:border-line [&_th]:bg-sunken [&_th]:px-2 [&_th]:py-[6px] [&_th]:text-left [&_th]:font-medium [&_th]:text-ink",
);

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-3 md:py-5">
      <div className="mb-[10px] flex items-center gap-2">
        <h2 className="text-[13px] font-semibold tracking-[-0.005em] text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

/**
 * A label column beside its controls — the Linear-style property sheet —
 * so an empty Plan or Notes costs one line, not a section.
 */
function PropertyRow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid grid-cols-[52px_minmax(0,1fr)] items-start gap-x-3 border-t border-line py-3 md:grid-cols-[72px_minmax(0,1fr)] md:gap-x-4">
      <h2 className="pt-[5px] text-[13px] leading-[18px] font-semibold tracking-[-0.005em] text-ink">{title}</h2>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

const PLAN_BUTTON =
  "flex h-7 items-center gap-[6px] rounded-lg border px-[10px] text-[12.5px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:outline-none";

function QuickPlan({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(PLAN_BUTTON, active ? "border-line-2 bg-chip text-ink" : "border-line bg-surface text-ink-2 hover:bg-hover hover:text-ink")}
    >
      {label}
    </button>
  );
}

/**
 * A designed face over the native date input. At rest it reads "Pick a date"
 * or the planned day; once focused (click, or P) the native field shows so the
 * date can be typed, and a click also opens the browser's picker.
 */
function PlanDate({ value, onChange }: { value: string | undefined; onChange: (day: string | null) => void }) {
  return (
    <label
      className={cn(
        PLAN_BUTTON,
        "group relative cursor-pointer md:min-w-[148px] focus-within:ring-2 focus-within:ring-line-2",
        value !== undefined ? "border-line-2 bg-chip text-ink" : "border-line bg-surface text-ink-2 hover:bg-hover hover:text-ink",
      )}
    >
      <CalendarDays className="size-[14px] text-ink-3 group-focus-within:invisible" />
      <span className="group-focus-within:invisible">{value !== undefined ? formatDayLong(value) : "Pick a date"}</span>
      <Kbd className="ml-auto group-focus-within:invisible max-md:hidden">P</Kbd>
      <input
        id="plan-date"
        type="date"
        aria-label="Planned day"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker();
          } catch {
            // Not supported or not allowed; the native field still works.
          }
        }}
        className="absolute inset-0 cursor-pointer rounded-lg bg-transparent px-[10px] text-[12.5px] text-ink opacity-0 outline-none [color-scheme:light_dark] focus:bg-surface focus:opacity-100"
      />
    </label>
  );
}

/**
 * One status chip style for the header row: 24px, a hairline edge, ink-2
 * text. Only the alarm (overdue, or missing standing in for it) is tinted.
 */
function StatusChip({ alarm, children }: { alarm?: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-[5px] rounded-full border px-[9px] text-[12px] font-medium whitespace-nowrap [&_svg]:size-[12px]",
        alarm ? "border-red/25 bg-red-bg text-red" : "border-line-2 text-ink-2",
      )}
    >
      {children}
    </span>
  );
}

function SubmissionChip({ item, overdue }: { item: TodoItem; overdue: boolean }) {
  switch (item.submission) {
    case "graded":
      return (
        <StatusChip>
          <Check />
          Graded{item.score !== undefined && item.pointsPossible !== undefined ? ` ${item.score}/${item.pointsPossible}` : ""}
        </StatusChip>
      );
    case "submitted":
      return (
        <StatusChip>
          <Check />
          Submitted
        </StatusChip>
      );
    case "missing":
      // The overdue chip already carries the alarm; this just adds Canvas's flag.
      return overdue ? <StatusChip>Marked missing</StatusChip> : <StatusChip alarm>Missing</StatusChip>;
    default:
      return null;
  }
}

function SubmissionIcon({ item }: { item: TodoItem }) {
  const bad = item.submission === "missing" || item.submission === "late";
  const ok = item.submission === "graded" || item.submission === "submitted";
  return (
    <span
      className={cn(
        "mt-px grid size-6 shrink-0 place-items-center rounded-full [&_svg]:size-[13px]",
        bad ? "bg-red-bg text-red" : ok ? "bg-chip text-ink" : "bg-chip text-ink-3",
      )}
      aria-hidden
    >
      {bad ? <AlertCircle /> : ok ? <Check /> : <Circle />}
    </span>
  );
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

function EditableTitle({ title, onSave }: { title: string; onSave: (t: string) => Promise<unknown> }) {
  const [value, setValue, save] = useSourcedDraft("todo:title", title);
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const t = value.trim();
        // A failed save keeps the edit on screen; the next blur retries it.
        if (t.length > 0 && t !== title) save(t, onSave).catch(() => {});
        else setValue(title);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setValue(title);
      }}
      className="-mx-2 mt-[5px] w-[calc(100%+16px)] rounded-md bg-transparent px-2 py-[3px] text-[22px] leading-[1.25] font-semibold tracking-[-0.022em] text-ink transition-colors outline-none hover:bg-hover focus:bg-hover"
      aria-label="Title"
    />
  );
}

function AddSubtask({ onAdd }: { onAdd: (title: string) => void }) {
  const [value, setValue] = useDraft("todo:subtask", "");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = value.trim();
    if (t.length === 0) return;
    onAdd(t);
    setValue("");
  };
  return (
    <form onSubmit={submit} className="-mx-2 flex items-center gap-[10px] rounded-md px-2 py-[4px] text-ink-3 transition-colors focus-within:bg-hover hover:bg-hover">
      <Plus className="size-[15px] shrink-0" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add subtask"
        aria-label="Add subtask"
        className="h-5 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
      />
    </form>
  );
}

function Notes({ value, onSave }: { value: string; onSave: (v: string) => Promise<unknown> }) {
  const [draft, setDraft, save] = useSourcedDraft("todo:notes", value);
  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        // Send what the server stores (it trims), so its echo is recognised
        // as this save. A failed save keeps the edit; the next blur retries.
        if (draft.trim() !== value.trim()) save(draft.trim(), onSave).catch(() => {});
      }}
      placeholder="Add notes…"
      aria-label="Notes"
      rows={draft === "" ? 1 : Math.max(2, Math.min(10, draft.split("\n").length + 1))}
      className="-mx-2 block w-[calc(100%+16px)] resize-none rounded-md bg-transparent px-2 py-[4px] text-[13.5px] leading-[20px] text-ink-2 transition-colors outline-none placeholder:text-ink-3 hover:bg-hover focus:bg-hover"
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
