// The calendar's top bar and footer hint line (docs/calendar.html, section A
// on desktop, the phone's `.m-head` below `md`). One bar for all three views:
// the month title, week navigation, the Day/Week/Month control, Subscribe and
// the Event button — with the phone keeping the title, a new-event button and
// the shared search/account slot, and the view control on a row beneath.

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, GraduationCap, Plus, Share } from "lucide-react";
import { Kbd } from "@/components/app/bits";
import { HEADER_BUTTON, HeaderTitle, MobileHeaderSlot } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CalendarView = "day" | "week" | "month";

const VIEWS: { id: CalendarView; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

export function CalendarToolbar({
  view,
  title,
  compactTitle,
  detail,
  onView,
  onPrev,
  onNext,
  onToday,
  showClasses,
  onToggleClasses,
  onSubscribe,
  onNewEvent,
}: {
  view: CalendarView;
  title: string;
  /** The phone's title — the mock shows "September 2026" on every view. */
  compactTitle?: string;
  /** The subtitle line under the title, e.g. "Week 2". */
  detail?: string;
  onView: (view: CalendarView) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  showClasses?: boolean;
  onToggleClasses?: () => void;
  onSubscribe: () => void;
  onNewEvent: () => void;
}) {
  const switcher = (
    <div className="flex h-8 min-w-0 flex-1 items-center gap-px rounded-lg bg-chip p-[3px] md:ml-auto md:flex-none">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          aria-pressed={view === v.id}
          onClick={() => onView(v.id)}
          className={cn(
            "h-[26px] flex-1 rounded-md px-3 text-[12.5px] font-medium text-ink-3 transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:outline-none",
            view === v.id && "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,.08)] dark:bg-hover",
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="shrink-0 border-b border-line md:border-b-0">
      {/* The page frame's 64px bar (rule included): the title block sits where every page's does. */}
      <div className="flex flex-wrap items-center gap-x-2 px-4 md:h-16 md:flex-nowrap md:border-b md:border-line md:px-6">
        <HeaderTitle
          className="mr-1 my-[11px] flex-1 md:my-0 md:mr-3 md:flex-none"
          title={
            <>
              <span className="md:hidden">{compactTitle ?? title}</span>
              <span className="hidden md:inline">{title}</span>
            </>
          }
          subtitle={detail}
        />

        <div className="hidden h-8 items-center overflow-hidden rounded-lg border border-line md:flex">
          <NavButton label="Previous" onClick={onPrev}>
            <ChevronLeft className="size-[15px]" />
          </NavButton>
          <NavButton label="Today" onClick={onToday} className="border-x border-line px-3">
            Today
          </NavButton>
          <NavButton label="Next" onClick={onNext}>
            <ChevronRight className="size-[15px]" />
          </NavButton>
        </div>

        {/* Phones wrap the view control onto its own row under the 64px
            bar, like tabs; from md up the wrapper dissolves into the bar. */}
        <div className="order-last flex basis-full items-center gap-2 pb-[10px] md:contents">
          {switcher}
          {onToggleClasses !== undefined && (
            <button
              type="button"
              onClick={onToggleClasses}
              aria-pressed={showClasses === true}
              aria-label="Show classes"
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-hover md:hidden",
                showClasses === true && "bg-chip text-ink",
              )}
            >
              <GraduationCap className="size-[16px]" />
            </button>
          )}
        </div>

        {onToggleClasses !== undefined && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleClasses}
            aria-pressed={showClasses === true}
            className={cn(
              "hidden h-8 rounded-lg px-[10px] text-[12.5px] font-medium text-ink-3 hover:text-ink md:inline-flex",
              showClasses === true && "bg-chip text-ink",
            )}
          >
            <GraduationCap className="size-[15px]" />
            Show classes
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onSubscribe}
          aria-label="Subscribe in another calendar"
          className="hidden h-8 rounded-lg px-[10px] text-[12.5px] font-medium text-ink-3 hover:text-ink md:inline-flex"
        >
          <Share className="size-[14px]" />
          Subscribe
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onNewEvent}
          className="hidden h-8 rounded-lg border-line-2 px-3 text-[12.5px] font-medium md:inline-flex"
        >
          <Plus className="size-[14px]" />
          Event
        </Button>

        <button
          type="button"
          onClick={onNewEvent}
          aria-label="New event"
          className={cn(HEADER_BUTTON, "md:hidden")}
        >
          <Plus className="size-[16px]" />
        </button>
        <MobileHeaderSlot />
      </div>

    </div>
  );
}

function NavButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-full min-w-8 items-center justify-center px-2 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink focus-visible:bg-hover focus-visible:outline-none",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** "← → week · T today · D W M view · N new event · Times in …". */
export function HintBar({ unit, zone }: { unit: string; zone: string }) {
  return (
    <div className="mt-auto hidden h-10 shrink-0 items-center gap-5 border-t border-line px-6 text-[12px] text-ink-3 md:flex">
      <Hint keys={["←", "→"]}>{unit}</Hint>
      <Hint keys={["T"]}>today</Hint>
      <Hint keys={["D", "W", "M"]}>view</Hint>
      <Hint keys={["N"]}>new event</Hint>
      <span className="ml-auto">Times in {zone}</span>
    </div>
  );
}

function Hint({ keys, children }: { keys: string[]; children: ReactNode }) {
  return (
    <span className="flex items-center gap-[6px]">
      <span className="flex gap-[3px]">
        {keys.map((key) => (
          <Kbd key={key} className="grid h-[18px] min-w-[18px] place-items-center px-1 py-0 text-[10.5px]">
            {key}
          </Kbd>
        ))}
      </span>
      {children}
    </span>
  );
}
