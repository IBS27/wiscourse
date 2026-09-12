// The calendar's top bar and footer hint line (docs/calendar.html, section A
// on desktop, the phone's `.m-head` below `md`). One bar for all three views:
// the month title, week navigation, the Day/Week/Month control, Subscribe and
// the Event button — with the phone keeping only the title, the control, a
// single new-event affordance and the account menu.

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, GraduationCap, Plus, Share } from "lucide-react";
import { Kbd } from "@/components/app/bits";
import { ProfileMenu } from "@/components/app/profile-menu";
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
  /** The quiet half of the title, e.g. "· Week 2". */
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
  return (
    <div className="flex h-[52px] shrink-0 items-center gap-[6px] border-b border-line px-4 md:h-[54px] md:gap-[10px] md:pr-4 md:pl-5">
      <div className="mr-1 min-w-0 flex-1 truncate text-[17px] font-semibold tracking-[-0.02em] md:flex-none md:text-[15px] md:tracking-[-0.015em]">
        <span className="md:hidden">{compactTitle ?? title}</span>
        <span className="hidden md:inline">{title}</span>
        {detail !== undefined && (
          <span className="hidden font-medium text-ink-3 md:inline"> {detail}</span>
        )}
      </div>

      <div className="hidden items-center overflow-hidden rounded-lg border border-line bg-surface md:flex">
        <NavButton label="Previous" onClick={onPrev}>
          <ChevronLeft className="size-[13px]" />
        </NavButton>
        <NavButton label="Today" onClick={onToday} className="border-l border-line px-[9px]">
          Today
        </NavButton>
        <NavButton label="Next" onClick={onNext} className="border-l border-line">
          <ChevronRight className="size-[13px]" />
        </NavButton>
      </div>

      <div className="flex shrink-0 items-center gap-1 rounded-lg border border-line bg-sunken p-[2px] md:ml-auto">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={view === v.id}
            onClick={() => onView(v.id)}
            className={cn(
              "rounded-md px-[7px] py-[4px] text-[12px] font-medium text-ink-3 hover:text-ink md:px-[11px] md:text-[12.5px]",
              view === v.id &&
                "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,.06),inset_0_0_0_1px_var(--line)]",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      {onToggleClasses !== undefined && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleClasses}
            aria-pressed={showClasses === true}
            className={cn(
              "hidden h-[30px] rounded-lg px-[7px] text-[12.5px] font-medium text-ink-3 hover:text-ink md:inline-flex",
              showClasses === true && "text-ink",
            )}
          >
            Show classes
          </Button>
          <button
            type="button"
            onClick={onToggleClasses}
            aria-pressed={showClasses === true}
            aria-label="Show classes"
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-lg border border-line text-ink-3 md:hidden",
              showClasses === true && "border-transparent bg-chip text-ink",
            )}
          >
            <GraduationCap className="size-[15px]" />
          </button>
        </>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={onSubscribe}
        aria-label="Subscribe in another calendar"
        className="hidden h-[30px] rounded-lg px-[7px] text-[12.5px] font-medium text-ink-3 hover:text-ink md:inline-flex"
      >
        <Share className="size-[14px]" />
        Subscribe
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={onNewEvent}
        className="hidden h-[30px] rounded-lg border-line-2 px-[11px] text-[12.5px] font-medium md:inline-flex"
      >
        <Plus className="size-[14px]" />
        Event
      </Button>

      <button
        type="button"
        onClick={onNewEvent}
        aria-label="New event"
        className="grid size-7 shrink-0 place-items-center rounded-lg bg-today text-today-fg md:hidden"
      >
        <Plus className="size-[14px]" />
      </button>
      <span className="shrink-0 md:hidden">
        <ProfileMenu variant="avatar" />
      </span>
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
      onClick={onClick}
      className={cn(
        "flex h-7 min-w-7 items-center justify-center px-[9px] text-[12.5px] font-medium text-ink-2 hover:bg-hover hover:text-ink",
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
    <div className="mt-auto hidden shrink-0 gap-4 border-t border-line px-5 py-[10px] text-xs text-ink-3 md:flex">
      <span className="flex items-center gap-[6px]">
        <Kbd>←</Kbd>
        <Kbd>→</Kbd>
        {unit}
      </span>
      <span className="flex items-center gap-[6px]">
        <Kbd>T</Kbd>
        today
      </span>
      <span className="flex items-center gap-[6px]">
        <Kbd>D</Kbd>
        <Kbd>W</Kbd>
        <Kbd>M</Kbd>
        view
      </span>
      <span className="flex items-center gap-[6px]">
        <Kbd>N</Kbd>
        new event
      </span>
      <span className="ml-auto">Times in {zone}</span>
    </div>
  );
}
