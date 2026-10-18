import type { CSSProperties, ReactNode } from "react";
import {
  Calendar, Check, ChevronDown, ChevronRight, Clock, ExternalLink, FileText, LoaderCircle,
  Paperclip, Plus, Search, Send, SquareCheck,
} from "lucide-react";
import { Kbd } from "@/components/app/bits";
import { cn } from "@/lib/utils";
import {
  AGENDA, ASK_THREADS, CAL, CAL_DAYS, CAL_EVENTS, COURSES, FIRST_SYNC, GRADES, INBOX, MODULES,
  QUICK_ADD_TEXT, RAIL, SEARCH, WEEK, calTop, courseVar, minutes, type CourseKey, type ModuleItem,
} from "./landing-data";

/**
 * Miniatures of real screens, used by the landing page. They are static JSX
 * with the app's tokens; the only state they take is what the page animates.
 */

const vars = (v: Record<string, string | number>) => v as CSSProperties;
const c = (key: CourseKey) => vars({ "--c": courseVar(key) });

/* ---------- hero: Home ---------- */

export function HomePreview({ playing, synced }: { playing: boolean; synced: boolean }) {
  let i = 0;
  return (
    <div
      aria-hidden="true"
      className="w-full overflow-hidden rounded-lg border border-line bg-surface shadow-float lg:w-[calc(100%+140px)] lg:max-w-[800px]"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <div className="text-[15px] font-semibold tracking-[-0.015em]">Friday, August 21</div>
          <div className="mt-[3px] flex items-center gap-[6px] text-xs text-ink-3">
            {synced ? (
              <span className="size-[6px] rounded-full bg-[var(--course-emerald)]" />
            ) : (
              <span className="size-[10px] animate-spin rounded-full border-[1.5px] border-line-2 border-t-ink-2" />
            )}
            <span>{synced ? "Synced just now · 4 courses · next check in 2 min" : "Syncing from Canvas…"}</span>
          </div>
        </div>
        <div className="hidden h-8 w-[300px] items-center gap-[9px] rounded-lg border border-line bg-sunken px-[11px] text-[13px] text-ink-3 lg:flex">
          <Plus className="size-[14px]" />
          Add a task…
          <Kbd className="ml-auto">N</Kbd>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 border-b border-line px-3 py-[10px]">
        {WEEK.map((d) => (
          <div
            key={d.day}
            className={cn(
              "flex h-12 flex-col items-center justify-center gap-[5px] rounded-md text-xs text-ink-2 sm:h-[54px]",
              d.today && "bg-today text-today-fg",
            )}
          >
            <span className="text-[11px] sm:text-xs">{d.label}</span>
            <b className={cn("text-sm font-semibold tracking-[-0.01em]", d.today ? "text-today-fg" : "text-ink")}>{d.day}</b>
            <span className="flex h-[6px] gap-[2px] whitespace-nowrap sm:gap-[3px]">
              {d.dots.map((k, j) => (
                <i key={j} className="size-[6px] rounded-full bg-c" style={c(k)} />
              ))}
              {d.more && (
                <em className={cn("hidden text-[9.5px] leading-[6px] font-semibold not-italic sm:inline", d.today ? "text-today-fg opacity-70" : "text-ink-3")}>
                  +{d.more}
                </em>
              )}
            </span>
          </div>
        ))}
      </div>

      {AGENDA.map((e, n) => {
        const style = vars({ "--i": i++ });
        const anim = cn(
          "opacity-0 translate-y-[6px]",
          playing && "animate-[landing-in_.45s_cubic-bezier(.16,1,.3,1)_forwards] [animation-delay:calc(var(--i)*40ms+120ms)]",
        );
        if (e.kind === "section") {
          return (
            <div key={n} className={cn("flex items-baseline gap-2 px-4 pt-[10px] pb-1", anim)} style={style}>
              <span className={cn("text-[12.5px] font-semibold tracking-[-0.01em]", e.red && "text-red")}>{e.title}</span>
              {e.detail && <span className="text-[11.5px] text-ink-3">{e.detail}</span>}
              <span className={cn("ml-auto rounded-full px-[7px] py-px text-[11px] font-semibold", e.red ? "bg-red-bg text-red" : "bg-chip text-ink-3")}>{e.count}</span>
            </div>
          );
        }
        return (
          <div key={n} className={cn("mb-[2px] flex min-h-[46px] items-center gap-3 border-l-4 border-c py-[9px] pr-4 pl-3 hover:bg-hover", anim)} style={{ ...style, ...c(e.c) }}>
            <span className={cn("relative size-[15px] shrink-0 rounded-[4px] border-[1.5px] border-line-2", e.done && "border-ink bg-ink")}>
              {e.done && <span className="absolute top-px left-1 h-2 w-1 rotate-45 border-r-[1.5px] border-b-[1.5px] border-surface" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className={cn("truncate text-[13.5px] font-medium", e.done && "text-ink-3 line-through")}>{e.title}</div>
              <div className="mt-[2px] truncate text-xs text-ink-3">{e.meta}</div>
            </div>
            <span className={cn("hidden shrink-0 text-xs whitespace-nowrap text-ink-3 sm:inline", e.tone === "red" && "text-red", e.tone === "ok" && "text-ink-2")}>{e.status}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- quick add ---------- */

export function QuickAddDemo({ typed }: { typed: number }) {
  const text = QUICK_ADD_TEXT.slice(0, typed);
  const chips: { at: number; key?: CourseKey; label: string }[] = [
    { at: QUICK_ADD_TEXT.length, key: "indigo", label: "CS 537" },
    { at: 14, label: "Planned Fri, Aug 21" },
    { at: 12, label: "Personal task" },
  ];
  return (
    <div aria-hidden="true" className="w-full rounded-lg border border-line bg-surface shadow-menu lg:ml-auto lg:max-w-[480px]">
      <div className="flex min-h-[50px] items-center gap-[10px] border-b border-line px-4 py-[14px] text-sm sm:text-[15px]">
        <Plus className="size-4 shrink-0 text-ink-3" />
        {text && <span>{text}</span>}
        <span className={cn("h-[18px] w-[1.5px] bg-ink animate-[landing-blink_1s_steps(2)_infinite]", !text && "-ml-1")} />
        {!text && <span className="text-ink-3">Add a task…</span>}
      </div>
      <div className="flex min-h-[52px] flex-wrap gap-[6px] px-4 py-3">
        {chips.map((ch) => (
          <span
            key={ch.label}
            className={cn(
              "inline-flex h-[26px] items-center gap-[6px] rounded-md border border-line bg-chip px-[9px] text-xs font-medium transition-[opacity,transform] duration-300 ease-[cubic-bezier(.16,1,.3,1)]",
              typed >= ch.at ? "opacity-100" : "translate-y-1 opacity-0",
            )}
          >
            {ch.key && <i className="size-[6px] rounded-full bg-c" style={c(ch.key)} />}
            {ch.label}
          </span>
        ))}
      </div>
      <div className="flex gap-[14px] border-t border-line px-4 py-[10px] text-[11.5px] text-ink-3 [&_b]:font-medium [&_b]:text-ink-2">
        <span><b>↵</b> add</span>
        <span><b>⇥</b> edit chip</span>
        <span className="hidden sm:inline"><b>⌥↵</b> add and keep open</span>
        <span className="hidden sm:inline"><b>esc</b> cancel</span>
      </div>
    </div>
  );
}

/* ---------- New rail ---------- */

export function NewRail() {
  return (
    <div aria-hidden="true" className="w-full overflow-hidden rounded-lg border border-line bg-sunken lg:max-w-[420px] dark:bg-surface">
      <div className="flex items-center justify-between border-b border-line px-[14px] py-[11px] text-[13px] font-semibold">
        <span>
          New
          <span className="ml-[6px] rounded-full border border-line bg-chip px-[7px] text-[11px] font-semibold text-ink-3">5</span>
        </span>
        <span className="text-[11.5px] font-medium text-ink-3">Mark all read</span>
      </div>
      {RAIL.map((g) => (
        <div key={g.group}>
          <div className="px-[14px] pt-[10px] pb-1 text-[11px] font-semibold tracking-[.06em] text-ink-3 uppercase">{g.group}</div>
          {g.cards.map((k) => (
            <div key={k.title} className="mx-[10px] mb-2 rounded-lg border border-line border-l-[3px] border-l-c bg-raised px-3 py-[10px]" style={c(k.c)}>
              <div className="mb-1 flex items-center gap-2 text-[11.5px] text-ink-3">
                <b className="font-semibold text-ink-2">{k.code}</b>
                <span className="ml-auto">{k.when}</span>
              </div>
              <div className="text-[13px] font-medium tracking-[-0.005em]">
                {k.title}
                {k.grade && <span className="font-medium text-ink-2"> {k.grade}</span>}
              </div>
              <div className="mt-[2px] truncate text-xs text-ink-3">{k.sub}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ---------- showcase panes ---------- */

function PaneHeader({ title, meta, action }: { title: string; meta?: string; action?: string }) {
  return (
    <div className="flex h-[50px] items-center justify-between gap-3 border-b border-line px-[18px]">
      <span className="text-[15px] font-semibold tracking-[-0.015em]">
        {title}
        {meta && <span className="ml-2 hidden text-xs font-normal text-ink-3 lg:inline">{meta}</span>}
      </span>
      {action && <span className="hidden text-[12.5px] text-ink-3 lg:inline">{action}</span>}
    </div>
  );
}

const Eyebrow = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("text-[10.5px] font-semibold tracking-[.09em] text-ink-3 uppercase", className)}>{children}</div>
);

export function InboxPane() {
  return (
    <>
      <PaneHeader title="Inbox" meta="5 unread · 4 courses" action="Mark all read" />
      <div className="flex gap-[6px] border-b border-line px-[18px] py-[10px]">
        {["All", "Announcements", "Grades", "Assignments"].map((f, i) => (
          <span
            key={f}
            className={cn("rounded-md border px-[9px] py-[3px] text-xs font-medium", i === 0 ? "border-today bg-today text-today-fg" : "border-line bg-surface text-ink-2")}
          >
            {f}
          </span>
        ))}
      </div>
      {INBOX.map((g) => (
        <div key={g.group}>
          <div className="px-[18px] pt-[14px] pb-1 text-[11px] font-semibold tracking-[.06em] text-ink-3 uppercase">{g.group}</div>
          {g.items.map((it, i) => (
            <div
              key={it.title}
              className={cn(
                "grid grid-cols-[62px_1fr_auto] items-baseline gap-x-[10px] border-l-4 border-c py-[10px] pr-[14px] pl-[14px] lg:grid-cols-[76px_1fr_auto] lg:pr-[18px]",
                i > 0 && "border-t border-t-line",
              )}
              style={c(it.c)}
            >
              <span className="text-[11px] font-semibold tracking-[.02em] text-c">{it.code}</span>
              <span className="col-start-2 truncate text-[13.5px] font-medium">
                {it.title}
                {it.grade && <span className="font-medium text-ink-2"> {it.grade}</span>}
              </span>
              <span className={cn("hidden min-w-[34px] text-right text-[11.5px] text-ink-3 tabular sm:inline", !it.unread && "pr-[14px]")}>
                {it.when}
                {it.unread && <span className="ml-2 inline-block size-[6px] translate-y-[-1px] rounded-full bg-ink" />}
              </span>
              <span className="col-start-2 mt-[2px] truncate text-xs text-ink-3">{it.excerpt}</span>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

const MODULE_ICON: Record<ModuleItem["icon"], typeof FileText> = {
  page: FileText, file: Paperclip, assignment: Calendar, external: ExternalLink,
};

export function CoursesPane() {
  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[208px_1fr]">
      <div className="hidden border-r border-line bg-sunken px-2 py-3 lg:block">
        <Eyebrow className="px-2 pt-1 pb-2">Courses · Fall 2026</Eyebrow>
        {COURSES.map((k, i) => (
          <div
            key={k.code}
            className={cn("grid grid-cols-[auto_1fr] items-center gap-x-2 rounded-md px-2 py-[7px] text-[13px] leading-[1.25] font-medium text-ink-2", i === 0 && "bg-hover text-ink")}
            style={c(k.key)}
          >
            <span className="size-[6px] rounded-full bg-c" />
            {k.name}
            <small className="col-start-2 text-[11.5px] font-normal text-ink-3">{k.code}</small>
          </div>
        ))}
      </div>
      <div className="min-w-0">
        <div className="px-[18px] pt-4">
          <div className="text-[11px] font-semibold tracking-[.09em] text-[var(--course-indigo)] uppercase">CS 537</div>
          <div className="mt-[2px] text-[17px] font-semibold tracking-[-0.015em]">Introduction to Operating Systems</div>
        </div>
        <div className="flex gap-[14px] border-b border-line px-[18px] pt-3 text-[13px] font-medium text-ink-3 sm:gap-[18px]">
          {["Modules", "Pages", "Files", "Syllabus", "Announcements", "Grades"].map((t, i) => (
            <span key={t} className={cn("-mb-px border-b-2 pb-[9px]", i === 0 ? "border-ink text-ink" : "border-transparent", i >= 4 && "hidden sm:inline")}>
              {t}
            </span>
          ))}
        </div>
        <div className="px-[18px] pt-[10px]">
          {MODULES.map((m, mi) => (
            <div key={m.title}>
              <div className={cn("flex items-center gap-2 py-2 text-[13.5px] font-semibold", mi > 0 && m.open && "mt-[6px]")}>
                {m.open ? <ChevronDown className="size-[13px] text-ink-3" /> : <ChevronRight className="size-[13px] text-ink-3" />}
                {m.title}
              </div>
              {m.items.map((it) => {
                const Icon = MODULE_ICON[it.icon];
                return (
                  <div key={it.title} className="flex items-center gap-[9px] border-t border-line py-2 pl-[21px] text-[13px]">
                    <Icon className="size-[14px] shrink-0 text-ink-3" strokeWidth={1.75} />
                    <span className="truncate">{it.title}</span>
                    <span className={cn("ml-auto inline-flex shrink-0 items-center gap-1 text-xs whitespace-nowrap", it.done ? "text-ink-2" : "text-ink-3")}>
                      {it.done && <Check className="size-3" />}
                      {it.right}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function GradesPane() {
  return (
    <>
      <PaneHeader title="CS 537" meta="Operating Systems · Weighted by group" action="Fall 2026" />
      <div className="grid grid-cols-1 lg:h-[calc(100%-50px)] lg:grid-cols-[3fr_2fr]">
        <div className="order-first border-b border-line px-[18px] py-4 lg:order-none lg:border-b-0 lg:border-l lg:border-line lg:p-5">
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-[18px] lg:block">
            <div className="text-[30px] leading-none font-semibold tracking-[-0.03em] tabular lg:text-[36px]">90.1%</div>
            <div className="col-start-1 mt-[6px] text-xs text-ink-3">What-if total · was 89.4%</div>
            <div className="col-start-2 row-span-2 row-start-1 text-[13px] leading-[1.5] lg:mt-[18px] lg:border-t lg:border-line lg:pt-[14px]">
              Need <b className="font-semibold">84%</b> on the rest for an A.
            </div>
            <div className="hidden text-xs leading-[1.5] text-ink-3 lg:mt-[14px] lg:block">
              Canvas is the source of truth. Edits stay on this device and never change your real grade.
            </div>
            <div className="hidden gap-[14px] text-xs text-ink-3 underline-offset-2 lg:mt-4 lg:flex [&_span]:underline">
              <span>Reset</span>
              <span>Open in Canvas</span>
            </div>
          </div>
        </div>
        <div className="lg:order-first">
          <table className="w-full border-collapse text-[13px] tabular">
            <thead>
              <tr>
                <th className="border-b border-line px-[18px] pt-[11px] pb-[9px] text-left text-[11px] font-semibold tracking-[.02em] text-ink-3">Assignment</th>
                <th className="border-b border-line px-[18px] pt-[11px] pb-[9px] text-right text-[11px] font-semibold tracking-[.02em] text-ink-3">Score</th>
              </tr>
            </thead>
            <tbody>
              {GRADES.map((r, i) => (
                <tr key={i} className={cn(r.kind === "group" && "bg-sunken font-semibold")}>
                  <td className={cn("border-t border-line px-[18px] py-[10px]", r.kind === "sub" && "pl-8 text-ink-2")}>
                    {r.title}
                    {r.kind === "group" && <span className="ml-[6px] text-[11.5px] font-normal text-ink-3">{r.weight}</span>}
                  </td>
                  <td className={cn("border-t border-line px-[18px] py-[10px] text-right", r.muted && "text-ink-3")}>
                    {r.kind === "group" && r.edit ? (
                      <span className="-my-1 -mr-[7px] inline-block min-w-[50px] rounded-md border border-line-2 bg-surface px-[7px] py-[3px] text-right shadow-[0_0_0_3px_color-mix(in_srgb,var(--line-2)_35%,transparent)]">
                        {r.score}
                      </span>
                    ) : (
                      r.score
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export function CalendarPane() {
  const hours = Array.from({ length: CAL.endHour - CAL.startHour + 1 }, (_, i) => CAL.startHour + i);
  const label = (h: number) => (h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`);
  const top = (h: number) => CAL.headerPx + CAL.stripPx + (h - CAL.startHour) * CAL.pxPerHour;
  return (
    <>
      <PaneHeader title="Week" meta="Aug 17 to 21" action="Today · Subscribe" />
      <div className="grid h-[calc(100%-50px)] grid-cols-[44px_repeat(3,1fr)] lg:grid-cols-[44px_repeat(5,1fr)]">
        <div className="relative border-r border-line">
          <div className="h-[46px] border-b border-line" />
          <div className="h-[26px] border-b border-line" />
          {hours.map((h) => (
            <span key={h} className="absolute right-[6px] -translate-y-1/2 text-[10.5px] text-ink-3 tabular" style={{ top: top(h) }}>
              {label(h)}
            </span>
          ))}
        </div>
        {CAL_DAYS.map((d, di) => (
          <div key={d.day} className={cn("relative border-l border-line first:border-l-0", di >= 3 && "hidden lg:block")}>
            <div className="box-border h-[46px] border-b border-line pt-[6px] text-center text-[11px] font-medium text-ink-3">
              {d.label}
              <b
                className={cn(
                  "mt-px block h-[22px] text-[13px] leading-[22px] font-semibold text-ink tabular",
                  d.today && "mx-auto grid w-[22px] place-items-center rounded-md bg-today text-today-fg",
                )}
              >
                {d.day}
              </b>
            </div>
            <div className="flex h-[26px] items-center gap-[3px] overflow-hidden border-b border-line px-1">
              {d.due.map((p) => (
                <span key={p.label} className="inline-flex h-[18px] items-center gap-1 rounded-md bg-chip px-[6px] text-[10px] font-medium whitespace-nowrap" style={c(p.c)}>
                  <i className="size-[5px] rounded-full bg-c" />
                  {p.label}
                </span>
              ))}
            </div>
            {hours.slice(1).map((h) => (
              <i key={h} className="absolute right-0 left-0 h-px bg-line" style={{ top: top(h) }} />
            ))}
            {CAL_EVENTS.filter((e) => e.day === di).map((e) => (
              <div
                key={e.title + e.start}
                className={cn(
                  "absolute right-1 left-1 overflow-hidden rounded-md py-1 pr-[5px] pl-2 text-[10.5px] leading-[1.3] font-medium lg:py-[5px] lg:pr-[6px] lg:pl-[9px] lg:text-[11px] lg:whitespace-nowrap",
                  "before:absolute before:top-0 before:bottom-0 before:left-0 before:w-[3px] before:bg-c",
                  e.kind === "due" ? "border border-line bg-surface" : e.kind === "plan" ? "border border-dashed border-line-2 bg-surface" : "bg-chip",
                )}
                style={{ top: calTop(e.start), height: minutes(e.end) - minutes(e.start), ...c(e.c) }}
              >
                <span className="block truncate">{e.title}</span>
                <small className="hidden truncate text-[10.5px] font-normal text-ink-3 lg:block">{e.sub}</small>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

export function SearchPane() {
  return (
    <div className="h-full bg-sunken px-[14px] pt-5 lg:px-[18px] lg:pt-9">
      <div className="mx-auto max-w-[560px] overflow-hidden rounded-lg border border-line bg-raised shadow-menu">
        <div className="flex items-center gap-[10px] border-b border-line px-[14px] py-[13px] text-sm">
          <Search className="size-[15px] text-ink-3" strokeWidth={1.75} />
          sched
          <span className="-ml-2 h-4 w-px bg-ink animate-[landing-blink_1s_steps(2)_infinite]" />
          <Kbd className="ml-auto text-[10.5px]">Esc</Kbd>
        </div>
        {SEARCH.map((g) => (
          <div key={g.group}>
            <Eyebrow className="px-[14px] pt-[10px] pb-1">{g.group}</Eyebrow>
            {g.rows.map((r) => (
              <div key={r.title} className={cn("flex items-center gap-[10px] px-[14px] py-2 text-[13px]", r.on && "bg-hover")} style={r.c ? c(r.c) : undefined}>
                {r.c && <span className="size-[6px] rounded-full bg-c" />}
                {r.icon === "task" && <SquareCheck className="size-[14px] text-ink-3" strokeWidth={1.75} />}
                {r.icon === "calendar" && <Calendar className="size-[14px] text-ink-3" strokeWidth={1.75} />}
                <span className="truncate">{r.title}</span>
                <span className="ml-auto flex shrink-0 gap-1 text-xs text-ink-3">
                  {r.meta}
                  {r.keys?.map((k) => <Kbd key={k} className="text-[10.5px]">{k}</Kbd>)}
                </span>
              </div>
            ))}
          </div>
        ))}
        <div className="flex gap-[14px] border-t border-line px-[14px] py-[9px] text-[11.5px] text-ink-3 [&_b]:font-medium [&_b]:text-ink-2">
          <span><b>↑↓</b> move</span>
          <span><b>↵</b> open</span>
          <span><b>esc</b> close</span>
        </div>
      </div>
    </div>
  );
}

export function AskPane() {
  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[220px_1fr]">
      <div className="hidden border-r border-line bg-sunken px-2 py-3 lg:block">
        <Eyebrow className="px-2 pt-1 pb-2">Threads</Eyebrow>
        {ASK_THREADS.map((t, i) => (
          <div key={t} className={cn("truncate rounded-md px-2 py-[7px] text-[13px] text-ink-2", i === 0 && "bg-hover text-ink")}>{t}</div>
        ))}
      </div>
      <div className="flex min-w-0 flex-col">
        <div className="flex flex-1 flex-col gap-[14px] px-[22px] pt-[22px]">
          <div className="max-w-[72%] self-end rounded-lg bg-chip px-3 py-[9px] text-[13.5px]">When is the CS 537 midterm, and what does it cover?</div>
          <div className="max-w-[86%] text-[13.5px] leading-[1.55]">
            <p className="mb-2"><b className="font-semibold">Thursday, October 15 at 7:15 PM</b> in Van Vleck B102. The syllabus lists it as covering chapters 1 to 7 of the textbook, which is everything through CPU scheduling.</p>
            <p className="mb-2">You have one planned task that overlaps: a study group for Project 2 at 7 PM that day. Want me to move it?</p>
            <span className="mt-[2px] inline-flex items-center gap-[6px] rounded-md border border-line px-2 py-[3px] text-xs text-ink-2">
              <span className="size-[6px] rounded-full bg-[var(--course-indigo)]" />
              CS 537 · Syllabus
            </span>
          </div>
          <div className="max-w-[72%] self-end rounded-lg bg-chip px-3 py-[9px] text-[13.5px]">Yes, move it to Wednesday the 14th, same time.</div>
          <div className="max-w-[86%] text-[13.5px] leading-[1.55]">
            <p className="mb-2">Done. The study group is now planned for <b className="font-semibold">Wednesday, October 14 at 7 PM</b>.</p>
            <div className="mt-1 grid grid-cols-[1fr_auto] items-center gap-x-[14px] rounded-lg border border-line border-l-[3px] border-l-[var(--course-indigo)] bg-surface px-3 py-[9px] text-[13px]">
              <span className="font-medium">Study group, Project 2</span>
              <span className="row-span-2 text-xs text-ink-3 underline underline-offset-2">Undo</span>
              <span className="mt-px text-xs text-ink-3">Planned Thu Oct 15 to Wed Oct 14 · 7:00 PM</span>
            </div>
          </div>
        </div>
        <div className="mx-[22px] mt-4 mb-[22px] flex items-center justify-between rounded-lg border border-line-2 px-3 py-[11px] text-[13.5px] text-ink-3">
          <span>Ask about your courses or plan your week</span>
          <Send className="size-[15px]" strokeWidth={1.75} />
        </div>
      </div>
    </div>
  );
}

/* ---------- first sync ---------- */

export function FirstSyncCard({ go }: { go: boolean }) {
  return (
    <div aria-label="First sync from Canvas" className="rounded-lg border border-line bg-surface px-[18px] pt-[18px] pb-2 shadow-float">
      <div className="text-sm font-semibold tracking-[-0.01em]">Setting up wiscourse</div>
      <div className="mt-[3px] text-[12.5px] text-ink-3">First sync from Canvas. Items show up as they arrive.</div>
      <div className="my-[14px] mb-[6px] h-[3px] overflow-hidden rounded-full bg-chip">
        <i
          className={cn("block h-full w-full origin-left bg-ink transition-transform duration-[2600ms] ease-[cubic-bezier(.2,.7,.2,1)]", go ? "scale-x-[.72]" : "scale-x-[.06]")}
        />
      </div>
      {FIRST_SYNC.map((s, i) => (
        <div
          key={s.label}
          className={cn(
            "flex items-center gap-[9px] border-t border-line py-[10px] text-[13px] first-of-type:border-t-0",
            "transition-[opacity,transform] duration-[400ms] ease-[cubic-bezier(.16,1,.3,1)] [transition-delay:calc(var(--i)*260ms+300ms)]",
            go ? "opacity-100" : "translate-y-1 opacity-0",
            s.state === "wait" && "text-ink-3",
          )}
          style={vars({ "--i": i })}
        >
          {s.state === "done" && <Check className="size-[14px] shrink-0 text-ink" />}
          {s.state === "busy" && <LoaderCircle className="size-[14px] shrink-0 animate-spin text-ink-3" />}
          {s.state === "wait" && <Clock className="size-[14px] shrink-0 text-ink-3" />}
          {s.label}
          <span className={cn("ml-auto text-ink-3 tabular", s.state === "done" && "text-ink-2")}>
            {s.strong && <b className="font-medium text-ink">{s.strong}</b>}
            {s.value}
          </span>
        </div>
      ))}
    </div>
  );
}
