/**
 * Showcase pane: a static miniature of a course hub on its Modules tab
 * (course-header.tsx over module-timeline.tsx), for CS 537. The modules are
 * dated by week, so the real screen draws them as the week timeline, the one
 * Modules layout with progress meters. Its one live moment: the meters fill,
 * then this week's quiz turns Submitted and its week counts one more viewed.
 */

import {
  ArrowUpRight, Check, ChevronLeft, CircleHelp, ClipboardList, Clock, ExternalLink, FileText, Link2, Paperclip, Search,
} from "lucide-react";
import { CourseTag, Pill } from "@/components/app/bits";
import { cn } from "@/lib/utils";
import { c } from "../landing-data";
import { enter, useSequence } from "../landing-motion";

const ICON = { Page: FileText, File: Paperclip, Assignment: ClipboardList, Quiz: CircleHelp, ExternalUrl: Link2 } as const;

/** `status` is the row's right-hand word; "Overdue" and "Submitted" draw as the real row draws them. */
type Item = { type: keyof typeof ICON; title: string; status?: string; live?: boolean };
type Week = { label: string; range: string; topic: string; viewed: number; current?: boolean; items: Item[] };

const WEEKS: Week[] = [
  {
    label: "Week 3", range: "Aug 10 to 14", topic: "Processes and the Shell", viewed: 2,
    items: [
      { type: "Page", title: "Lecture notes: fork, exec and wait" },
      { type: "Assignment", title: "Project 1: xv6 Shell", status: "Submitted" },
    ],
  },
  {
    label: "Week 4", range: "Aug 17 to 21", topic: "Threads and Concurrency", viewed: 3, current: true,
    items: [
      { type: "Page", title: "Lecture notes: threads and pthreads" },
      // The live row: due today, then submitted while the pane is on screen.
      { type: "Quiz", title: "Quiz 4: Concurrency", status: "Today", live: true },
      { type: "File", title: "p2-starter.tar.gz", status: "GZ · 212 KB" },
      { type: "Assignment", title: "Project 2: Multithreaded Web Server", status: "Overdue" },
      { type: "ExternalUrl", title: "OSTEP chapter 26: Concurrency", status: "pages.cs.wisc.edu" },
    ],
  },
  {
    label: "Week 5", range: "Aug 24 to 28", topic: "CPU Scheduling", viewed: 0,
    items: [
      { type: "Page", title: "Lecture notes: CPU scheduling policies" },
      { type: "File", title: "scheduler-handout.pdf", status: "PDF · 1.4 MB" },
      { type: "Assignment", title: "Project 3: xv6 Scheduler", status: "Mon" },
    ],
  },
];

const TABS = ["Overview", "Modules", "Files", "Announcements", "Syllabus", "Grades"];
const META = ["Fall 2026", "Priya Raman", "MWF 10:00-10:50 AM", "CS 1240"];

export function CoursesPane({ active }: { active: boolean }) {
  // Step 0 fills the meters; step 1 submits the quiz.
  const step = useSequence(active, [500, 1900]);
  const filled = step >= 0;
  const submitted = step >= 1;

  return (
    <div className="flex h-full flex-col" style={c("indigo")}>
      <div className="border-b border-line bg-surface">
        <div {...enter(0)}>
          {/* Phones: the code is the title, the long name one quiet line under it. */}
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-[10px] px-4 pt-4 pb-3 lg:hidden">
            <span className="mt-[2px] -ml-1 shrink-0 text-ink-3">
              <ChevronLeft className="size-5" />
            </span>
            <div className="flex min-w-0 items-center gap-2 text-[20px] leading-6 font-semibold tracking-[-0.02em]">
              <span className="size-2 shrink-0 rounded-full bg-c" />
              <span className="truncate">CS 537</span>
            </div>
            <div className="mt-[3px] ml-auto flex shrink-0 items-center gap-[14px] text-ink-3">
              <Search className="size-[18px]" />
              <ExternalLink className="size-[18px]" />
            </div>
            <p className="col-start-2 col-end-4 mt-[2px] truncate text-[13px] leading-[18px] text-ink-3">
              Operating Systems · Fall 2026
            </p>
          </div>

          <div className="hidden h-16 items-center gap-5 px-6 lg:flex">
            <div className="flex h-[42px] min-w-0 flex-1 flex-col">
              <div className="page-title h-6 truncate leading-6">Operating Systems</div>
              <div className="mt-[2px] h-4 min-w-0 truncate text-[12.5px] leading-4 text-ink-3">
                <span>
                  <CourseTag>CS 537</CourseTag>
                </span>
                {META.map((part) => (
                  <span key={part}>
                    <span className="mx-[7px]">·</span>
                    {part}
                  </span>
                ))}
              </div>
            </div>
            <div className="inline-flex h-8 shrink-0 items-center gap-[7px] rounded-lg border border-line px-3 text-[12.5px] font-medium text-ink-2">
              Open in Canvas
              <ArrowUpRight className="size-[14px] text-ink-3" />
            </div>
          </div>
        </div>

        <div {...enter(1)} className={cn(enter(1).className, "relative")}>
          <div className="flex gap-4 overflow-hidden px-4 lg:gap-6 lg:px-6">
            {TABS.map((tab) => (
              <span
                key={tab}
                className={cn(
                  "-mb-px flex shrink-0 items-center gap-[6px] border-b-2 pt-2 pb-[10px] text-[13px] font-medium",
                  tab === "Modules" ? "border-ink text-ink" : "border-transparent text-ink-3",
                )}
              >
                {tab}
                {tab === "Files" && (
                  <span className="tabular rounded-full bg-chip px-[6px] py-px text-[10.5px] font-semibold text-ink-3">
                    2<span className="hidden lg:inline"> new</span>
                  </span>
                )}
              </span>
            ))}
          </div>
          {/* Phones: the row scrolls on; the last tab fades into the edge. */}
          <span className="absolute top-0 right-0 bottom-[2px] w-6 bg-linear-to-l from-surface from-15% to-transparent lg:hidden" />
        </div>
      </div>

      <div className="min-h-0 w-full flex-1 overflow-hidden pt-[6px] lg:pt-[10px]">
        {WEEKS.map((week, w) => {
          const base = 2 + WEEKS.slice(0, w).reduce((n, prior) => n + prior.items.length + 1, 0);
          const viewed = week.viewed + (submitted && week.items.some((item) => item.live) ? 1 : 0);
          const total = week.items.length;
          return (
            <section
              key={week.label}
              {...enter(base)}
              className={cn(
                enter(base).className,
                "relative grid grid-cols-1 after:absolute after:right-4 after:bottom-0 after:left-4 after:h-px after:bg-line lg:grid-cols-[132px_minmax(0,1fr)] lg:px-6 lg:after:right-6 lg:after:left-6",
                week.current && "bg-sunken",
              )}
            >
              <div className="px-4 pt-[14px] pb-1 text-[12.5px] text-ink-3 lg:px-0 lg:py-[14px] lg:pr-4">
                <b className="inline-flex items-center gap-[6px] text-[13.5px] font-semibold tracking-[-0.01em] text-ink lg:flex">
                  {week.current && <span className="size-[6px] rounded-full bg-c" />}
                  {week.label}
                </b>
                {week.current && (
                  <span className="text-ink-2 lg:block">
                    <span className="lg:hidden"> · </span>
                    This week
                  </span>
                )}
                <span className="lg:block">
                  <span className="lg:hidden"> · </span>
                  {week.range}
                </span>
                <span className="tabular lg:mt-[6px] lg:block">
                  <span className="lg:hidden"> · </span>
                  <span className="mb-[5px] hidden h-1 w-[88px] overflow-hidden rounded-full bg-line-2 lg:block dark:bg-line">
                    <span
                      className="block h-full origin-left rounded-full bg-ink-3 transition-transform duration-700 ease-(--lp-ease)"
                      style={{ transform: `scaleX(${filled ? viewed / total : 0})` }}
                    />
                  </span>
                  {viewed === total ? "Done" : `${viewed} of ${total} viewed`}
                </span>
              </div>

              <div className="py-[6px] lg:border-l lg:border-line">
                <div className="px-4 pt-2 pb-[2px] text-[12.5px] font-medium text-ink-2 lg:pl-[30px]">{week.topic}</div>
                {week.items.map((item, i) => (
                  <Row key={item.title} item={item} status={item.live && submitted ? "Submitted" : item.status} i={base + 1 + i} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** ModuleRow in the timeline's dense gutter: type icon, title, status. */
function Row({ item, status, i }: { item: Item; status?: string; i: number }) {
  const Icon = ICON[item.type];
  return (
    <div
      {...enter(i)}
      className={cn(
        enter(i).className,
        "relative flex min-h-11 items-center gap-[10px] py-[10px] pr-4 pl-[30px] text-[14px] leading-[1.4] tracking-[-0.006em] text-ink",
      )}
    >
      <Icon className="size-[15px] shrink-0 text-ink-3" />
      <span className="line-clamp-2 min-w-0 lg:truncate">{item.title}</span>
      {item.type === "ExternalUrl" && <ArrowUpRight className="-ml-[4px] size-3 shrink-0 text-ink-3" />}
      {status !== undefined && (
        <span className="ml-auto flex shrink-0 items-center gap-2 pl-3">
          <span className="tabular text-[12.5px] whitespace-nowrap text-ink-3">
            {status === "Overdue" ? (
              <span className="flex items-center gap-[5px] text-ink-2">
                <Clock className="size-3 text-red" />
                Overdue
              </span>
            ) : status === "Submitted" ? (
              // Only the live row pops: it is the one whose pill was not there a moment ago.
              <Pill className={cn("h-[20px] text-[12px]", item.live && "animate-[lp-pop_.45s_var(--lp-ease)_both]")}>
                <Check />
                Submitted
              </Pill>
            ) : (
              status
            )}
          </span>
        </span>
      )}
    </div>
  );
}
