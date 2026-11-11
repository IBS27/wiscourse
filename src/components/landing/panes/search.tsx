/**
 * Showcase pane: the ⌘K palette (src/components/search) open over a dimmed
 * page. A static miniature of the unscoped palette: a floating dialog from lg
 * up, the full-screen sheet with two-line rows below. Its one live moment:
 * "sched" is typed, the results replace the empty-query actions once two
 * characters are in (as the real palette does), and the selection steps down
 * one row.
 */

import type { ComponentType } from "react";
import {
  ClipboardList, File, FileText, GraduationCap, Megaphone, Moon, Plus, RefreshCw, Search,
} from "lucide-react";
import { CourseTag, Kbd } from "@/components/app/bits";
import { cn } from "@/lib/utils";
import { c, COURSES, type CourseKey } from "../landing-data";
import { enter, useSequence, useTyped } from "../landing-motion";

const QUERY = "sched";
/** The real palette keeps its empty-query sections until the query has two characters. */
const MIN_QUERY = 2;

const FILTERS = ["All", "Assignments", "Pages", "Files", "Announcements", "Courses"];

type Row = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  /** The quiet details after the title. */
  details?: string[];
  kbd?: string;
  course?: { key: CourseKey; code: string };
};
type Section = { label: string; rows: Row[] };

const course = (key: CourseKey) => COURSES.find((x) => x.key === key);

/** What an empty query shows. */
const BROWSE: Section[] = [
  {
    label: "Actions",
    rows: [
      { icon: Plus, title: "New task" },
      { icon: RefreshCw, title: "Sync now", details: ["last 2 minutes ago"] },
      { icon: Moon, title: "Toggle theme" },
    ],
  },
  {
    label: "Go to",
    rows: COURSES.map((x, i) => ({ icon: GraduationCap, title: x.name, kbd: `⌥${i + 1}`, course: x })),
  },
];

/** Ranked as the real palette ranks them: a prefix match first, then word starts. */
const RESULTS: Section[] = [
  {
    label: "Assignments",
    rows: [{ icon: ClipboardList, title: "Project 3: xv6 Scheduler", details: ["Due Aug 24"], course: course("indigo") }],
  },
  {
    label: "Pages and files",
    rows: [
      { icon: File, title: "scheduler-handout.pdf", details: ["Week 5", "1.4 MB"], course: course("indigo") },
      { icon: FileText, title: "Lecture 9: CPU scheduling policies", course: course("indigo") },
      { icon: FileText, title: "Discussion section schedule", course: course("teal") },
    ],
  },
  {
    label: "Announcements",
    rows: [{ icon: Megaphone, title: "Lab schedule for the first two weeks", details: ["Thu"], course: course("sky") }],
  },
];
const RESULT_COUNT = RESULTS.reduce((n, section) => n + section.rows.length, 0);

export function SearchPane({ active }: { active: boolean }) {
  const typed = useTyped(QUERY, active, { delay: 1000, speed: 95 });
  // Once the query is in, ↓ moves the selection off the first result.
  const moved = useSequence(active && typed === QUERY.length, [750]) >= 0;

  const query = QUERY.slice(0, typed);
  const browsing = typed < MIN_QUERY;
  const sections = browsing
    ? BROWSE
    : [...RESULTS, { label: "Actions", rows: [{ icon: Plus, title: `New task “${query}”` }] }];
  const selected = sections.flatMap((section) => section.rows)[moved ? 1 : 0];

  return (
    <div className="h-full bg-sunken lg:px-14 lg:pt-7">
      <div
        className={cn(
          "flex h-full flex-col overflow-hidden bg-surface lg:h-auto lg:rounded-xl lg:border lg:border-line-2/70 lg:shadow-float dark:lg:border-line-2",
          active ? "animate-[lp-fade_.3s_ease-out_both] lg:animate-[lp-pop_.4s_var(--lp-ease)_both]" : "opacity-0",
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line pr-3 pl-4 lg:px-[18px]">
          <Search className="size-[17px] shrink-0 text-ink-3" />
          <div className="flex min-w-0 flex-1 items-center text-[16px] tracking-[-0.01em] whitespace-nowrap">
            {query}
            <span className="ml-px h-[19px] w-px shrink-0 animate-[lp-blink_1s_steps(2)_infinite] bg-ink" />
            {typed === 0 && <span className="truncate text-ink-3">Search assignments, pages, files…</span>}
          </div>
          <span className="flex h-8 shrink-0 items-center rounded-md px-2 text-[14px] font-medium text-ink-2 lg:hidden">Cancel</span>
          <Kbd className="hidden shrink-0 lg:inline">esc</Kbd>
        </div>

        {/* Phones always carry the filter row; the dialog drops it once results are showing. */}
        <div className={cn("flex shrink-0 gap-1 overflow-hidden border-b border-line px-3 py-2 whitespace-nowrap", !browsing && "lg:hidden")}>
          {FILTERS.map((label, i) => (
            <span
              key={label}
              className={cn(
                "flex h-7 shrink-0 items-center rounded-md px-[10px] text-[12.5px] font-medium",
                i === 0 ? "bg-chip text-ink shadow-[inset_0_0_0_1px_var(--line)]" : "text-ink-3",
              )}
            >
              {label}
            </span>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-2 pb-2">
          {sections.map((section, s) => (
            // Keyed by mode so the results remount, and play their entrance, when they replace the actions.
            <div key={`${browsing}:${section.label}`} {...(browsing ? undefined : enter(s))}>
              <div className="px-3 pt-[14px] pb-[6px] text-[12px] font-medium text-ink-3">{section.label}</div>
              {section.rows.map((row) => (
                <PaletteRow key={row.title} row={row} typed={typed} on={row === selected} />
              ))}
            </div>
          ))}
        </div>

        <div className="hidden h-10 shrink-0 items-center gap-4 border-t border-line bg-sunken px-[18px] text-[12px] text-ink-3 lg:flex">
          <Hint kbd="↑↓">move</Hint>
          <Hint kbd="↵">open</Hint>
          {browsing ? (
            <>
              <Hint kbd="⇥">filter</Hint>
              <span className="ml-auto">
                Type <span className="font-medium text-ink-2">#cs537</span> to search one course
              </span>
            </>
          ) : (
            <>
              <Hint kbd="⌘↵">open in Canvas</Hint>
              <span className="ml-auto tabular">{RESULT_COUNT} results</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PaletteRow({ row, typed, on }: { row: Row; typed: number; on: boolean }) {
  // Only results are matched against the query; actions read plain.
  const title = row.course === undefined ? row.title : <Highlight text={row.title} length={typed} />;
  const meta = row.details && (
    <span className="truncate">
      {row.details.map((detail, i) => (
        <span key={detail}>
          {i > 0 && <span className="px-[5px] opacity-60">·</span>}
          {detail}
        </span>
      ))}
    </span>
  );
  const code = row.course?.code;

  return (
    <div
      className={cn(
        "flex min-h-[52px] items-center gap-3 rounded-lg px-3 py-2 text-ink lg:h-10 lg:min-h-0 lg:py-0",
        on && "bg-hover",
      )}
      style={c(row.course?.key ?? "none")}
    >
      <span className={cn("grid w-4 shrink-0 place-items-center", on ? "text-ink-2" : "text-ink-3")}>
        <row.icon className="size-[15px]" />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-[3px] lg:hidden">
        <span className="truncate text-[15px] leading-tight">{title}</span>
        {(code !== undefined || meta) && (
          <span className="flex min-w-0 items-center text-[12.5px] text-ink-3">
            {code !== undefined && <CourseTag className="shrink-0">{code}</CourseTag>}
            {code !== undefined && meta && <span className="px-[6px] opacity-60">·</span>}
            {meta}
          </span>
        )}
      </span>

      <span className="hidden lg:contents">
        <span className="min-w-0 flex-1 truncate text-[14px]">{title}</span>
        {meta && <span className="flex max-w-[45%] shrink-0 text-[12px] tabular text-ink-3">{meta}</span>}
        {row.kbd !== undefined && <Kbd className="shrink-0">{row.kbd}</Kbd>}
        {code !== undefined && <CourseTag className="w-[92px] shrink-0 text-[12px]">{code}</CourseTag>}
      </span>
    </div>
  );
}

/** Emboldens the typed part of the query where the title matches it. */
function Highlight({ text, length }: { text: string; length: number }) {
  const at = text.toLowerCase().indexOf(QUERY);
  if (length === 0 || at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <b className="font-semibold text-ink">{text.slice(at, at + length)}</b>
      {text.slice(at + length)}
    </>
  );
}

function Hint({ kbd, children }: { kbd: string; children: string }) {
  return (
    <span className="flex items-center gap-[6px]">
      <Kbd className="min-w-[20px] text-center">{kbd}</Kbd>
      {children}
    </span>
  );
}
