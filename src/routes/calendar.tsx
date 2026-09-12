// The calendar. Week is a time grid (docs/calendar.html direction A), Month
// is one line per item with a day popover (direction B), Day is the phone's
// default and the desktop's third view. The view and the anchor day live in
// the URL so a link opens exactly what you were looking at.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CalendarToolbar, HintBar, type CalendarView } from "@/components/calendar/toolbar";
import { WeekGrid } from "@/components/calendar/week-grid";
import { MonthGrid } from "@/components/calendar/month-grid";
import { DayView } from "@/components/calendar/day-view";
import { EventDialog } from "@/components/calendar/event-dialog";
import { MeetingsEditor } from "@/components/calendar/meetings-editor";
import { SubscribeDialog } from "@/components/calendar/subscribe";
import { useCalendarData } from "@/components/calendar/use-calendar";
import {
  monthDays,
  shiftMonth,
  mondayWeekDays,
  type CalendarEvent,
  type TimeBlock,
} from "@/lib/calendar";
import {
  addDays,
  dayDiff,
  dayKeyOf,
  formatDayMedium,
  formatMonthYear,
  startOfMondayWeek,
} from "@/lib/dates";
import { useCourses, useIsMobile, useNow, useToday } from "@/lib/hooks";
import { useSyncInfo } from "@/lib/sync-info";
import { useDisplayTimeZone } from "@/lib/time-zone";
import { cn, isTyping } from "@/lib/utils";

export interface CalendarSearch {
  view?: CalendarView;
  /** Anchor day, "YYYY-MM-DD"; the week or month containing it is shown. */
  date?: string;
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
/** Something modal is on screen; the calendar's bare keys stand down. */
const OVERLAY = '[role="dialog"]:not([data-day-popover]), [aria-modal="true"]:not([data-day-popover])';
const SHOW_CLASSES_KEY = "wiscourse.calendar.showClasses";

export const Route = createFileRoute("/calendar")({
  validateSearch: (search: Record<string, unknown>): CalendarSearch => ({
    view:
      search.view === "day" || search.view === "week" || search.view === "month"
        ? search.view
        : undefined,
    date: typeof search.date === "string" && DAY_KEY.test(search.date) ? search.date : undefined,
  }),
  component: Calendar,
});

function Calendar() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const today = useToday();
  const now = useNow();
  const zone = useDisplayTimeZone();
  const mobile = useIsMobile();
  const info = useSyncInfo();
  const { visible } = useCourses();

  const view: CalendarView = search.view ?? (mobile ? "day" : "week");
  const anchor = search.date ?? today;

  const [showClasses, setShowClasses] = useState(
    () => localStorage.getItem(SHOW_CLASSES_KEY) === "1",
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | "new" | null>(null);
  const [meetingsFor, setMeetingsFor] = useState<number | "any" | null>(null);
  const [subscribing, setSubscribing] = useState(false);

  const days = useMemo(
    () => (view === "month" ? monthDays(anchor) : mondayWeekDays(anchor)),
    [view, anchor],
  );
  const { models, meetings, loading } = useCalendarData({ days });

  const go = useCallback(
    (next: { view?: CalendarView; date?: string }) => {
      void navigate({
        search: (old: CalendarSearch) => ({ ...old, ...next }),
        replace: true,
      });
    },
    [navigate],
  );

  const shift = useCallback(
    (delta: number) => {
      if (view === "month") {
        go({ date: shiftMonth(anchor, delta) });
        setSelected(null);
      } else if (view === "week") {
        go({ date: addDays(anchor, delta * 7) });
      } else {
        go({ date: addDays(anchor, delta) });
      }
    },
    [anchor, go, view],
  );

  const setView = useCallback(
    (next: CalendarView) => {
      setSelected(null);
      go({ view: next, date: anchor });
    },
    [anchor, go],
  );

  const toggleClasses = () => {
    setShowClasses((on) => {
      localStorage.setItem(SHOW_CLASSES_KEY, on ? "0" : "1");
      return !on;
    });
  };

  // Stable: the month's outside-click listener depends on this identity.
  const selectDay = useCallback(
    (day: string | null) => {
      if (day !== null && mobile) go({ view: "day", date: day });
      else setSelected(day);
    },
    [go, mobile],
  );

  const openBlock = useCallback((block: TimeBlock) => {
    if (block.kind === "meeting") setMeetingsFor(block.courseCanvasId ?? "any");
    else if (block.event !== undefined) setEditingEvent(block.event);
  }, []);

  const modalOpen = editingEvent !== null || meetingsFor !== null || subscribing;

  // Bare-key shortcuts. Registered in the capture phase so the calendar's
  // "N" wins over the global quick-add on this page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.repeat) return;
      if (isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      const handled = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      // A dialog owns the keyboard, except that "n" must not fall through
      // to the global quick-add and stack a second dialog on top.
      if (modalOpen) {
        if (key === "n") handled();
        return;
      }
      // Anything else modal — the command palette, quick-add — owns it too.
      // The day popover is deliberately not modal: it is walked with these
      // very keys.
      if (document.querySelector(OVERLAY) !== null) return;
      switch (key) {
        case "arrowleft":
        case "arrowright": {
          const delta = key === "arrowleft" ? -1 : 1;
          handled();
          if (view === "month" && selected !== null) moveSelection(delta);
          else shift(delta);
          return;
        }
        case "arrowup":
        case "arrowdown": {
          if (view !== "month" || selected === null) return;
          handled();
          moveSelection(key === "arrowup" ? -7 : 7);
          return;
        }
        case "t":
          handled();
          go({ date: today });
          setSelected(null);
          return;
        case "d":
        case "w":
        case "m":
          handled();
          setView(key === "d" ? "day" : key === "w" ? "week" : "month");
          return;
        case "n":
          handled();
          setEditingEvent("new");
          return;
        case "escape":
          if (selected !== null) {
            handled();
            setSelected(null);
          }
          return;
      }
    };

    const moveSelection = (delta: number) => {
      if (selected === null) return;
      const next = addDays(selected, delta);
      setSelected(next);
      if (next.slice(0, 7) !== anchor.slice(0, 7)) go({ date: next });
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [anchor, go, modalOpen, selected, setView, shift, today, view]);

  // Only once the meetings query has answered; the nudge must not flash.
  const noMeetings = !loading && meetings.length === 0 && visible.length > 0;
  const title =
    view === "day"
      ? formatDayMedium(anchor)
      : formatMonthYear(view === "week" ? days[3] : anchor);
  // The phone header carries the month, whichever view is showing — with
  // the year only when it is not this one, which is the only way the full
  // title fits beside the view control, the add button and the account menu.
  const monthOf = view === "week" ? days[3] : anchor;
  const compactTitle = formatMonthYear(monthOf).replace(
    ` ${today.slice(0, 4)}`,
    "",
  );
  const week = view === "week" ? teachingWeek(visible, days[0]) : undefined;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        // The Day view is bounded to the phone viewport (less the tab bar)
        // so its timeline scrolls under a fixed strip and Due band.
        view === "day" && "h-[calc(100dvh-72px)] md:h-auto md:flex-1",
      )}
    >
      <CalendarToolbar
        view={view}
        title={title}
        compactTitle={compactTitle}
        detail={week === undefined ? undefined : `· Week ${week}`}
        onView={setView}
        onPrev={() => shift(-1)}
        onNext={() => shift(1)}
        onToday={() => {
          go({ date: today });
          setSelected(null);
        }}
        showClasses={view === "month" ? showClasses : undefined}
        onToggleClasses={view === "month" ? toggleClasses : undefined}
        onSubscribe={() => setSubscribing(true)}
        onNewEvent={() => setEditingEvent("new")}
      />

      {info?.connected === false && <ConnectCard />}

      {view === "week" && (
        <WeekGrid
          days={days}
          models={models}
          todayKey={today}
          now={now}
          zone={zone}
          prompt={
            noMeetings ? <ClassTimesPrompt onOpen={() => setMeetingsFor("any")} /> : undefined
          }
          onOpenBlock={openBlock}
          onOpenEvent={setEditingEvent}
        />
      )}

      {view === "month" && (
        <MonthGrid
          days={days}
          models={models}
          monthKey={anchor}
          todayKey={today}
          now={now}
          zone={zone}
          compact={mobile}
          showClasses={showClasses}
          selected={selected}
          onSelect={selectDay}
          onOpenBlock={openBlock}
          onOpenEvent={setEditingEvent}
        />
      )}

      {view === "day" && (
        <DayView
          day={anchor}
          days={days}
          models={models}
          todayKey={today}
          now={now}
          zone={zone}
          onSelectDay={(day) => go({ date: day })}
          onShiftWeek={(delta) => go({ date: addDays(anchor, delta * 7) })}
          onShiftDay={(delta) => go({ date: addDays(anchor, delta) })}
          onOpenBlock={openBlock}
          onOpenEvent={setEditingEvent}
        />
      )}

      <HintBar unit={view === "month" ? "month" : view === "week" ? "week" : "day"} zone={zone} />

      <EventDialog
        open={editingEvent !== null}
        onOpenChange={(open) => !open && setEditingEvent(null)}
        event={editingEvent === "new" || editingEvent === null ? undefined : editingEvent}
        defaultDay={selected ?? anchor}
      />
      <MeetingsEditor
        open={meetingsFor !== null}
        onOpenChange={(open) => !open && setMeetingsFor(null)}
        courseCanvasId={typeof meetingsFor === "number" ? meetingsFor : undefined}
      />
      <SubscribeDialog open={subscribing} onOpenChange={setSubscribing} />
    </div>
  );
}

function ClassTimesPrompt({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-[9px] border-b border-line px-5 py-[9px] text-left text-[12.5px] text-ink-3 hover:text-ink"
    >
      <CalendarClock className="size-[14px]" />
      Add your class times so lectures show here
    </button>
  );
}

function ConnectCard() {
  return (
    <div className="mx-4 mt-4 flex items-center justify-between gap-4 rounded-[10px] border border-line bg-surface p-4">
      <div>
        <div className="text-[14px] font-semibold tracking-[-0.01em]">Connect Canvas</div>
        <div className="mt-[3px] text-[12.5px] text-ink-3">
          Link your Canvas account to see due dates and events here.
        </div>
      </div>
      <Button asChild size="sm">
        <Link to="/settings">Connect</Link>
      </Button>
    </div>
  );
}

/** "Week 2" of the term, from the earliest term start among the courses. */
function teachingWeek(
  courses: { termStartAt?: number; startAt?: number }[],
  mondayKey: string,
): number | undefined {
  let earliest: number | undefined;
  for (const course of courses) {
    const start = course.termStartAt ?? course.startAt;
    if (start === undefined) continue;
    if (earliest === undefined || start < earliest) earliest = start;
  }
  if (earliest === undefined) return undefined;
  const week = dayDiff(startOfMondayWeek(dayKeyOf(earliest)), mondayKey) / 7 + 1;
  return Number.isInteger(week) && week >= 1 && week <= 20 ? week : undefined;
}
