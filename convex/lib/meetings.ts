// Expands recurring class meetings into concrete occurrences. Meetings are
// wall-clock in the campus zone (a 9:55 lecture is 9:55 in Madison every
// week, DST or not), so each occurrence is converted independently.

import type { Doc } from "../_generated/dataModel";
import type { Infer } from "convex/values";
import type { meetingKind } from "../schema";
import { CAMPUS_TIME_ZONE, addDaysKey, dayKeyIn, weekdayOfKey, zonedToUtc } from "./zones";

export type MeetingKind = Infer<typeof meetingKind>;

export const MEETING_KIND_LABELS: Record<MeetingKind, string> = {
  lecture: "Lecture",
  discussion: "Discussion",
  lab: "Lab",
  seminar: "Seminar",
  office_hours: "Office hours",
  other: "Class",
};

export type Meeting = Pick<
  Doc<"courseMeetings">,
  "courseCanvasId" | "kind" | "label" | "days" | "startMinute" | "endMinute" | "location" | "startsOn" | "endsOn"
> & { _id: Doc<"courseMeetings">["_id"] };

export interface MeetingOccurrence {
  meetingId: Meeting["_id"];
  courseCanvasId: number;
  kind: MeetingKind;
  label?: string;
  location?: string;
  /** The campus-clock day the meeting falls on. */
  day: string;
  startAt: number;
  endAt: number;
}

/** Term window a meeting defaults to when it has no explicit bounds. */
export interface TermBounds {
  startAt?: number;
  endAt?: number;
}

/**
 * Occurrences of `meetings` that start inside [rangeStart, rangeEnd).
 * `termOf` supplies each course's dates: a meeting runs from its own
 * `startsOn` (else the term start, else forever) to `endsOn` (else the
 * term end, else forever).
 */
export function expandMeetings(
  meetings: Meeting[],
  rangeStart: number,
  rangeEnd: number,
  termOf: (courseCanvasId: number) => TermBounds | undefined,
  timeZone: string = CAMPUS_TIME_ZONE,
): MeetingOccurrence[] {
  const out: MeetingOccurrence[] = [];
  const firstDay = addDaysKey(dayKeyIn(rangeStart, timeZone), -1);
  const lastDay = addDaysKey(dayKeyIn(rangeEnd, timeZone), 1);

  for (const meeting of meetings) {
    if (meeting.days.length === 0 || meeting.endMinute <= meeting.startMinute) continue;
    const term = termOf(meeting.courseCanvasId);
    const from = meeting.startsOn ?? (term?.startAt === undefined ? undefined : dayKeyIn(term.startAt, timeZone));
    const to = meeting.endsOn ?? (term?.endAt === undefined ? undefined : dayKeyIn(term.endAt, timeZone));
    const days = new Set(meeting.days);

    for (let day = firstDay; day <= lastDay; day = addDaysKey(day, 1)) {
      if (from !== undefined && day < from) continue;
      if (to !== undefined && day > to) break;
      if (!days.has(weekdayOfKey(day))) continue;
      const startAt = zonedToUtc(day, meeting.startMinute, timeZone);
      if (startAt < rangeStart || startAt >= rangeEnd) continue;
      out.push({
        meetingId: meeting._id,
        courseCanvasId: meeting.courseCanvasId,
        kind: meeting.kind,
        label: meeting.label,
        location: meeting.location,
        day,
        startAt,
        endAt: zonedToUtc(day, meeting.endMinute, timeZone),
      });
    }
  }
  return out.sort((a, b) => a.startAt - b.startAt);
}
