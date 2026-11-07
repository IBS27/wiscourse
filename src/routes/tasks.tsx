import { useTodoList } from "@/lib/list-queries";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, ChevronRight, CircleCheck, Inbox, ListFilter, Plus } from "lucide-react";
import type { TodoItem } from "../../convex/todos";
import { Dot, Kbd, SectionCount } from "@/components/app/bits";
import { useQuickAdd } from "@/lib/quick-add-context";
import { HEADER_BUTTON, PageHeader, READING_FRAME, READING_WIDTH } from "@/components/app/page-header";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AgendaItem } from "@/components/agenda/agenda-item";
import { buildAgenda, isDone } from "@/lib/agenda";
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
const SOURCES: { id: Source; label: string }[] = [
  { id: "all", label: "All tasks" },
  { id: "canvas", label: "Canvas" },
  { id: "personal", label: "Personal" },
];
const SEMESTERS: { id: Semester; label: string }[] = [
  { id: "current", label: "This semester" },
  { id: "all", label: "All semesters" },
];

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
      {/* Header, filters and list all run to the main area's gutters, so their edges line up. */}
      <PageHeader
        title="Tasks"
        // One reading column for header, filters and list, so a row's status
        // sits near its title instead of across a 1200px row.
        contentClassName={READING_WIDTH}
        subtitle={
          scoped
            ? `${scoped.filter((i) => !isDone(i)).length} open · ${scoped.filter(isDone).length} done`
            : "\u00a0" // holds the line while loading, so the title does not jump
        }
        actions={
          <>
            <button
              type="button"
              onClick={quickAdd.open}
              className="hidden h-9 w-[300px] items-center gap-[9px] rounded-lg border border-line bg-sunken px-3 text-[13px] text-ink-3 transition-colors hover:border-line-2 hover:text-ink-2 focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:outline-none md:flex"
            >
              <Plus className="size-[14px]" />
              Add a task…
              <Kbd className="ml-auto">N</Kbd>
            </button>
            <button
              type="button"
              onClick={quickAdd.open}
              aria-label="Add a task"
              className={cn(HEADER_BUTTON, "md:hidden")}
            >
              <Plus className="size-[16px]" />
            </button>
          </>
        }
      />

      <div className={cn(READING_FRAME, "px-4 md:px-6")}>
        <div className="flex w-full items-center gap-2 overflow-x-auto border-b border-line py-[10px] [scrollbar-width:none] md:flex-wrap md:overflow-visible">
          <Segmented label="Status" value={view} onChange={setView} options={VIEWS} />
          {courseOptions.length > 0 && (
            <>
              <span className="mx-1 h-4 w-px shrink-0 bg-line-2" aria-hidden />
              <div className="flex shrink-0 items-center gap-[6px] md:flex-wrap" role="group" aria-label="Course">
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
          <div className="flex shrink-0 items-center max-md:pr-4 md:ml-auto">
            <FilterMenu
              source={source}
              onSource={setSource}
              semester={semester}
              onSemester={(value) => {
                setSemester(value);
                setCourse(null);
              }}
            />
          </div>
        </div>
      </div>

      <div className={cn(READING_FRAME, "w-full pb-8")}>
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
  // Same buckets as Home; whatever Canvas already has (submitted, graded,
  // settled) folds into one collapsed section at the end.
  const buckets = buildAgenda(dated, { todayKey, now }).filter((b) => b.items.length > 0);
  const placed = new Set(buckets.flatMap((b) => b.items.map((it) => it.key)));
  const handled = dated
    .filter((it) => !placed.has(it.key))
    .sort((a, b) => (b.dueAt ?? 0) - (a.dueAt ?? 0));
  return (
    <>
      {buckets.map((b) => (
        <Section key={b.id} title={b.title} detail={b.detail} items={b.items} red={b.id === "overdue"} todayKey={todayKey} now={now} />
      ))}
      {undated.length > 0 && <Section title="Undated" items={undated} todayKey={todayKey} now={now} />}
      {handled.length > 0 && <HandledSection items={handled} todayKey={todayKey} now={now} />}
    </>
  );
}

function HandledSection({ items, todayKey, now }: { items: TodoItem[]; todayKey: string; now: number }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="pb-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-baseline gap-2 px-4 pt-6 pb-2 text-left transition-colors hover:text-ink md:px-6"
      >
        <ChevronRight className={cn("size-[13px] self-center text-ink-3 transition-transform", open && "rotate-90")} aria-hidden />
        <h2 className="text-[13px] font-semibold tracking-[-0.005em] text-ink-2">Submitted or graded</h2>
        <span className="text-[12.5px] text-ink-3">Canvas has these; mark them done to clear them</span>
        <SectionCount n={items.length} sep />
      </button>
      {open && items.map((it, i) => <AgendaItem key={it.key} item={it} first={i === 0} todayKey={todayKey} now={now} />)}
    </section>
  );
}

function Section({ title, detail, items, red, todayKey, now }: { title: string; detail?: string; items: TodoItem[]; red?: boolean; todayKey: string; now: number }) {
  return (
    <section>
      <div className="flex items-baseline gap-2 px-4 pt-6 pb-2 md:px-6">
        <h2 className={cn("text-[13px] font-semibold tracking-[-0.005em] text-ink", red && "text-red")}>{title}</h2>
        {detail && <span className="text-[12.5px] text-ink-3">{detail}</span>}
        <SectionCount n={items.length} sep={Boolean(detail)} />
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
        // Same shape as the segmented control beside it: 28px, radius 6, grey fill when selected.
        "flex h-7 shrink-0 cursor-pointer items-center gap-[6px] rounded-md px-[10px] text-[12.5px] font-medium whitespace-nowrap text-ink-2 transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:outline-none",
        active && "bg-chip text-ink hover:bg-chip",
      )}
    >
      {children}
    </button>
  );
}

/** Source and semester: set-and-forget choices, kept out of the toolbar. */
function FilterMenu({
  source,
  onSource,
  semester,
  onSemester,
}: {
  source: Source;
  onSource: (value: Source) => void;
  semester: Semester;
  onSemester: (value: Semester) => void;
}) {
  const active = (source !== "all" ? 1 : 0) + (semester !== "current" ? 1 : 0);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={active > 0 ? `Filter, ${active} active` : "Filter"}
          className={cn(
            "flex h-7 shrink-0 items-center gap-[6px] rounded-md border border-line px-[9px] text-[12.5px] font-medium whitespace-nowrap text-ink-2 transition-colors hover:border-line-2 hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:outline-none data-[state=open]:bg-hover",
            active > 0 && "border-line-2 text-ink",
          )}
        >
          <ListFilter className="size-[14px] text-ink-3" />
          Filter
          {active > 0 && (
            <span className="tabular grid h-4 min-w-4 place-items-center rounded-full bg-today px-1 text-[10.5px] leading-none font-semibold text-today-fg">
              {active}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        <MenuChoices label="Source" value={source} onChange={onSource} options={SOURCES} />
        <DropdownMenuSeparator />
        <MenuChoices label="Semester" value={semester} onChange={onSemester} options={SEMESTERS} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuChoices<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <>
      <div className="px-2 pt-[6px] pb-1 text-[12px] font-medium text-ink-3" aria-hidden>
        {label}
      </div>
      <DropdownMenuRadioGroup
        aria-label={label}
        value={value}
        onValueChange={(id) => {
          const option = options.find((o) => o.id === id);
          if (option) onChange(option.id);
        }}
      >
        {options.map((o) => (
          <DropdownMenuRadioItem key={o.id} value={o.id}>
            {o.label}
            <Check className={cn("ml-auto", value !== o.id && "invisible")} />
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
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
