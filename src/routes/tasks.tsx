import { useTodoList } from "@/lib/list-queries";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CircleCheck, Inbox, Plus } from "lucide-react";
import type { TodoItem } from "../../convex/todos";
import { Dot, Kbd } from "@/components/app/bits";
import { useQuickAdd } from "@/lib/quick-add-context";
import { ProfileMenu } from "@/components/app/profile-menu";
import { AgendaItem } from "@/components/agenda/agenda-item";
import { isDone } from "@/lib/agenda";
import { courseLabel, courseStyle, useCourses, useNow, useToday } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tasks")({
  component: Tasks,
});

type View = "open" | "undated" | "done";
const VIEWS: { id: View; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "undated", label: "Undated" },
  { id: "done", label: "Done" },
];
type Semester = "current" | "all";
type Source = "all" | "canvas" | "personal";

function Tasks() {
  const items = useTodoList();
  const { loading, current, visible, filterable, color } = useCourses();
  const today = useToday();
  const now = useNow();
  const quickAdd = useQuickAdd();
  const [view, setView] = useState<View>("open");
  const [source, setSource] = useState<Source>("all");
  const [semester, setSemester] = useState<Semester>("current");
  const [course, setCourse] = useState<number | null>(null);

  const courseOptions = semester === "current" ? visible : filterable;
  const scoped = useMemo(() => {
    if (!items || loading) return undefined;
    const currentIds = new Set(current.map((c) => c.canvasId));
    return items.filter((it) => {
      if (semester === "current" && it.courseCanvasId !== undefined && !currentIds.has(it.courseCanvasId)) return false;
      if (source === "canvas" && it.kind === "local") return false;
      if (source === "personal" && it.kind !== "local") return false;
      return course === null || it.courseCanvasId === course;
    });
  }, [items, loading, current, semester, source, course]);

  const filtered = useMemo(() => {
    if (!scoped) return undefined;
    let list = scoped.filter((it) => {
      if (view === "done") return isDone(it);
      if (isDone(it)) return false;
      if (view === "undated") return it.dueAt === undefined && it.plannedDay === undefined;
      return true;
    });
    if (view === "done") list = [...list].sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
    return list;
  }, [scoped, view]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex min-h-[64px] items-center justify-between gap-4 border-b border-line px-4 py-3 md:px-6">
        <div>
          <div className="page-title">Tasks</div>
          <div className="mt-[3px] h-4 text-[12.5px] text-ink-3 tabular">
            {scoped ? `${scoped.filter((i) => !isDone(i)).length} open · ${scoped.filter(isDone).length} done` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={quickAdd.open}
          className="hidden h-9 w-[320px] items-center gap-[9px] rounded-lg border border-line bg-sunken px-3 text-[13px] text-ink-3 transition-colors hover:border-line-2 hover:text-ink-2 md:flex"
        >
          <Plus className="size-[14px]" />
          Add a task…
          <Kbd className="ml-auto">N</Kbd>
        </button>
        <div className="flex items-center gap-3 md:hidden">
          <button type="button" onClick={quickAdd.open} aria-label="Add a task" className="grid size-8 place-items-center rounded-lg bg-today text-today-fg">
            <Plus className="size-[14px]" />
          </button>
          <ProfileMenu variant="avatar" />
        </div>
      </header>

      <div className="flex items-center gap-2 overflow-x-auto border-b border-line px-4 py-[10px] [scrollbar-width:none] md:flex-wrap md:overflow-visible md:px-6">
        <Segmented label="Status" value={view} onChange={setView} options={VIEWS} />
        {courseOptions.length > 0 && (
          <>
            <span className="mx-1 h-4 w-px shrink-0 bg-line-2" aria-hidden />
            <div className="flex shrink-0 items-center gap-[2px]" role="group" aria-label="Course">
              <FilterChip active={course === null} onClick={() => setCourse(null)}>
                All courses
              </FilterChip>
              {courseOptions.map((c) => (
                <FilterChip
                  key={c.canvasId}
                  active={course === c.canvasId}
                  onClick={() => setCourse(course === c.canvasId ? null : c.canvasId)}
                  style={courseStyle(color(c.canvasId))}
                >
                  <Dot />
                  <span className="max-w-[160px] truncate">{courseLabel(c)}</span>
                </FilterChip>
              ))}
            </div>
          </>
        )}
        <div className="flex shrink-0 items-center gap-2 max-md:pr-4 md:ml-auto">
          <Segmented
            label="Source"
            value={source}
            onChange={setSource}
            options={[
              { id: "all", label: "All" },
              { id: "canvas", label: "Canvas" },
              { id: "personal", label: "Personal" },
            ]}
          />
          <Segmented
            label="Semester"
            value={semester}
            onChange={(value) => {
              setSemester(value);
              setCourse(null);
            }}
            options={[
              { id: "current", label: "This semester" },
              { id: "all", label: "All semesters" },
            ]}
          />
        </div>
      </div>

      <div className="pb-8">
        {filtered === undefined ? null : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-10 py-20 text-center">
            <span className="mb-1 grid size-10 place-items-center rounded-full bg-chip text-ink-3">
              {view === "done" ? <CircleCheck className="size-[18px]" /> : <Inbox className="size-[18px]" />}
            </span>
            <span className="text-[14px] font-medium text-ink-2">
              {view === "done" ? "Nothing done yet" : view === "undated" ? "No undated tasks" : "All clear"}
            </span>
            <span className="text-[12.5px] leading-[1.5] text-ink-3">
              Press <Kbd>N</Kbd> to add a task.
            </span>
          </div>
        ) : (
          <GroupedList items={filtered} view={view} todayKey={today} now={now} />
        )}
      </div>
    </div>
  );
}

function GroupedList({ items, view, todayKey, now }: { items: TodoItem[]; view: View; todayKey: string; now: number }) {
  if (view !== "open") {
    return <Section title={view === "done" ? "Done" : "Undated"} detail={view === "done" ? "Most recent first" : undefined} items={items} todayKey={todayKey} now={now} />;
  }
  const dated = items.filter((it) => it.dueAt !== undefined || it.plannedDay !== undefined);
  const undated = items.filter((it) => it.dueAt === undefined && it.plannedDay === undefined);
  return (
    <>
      {dated.length > 0 && <Section title="Scheduled" items={dated} todayKey={todayKey} now={now} />}
      {undated.length > 0 && <Section title="Undated" items={undated} todayKey={todayKey} now={now} />}
    </>
  );
}

function Section({ title, detail, items, todayKey, now }: { title: string; detail?: string; items: TodoItem[]; todayKey: string; now: number }) {
  return (
    <section>
      <div className="flex items-baseline gap-2 px-4 pt-6 pb-2 md:px-6">
        <h2 className="text-[13px] font-semibold tracking-[-0.005em] text-ink">{title}</h2>
        {detail && <span className="text-[12.5px] text-ink-3">{detail}</span>}
        <span className="ml-auto text-[12px] font-medium text-ink-3 tabular">{items.length}</span>
      </div>
      {items.map((it, i) => (
        <AgendaItem key={it.key} item={it} first={i === 0} todayKey={todayKey} now={now} />
      ))}
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  style,
  children,
}: {
  active: boolean;
  onClick: () => void;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={style}
      className={cn(
        "flex h-7 shrink-0 items-center gap-[6px] rounded-md px-[9px] text-[12.5px] font-medium whitespace-nowrap text-ink-3 transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:outline-none",
        active && "bg-chip text-ink hover:bg-chip",
      )}
    >
      {children}
    </button>
  );
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div role="group" aria-label={label} className="flex h-7 shrink-0 items-center rounded-lg bg-chip p-[2px]">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={cn(
            "h-full rounded-[6px] px-[10px] text-[12.5px] font-medium whitespace-nowrap text-ink-3 transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:outline-none",
            value === o.id && "bg-surface text-ink shadow-[0_1px_2px_rgba(16,17,20,0.06),inset_0_0_0_1px_var(--line)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
