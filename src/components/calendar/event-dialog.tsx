// New / edit / delete for the student's own events, and a read-only detail
// for the ones Canvas owns (sync is their only writer).

import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { Trash2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CanvasHtml } from "@/components/reader/canvas-html";
import {
  allDayKey,
  allDayStart,
  eventCourseId,
  minuteFromTimeInput,
  minuteOf,
  minuteRange,
  timeInputValue,
  type CalendarEvent,
} from "@/lib/calendar";
import { atMinute, dayKeyOf, formatDayLong, formatTime } from "@/lib/dates";
import { courseLabel, useCourses, useToday } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { useDisplayTimeZone } from "@/lib/time-zone";

const FIELD =
  "h-9 rounded-md border border-line bg-surface px-2 text-[13px] text-ink outline-none focus-visible:border-line-2";

export function EventDialog({
  open,
  onOpenChange,
  event,
  defaultDay,
  defaultMinute,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing an existing event; omitted when creating one. */
  event?: CalendarEvent;
  defaultDay?: string;
  defaultMinute?: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        {open &&
          (event !== undefined && event.source === "canvas" ? (
            <CanvasEventDetail event={event} onClose={() => onOpenChange(false)} />
          ) : (
            <EventForm
              event={event}
              defaultDay={defaultDay}
              defaultMinute={defaultMinute}
              onClose={() => onOpenChange(false)}
            />
          ))}
      </DialogContent>
    </Dialog>
  );
}

function EventForm({
  event,
  defaultDay,
  defaultMinute,
  onClose,
}: {
  event?: CalendarEvent;
  defaultDay?: string;
  defaultMinute?: number;
  onClose: () => void;
}) {
  const zone = useDisplayTimeZone();
  const today = useToday();
  const { filterable } = useCourses();
  const createEvent = useMutation(api.calendar.createEvent);
  const updateEvent = useMutation(api.calendar.updateEvent);
  const deleteEvent = useMutation(api.calendar.deleteEvent);

  const [title, setTitle] = useState(event?.title ?? "");
  const [day, setDay] = useState(() => {
    if (event === undefined) return defaultDay ?? today;
    // All-day events are keyed to the campus day, the way the feed keys them.
    return event.allDay === true ? allDayKey(event.startAt) : dayKeyOf(event.startAt);
  });
  const [allDay, setAllDay] = useState(event?.allDay === true);
  const [start, setStart] = useState(
    timeInputValue(event === undefined ? (defaultMinute ?? 12 * 60) : minuteOf(event.startAt, zone)),
  );
  const [end, setEnd] = useState(
    timeInputValue(
      event?.endAt !== undefined
        ? minuteOf(event.endAt, zone)
        : (event === undefined ? (defaultMinute ?? 12 * 60) : minuteOf(event.startAt, zone)) + 60,
    ),
  );
  const [location, setLocation] = useState(event?.location ?? "");
  const [course, setCourse] = useState(
    event?.courseCanvasId === undefined ? "" : String(event.courseCanvasId),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (title.trim() === "" || busy) return;
    setBusy(true);
    setError(null);
    const startMinute = minuteFromTimeInput(start);
    const endMinute = minuteFromTimeInput(end);
    const fields = {
      title: title.trim(),
      startAt: allDay ? allDayStart(day) : atMinute(day, startMinute),
      endAt: allDay ? undefined : atMinute(day, Math.max(endMinute, startMinute + 5)),
      allDay: allDay ? true : undefined,
      location: location.trim() === "" ? undefined : location.trim(),
      courseCanvasId: course === "" ? undefined : Number(course),
    };
    try {
      if (event === undefined) await createEvent(fields);
      else await updateEvent({ id: event._id as Id<"calendarEvents">, ...fields });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the event");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (event === undefined) return;
    setBusy(true);
    try {
      await deleteEvent({ id: event._id as Id<"calendarEvents"> });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="border-b border-line px-4 pt-4 pb-[14px]">
        <DialogTitle className="text-[14px] font-semibold tracking-[-0.01em]">
          {event === undefined ? "New event" : "Edit event"}
        </DialogTitle>
        <DialogDescription className="mt-[3px] text-[12.5px] text-ink-3">
          Your own event. It shows on the calendar and in the feed you subscribe to.
        </DialogDescription>
      </div>

      <div className="space-y-3 px-4 py-4">
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Study group — P3"
          aria-label="Event title"
        />

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            aria-label="Day"
            className={cn(FIELD, "w-[160px] tabular")}
          />
          {!allDay && (
            <>
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                aria-label="Start time"
                className={cn(FIELD, "w-[120px] tabular")}
              />
              <span className="text-ink-3">–</span>
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                aria-label="End time"
                className={cn(FIELD, "w-[120px] tabular")}
              />
            </>
          )}
          <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="size-[15px] accent-[var(--today-bg)]"
            />
            All day
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location"
            aria-label="Location"
            className="w-[220px]"
          />
          <select
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            aria-label="Course"
            className={cn(FIELD, "w-[200px]")}
          >
            <option value="">No course</option>
            {filterable.map((c) => (
              <option key={c.canvasId} value={String(c.canvasId)}>
                {courseLabel(c)}
              </option>
            ))}
          </select>
        </div>

        {error !== null && <p className="text-[12.5px] text-red">{error}</p>}
      </div>

      <div className="flex items-center gap-2 border-t border-line px-4 py-3">
        {event !== undefined && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void remove()}
            className="text-ink-3 hover:text-red"
          >
            <Trash2 className="size-[14px]" />
            Delete
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={busy || title.trim() === ""}>
            {event === undefined ? "Add event" : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function CanvasEventDetail({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const { label } = useCourses();
  const courseId = eventCourseId(event);
  const zone = useDisplayTimeZone();
  const when =
    event.allDay === true
      ? "All day"
      : event.endAt === undefined
        ? formatTime(event.startAt)
        : minuteRange(minuteOf(event.startAt, zone), minuteOf(event.endAt, zone));

  return (
    <div>
      <div className="border-b border-line px-4 pt-4 pb-[14px]">
        <DialogTitle className="text-[14px] font-semibold tracking-[-0.01em]">
          {event.title}
        </DialogTitle>
        <DialogDescription className="mt-[3px] text-[12.5px] text-ink-3">
          {[label(courseId), formatDayLong(dayOf(event)), when]
            .filter((part) => part !== undefined)
            .join(" · ")}
        </DialogDescription>
      </div>
      <div className="max-h-[50vh] overflow-y-auto px-4 py-4 text-[13px]">
        {event.location !== undefined && (
          <div className="mb-3 text-[12.5px] text-ink-2">{event.location}</div>
        )}
        {event.description === undefined ? (
          <p className="text-[12.5px] text-ink-3">No description.</p>
        ) : (
          <CanvasHtml html={event.description} courseId={courseId ?? 0} />
        )}
      </div>
      <div className="flex justify-between gap-2 border-t border-line px-4 py-3">
        <span className="self-center text-xs text-ink-3">From Canvas · read-only</span>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

/** The day an event belongs to: campus clock for all-day, display otherwise. */
function dayOf(event: CalendarEvent): string {
  return event.allDay === true ? allDayKey(event.startAt) : dayKeyOf(event.startAt);
}
