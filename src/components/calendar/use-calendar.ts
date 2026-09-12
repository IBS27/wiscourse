import { useTodoList } from "@/lib/list-queries";
// One place where the calendar's three subscriptions live: todos (due times
// and plans), calendar events, and class meetings. Every view asks for a set
// of day keys and gets back the per-day model; the query range is memoised
// from those days so panning a week is one new subscription, not four.

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { expandMeetings, type Meeting } from "../../../convex/lib/meetings";
import { zonedToUtc } from "../../../convex/lib/zones";
import { addDays } from "@/lib/dates";
import { buildDayModels, eventCourseId, type CalendarEvent, type DayModel } from "@/lib/calendar";
import { useCourses } from "@/lib/hooks";
import { useDisplayTimeZone } from "@/lib/time-zone";

export interface CalendarData {
  models: Map<string, DayModel>;
  /** True until the first result of every query has landed. */
  loading: boolean;
  /** The raw meeting rows, for "you have not entered any class times yet". */
  meetings: Meeting[];
}

export function useCalendarData({ days }: { days: string[] }): CalendarData {
  const zone = useDisplayTimeZone();
  const { byId, filterable, label } = useCourses();
  const first = days[0];
  const last = days[days.length - 1];

  // Midnight to midnight on the display clock: changing the zone moves the
  // window, so the zone is part of the range's identity.
  const range = useMemo(
    () => ({ start: zonedToUtc(first, 0, zone), end: zonedToUtc(addDays(last, 1), 0, zone) }),
    [first, last, zone],
  );

  const todoRange = useMemo(() => ({ from: range.start, to: range.end }), [range]);
  const todos = useTodoList(todoRange);
  const eventRows = useQuery(api.calendar.range, range);
  const meetings = useQuery(api.meetings.list);

  // Hidden courses and courses from another term never reach the grid.
  const shown = useMemo(() => new Set(filterable.map((c) => c.canvasId)), [filterable]);

  const occurrences = useMemo(() => {
    if (meetings === undefined) return [];
    return expandMeetings(
      meetings.filter((m) => shown.has(m.courseCanvasId)),
      range.start,
      range.end,
      (id) => {
        const course = byId.get(id);
        if (course === undefined) return undefined;
        return {
          startAt: course.termStartAt ?? course.startAt,
          endAt: course.termEndAt ?? course.endAt,
        };
      },
    );
  }, [meetings, shown, range, byId]);

  const events = useMemo<CalendarEvent[]>(() => {
    if (eventRows === undefined) return [];
    return eventRows.filter((row) => {
      const course = eventCourseId(row);
      return course === undefined || shown.has(course);
    });
  }, [eventRows, shown]);

  const models = useMemo(
    () =>
      buildDayModels({
        days,
        todos: todos ?? [],
        events,
        meetings: occurrences,
        zone,
        courseLabel: label,
      }),
    // `label` is rebuilt whenever the course list changes, which is exactly
    // when the labels on the grid should change.
    [days, todos, events, occurrences, zone, label],
  );

  return {
    models,
    loading: todos === undefined || eventRows === undefined || meetings === undefined,
    meetings: meetings ?? [],
  };
}
