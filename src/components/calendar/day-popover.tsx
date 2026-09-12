// The month's day popover: it opens beside the cell instead of navigating,
// so the month can be walked with the arrow keys and each day read in full.
// Non-modal — the month stays live behind it — so it manages focus itself:
// in on open, back to the cell on close.

import { useEffect, useRef, useState, type RefObject } from "react";
import { useMutation } from "convex/react";
import { Plus, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { DayModel, CalendarEvent, TimeBlock } from "@/lib/calendar";
import { AllDayRow, BlockRow, DueRow, PlannedRow } from "./day-rows";
import { formatDayLong } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function DayPopover({
  model,
  todayKey,
  now,
  zone,
  onClose,
  onOpenBlock,
  onOpenEvent,
  popoverRef,
  onRestoreFocus,
}: {
  model: DayModel;
  todayKey: string;
  now: number;
  zone: string;
  onClose: () => void;
  onOpenBlock: (block: TimeBlock) => void;
  onOpenEvent: (event: CalendarEvent) => void;
  popoverRef: RefObject<HTMLDivElement | null>;
  /** Puts focus back on the given day's cell when the popover goes away. */
  onRestoreFocus: (day: string) => void;
}) {
  const { day, due, planned, allDay, blocks } = model;
  const meetings = blocks.filter((b) => b.kind === "meeting");
  const events = blocks.filter((b) => b.kind === "event");
  const headingRef = useRef<HTMLDivElement>(null);
  // The popover follows the arrow keys without remounting, so the day to
  // hand focus back to is whichever one was last shown.
  const dayRef = useRef(day);
  useEffect(() => {
    dayRef.current = day;
  }, [day]);

  useEffect(() => {
    headingRef.current?.focus();
    return () => onRestoreFocus(dayRef.current);
  }, [onRestoreFocus]);

  const summary = [
    day === todayKey ? "Today" : undefined,
    count(meetings.length, "class", "classes"),
    count(events.length + allDay.length, "event", "events"),
    count(due.length, "due", "due"),
    count(planned.length, "planned", "planned"),
  ].filter((s) => s !== undefined);
  const empty =
    due.length === 0 && planned.length === 0 && allDay.length === 0 && blocks.length === 0;

  return (
    <aside
      ref={popoverRef}
      role="dialog"
      data-day-popover
      aria-label={formatDayLong(day)}
      className="absolute z-10 flex w-[324px] flex-col overflow-hidden rounded-[10px] border border-line bg-raised pb-[14px] shadow-float"
    >
      <div className="flex items-start gap-2 border-b border-line px-4 pt-[14px] pb-3">
        <div className="min-w-0 flex-1">
          <div
            ref={headingRef}
            tabIndex={-1}
            className="text-[15px] font-semibold tracking-[-0.015em] outline-none"
          >
            {formatDayLong(day)}
          </div>
          <div className="mt-[2px] text-xs text-ink-3">
            {summary.length > 0 ? summary.join(" · ") : "Nothing scheduled"}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close day"
          className="-mt-1 -mr-1 grid size-7 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"
        >
          <X className="size-[15px]" />
        </button>
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        {allDay.length > 0 && <Group label="All day" />}
        {allDay.map((event) => (
          <AllDayRow key={event._id} event={event} variant="popover" onOpen={onOpenEvent} />
        ))}

        {meetings.length > 0 && <Group label="Classes" />}
        {meetings.map((block) => (
          <BlockRow key={block.id} block={block} variant="popover" now={now} onOpen={onOpenBlock} />
        ))}

        {events.length > 0 && <Group label="Events" />}
        {events.map((block) => (
          <BlockRow key={block.id} block={block} variant="popover" now={now} onOpen={onOpenBlock} />
        ))}

        {due.length > 0 && <Group label="Due" />}
        {due.map((item) => (
          <DueRow key={item.key} item={item} variant="popover" zone={zone} now={now} />
        ))}

        {planned.length > 0 && <Group label="Planned" />}
        {planned.map((item) => (
          <PlannedRow key={item.key} item={item} variant="popover" todayKey={todayKey} />
        ))}

        {empty && <div className="px-4 pt-3 text-[12.5px] text-ink-3">Nothing on this day.</div>}
      </div>

      {/* Keyed by day so a new day gets a fresh field, with no effect. */}
      <PlanInput key={day} day={day} onClose={onClose} />
    </aside>
  );
}

function Group({ label }: { label: string }) {
  return <div className="eyebrow px-4 pt-3 pb-1 text-[10.5px]">{label}</div>;
}

function count(n: number, one: string, many: string): string | undefined {
  if (n === 0) return undefined;
  return `${n} ${n === 1 ? one : many}`;
}

/** "Plan something for Thursday…" — creates a local todo on that day. */
function PlanInput({ day, onClose }: { day: string; onClose: () => void }) {
  const createLocal = useMutation(api.todos.createLocal);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const submit = async () => {
    const title = value.trim();
    if (title === "" || busy) return;
    setBusy(true);
    try {
      await createLocal({ title, plannedDay: day });
      setValue("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <label
      className={cn(
        "mx-4 mt-3 flex h-8 items-center gap-[7px] rounded-lg border border-dashed border-line-2 px-[10px] text-[12.5px] text-ink-3 focus-within:border-solid focus-within:border-line-2",
        value !== "" && "border-solid text-ink",
      )}
    >
      <Plus className="size-[13px] shrink-0" />
      <input
        ref={ref}
        value={value}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") {
            if (value === "") onClose();
            else setValue("");
          }
        }}
        placeholder={`Plan something for ${weekdayLong(day)}…`}
        className="w-full bg-transparent text-ink outline-none placeholder:text-ink-3"
        aria-label={`Plan something for ${formatDayLong(day)}`}
      />
    </label>
  );
}

/** "Thursday" — the long weekday alone. */
function weekdayLong(day: string): string {
  return formatDayLong(day).split(",")[0];
}
