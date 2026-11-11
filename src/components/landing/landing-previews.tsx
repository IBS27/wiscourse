import { useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowRight, BarChart3, BookOpen, CalendarDays, Check, Clock, Home, Inbox, ListChecks, ListTree,
  MessageCircle, Plus, RefreshCw, Search, Undo2,
} from "lucide-react";
import { Chip, CountBadge, CourseTag, Dot, Kbd, Pill, SectionCount } from "@/components/app/bits";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";
import {
  AGENDA, COURSES, FEED, QUICK_ADD_DAY, QUICK_ADD_TEXT, STORY, WEEK, c,
  type AgendaRow, type FeedRow,
} from "./landing-data";
import { enter, useCountUp, useReducedMotion, useSequence, useTyped } from "./landing-motion";

/**
 * Miniatures of real screens, used by the landing page. The markup mirrors the
 * app's own components class for class (agenda rows, week strip, the Recent
 * rail, quick add, first sync) with static data in place of queries; the only
 * state they hold is what the page animates. They are decorative: each root is
 * aria-hidden and nothing inside takes focus.
 */

const POP = "animate-[lp-pop_.45s_var(--lp-ease)_both]";

/** Height opens from zero when `on` flips, so a late row pushes its neighbours down smoothly. */
function Arriving({ on, style, children }: { on: boolean; style?: CSSProperties; children: ReactNode }) {
  return (
    <div style={style} className={cn("grid transition-[grid-template-rows] duration-500 ease-[var(--lp-ease)]", on ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
      <div className={cn("overflow-hidden", on && "animate-[lp-flash_1.8s_ease-out_.15s_both]")}>
        <div className={on ? "animate-[lp-arrive_.6s_var(--lp-ease)_both]" : "opacity-0"}>{children}</div>
      </div>
    </div>
  );
}

/* ---------- hero: the app on Home ---------- */

const NAV = [
  { label: "Home", icon: Home },
  { label: "Inbox", icon: Inbox },
  { label: "Courses", icon: BookOpen },
  { label: "Tasks", icon: ListChecks },
  { label: "Grades", icon: BarChart3 },
  { label: "Calendar", icon: CalendarDays },
  { label: "Ask", icon: MessageCircle },
];

function Sidebar({ home, inbox }: { home: number; inbox: number }) {
  return (
    <div className="hidden w-[212px] shrink-0 flex-col border-r border-line bg-sidebar px-[10px] pt-[14px] pb-3 md:flex">
      <div className="flex items-center justify-between px-[6px] pt-[2px] pb-4">
        <Logo className="text-[16px]" />
        <span className="flex items-center gap-[6px] text-ink-3">
          <Search className="size-[14px]" />
          <Kbd>⌘K</Kbd>
        </span>
      </div>
      <div className="flex flex-col gap-px">
        {NAV.map(({ label, icon: Icon }) => {
          const n = label === "Home" ? home : label === "Inbox" ? inbox : 0;
          return (
            <div
              key={label}
              className={cn(
                "flex h-8 items-center gap-[10px] rounded-lg px-2 text-[13.5px] font-medium text-ink-2",
                label === "Home" && "bg-[color-mix(in_oklab,var(--ink)_7%,var(--sidebar))] font-semibold text-ink dark:bg-hover",
              )}
            >
              <Icon className="size-4" />
              {label}
              <CountBadge key={n} n={n} className={cn("ml-auto font-medium text-ink-2 tabular", POP)} />
              {label === "Ask" && <Kbd className="ml-auto">⌘J</Kbd>}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between px-2 pt-6 pb-[6px] text-[12px] font-medium text-ink-3">
        <span>Courses</span>
        <span className="text-[12.5px] font-normal">Fall 2026</span>
      </div>
      {COURSES.map((k) => (
        <div key={k.code} className="flex h-[30px] items-center gap-[9px] rounded-lg px-2 text-[13px] text-ink-2" style={c(k.key)}>
          <Dot />
          <span className="min-w-0 flex-1 truncate">{k.code}</span>
        </div>
      ))}
    </div>
  );
}

function WeekStrip() {
  return (
    <div className="grid grid-cols-7 gap-1 border-b border-line px-3 py-0 md:px-5 md:py-2">
      {WEEK.map((d) => (
        <div key={d.day} className="rounded-[10px] px-1 py-px text-center transition-colors hover:bg-hover md:py-[5px]">
          <div className="flex items-center justify-center gap-[6px] max-sm:flex-col max-sm:gap-0">
            <span className={cn("text-[12px] font-medium text-ink-3 max-sm:text-[11px] max-sm:leading-[14px]", d.today && "font-semibold text-ink")}>{d.label}</span>
            <span
              className={cn(
                "grid size-[22px] place-items-center rounded-full text-[13.5px] font-semibold tracking-[-0.02em] tabular md:size-6",
                d.past && "font-medium text-ink-3",
                d.today && "bg-today text-today-fg",
              )}
            >
              {d.day}
            </span>
          </div>
          <div className="mt-px flex h-[6px] items-center justify-center gap-[3px] md:mt-[3px]">
            {d.dots.map((k) => (
              <i key={k} className={cn("block size-[6px] rounded-full bg-c", d.past && "opacity-60")} style={c(k)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AgendaLine({
  row, first, done, doneAt, status, index, onToggle,
}: {
  row: AgendaRow;
  first: boolean;
  done: boolean;
  doneAt: string;
  status?: string;
  index: number;
  onToggle: () => void;
}) {
  const meta: ReactNode[] = [<CourseTag key="code">{row.code}</CourseTag>];
  if (done) {
    meta.push(<span key="done">Done {doneAt}</span>);
  } else {
    if (row.late) {
      meta.push(
        <span key="late" className="flex items-center gap-1 font-medium text-red">
          <Clock className="size-[12px]" />
          {row.late}
        </span>,
      );
    }
    row.meta.forEach((m) => meta.push(<span key={m}>{m}</span>));
  }
  if (row.subtasks) {
    meta.push(
      <span key="sub" className="flex items-center gap-1">
        <ListTree className="size-[13px]" />
        {row.subtasks}
      </span>,
    );
  }
  const submitted = status?.startsWith("Submitted") || status?.startsWith("Graded");
  return (
    <div
      className={cn(
        enter(index).className,
        "group relative flex items-start gap-3 bg-surface py-[11px] pr-4 pl-4 transition-colors hover:bg-hover md:pr-6 md:pl-6",
        "after:absolute after:right-4 after:bottom-0 after:left-[45px] after:h-px after:bg-line md:after:right-6 md:after:left-[53px]",
        first && "before:absolute before:top-0 before:right-4 before:left-[45px] before:h-px before:bg-line md:before:right-6 md:before:left-[53px]",
      )}
      style={{ ...enter(index).style, ...c(row.c) }}
    >
      <button
        type="button"
        tabIndex={-1}
        onClick={onToggle}
        className={cn(
          "mt-[2px] grid size-[17px] shrink-0 place-items-center rounded-full border-[1.5px] border-ink-3/70 transition-[background-color,border-color,scale] duration-200 group-hover:border-ink-2 hover:bg-chip active:scale-90",
          done && "border-ink-3 bg-ink-3 hover:bg-ink-3",
        )}
      >
        <Check className={cn("size-[11px] stroke-[2.2] text-today-fg transition-[scale,opacity] duration-200", !done && "scale-50 opacity-0")} />
      </button>
      <div className="min-w-0 flex-1">
        <div className={cn("text-[14px] leading-[1.4] font-medium tracking-[-0.006em] text-ink transition-colors duration-300", done && "text-ink-3 line-through decoration-line-2")}>
          {row.title}
        </div>
        <div className="mt-[3px] flex min-w-0 items-center gap-x-[6px] overflow-hidden text-[13px] whitespace-nowrap text-ink-3">
          {meta.map((m, i) => (
            <span key={i} className={cn("flex items-center gap-[6px]", i === meta.length - 1 ? "min-w-0" : "shrink-0")}>
              {i > 0 && <span className="text-line-2">·</span>}
              {i === meta.length - 1 ? <span className="min-w-0 truncate">{m}</span> : m}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-px flex shrink-0 items-center gap-2 max-sm:hidden">
        {done ? (
          <Pill tone="outline" className={POP}>
            <Undo2 />
            Undo
          </Pill>
        ) : status ? (
          <Pill key={status} tone="quiet" className={POP}>
            {submitted && <Check />}
            {status}
          </Pill>
        ) : null}
      </div>
    </div>
  );
}

function FeedLine({ row, divider }: { row: FeedRow; divider: boolean }) {
  return (
    <div
      className={cn(
        "relative flex gap-[10px] py-[10px] pr-5 pl-5 transition-colors hover:bg-hover",
        divider && "after:absolute after:right-5 after:bottom-0 after:left-[42px] after:h-px after:bg-line",
      )}
      style={c(row.c)}
    >
      <span className="flex w-3 shrink-0 justify-center pt-[6px]">
        {row.unread && <span className="size-[6px] rounded-full bg-unread" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-3">
          <div className={cn("line-clamp-2 min-w-0 flex-1 text-[13px] leading-[1.4] tracking-[-0.005em] text-ink", row.unread ? "font-medium" : "font-normal")}>
            {row.title}
          </div>
          <span className="shrink-0 pt-px text-[13px] text-ink-2 tabular">{row.when}</span>
        </div>
        <div className="mt-[3px] flex min-w-0 items-center gap-[6px] text-[13px] whitespace-nowrap text-ink-2">
          <CourseTag className="shrink-0 text-[12.5px]">{row.code}</CourseTag>
          <span className="text-line-2">·</span>
          <span className="min-w-0 truncate">{row.status}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * The Recent feed: header, grouped rows, footer link. `shown` is how far the
 * arrivals have got (see `FeedRow.arrives`); `groups` trims the list for the
 * shorter card.
 */
function RecentFeed({ shown, groups = FEED.length, first = 0 }: { shown: number; groups?: number; first?: number }) {
  const visible = (row: FeedRow) => (row.arrives ?? 0) <= shown;
  const unread = FEED.flatMap((g) => g.rows).filter((r) => r.unread && visible(r)).length;
  let i = first;
  return (
    <>
      <div className="flex min-h-[44px] items-baseline gap-2 px-5 pt-3 pb-1">
        <span className="text-[13px] font-semibold tracking-[-0.01em]">Recent</span>
        <SectionCount key={unread} n={unread} className={cn("inline-block", POP)} />
        <span className="-mr-2 ml-auto rounded-md px-2 py-[3px] text-[12px] text-ink-3">Mark all read</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {FEED.slice(0, groups).map((g) => (
          <div key={g.group}>
            <div {...enter(i++)}>
              <div className="px-5 pt-3 pb-1 text-[12px] font-medium text-ink-3">{g.group}</div>
            </div>
            {g.rows.map((row, r) => {
              const line = <FeedLine row={row} divider={r < g.rows.length - 1} />;
              return row.arrives ? (
                <Arriving key={row.id} on={visible(row)} style={c(row.c)}>{line}</Arriving>
              ) : (
                <div key={row.id} {...enter(i++)}>{line}</div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center gap-[6px] border-t border-line px-5 py-3 text-[12.5px] font-medium text-ink-2">
        View all in Inbox
        <ArrowRight className="size-[13px]" />
      </div>
    </>
  );
}

/**
 * Home, as the app shows it: sidebar, agenda, Recent rail. `step` is the
 * hero's timeline: 0 rows cascade in, 1 the sync settles, 2 a task is ticked
 * off, 3 a grade posts (a row lands in Recent and the agenda pill follows).
 * The completion circles are live, so a visitor can tick rows too.
 */
export function HomeWindow({ step }: { step: number }) {
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const synced = step >= 1;
  const graded = step >= 3;
  const isDone = (row: AgendaRow) =>
    (row.doneAt !== undefined || (row.id === STORY.doneId && step >= 2)) !== toggled.has(row.id);
  const toggle = (id: string) =>
    setToggled((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  // The Home badge counts open work that is overdue or due today.
  const open = AGENDA.slice(0, 2).flatMap((s) => s.rows).filter((r) => !isDone(r)).length;
  let i = 0;
  return (
    <div
      aria-hidden="true"
      data-on={step >= 0}
      className="flex h-[560px] overflow-hidden rounded-xl border border-line bg-surface text-left text-ink shadow-[0_0_0_1px_color-mix(in_oklab,var(--ink)_3%,transparent),0_24px_60px_-18px_color-mix(in_oklab,var(--ink)_28%,transparent)] md:h-[640px] dark:shadow-[0_32px_80px_-20px_rgb(0_0_0/0.8)]"
    >
      <Sidebar home={open} inbox={graded ? 4 : 3} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between gap-5 border-b border-line px-4 md:h-16 md:px-6">
          <div className="flex h-[42px] min-w-0 flex-col">
            <div className="page-title h-6 truncate leading-6">
              <span className="md:hidden">Fri, Aug 21</span>
              <span className="hidden md:inline">Friday, August 21</span>
            </div>
            <div className="mt-[2px] flex h-4 items-center gap-[6px] text-[12.5px] leading-4 whitespace-nowrap text-ink-3">
              <RefreshCw className={cn("size-[12px] shrink-0", !synced && "animate-spin")} />
              <span key={String(synced)} className="animate-[lp-fade_.4s_ease_both]">{synced ? "Synced just now" : "Syncing…"}</span>
              <span className="text-line-2 max-sm:hidden">·</span>
              <span className="max-sm:hidden">4 courses</span>
            </div>
          </div>
          <div className="hidden h-9 w-[280px] items-center gap-[9px] rounded-lg border border-line bg-sunken px-3 text-[13px] text-ink-3 lg:flex">
            <Plus className="size-[14px]" />
            Add a task…
            <Kbd className="ml-auto">N</Kbd>
          </div>
          <div className="grid size-9 shrink-0 place-items-center rounded-full text-ink-2 lg:hidden">
            <Plus className="size-[16px]" />
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <WeekStrip />
            <div className="pt-0 pb-[26px] md:pt-[6px]">
              {AGENDA.map((section) => {
                const count = section.rows.length;
                return (
                  <div key={section.title}>
                    <div {...enter(i++)}>
                      <div className="flex items-baseline gap-2 px-4 pt-3 pb-[6px] md:px-6 md:pt-6 md:pb-2">
                        <span className={cn("text-[13px] font-semibold tracking-[-0.005em] text-ink", section.red && "text-red")}>{section.title}</span>
                        {section.detail && <span className="text-[12.5px] text-ink-3">{section.detail}</span>}
                        <SectionCount n={count} sep={Boolean(section.detail)} />
                      </div>
                    </div>
                    {section.rows.map((row, r) => (
                      <AgendaLine
                        key={row.id}
                        row={row}
                        first={r === 0}
                        index={i++}
                        done={isDone(row)}
                        doneAt={row.doneAt ?? STORY.doneAt}
                        status={row.id === STORY.gradedId && graded ? STORY.graded : row.status}
                        onToggle={() => toggle(row.id)}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="hidden w-[300px] shrink-0 flex-col border-l border-line bg-surface xl:flex">
            <RecentFeed shown={graded ? 3 : 2} first={3} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- quick add ---------- */

/**
 * The quick-add dialog typing its own example, over the day the task lands
 * in. `step`: 0 typing, 1 Enter goes down, 2 the task is filed and the field
 * clears.
 */
export function QuickAddDemo({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  const step = useSequence(active, [0, 3100, 3350], 9000);
  const count = useTyped(QUICK_ADD_TEXT, step === 0 || step === 1, { delay: 500, speed: 75 });
  // Reduced motion rests on the telling frame: the example typed out and filed.
  const typed = reduce ? QUICK_ADD_TEXT.length : count;
  const added = step >= 2;

  const words = QUICK_ADD_TEXT.slice(0, typed).split(" ");
  const day = words.includes("fri");
  const course = words.includes("#cs537");
  const title = words.filter((w) => w !== "fri" && !w.startsWith("#")).join(" ").trim();

  return (
    <div aria-hidden="true" data-on={active} className="relative mx-auto w-full max-w-[500px]">
      <div className="relative z-[1] mx-auto w-[94%] overflow-hidden rounded-[10px] border border-line bg-surface shadow-float">
        <div className="p-4">
          <div className="flex h-[38px] items-center gap-[9px] rounded-lg border border-line-2 bg-sunken px-[11px] text-[14px]">
            <Plus className="size-[14px] shrink-0 text-ink-3" />
            <span className="flex min-w-0 items-center whitespace-pre">
              {words.map((w, i) => {
                const token = w === "fri" || w === "#cs537";
                return (
                  <span key={i}>
                    {i > 0 && " "}
                    <span className={cn(token && "border-b-[1.5px] border-c pb-px")} style={w === "#cs537" ? c("indigo") : undefined}>{w}</span>
                  </span>
                );
              })}
              <span className="ml-px h-[18px] w-[1.5px] animate-[lp-blink_1s_steps(2)_infinite] bg-ink" />
              {typed === 0 && <span className="ml-[3px] text-ink-3">Add a task…</span>}
            </span>
          </div>
          <div className="flex min-h-[36px] flex-wrap items-center gap-[7px] pt-3">
            {typed === 0 ? (
              <span className="text-xs text-ink-3">
                Try <span className="text-ink-2">“problem set due mon 5pm #math340”</span>
              </span>
            ) : (
              <>
                <Chip solid>{title}</Chip>
                {course && (
                  <Chip className={POP}>
                    <Dot style={c("indigo")} />
                    CS 537
                  </Chip>
                )}
                {day && (
                  <Chip className={POP}>
                    <CalendarDays />
                    Planned Fri, Aug 21
                  </Chip>
                )}
                <Chip className="max-sm:hidden">Personal task</Chip>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-[14px] border-t border-line px-4 py-3 text-xs text-ink-3">
          <span>
            <b className={cn("inline-block rounded-[4px] px-[3px] font-semibold text-ink-2 transition-[background-color,scale] duration-150", step === 1 && "scale-90 bg-chip text-ink")}>↵</b> add
          </span>
          <span className="max-sm:hidden"><b className="font-semibold text-ink-2">⌥↵</b> add and keep open</span>
          <span><b className="font-semibold text-ink-2">esc</b> cancel</span>
        </div>
      </div>

      <div className="-mt-6 overflow-hidden rounded-[10px] border border-line bg-surface pt-7 pb-1">
        <div className="flex items-baseline gap-2 px-4 pt-3 pb-[6px]">
          <span className="text-[13px] font-semibold tracking-[-0.005em]">Today</span>
          <span className="text-[12.5px] text-ink-3">Fri, Aug 21</span>
          <SectionCount key={String(added)} n={QUICK_ADD_DAY.length + (added ? 1 : 0)} sep className={cn("inline-block", POP)} />
        </div>
        {QUICK_ADD_DAY.map((row) => (
          <MiniRow key={row.title} title={row.title} code={row.code} meta={row.meta} style={c(row.c)} />
        ))}
        <Arriving on={added || reduce} style={c("indigo")}>
          <MiniRow title="read ch 4" code="CS 537" meta="Planned today · Personal" style={c("indigo")} last />
        </Arriving>
      </div>
    </div>
  );
}

function MiniRow({ title, code, meta, style, last }: { title: string; code: string; meta: string; style: CSSProperties; last?: boolean }) {
  return (
    <div
      className={cn("relative flex items-start gap-3 py-[10px] pr-4 pl-4", !last && "after:absolute after:right-4 after:bottom-0 after:left-[45px] after:h-px after:bg-line")}
      style={style}
    >
      <span className="mt-[2px] size-[17px] shrink-0 rounded-full border-[1.5px] border-ink-3/70" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] leading-[1.4] font-medium tracking-[-0.006em]">{title}</div>
        <div className="mt-[3px] flex items-center gap-[6px] text-[13px] whitespace-nowrap text-ink-3">
          <CourseTag>{code}</CourseTag>
          <span className="text-line-2">·</span>
          <span className="min-w-0 truncate">{meta}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- what changed ---------- */

/** The Recent rail as a card, with the day's changes landing one after another. */
export function RecentDemo({ active }: { active: boolean }) {
  const step = useSequence(active, [1100, 2100, 3100]);
  return (
    <div
      aria-hidden="true"
      data-on={active}
      className="mx-auto flex w-full max-w-[420px] flex-col overflow-hidden rounded-[10px] border border-line bg-surface shadow-float"
    >
      <RecentFeed shown={step + 1} groups={2} />
    </div>
  );
}

/* ---------- first sync ---------- */

/** The first-sync card from Home, running: courses land, assignments count up, the rest queues. */
export function FirstSyncCard({ active }: { active: boolean }) {
  const step = useSequence(active, [500, 1500]);
  const assignments = useCountUp<HTMLSpanElement>(step >= 1, { from: 0, to: 128, duration: 1100 });
  const rows = [
    { label: "Courses", done: step >= 0, busy: active && step < 0, detail: <>4 active</> },
    { label: "Assignments", done: step >= 1, busy: step === 0, detail: <span ref={assignments}>128</span> },
    { label: "Announcements and modules", done: false, busy: step >= 1, detail: <>queued</> },
  ];
  return (
    <div aria-hidden="true" className="rounded-[10px] border border-line bg-surface p-4 text-left shadow-float">
      <div className="text-[14px] font-semibold tracking-[-0.01em]">Setting up wiscourse</div>
      <div className="mt-[3px] text-[12.5px] text-ink-3">First sync from Canvas. Start using the app now, items land as they arrive.</div>
      <div className="my-[14px] h-1 overflow-hidden rounded-full bg-chip">
        <div
          className="h-full origin-left rounded-full bg-ink transition-transform duration-[900ms] ease-[var(--lp-ease)]"
          style={{ transform: `scaleX(${step >= 1 ? 0.66 : step >= 0 ? 0.33 : 0.08})` }}
        />
      </div>
      {rows.map((row) => {
        const Icon = row.done ? Check : row.busy ? RefreshCw : Clock;
        return (
          <div
            key={row.label}
            className={cn("flex items-center gap-[9px] border-b border-line py-[7px] text-[13px] text-ink-2 transition-colors duration-300 last:border-b-0", !row.done && !row.busy && "text-ink-3")}
          >
            <Icon key={row.done ? "done" : row.busy ? "busy" : "wait"} className={cn("size-[14px]", row.busy ? "animate-spin" : POP)} />
            {row.label}
            <span className="ml-auto text-xs text-ink-3 tabular">{row.busy ? "syncing…" : row.done ? row.detail : "queued"}</span>
          </div>
        );
      })}
    </div>
  );
}
