/**
 * Showcase pane: a static miniature of the Inbox screen (src/routes/inbox.tsx).
 * Page bar, type tabs, the feed list and, from lg up, the reading pane with
 * the open announcement. Its one live moment: a freshly posted grade lands at
 * the top of Today and the unread counts tick up by one.
 */

import {
  ArrowUpRight, CheckCheck, ChevronDown, Clock, FilePlus2, GraduationCap, Mail, Megaphone, Search,
} from "lucide-react";
import { CourseTag, SectionCount } from "@/components/app/bits";
import { cn } from "@/lib/utils";
import { c, type CourseKey } from "../landing-data";
import { enter, useSequence } from "../landing-motion";

const ICON = { announcement: Megaphone, grade: GraduationCap, assignment: FilePlus2, change: Clock } as const;

type FeedType = keyof typeof ICON;
type Item = { type: FeedType; c: CourseKey; code: string; title: string; sub: string; when: string; unread?: boolean };

/** The grade that arrives while the pane is on screen. */
const ARRIVAL: Item = { type: "grade", c: "sky", code: "STAT 324", title: "Homework 3", sub: "Graded 47/50", when: "now", unread: true };
/** Its row height on one title line, which the rows below slide down by. */
const ARRIVAL_PX = 63;

/** The announcement open in the reading pane. */
const OPEN: Item = {
  type: "announcement", c: "indigo", code: "CS 537", title: "Today's discussion sections meet in CS 1240",
  sub: "Hi all, our usual rooms are booked for the career fair setup, so every Friday section meets in CS 1240.", when: "2h",
};

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Today",
    items: [
      OPEN,
      { type: "change", c: "teal", code: "ECON 101", title: "Problem Set 4 due date moved", sub: "Aug 26, 5:00 PM → Aug 28, 5:00 PM", when: "4h", unread: true },
      { type: "assignment", c: "amber", code: "MATH 340", title: "Homework 6", sub: "New assignment · Due Sep 1, 11:59 PM · 40 points", when: "6h", unread: true },
    ],
  },
  {
    label: "Yesterday",
    items: [
      { type: "announcement", c: "sky", code: "STAT 324", title: "Lab sections begin next week", sub: "Labs meet in Van Vleck B119 starting Aug 25.", when: "Thu", unread: true },
      { type: "grade", c: "indigo", code: "CS 537", title: "Project 1: xv6 Shell", sub: "Graded 92/100", when: "Thu" },
      { type: "announcement", c: "teal", code: "ECON 101", title: "Office hours moved to Social Sciences 6470", sub: "Starting this week, Tuesdays 2 to 4 PM.", when: "Thu" },
    ],
  },
  {
    label: "This week",
    items: [
      { type: "grade", c: "amber", code: "MATH 340", title: "Homework 4", sub: "Graded 38/40", when: "Tue", unread: true },
      { type: "change", c: "indigo", code: "CS 537", title: "Project 2: Multithreaded Web Server points changed", sub: "100 points → 120 points", when: "Mon" },
    ],
  },
];

const TABS: { label: string; type?: FeedType }[] = [
  { label: "All" },
  { label: "Announcements", type: "announcement" },
  { label: "Grades", type: "grade" },
  { label: "Changes", type: "change" },
  { label: "Assignments", type: "assignment" },
];

const HEADER_BUTTON = "grid size-9 shrink-0 place-items-center rounded-full text-ink-2";
const ACTION = "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md text-[13px] font-medium whitespace-nowrap";

export function InboxPane({ active }: { active: boolean }) {
  // Step 0 mounts the new row unseen with the rows below held in place; step 1 lets both move.
  const step = useSequence(active, [1600, 1660]);
  const landed = step >= 1;
  const feed = [...(landed ? [ARRIVAL] : []), ...GROUPS.flatMap((g) => g.items)];
  const unread = (type?: FeedType) => feed.filter((f) => f.unread && (type === undefined || f.type === type)).length;
  const [today, ...earlier] = GROUPS;

  return (
    <div className="flex h-full flex-col">
      <div {...enter(0)}>
        <div className="h-14 shrink-0 border-b border-line px-4 lg:h-16 lg:px-6">
          <div className="flex h-full w-full items-center justify-between gap-5">
            <div className="flex h-[42px] min-w-0 flex-col">
              <div className="page-title h-6 truncate leading-6">Inbox</div>
              <div className="mt-[2px] h-4 min-w-0 truncate text-[12.5px] leading-4 text-ink-3">
                <Tick n={unread()} /> unread · checked just now
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 lg:gap-3">
              <div className="hidden items-center gap-4 lg:flex">
                <CourseSelect />
                <UnreadToggle />
              </div>
              <div className="inline-flex h-8 items-center gap-[6px] rounded-md px-2 text-[12.5px] font-medium whitespace-nowrap text-ink-2 max-lg:size-9 max-lg:justify-center max-lg:rounded-full max-lg:border max-lg:border-line max-lg:px-0 lg:ml-1">
                <CheckCheck className="size-[15px]" />
                <span className="hidden lg:inline">Mark all read</span>
              </div>
              <div className="flex shrink-0 items-center gap-2 lg:hidden">
                <span className={HEADER_BUTTON}>
                  <Search className="size-[16px]" />
                </span>
                <span className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-chip text-[12.5px] font-semibold text-ink-2">
                  MK
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col border-line lg:w-[388px] lg:flex-none lg:border-r">
          <div {...enter(1)}>
            <div className="border-b border-line px-4 py-2 lg:px-6">
              {/* The real track scrolls sideways; here a short fade stands in for "more this way". */}
              <div className="relative flex h-8 w-fit max-w-full items-center overflow-hidden rounded-lg bg-chip p-[2px] after:absolute after:inset-y-0 after:right-0 after:w-5 after:bg-linear-to-l after:from-chip after:to-transparent">
                {TABS.map((tab) => (
                  <span
                    key={tab.label}
                    className={cn(
                      "inline-flex h-full shrink-0 items-center gap-[5px] rounded-[6px] px-[10px] text-[12.5px] font-medium whitespace-nowrap",
                      tab.type === undefined
                        ? "bg-surface text-ink shadow-[0_1px_2px_rgba(16,17,20,0.06),inset_0_0_0_1px_var(--line)]"
                        : "text-ink-3",
                    )}
                  >
                    {tab.label}
                    {tab.type !== undefined && (
                      <span className="tabular text-[12px] font-normal text-ink-3">
                        <Tick n={unread(tab.type)} />
                      </span>
                    )}
                  </span>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 lg:hidden">
                <CourseSelect />
                <UnreadToggle />
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            <GroupLabel label={today.label} n={today.items.length + (landed ? 1 : 0)} i={2} />
            {step >= 0 && <Row item={ARRIVAL} arriving={landed} beforeOpen className={landed ? undefined : "opacity-0"} />}
            <div
              className={landed ? "transition-transform duration-500 ease-(--lp-ease)" : undefined}
              style={step === 0 ? { transform: `translateY(-${ARRIVAL_PX}px)` } : undefined}
            >
              {today.items.map((item, i) => (
                <Row key={item.title} item={item} open={item === OPEN} i={3 + i} />
              ))}
              {earlier.map((group, g) => {
                const base = 3 + today.items.length + earlier.slice(0, g).reduce((n, e) => n + e.items.length + 1, 0);
                return (
                  <div key={group.label}>
                    <GroupLabel label={group.label} n={group.items.length} i={base} />
                    {group.items.map((item, i) => (
                      <Row key={item.title} item={item} i={base + 1 + i} />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="hidden min-w-0 flex-1 lg:block">
          <Reading />
        </div>
      </div>
    </div>
  );
}

/** A count that pops when it changes. */
function Tick({ n }: { n: number }) {
  return (
    <span key={n} className="inline-block animate-[lp-pop_.4s_var(--lp-ease)_both]">
      {n}
    </span>
  );
}

function GroupLabel({ label, n, i }: { label: string; n: number; i: number }) {
  return (
    <div
      {...enter(i)}
      className={cn(
        enter(i).className,
        "flex items-baseline gap-2 pt-5 pr-4 pb-[6px] pl-6 text-[13px] font-semibold tracking-[-0.01em] text-ink lg:pr-6 lg:pl-8",
      )}
    >
      {label}
      <SectionCount n={n} />
    </div>
  );
}

/** InboxRow: unread gutter, type icon, title with the time, then course and what happened. */
function Row({
  item, open = false, beforeOpen = false, arriving = false, i, className,
}: {
  item: Item;
  /** Shown in the reading pane: the selected plate, from lg up. */
  open?: boolean;
  /** Sits right above the open row, whose plate its hairline must not touch. */
  beforeOpen?: boolean;
  arriving?: boolean;
  i?: number;
  className?: string;
}) {
  const Icon = ICON[item.type];
  const motion = i === undefined ? undefined : enter(i);
  return (
    <div
      className={cn(
        motion?.className,
        "relative isolate flex items-start py-[11px] pr-4 pl-4 lg:pr-8 lg:pl-8",
        "before:absolute before:inset-x-1 before:inset-y-[2px] before:-z-10 before:rounded-[6px] lg:before:inset-x-6",
        "after:absolute after:right-1 after:bottom-0 after:left-[65px] after:h-px after:bg-line lg:after:right-6 lg:after:left-[81px]",
        open && "lg:before:bg-[color-mix(in_oklab,var(--ink)_7%,transparent)]",
        (open || beforeOpen) && "lg:after:hidden",
        arriving && "animate-[lp-arrive_.5s_var(--lp-ease)_both]",
        className,
      )}
      style={{ ...motion?.style, ...c(item.c) }}
    >
      {arriving && (
        <span className="absolute inset-x-1 inset-y-[2px] -z-10 animate-[lp-flash_1.8s_ease-out_both] rounded-[6px] lg:inset-x-6" />
      )}
      <span className="mr-[10px] flex w-3 shrink-0 justify-center pt-[7px]">
        {item.unread && <span className="size-[6px] rounded-full bg-unread" />}
      </span>
      <Icon className="mt-[3px] mr-3 size-[15px] shrink-0 text-ink-3" />
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-3">
          <span
            className={cn(
              "line-clamp-2 min-w-0 flex-1 text-[14px] leading-[1.4] tracking-[-0.005em] text-ink",
              item.unread ? "font-semibold" : "font-normal",
            )}
          >
            {item.title}
          </span>
          <span className="tabular shrink-0 pt-px text-[12.5px] text-ink-3">{item.when}</span>
        </span>
        <span className="mt-[3px] flex min-w-0 items-center gap-[6px] text-[12.5px] text-ink-3">
          <CourseTag className="shrink-0">{item.code}</CourseTag>
          <span>·</span>
          <span className="min-w-0 flex-1 truncate">{item.sub}</span>
        </span>
      </span>
    </div>
  );
}

function CourseSelect() {
  return (
    <div className="relative flex min-w-0 items-center">
      <span className="flex h-7 max-w-[180px] min-w-0 items-center truncate rounded-md bg-surface pr-7 pl-[10px] text-[12.5px] font-medium text-ink-2 shadow-[inset_0_0_0_1px_var(--line-2)]">
        All courses
      </span>
      <ChevronDown className="absolute right-[9px] size-[13px] text-ink-3" />
    </div>
  );
}

function UnreadToggle() {
  return (
    <div className="flex h-7 shrink-0 items-center gap-[9px] rounded-md px-1 text-[12.5px] font-medium whitespace-nowrap text-ink-2">
      <span className="relative block h-4 w-7 rounded-full bg-line-2">
        <span className="absolute top-[2px] left-[2px] block size-3 rounded-full bg-surface shadow-[0_1px_1px_rgba(0,0,0,0.12)]" />
      </span>
      Unread only
    </div>
  );
}

/** The reading pane's announcement: kind line, title, by-line, actions, body. */
function Reading() {
  return (
    <div className="mx-auto w-full px-6 pt-7 pb-12" style={c(OPEN.c)}>
      <div {...enter(4)}>
        <div className="mb-[10px] flex items-center gap-2 text-[12.5px] text-ink-3">
          <CourseTag>{OPEN.code}</CourseTag>
          <span>·</span>
          <span className="inline-flex min-w-0 items-center gap-[5px]">
            <Megaphone className="size-[13px] shrink-0" />
            <span className="truncate">Announcement</span>
          </span>
        </div>
        <div className="text-[22px] leading-[1.25] font-semibold tracking-[-0.022em] text-balance text-ink">{OPEN.title}</div>
        <div className="mt-[10px] flex items-center gap-2 text-[12.5px] text-ink-3">
          <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-chip text-[9.5px] font-semibold text-ink-2">PR</span>
          <span className="font-medium text-ink-2">Priya Raman</span>
          <span>·</span>
          <span className="tabular">Aug 21, 9:14 AM</span>
        </div>
      </div>

      <div {...enter(6)} className={cn(enter(6).className, "mt-5 flex items-center gap-2 border-b border-line pb-5")}>
        <span className={cn(ACTION, "bg-today px-3 text-today-fg")}>All announcements</span>
        <span className={cn(ACTION, "border border-line-2 bg-surface px-2.5 text-ink")}>
          Open in Canvas
          <ArrowUpRight className="size-[14px] text-ink-3" />
        </span>
        <span className={cn(ACTION, "ml-auto w-8 text-ink")}>
          <Mail className="size-[14px] text-ink-2" />
        </span>
      </div>

      <div {...enter(8)} className={cn(enter(8).className, "pt-6 text-[14.5px] leading-[1.65] text-ink [&_p]:mb-[14px]")}>
        <p>
          Hi all, our usual rooms are booked for the career fair setup, so every Friday section meets in CS 1240 today. Times do
          not change.
        </p>
        <p>
          We will work through the lock and condition variable problems from the Week 4 worksheet and keep the last fifteen
          minutes for questions about the thread pool.
        </p>
        <p>If you cannot make it, the worksheet and its solutions go up under Week 4 in Modules tonight.</p>
        <p>See you there.</p>
      </div>
    </div>
  );
}
