/**
 * Showcase pane: an Ask thread (src/routes/ask.$threadId.tsx and
 * src/components/ask). A static miniature of the chat column with its header
 * and composer and, from lg up, the chat list. Its one live moment: the
 * conversation plays out (question, lookup, cited answer, follow-up, an
 * applied change with Undo), pinned to the newest message as the real thread is.
 */

import type { ReactNode } from "react";
import {
  ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight, Eye, FileText, MessagesSquare, MoreHorizontal, SquarePen, Undo2,
} from "lucide-react";
import { CourseTag, Dot, Kbd } from "@/components/app/bits";
import { cn } from "@/lib/utils";
import { c, type CourseKey } from "../landing-data";
import { enter, useSequence } from "../landing-motion";

const THREADS: { label: string; threads: { c: CourseKey; title: string; when: string }[] }[] = [
  {
    label: "Today",
    threads: [
      { c: "indigo", title: "CS 537 midterm", when: "9:41" },
      { c: "none", title: "Plan this week", when: "8:15" },
    ],
  },
  {
    label: "This week",
    threads: [
      { c: "teal", title: "ECON late policy", when: "Wed" },
      { c: "none", title: "Monday reading", when: "Tue" },
      { c: "amber", title: "Eigenvalue hints", when: "Mon" },
    ],
  },
  {
    label: "Earlier",
    threads: [{ c: "sky", title: "Grading scale", when: "Aug 12" }],
  },
];
const OPEN = THREADS[0].threads[0];

/** The conversation's beats in order, and when each lands in ms from activation. */
const BEATS = {
  asked: 250, thinking: 700, reading: 1150, answer: 1700, overlap: 2050, sources: 2400,
  reply: 3100, working: 3450, done: 3950, change: 4400,
};
type Beat = keyof typeof BEATS;
const ORDER = Object.keys(BEATS) as Beat[];
const AT = Object.values(BEATS);

const RISE = "animate-[lp-fade-up_.45s_var(--lp-ease)_both]";
const SPINNER = "size-3 animate-spin rounded-full border-[1.5px] border-line-2 border-t-ink-2 motion-reduce:animate-none";

export function AskPane({ active }: { active: boolean }) {
  const step = useSequence(active, AT);
  const at = (beat: Beat) => step >= ORDER.indexOf(beat);
  const waiting = ORDER[step] === "thinking" || ORDER[step] === "working";

  return (
    <div className="flex h-full">
      <aside className="hidden w-[220px] shrink-0 flex-col border-r border-line lg:flex">
        <div className="flex h-16 shrink-0 items-center px-4">
          <span className="page-title">Chats</span>
        </div>
        <div className="shrink-0 px-[10px] pb-1">
          <div className="flex h-8 items-center gap-[9px] rounded-lg px-2 text-[13px] font-medium text-ink-2">
            <SquarePen className="size-[15px] text-ink-3" />
            <span className="flex-1">New chat</span>
            <Kbd>⌘J</Kbd>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden px-[10px] pb-3">
          {THREADS.map((group, g) => (
            <div key={group.label} {...enter(g)}>
              <div className="px-2 pt-4 pb-1 text-[12px] font-medium text-ink-3">{group.label}</div>
              {group.threads.map((thread) => (
                <div
                  key={thread.title}
                  className={cn(
                    "flex items-center gap-[9px] rounded-lg py-[7px] pr-8 pl-2 text-[13px] text-ink-2",
                    thread === OPEN && "bg-hover font-medium text-ink",
                  )}
                  style={c(thread.c)}
                >
                  <Dot />
                  <span className="min-w-0 flex-1 truncate">{thread.title}</span>
                  <span className="shrink-0 text-[11px] font-normal tabular text-ink-3">{thread.when}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-[10px] border-b border-line px-2 lg:pr-4 lg:pl-6">
          <span className="grid size-8 place-items-center rounded-lg text-ink-2 lg:hidden">
            <ChevronLeft className="size-[18px]" />
          </span>
          <div className="flex h-[42px] min-w-0 flex-1 flex-col">
            <div className="page-title h-6 truncate leading-6">{OPEN.title}</div>
            <div className="mt-[2px] h-4 min-w-0 truncate text-[12.5px] leading-4 text-ink-3" style={c(OPEN.c)}>
              <CourseTag>CS 537</CourseTag>
            </div>
          </div>
          <span className="grid size-7 place-items-center rounded-md text-ink-3">
            <MoreHorizontal className="size-[15px]" />
          </span>
          <span className="grid size-8 place-items-center rounded-lg text-ink-2 lg:hidden">
            <MessagesSquare className="size-[17px]" />
          </span>
        </header>

        {/* Reversed, with the spacer first: the thread grows down from the top
            and, once it overflows, stays pinned to its newest message. */}
        <div className="flex min-h-0 flex-1 flex-col-reverse overflow-hidden">
          <div className="flex-1" />
          <div className="mx-auto flex w-full max-w-[720px] shrink-0 flex-col gap-6 px-4 pt-8 pb-6 lg:px-6">
            {at("asked") && <UserMessage>When is the CS 537 midterm, and what does it cover?</UserMessage>}

            {at("reading") && (
              <div className="min-w-0">
                <div className="mb-2 flex items-center gap-[7px] text-[12px] text-ink-3">
                  {at("answer") ? (
                    <>
                      <Eye className="size-[13px]" />
                      Looked up 2 things
                      <ChevronRight className="size-3" />
                    </>
                  ) : (
                    <>
                      <span className={SPINNER} />
                      Reading the CS 537 syllabus
                    </>
                  )}
                </div>
                {at("answer") && (
                  <Prose className="mb-2">
                    <p className={RISE}>
                      The midterm is <strong>Thursday, October 15 at 7:15 PM</strong> in Van Vleck B102. It covers chapters
                      1 to 7, through CPU scheduling.
                    </p>
                    {at("overlap") && (
                      <p className={RISE}>Your P2 study group is at 7 PM that evening. Want me to move it?</p>
                    )}
                  </Prose>
                )}
                {at("sources") && (
                  <div className={cn(RISE, "mt-3 flex flex-wrap gap-[6px]")} style={c("indigo")}>
                    <span className="inline-flex h-7 max-w-[300px] items-center gap-[7px] rounded-lg border border-line bg-surface pr-[10px] pl-[9px] text-[12px] text-ink-2">
                      <FileText className="size-[13px] shrink-0 text-ink-3" />
                      <span className="truncate">Syllabus</span>
                      <CourseTag className="shrink-0 font-normal text-ink-3">CS 537</CourseTag>
                    </span>
                  </div>
                )}
              </div>
            )}

            {at("reply") && <UserMessage>Yes, move it to Wednesday the 14th, same time.</UserMessage>}

            {at("done") && (
              <div className="min-w-0">
                <Prose className={cn(RISE, "mb-2")}>
                  <p>
                    Done. Your study group is now on <strong>Wednesday, October 14 at 7 PM</strong>.
                  </p>
                </Prose>
                {at("change") && <ChangeCard />}
              </div>
            )}

            {waiting && (
              <div className={cn(RISE, "flex items-center gap-[7px] text-[12px] text-ink-3")}>
                <span className={SPINNER} />
                Thinking
              </div>
            )}
          </div>
        </div>

        <div className={cn(enter(3).className, "mx-auto w-full max-w-[720px] shrink-0 px-3 pb-[10px] lg:px-6")} style={enter(3).style}>
          <div className="rounded-[14px] border border-line-2 bg-surface shadow-[0_1px_2px_rgba(16,17,20,0.04),0_4px_16px_-6px_rgba(16,17,20,0.08)]">
            <div className="min-h-[48px] px-[14px] pt-3 pb-1 text-[16px] leading-[1.5] text-ink-3 lg:text-[14.5px]">
              Reply, or ask something new
            </div>
            <div className="flex items-center gap-[6px] pt-1 pr-2 pb-2 pl-[10px]">
              <span
                className="inline-flex h-7 max-w-[220px] items-center gap-[6px] rounded-lg px-[8px] text-[12.5px] font-medium text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]"
                style={c(OPEN.c)}
              >
                <Dot />
                <span className="truncate">CS 537</span>
                <ChevronDown className="size-3 shrink-0 text-ink-3" />
              </span>
              <span className="ml-auto grid size-8 place-items-center rounded-[10px] bg-chip text-ink-3">
                <ArrowUp className="size-[15px] stroke-[2.2]" />
              </span>
            </div>
          </div>
          <p className="pt-2 text-center text-[12px] text-ink-3">
            Reads your Canvas courses. Changes only your wiscourse tasks, plans and calendar.
          </p>
        </div>
      </div>
    </div>
  );
}

function UserMessage({ children }: { children: string }) {
  return (
    <div className={cn(RISE, "ml-auto w-fit max-w-[82%] rounded-[16px_16px_5px_16px] bg-chip px-[14px] py-[9px] text-[14px] leading-[1.55] text-ink")}>
      {children}
    </div>
  );
}

/** Assistant markdown, as components/ask/markdown.tsx sets it. */
function Prose({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("text-[14px] leading-[1.65] text-ink [&_p]:mb-3 [&_strong]:font-semibold [&>*:last-child]:mb-0", className)}>{children}</div>;
}

/** An applied change: the event it moved, where from and where to, with Undo. */
function ChangeCard() {
  return (
    <div className="my-2 animate-[lp-pop_.4s_var(--lp-ease)_both] overflow-hidden rounded-[10px] border border-line bg-surface">
      <div className="flex h-9 items-center gap-2 border-b border-line bg-sunken pr-[6px] pl-[11px] text-[12.5px] font-medium">
        <span className="grid size-4 place-items-center rounded-full bg-ink-2 text-surface">
          <Check className="size-[10px] stroke-[2.6]" />
        </span>
        <span className="min-w-0 flex-1 truncate">Moved study group to Wednesday</span>
        <span className="inline-flex h-[26px] items-center gap-[6px] rounded-md px-[6px] text-[12px] text-ink-3">
          <Undo2 className="size-[13px]" />
          Undo
        </span>
      </div>
      <div className="flex items-center gap-[10px] py-2 pr-[11px] pl-[10px]" style={c("indigo")}>
        <span className="grid size-[14px] shrink-0 place-items-center">
          <i className="block size-[7px] rounded-full shadow-[inset_0_0_0_1.5px_var(--c)]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium tracking-[-0.005em]">P2 study group</div>
          <div className="mt-px flex flex-wrap items-center gap-x-[6px] text-[12px] text-ink-3">
            {/* The course steps aside on phones so the old time keeps to one line. */}
            <span className="hidden items-center gap-[6px] lg:flex">
              <CourseTag>CS 537</CourseTag>
              <span className="opacity-55">·</span>
            </span>
            <span className="line-through decoration-line-2">Thu, Oct 15, 7:00 PM</span>
          </div>
        </div>
        <span className="shrink-0 text-right text-[12px] font-medium whitespace-nowrap text-ink tabular">Wed, Oct 14, 7:00 PM</span>
      </div>
    </div>
  );
}
