import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { api } from "../../convex/_generated/api";
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
  const items = useQuery(api.todos.list, {});
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
      <header className="flex items-center justify-between gap-5 border-b border-line px-4 py-[14px] md:px-5">
        <div>
          <div className="text-[15px] font-semibold tracking-[-0.015em]">Tasks</div>
          <div className="mt-[3px] text-xs text-ink-3">
            {scoped ? `${scoped.filter((i) => !isDone(i)).length} open · ${scoped.filter(isDone).length} done` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={quickAdd.open}
          className="hidden h-[34px] items-center gap-[9px] rounded-lg border border-line bg-sunken px-[11px] text-[13px] text-ink-3 hover:border-line-2 md:flex"
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

      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-[10px] md:px-5">
        <Segmented value={view} onChange={setView} options={VIEWS} />
        <Segmented
          value={source}
          onChange={setSource}
          options={[
            { id: "all", label: "All" },
            { id: "canvas", label: "Canvas" },
            { id: "personal", label: "Personal" },
          ]}
        />
        <Segmented
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
        {courseOptions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {courseOptions.map((c) => (
              <button
                key={c.canvasId}
                type="button"
                aria-pressed={course === c.canvasId}
                onClick={() => setCourse(course === c.canvasId ? null : c.canvasId)}
                className={cn(
                  "flex h-6 items-center gap-[6px] rounded-md px-2 text-xs font-medium text-ink-2 hover:bg-hover",
                  course === c.canvasId && "bg-chip text-ink shadow-[inset_0_0_0_1px_var(--line-2)]",
                )}
                style={courseStyle(color(c.canvasId))}
              >
                <Dot />
                <span className="max-w-[160px] truncate">{courseLabel(c)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="pb-6">
        {filtered === undefined ? null : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-[9px] px-10 py-11 text-center text-ink-3">
            <span className="text-[14px] font-medium text-ink-2">
              {view === "done" ? "Nothing done yet" : view === "undated" ? "No undated tasks" : "All clear"}
            </span>
            <span className="text-[12.5px] leading-[1.5]">
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
    return (
      <div className="pt-2">
        {items.map((it, i) => (
          <AgendaItem key={it.key} item={it} first={i === 0} todayKey={todayKey} now={now} />
        ))}
      </div>
    );
  }
  const dated = items.filter((it) => it.dueAt !== undefined || it.plannedDay !== undefined);
  const undated = items.filter((it) => it.dueAt === undefined && it.plannedDay === undefined);
  return (
    <>
      {dated.length > 0 && (
        <section>
          <div className="flex items-center gap-2 px-4 pt-4 pb-[7px] md:px-5">
            <span className="text-[11.5px] font-semibold tracking-[0.09em] uppercase">Scheduled</span>
            <span className="ml-auto text-[11px] font-semibold text-ink-3">{dated.length}</span>
          </div>
          {dated.map((it, i) => (
            <AgendaItem key={it.key} item={it} first={i === 0} todayKey={todayKey} now={now} />
          ))}
        </section>
      )}
      {undated.length > 0 && (
        <section>
          <div className="flex items-center gap-2 px-4 pt-4 pb-[7px] md:px-5">
            <span className="text-[11.5px] font-semibold tracking-[0.09em] uppercase">Undated</span>
            <span className="ml-auto text-[11px] font-semibold text-ink-3">{undated.length}</span>
          </div>
          {undated.map((it, i) => (
            <AgendaItem key={it.key} item={it} first={i === 0} todayKey={todayKey} now={now} />
          ))}
        </section>
      )}
    </>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div className="flex h-7 items-center rounded-lg bg-chip p-[2px]">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={cn(
            "h-full rounded-[6px] px-[10px] text-xs font-medium text-ink-2",
            value === o.id && "bg-surface text-ink shadow-[inset_0_0_0_1px_var(--line)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
