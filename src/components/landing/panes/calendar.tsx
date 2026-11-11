/**
 * Showcase pane: the Calendar week view, a static copy of routes/calendar
 * (toolbar, day headers, the Due and Plan bands, the time grid). The frame
 * has room for the five weekdays, or the last three on a phone, where the
 * bands shrink to their marks as they do in the app. Its one live moment:
 * the blocks pop in day by day, then the now line draws across today.
 */

import type { CSSProperties, ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Plus, Search, Share } from "lucide-react";
import { cn } from "@/lib/utils";
import { c, type CourseKey } from "../landing-data";
import { enter, useSequence } from "../landing-motion";

const PX_PER_HOUR = 48;
const MIN_BLOCK_PX = 40;
/** The grid is scrolled to 9 AM, an hour before the week's first class. */
const HOURS = ["9 AM", "10 AM", "11 AM", "Noon", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM"];
const FIRST_MINUTE = 9 * 60;
const NOW = 11 * 60 + 24;

type Due = { c: CourseKey; title: string; course: string; time?: string; late?: boolean };
type Planned = { c: CourseKey; title: string };
/** A class meeting, or with `local` an event the student made (dashed). Times are minutes past midnight. */
type Block = { c: CourseKey; code?: string; title: string; start: number; end: number; local?: boolean };
type Day = { label: string; date: number; due: Due[]; done?: number; planned: Planned[]; blocks: Block[] };

const at = (hour: number, minute = 0) => hour * 60 + minute;
const lecture = (key: CourseKey, code: string, start: number, end: number, title = "Lecture"): Block => ({
  c: key, code, title, start, end,
});

const CS = lecture("indigo", "CS 537", at(10), at(10, 50));
const ECON = lecture("teal", "ECON 101", at(12, 5), at(13, 20));
const MATH = lecture("amber", "MATH 340", at(11), at(12, 15));
const STAT = lecture("sky", "STAT 324", at(13, 20), at(14, 35), "Lab");

/** Mon Aug 17 to Fri Aug 21; the last day is today. */
const DAYS: Day[] = [
  { label: "Mon", date: 17, done: 1, due: [], planned: [], blocks: [CS, ECON] },
  { label: "Tue", date: 18, due: [], planned: [], blocks: [MATH, STAT] },
  {
    label: "Wed", date: 19, done: 1, planned: [],
    due: [{ c: "indigo", title: "Project 2: Multithreaded Web Server", course: "CS 537", late: true }],
    blocks: [CS, ECON, { c: "none", title: "Finish Project 2", start: at(14), end: at(15), local: true }],
  },
  {
    label: "Thu", date: 20, planned: [],
    due: [{ c: "teal", title: "Problem Set 3: Elasticity and Consumer Surplus", course: "ECON 101", time: "5 PM", late: true }],
    blocks: [MATH, STAT],
  },
  {
    label: "Fri", date: 21, done: 1,
    due: [{ c: "amber", title: "Homework 5: Eigenvalues and Diagonalization", course: "MATH 340" }],
    planned: [{ c: "indigo", title: "Read Silberschatz ch. 4, Threads" }],
    blocks: [CS, lecture("indigo", "CS 537", at(13), at(14), "Office hours")],
  },
];
const TODAY = DAYS.length - 1;
/** A phone has room for three days: the first two fold away. */
const PHONE_FROM = 2;

/** "11:00", as the app writes a time inside a range. */
const clock = (minute: number) => `${((Math.floor(minute / 60) + 11) % 12) + 1}:${String(minute % 60).padStart(2, "0")}`;
const offset = (minute: number) => ((minute - FIRST_MINUTE) / 60) * PX_PER_HOUR;

/** `enter(i)` merged with the element's own classes. */
const row = (i: number, className: string) => ({ ...enter(i), className: cn(enter(i).className, className) });

const COLUMNS = "grid grid-cols-[44px_repeat(3,minmax(0,1fr))] lg:grid-cols-[56px_repeat(5,minmax(0,1fr))]";
const TODAY_TINT = "bg-[color-mix(in_srgb,var(--ink)_3.5%,transparent)] dark:bg-[color-mix(in_srgb,white_4%,transparent)]";
const HOUR_LINES: CSSProperties = {
  backgroundImage: `repeating-linear-gradient(to bottom, var(--line) 0 1px, transparent 1px ${PX_PER_HOUR}px)`,
  backgroundPosition: "0 -1px",
};
const HEADER_BUTTON = "grid size-9 shrink-0 place-items-center rounded-full text-ink-2";
const NAV = "flex h-full min-w-8 items-center justify-center px-2 text-[12.5px] font-medium text-ink-2";
const ACTION = "hidden h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-medium whitespace-nowrap lg:inline-flex";

/** Hidden on a phone when the day is one of the two folded away. */
const fold = (day: number) => day < PHONE_FROM && "max-lg:hidden";

export function CalendarPane({ active }: { active: boolean }) {
  // The last block lands at about 1.3s; the now line follows it.
  const now = useSequence(active, [1450]) >= 0;

  return (
    <div className="flex h-full flex-col">
      <div {...row(0, "shrink-0 border-b border-line lg:border-b-0")}>
        <div className="flex flex-wrap items-center gap-x-2 px-4 lg:h-16 lg:flex-nowrap lg:border-b lg:border-line lg:px-6">
          <div className="my-[11px] mr-1 flex h-[42px] min-w-0 flex-1 flex-col lg:my-0 lg:mr-3 lg:flex-none">
            <div className="page-title h-6 truncate leading-6">
              August<span className="hidden lg:inline"> 2026</span>
            </div>
            <div className="mt-[2px] h-4 min-w-0 truncate text-[12.5px] leading-4 text-ink-3">Week 4</div>
          </div>

          <div className="hidden h-8 items-center overflow-hidden rounded-lg border border-line lg:flex">
            <span className={NAV}>
              <ChevronLeft className="size-[15px]" />
            </span>
            <span className={cn(NAV, "border-x border-line px-3")}>Today</span>
            <span className={NAV}>
              <ChevronRight className="size-[15px]" />
            </span>
          </div>

          {/* Phones wrap the view control onto its own row; from lg up the wrapper dissolves into the bar. */}
          <div className="order-last flex basis-full items-center gap-2 pb-[10px] lg:contents">
            <div className="flex h-8 min-w-0 flex-1 items-center gap-px rounded-lg bg-chip p-[3px] lg:ml-auto lg:flex-none">
              {["Day", "Week", "Month"].map((view) => (
                <span
                  key={view}
                  className={cn(
                    "grid h-[26px] flex-1 place-items-center rounded-md px-3 text-[12.5px] font-medium text-ink-3",
                    view === "Week" &&
                      "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,.08)] dark:bg-raised dark:shadow-[inset_0_0_0_1px_var(--line-2)]",
                  )}
                >
                  {view}
                </span>
              ))}
            </div>
          </div>

          <span className={cn(ACTION, "px-[10px] text-ink-3")}>
            <Share className="size-[14px]" />
            Subscribe
          </span>
          <span className={cn(ACTION, "border border-line-2 bg-surface px-3 shadow-xs dark:bg-line-2/30")}>
            <Plus className="size-[14px]" />
            Event
          </span>

          <div className="flex shrink-0 items-center gap-2 lg:hidden">
            <span className={HEADER_BUTTON}>
              <Plus className="size-[16px]" />
            </span>
            <span className={HEADER_BUTTON}>
              <Search className="size-[16px]" />
            </span>
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-chip text-[12.5px] font-semibold text-ink-2">
              MK
            </span>
          </div>
        </div>
      </div>

      <div {...row(1, cn(COLUMNS, "shrink-0 border-b border-line"))}>
        <div />
        {DAYS.map((day, d) => (
          <div
            key={day.date}
            className={cn(
              "flex flex-col items-center justify-center gap-[2px] border-l border-line py-[7px] lg:flex-row lg:gap-[6px] lg:py-[11px]",
              d === TODAY && TODAY_TINT,
              fold(d),
            )}
          >
            <span className={cn("text-[12px] font-medium", d === TODAY ? "text-ink" : "text-ink-3")}>{day.label}</span>
            <span
              className={cn(
                "tabular grid h-6 min-w-6 place-items-center rounded-full px-[5px] text-[14px] font-semibold tracking-[-0.01em]",
                d === TODAY ? "bg-today text-today-fg" : "text-ink-3",
              )}
            >
              {day.date}
            </span>
          </div>
        ))}
      </div>

      <Band i={2} label="Due">
        {(day) => (
          <>
            {day.due.map((item) => (
              <BandItem key={item.title} kind="due" {...item} />
            ))}
            {day.done !== undefined && (
              <span className="tabular flex h-[22px] shrink-0 items-center gap-px rounded-[5px] px-[3px] text-[11px] text-ink-3 lg:w-full lg:gap-[5px] lg:pr-1 lg:pl-[3px] lg:text-[12px]">
                <span className="grid size-[14px] shrink-0 place-items-center">
                  <Check className="size-[12px]" strokeWidth={2.75} />
                </span>
                {day.done}
                <span className="max-lg:hidden">done</span>
              </span>
            )}
          </>
        )}
      </Band>
      <Band i={3} label="Plan">
        {(day) => day.planned.map((item) => <BandItem key={item.title} kind="planned" {...item} />)}
      </Band>

      <div {...row(4, cn(COLUMNS, "min-h-0 flex-1"))}>
        <div className="relative">
          {HOURS.map((hour, h) => (
            <span
              key={hour}
              className="tabular absolute right-1 mt-[3px] text-[12px] leading-none whitespace-nowrap text-ink-3 lg:right-2"
              style={{ top: h * PX_PER_HOUR }}
            >
              {hour}
            </span>
          ))}
        </div>
        {DAYS.map((day, d) => (
          <div
            key={day.date}
            className={cn("relative overflow-hidden border-l border-line", d === TODAY && TODAY_TINT, fold(d))}
            style={HOUR_LINES}
          >
            {/* Days gone by sit at half strength; the wrapper carries it so each block's pop can end at full opacity. */}
            <div className={cn("absolute inset-0", d < TODAY && "opacity-50")}>
              {day.blocks.map((block, k) => (
                <TimeBlock key={block.start} block={block} active={active} delay={380 + d * 110 + k * 70} />
              ))}
            </div>
            {d === TODAY && now && (
              <div
                className="absolute right-0 left-0 z-[2] flex -translate-y-1/2 items-center"
                style={{ top: offset(NOW) }}
              >
                <span className="tabular ml-1 shrink-0 animate-[lp-pop_.45s_var(--lp-ease)_both] rounded-[4px] bg-today px-[4px] py-px text-[10.5px] leading-[13px] font-semibold text-today-fg">
                  {clock(NOW)}
                </span>
                <span className="h-[1.5px] flex-1 origin-left animate-[lp-fill-x_.7s_var(--lp-ease)_.12s_both] bg-today" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** One of the two thin bands above the grid: a label, then each day's items. */
function Band({ i, label, children }: { i: number; label: string; children: (day: Day) => ReactNode }) {
  return (
    <div {...row(i, cn(COLUMNS, "shrink-0 border-b border-line"))}>
      <div className="flex flex-col items-end gap-1 pt-[6px] pr-1 text-[12px] font-medium text-ink-3 lg:pr-2">{label}</div>
      {DAYS.map((day, d) => (
        <div
          key={day.date}
          className={cn(
            "flex min-h-8 min-w-0 flex-wrap content-start justify-center border-l border-line px-[3px] py-1 lg:flex-col lg:flex-nowrap lg:justify-start lg:gap-[3px]",
            d === TODAY && TODAY_TINT,
            fold(d),
          )}
        >
          {children(day)}
        </div>
      ))}
    </div>
  );
}

/** A band item: the event chip from lg up, its mark alone on a phone. */
function BandItem({
  kind, c: course, title, course: code, time, late,
}: { kind: "due" | "planned" } & Planned & Partial<Due>) {
  const when = time ?? (late ? "Late" : undefined);
  return (
    <span className="contents" style={c(course)}>
      <span className="flex size-[22px] items-center justify-center rounded-[5px] lg:hidden">
        {kind === "due" ? (
          <i className="block size-[7px] rounded-full bg-c" />
        ) : (
          <i className="block size-[11px] rounded-[3px] border-[1.5px] border-c opacity-85" />
        )}
      </span>
      <span className="hidden w-full shrink-0 rounded-[6px] border-l-2 border-c bg-[color-mix(in_srgb,var(--c)_11%,var(--surface))] py-[3px] pr-[5px] pl-[6px] text-[13px] leading-[16px] font-medium text-ink lg:block dark:bg-[color-mix(in_srgb,var(--c)_13%,var(--surface))]">
        <span className="line-clamp-3 break-words">{title}</span>
        {(when !== undefined || code !== undefined) && (
          <span className="tabular mt-px flex min-w-0 items-center gap-[4px] text-[12px] leading-[14px] font-normal whitespace-nowrap text-ink-3">
            {when !== undefined && <span className={cn("shrink-0", late && "text-red")}>{when}</span>}
            {when !== undefined && code !== undefined && <span className="shrink-0">·</span>}
            {code !== undefined && <span className="min-w-0 truncate">{code}</span>}
          </span>
        )}
      </span>
    </span>
  );
}

/** A block on the time grid; it rests hidden and pops in once the pane is active. */
function TimeBlock({ block, active, delay }: { block: Block; active: boolean; delay: number }) {
  return (
    <div
      className={cn(
        "absolute right-[3px] left-[3px] overflow-hidden rounded-md px-2 pt-1 text-[12px] leading-[1.3] whitespace-nowrap",
        block.local
          ? "bg-[color-mix(in_srgb,var(--c)_8%,var(--surface))] outline-1 outline-offset-[-1px] outline-[color-mix(in_srgb,var(--c)_55%,transparent)] outline-dashed dark:bg-[color-mix(in_srgb,var(--c)_14%,var(--surface))]"
          : "bg-[color-mix(in_srgb,var(--c)_16%,var(--surface))] dark:bg-[color-mix(in_srgb,var(--c)_26%,var(--surface))]",
        active ? "animate-[lp-pop_.45s_var(--lp-ease)_both]" : "opacity-0",
      )}
      style={{
        ...c(block.c),
        top: offset(block.start),
        height: Math.max(MIN_BLOCK_PX, offset(block.end) - offset(block.start)),
        animationDelay: `${delay}ms`,
      }}
    >
      <div className="truncate font-medium text-c">
        {block.code !== undefined && <b className="font-semibold">{block.code} </b>}
        {block.title}
      </div>
      <div className="tabular truncate text-[11px] text-[color-mix(in_srgb,var(--c)_70%,var(--ink))] opacity-85">
        {clock(block.start)} to {clock(block.end)}
      </div>
    </div>
  );
}
