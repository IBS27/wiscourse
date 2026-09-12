// The calendar's model, kept pure so tests/calendar.test.ts can exercise it.
//
// Three sources feed every view: todos (due times and planned days),
// calendarEvents (Canvas + local) and expanded class meetings. This module
// turns them into one `DayModel` per day, lays overlapping blocks out into
// lanes, and sizes the time grid. Nothing here touches React or the global
// display zone — the zone is always passed in, so a zone override moves the
// whole calendar and a test can pin it.

import type { TodoItem } from "../../convex/todos";
import { MEETING_KIND_LABELS, type MeetingOccurrence } from "../../convex/lib/meetings";
import { CAMPUS_TIME_ZONE, dayKeyIn, minuteOfDayIn, zonedToUtc } from "../../convex/lib/zones";
import { addDays, dayDiff, startOfMondayWeek } from "./dates";

/** One hour of grid, in pixels (docs/calendar.html: 48px per hour). */
export const PX_PER_HOUR = 48;
/** A block never renders shorter than this, however short the meeting. */
export const MIN_BLOCK_PX = 40;
/** The same floor in minutes — what a 40px block covers on the grid. */
const MIN_BLOCK_MINUTES = (MIN_BLOCK_PX / PX_PER_HOUR) * 60;
/** Breathing room above the first hour line so its label is not clipped. */
export const GRID_TOP_PAD = 10;
export const DEFAULT_GRID_START = 8 * 60;
export const DEFAULT_GRID_END = 18 * 60;

/** Shape of a `calendarEvents` row; structural so tests need no Convex ids. */
export interface CalendarEvent {
  _id: string;
  source: "canvas" | "local";
  title: string;
  startAt: number;
  endAt?: number;
  allDay?: boolean;
  location?: string;
  description?: string;
  contextCode?: string;
  courseCanvasId?: number;
}

export type BlockKind = "meeting" | "event";

/** Something that occupies time: a class meeting or a timed event. */
export interface TimeBlock {
  id: string;
  kind: BlockKind;
  day: string;
  /** Course label rendered in bold ahead of the title, when there is one. */
  code?: string;
  title: string;
  /** Second line — the location, when the block is tall enough. */
  subtitle?: string;
  startMinute: number;
  endMinute: number;
  startAt: number;
  endAt: number;
  courseCanvasId?: number;
  /** Local events read lighter with a dashed edge; Canvas ones are solid. */
  local: boolean;
  event?: CalendarEvent;
}

export interface LaidOutBlock extends TimeBlock {
  /** Column this block sits in among the blocks it overlaps. */
  lane: number;
  /** How many columns that cluster of overlapping blocks needs. */
  lanes: number;
}

export interface DayModel {
  day: string;
  /** Items with a due time today, done ones included (struck through). */
  due: TodoItem[];
  /** Open items planned for today that are not already in `due`. */
  planned: TodoItem[];
  /**
   * All-day events, plus the continuation days of anything multi-day: a
   * three-day conference is one block on the day it starts and a line in
   * the band after that, not a full-height block on every day.
   */
  allDay: CalendarEvent[];
  blocks: TimeBlock[];
}

export interface CalendarInput {
  days: string[];
  todos: TodoItem[];
  events: CalendarEvent[];
  meetings: MeetingOccurrence[];
  zone: string;
  courseLabel: (canvasId: number | undefined) => string | undefined;
}

/**
 * All-day events are pinned to the campus day rather than the display one,
 * so a student abroad sees "no classes" on the day Madison has it off — and
 * so the calendar and the ICS feed (which keys them the same way) agree.
 */
export function allDayKey(ms: number): string {
  return dayKeyIn(ms, CAMPUS_TIME_ZONE);
}

/** Midnight on the campus clock — where a new all-day event starts. */
export function allDayStart(day: string): number {
  return zonedToUtc(day, 0, CAMPUS_TIME_ZONE);
}

/** The course a Canvas event belongs to; local events carry it directly. */
export function eventCourseId(event: CalendarEvent): number | undefined {
  if (event.courseCanvasId !== undefined) return event.courseCanvasId;
  const code = event.contextCode;
  if (code === undefined || !code.startsWith("course_")) return undefined;
  const id = Number(code.slice("course_".length));
  return Number.isInteger(id) ? id : undefined;
}

/** An event with no end is a point in time; give it the smallest block. */
const DEFAULT_EVENT_MINUTES = 30;

export function eventBlock(
  event: CalendarEvent,
  zone: string,
  courseLabel: (canvasId: number | undefined) => string | undefined,
): TimeBlock {
  const day = dayKeyIn(event.startAt, zone);
  const startMinute = minuteOfDayIn(event.startAt, zone);
  const courseCanvasId = eventCourseId(event);
  const endAt = event.endAt ?? event.startAt + DEFAULT_EVENT_MINUTES * 60_000;
  // An event that runs past midnight is clipped to its starting day: the
  // grid has no second column to spill into.
  const endMinute = clipToDay(endAt, day, startMinute, zone);
  return {
    id: `event:${event._id}`,
    kind: "event",
    day,
    code: event.source === "canvas" ? courseLabel(courseCanvasId) : undefined,
    title: event.title,
    subtitle: event.location,
    startMinute,
    endMinute,
    startAt: event.startAt,
    endAt,
    courseCanvasId,
    local: event.source === "local",
    event,
  };
}

export function meetingBlock(
  occurrence: MeetingOccurrence,
  zone: string,
  courseLabel: (canvasId: number | undefined) => string | undefined,
): TimeBlock {
  const code = courseLabel(occurrence.courseCanvasId);
  const day = dayKeyIn(occurrence.startAt, zone);
  const startMinute = minuteOfDayIn(occurrence.startAt, zone);
  return {
    id: `meeting:${occurrence.meetingId}:${occurrence.day}`,
    kind: "meeting",
    day,
    code: occurrence.label === undefined ? code : undefined,
    title: occurrence.label ?? MEETING_KIND_LABELS[occurrence.kind],
    subtitle: occurrence.location,
    startMinute,
    // Meetings are campus wall-clock: seen from a far-enough zone one can
    // run past midnight, and the grid has no next column to spill into.
    endMinute: clipToDay(occurrence.endAt, day, startMinute, zone),
    startAt: occurrence.startAt,
    endAt: occurrence.endAt,
    courseCanvasId: occurrence.courseCanvasId,
    local: false,
  };
}

/** An end that leaves its day is pinned to midnight; a zero-length one grows. */
function clipToDay(endAt: number, day: string, startMinute: number, zone: string): number {
  if (dayKeyIn(endAt, zone) !== day) return 24 * 60;
  return Math.max(minuteOfDayIn(endAt, zone), startMinute + 1);
}

/**
 * Struck-through in every calendar surface: the student ticked it off, or
 * Canvas already has the submission. Narrower than `isSettled` in
 * src/lib/agenda.ts on purpose — an on-paper assignment with nothing to
 * submit is not "done" just because Canvas will never see a file for it.
 */
export function isDoneOrSubmitted(item: {
  doneAt?: number;
  submission: string;
}): boolean {
  return (
    item.doneAt !== undefined ||
    item.submission === "submitted" ||
    item.submission === "graded"
  );
}

/** "CS 537 Lecture" — what the block, the popover and the ICS feed call it. */
export function blockLabel(block: TimeBlock): string {
  return block.code === undefined ? block.title : `${block.code} ${block.title}`;
}

export function buildDayModels(input: CalendarInput): Map<string, DayModel> {
  const { days, zone, courseLabel } = input;
  const models = new Map<string, DayModel>(
    days.map((day) => [day, { day, due: [], planned: [], allDay: [], blocks: [] }]),
  );

  for (const item of input.todos) {
    const dueDay = item.dueAt === undefined ? undefined : dayKeyIn(item.dueAt, zone);
    if (dueDay !== undefined) models.get(dueDay)?.due.push(item);
    if (item.plannedDay === undefined || item.doneAt !== undefined) continue;
    // A task due today and planned today is one line, not two.
    if (item.plannedDay === dueDay) continue;
    models.get(item.plannedDay)?.planned.push(item);
  }

  const windowStart = days[0];
  const windowEnd = days[days.length - 1];
  for (const event of input.events) {
    const allDay = event.allDay === true;
    const dayOf = (ms: number) => (allDay ? allDayKey(ms) : dayKeyIn(ms, zone));
    const first = dayOf(event.startAt);
    // The end is exclusive: an event that stops at midnight belongs to the
    // day before, not to the empty first minute of the next one.
    const end = event.endAt ?? event.startAt;
    const last = dayOf(end > event.startAt ? end - 1 : event.startAt);

    if (!allDay) {
      // The starting day keeps its block; eventBlock clips it to midnight.
      models.get(first)?.blocks.push(eventBlock(event, zone, courseLabel));
    }
    // Every further day it runs through gets a band line. Clamped to the
    // window so an event that spans a term costs a handful of iterations.
    let day = allDay ? first : addDays(first, 1);
    if (day < windowStart) day = windowStart;
    const stop = last > windowEnd ? windowEnd : last;
    for (; day <= stop; day = addDays(day, 1)) {
      models.get(day)?.allDay.push(event);
    }
  }

  for (const occurrence of input.meetings) {
    const block = meetingBlock(occurrence, zone, courseLabel);
    models.get(block.day)?.blocks.push(block);
  }

  for (const model of models.values()) {
    model.due.sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0) || a.title.localeCompare(b.title));
    model.planned.sort((a, b) => a.title.localeCompare(b.title));
    model.allDay.sort((a, b) => a.title.localeCompare(b.title));
    model.blocks.sort(byStartThenLongest);
  }
  return models;
}

function byStartThenLongest(a: TimeBlock, b: TimeBlock): number {
  return (
    a.startMinute - b.startMinute ||
    b.endMinute - b.startMinute - (a.endMinute - a.startMinute) ||
    a.title.localeCompare(b.title)
  );
}

/**
 * Splits blocks into clusters of mutual overlap and packs each cluster into
 * as few lanes as it needs; every block in a cluster reports the same lane
 * count, so the cluster divides the column evenly.
 */
export function layoutBlocks(blocks: TimeBlock[]): LaidOutBlock[] {
  const sorted = [...blocks].sort(byStartThenLongest);
  // Lanes are assigned on the drawn extent, not the raw duration: two
  // 15-minute items 15 minutes apart do not overlap in time but their
  // 40px minimum heights do.
  const extent = (b: TimeBlock) =>
    b.startMinute + Math.max(b.endMinute - b.startMinute, MIN_BLOCK_MINUTES);
  const out: LaidOutBlock[] = [];
  let cluster: LaidOutBlock[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    for (const block of cluster) block.lanes = laneEnds.length;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
    clusterEnd = -Infinity;
  };

  for (const block of sorted) {
    if (block.startMinute >= clusterEnd) flush();
    let lane = freeLane(laneEnds, block.startMinute);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(extent(block));
    } else {
      laneEnds[lane] = extent(block);
    }
    cluster.push({ ...block, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, extent(block));
  }
  flush();
  return out;
}

/** First lane free at `minute`, or -1 when a new lane is needed. */
function freeLane(laneEnds: number[], minute: number): number {
  for (let i = 0; i < laneEnds.length; i++) {
    if (laneEnds[i] <= minute) return i;
  }
  return -1;
}

export interface GridBounds {
  startMinute: number;
  endMinute: number;
  /** Whole hours the gutter labels, `startHour` … `endHour - 1`. */
  hours: number[];
  height: number;
}

/**
 * 8 AM – 6 PM, grown on whole hours to fit the earliest and latest block.
 * The grid never scrolls, so it must always be tall enough for its content.
 */
export function gridBounds(blocks: { startMinute: number; endMinute: number }[]): GridBounds {
  let start = DEFAULT_GRID_START;
  let end = DEFAULT_GRID_END;
  for (const block of blocks) {
    start = Math.min(start, Math.floor(block.startMinute / 60) * 60);
    // A block clipped at midnight is something that carries on into the
    // next day; it must not drag the whole week down to 12 AM. It runs off
    // the bottom of its column instead, which is what "continues" looks like.
    if (block.endMinute >= 24 * 60) continue;
    end = Math.max(end, Math.ceil(block.endMinute / 60) * 60);
  }
  start = Math.max(0, start);
  end = Math.min(24 * 60, Math.max(end, start + 60));
  const hours: number[] = [];
  for (let m = start; m < end; m += 60) hours.push(m / 60);
  return {
    startMinute: start,
    endMinute: end,
    hours,
    height: GRID_TOP_PAD + ((end - start) / 60) * PX_PER_HOUR,
  };
}

/** Pixels from the top of the grid body for a given minute of the day. */
export function minuteOffset(minute: number, bounds: GridBounds): number {
  return GRID_TOP_PAD + ((minute - bounds.startMinute) / 60) * PX_PER_HOUR;
}

export function blockGeometry(
  block: { startMinute: number; endMinute: number },
  bounds: GridBounds,
): { top: number; height: number } {
  const drawn = ((block.endMinute - block.startMinute) / 60) * PX_PER_HOUR;
  const height = Math.max(MIN_BLOCK_PX, drawn);
  const top = minuteOffset(block.startMinute, bounds);
  // A short block near the bottom edge is nudged up so its 40px minimum
  // still fits. Only one that was padded, though: a block clipped at
  // midnight is *meant* to run off the bottom, and pulling it up would put
  // a 2 PM event at 8 AM.
  const overflow = top + height - bounds.height;
  if (height > drawn && overflow > 0) {
    return { top: Math.max(GRID_TOP_PAD, top - overflow), height };
  }
  return { top, height };
}

// ── Day sets ────────────────────────────────────────────────────────────────

/**
 * Monday … Sunday of the week containing `key`. Named for its start on
 * purpose: src/lib/agenda.ts exports a Sunday-start `weekDays` for Home.
 */
export function mondayWeekDays(key: string): string[] {
  const monday = startOfMondayWeek(key);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/**
 * The month grid containing `key`: whole Monday-start weeks covering the
 * month — four rows for a February that starts on a Monday, usually five,
 * six when the 1st falls late in the week.
 */
export function monthDays(key: string): string[] {
  const first = `${key.slice(0, 7)}-01`;
  const start = startOfMondayWeek(first);
  const last = lastDayOfMonth(key);
  const weeks = Math.ceil((dayDiff(start, last) + 1) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
}

export function lastDayOfMonth(key: string): string {
  const [year, month] = key.split("-").map(Number);
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return addDays(next, -1);
}

/** "MWF" — the compact timetable form of a set of weekdays. */
export function dayLetters(days: number[]): string {
  const letters = ["U", "M", "T", "W", "R", "F", "S"];
  return [...days]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((d) => letters[d])
    .join("");
}

export function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** The same day of the month, `delta` months away, clamped to its length. */
export function shiftMonth(key: string, delta: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const total = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  const clamped = Math.min(day, lastDay);
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}

// ── Labels ──────────────────────────────────────────────────────────────────

/** "8 AM", "Noon", "1 PM" — the gutter of the time grid. */
export function hourLabel(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "Noon";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

/** "11:00" — a clock time with no meridiem, for use inside a range. */
export function clockTime(minute: number): string {
  const hour = Math.floor(minute / 60) % 24;
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:${String(minute % 60).padStart(2, "0")}`;
}

/** "11:00 – 12:15" — en dash with spaces, meridiem dropped inside a range. */
export function minuteRange(startMinute: number, endMinute: number): string {
  return `${clockTime(startMinute)} – ${clockTime(endMinute)}`;
}

/** A block's own time: "11:00 – 12:15", or "2:00 – …" when it carries on. */
export function blockTimeLabel(block: { startMinute: number; endMinute: number }): string {
  return block.endMinute >= 24 * 60
    ? `${clockTime(block.startMinute)} – …`
    : minuteRange(block.startMinute, block.endMinute);
}

/** "11:00–12:15" — the range without spaces, for the 70px time column. */
export function minuteRangeTight(startMinute: number, endMinute: number): string {
  return `${clockTime(startMinute)}–${clockTime(endMinute)}`;
}

/** "11:59p" — the dense form for month cells and the week bands. */
export function denseTime(minute: number): string {
  return `${clockTime(minute)}${Math.floor(minute / 60) % 24 < 12 ? "a" : "p"}`;
}

/** "5:00 PM" — a lone time, from a minute of the day. */
export function clockTimeMeridiem(minute: number): string {
  return `${clockTime(minute)} ${Math.floor(minute / 60) % 24 < 12 ? "AM" : "PM"}`;
}

/** Minutes past midnight of an instant, on the calendar's clock. */
export function minuteOf(ms: number, zone: string): number {
  return minuteOfDayIn(ms, zone);
}

/** "14:30" — the value an `<input type="time">` takes. */
export function timeInputValue(minute: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(minute)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Minutes past midnight from an `<input type="time">` value. */
export function minuteFromTimeInput(time: string): number {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return Math.max(0, Math.min(24 * 60, h * 60 + m));
}

// ── Syllabus hint ───────────────────────────────────────────────────────────

const DAY_LETTERS: Record<string, number> = { M: 1, T: 2, W: 3, R: 4, F: 5, S: 6, U: 0 };

// Anchored so "Monitor", "Satellite" and "Sunset" are not weekdays.
const DAY_NAMES: [RegExp, number][] = [
  [/^sun(day)?s?$/i, 0],
  [/^mon(day)?s?$/i, 1],
  [/^tue(s|sday)?s?$/i, 2],
  [/^wed(nesday)?s?$/i, 3],
  [/^thu(r|rs|rsday)?s?$/i, 4],
  [/^fri(day)?s?$/i, 5],
  [/^sat(urday)?s?$/i, 6],
];

/** A class is at most this long; anything wider is not a meeting time. */
const MAX_MEETING_MINUTES = 6 * 60;

const TIME_RANGE =
  /(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?m?\.?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?m?\.?/i;

export interface MeetsHint {
  days: number[];
  startMinute: number;
  endMinute: number;
}

/**
 * "MWF 9:55-10:45" from the syllabus, when it is unambiguous enough to
 * prefill a meeting. Returns undefined rather than guessing: the hint is
 * shown either way, and a wrong prefill is worse than none.
 */
export function parseMeetsHint(text: string | undefined): MeetsHint | undefined {
  if (text === undefined) return undefined;
  const days = parseDays(text);
  const times = parseTimeRange(text);
  if (days.length === 0 || times === undefined) return undefined;
  return { days, ...times };
}

function parseDays(text: string): number[] {
  const found = new Set<number>();
  for (const word of text.match(/[A-Za-z]+/g) ?? []) {
    const name = DAY_NAMES.find(([re]) => re.test(word));
    if (name !== undefined) found.add(name[1]);
  }
  if (found.size > 0) return [...found].sort((a, b) => a - b);
  // Letter runs — uppercase only, so "at" or "to" never read as days.
  for (const token of text.match(/\b[MTWRFSU]{1,7}\b/g) ?? []) {
    if (!/^[MTWRFSU]+$/.test(token)) continue;
    for (const letter of token) found.add(DAY_LETTERS[letter]);
  }
  return [...found].sort((a, b) => a - b);
}

function toMinute(hour: number, minute: number, meridiem: string | undefined): number {
  let h: number;
  if (meridiem === undefined) {
    // Class times drop the meridiem; 1–7 o'clock means afternoon on a campus.
    h = hour >= 8 && hour <= 12 ? hour % 24 : hour + 12;
  } else if (/p/i.test(meridiem)) {
    h = (hour % 12) + 12;
  } else {
    h = hour % 12;
  }
  return (h % 24) * 60 + minute;
}

/**
 * The first reading of the range that is a plausible class: the start
 * before the end, and no longer than a long lab. A bare "2-15" (a date
 * range in disguise) carries neither minutes nor a meridiem and is refused.
 */
function parseTimeRange(text: string): { startMinute: number; endMinute: number } | undefined {
  const m = TIME_RANGE.exec(text);
  if (m === null) return undefined;
  const [, sh, sm, sMer, eh, em, eMer] = m;
  if (sm === undefined && em === undefined && sMer === undefined && eMer === undefined) {
    return undefined;
  }
  const ends =
    eMer === undefined
      ? [undefined, "p"]
      : [eMer];
  const starts = sMer === undefined ? [eMer, undefined, "a", "p"] : [sMer];
  for (const endMeridiem of ends) {
    const endMinute = toMinute(Number(eh), Number(em ?? 0), endMeridiem);
    for (const startMeridiem of starts) {
      const startMinute = toMinute(Number(sh), Number(sm ?? 0), startMeridiem);
      if (startMinute < endMinute && endMinute - startMinute <= MAX_MEETING_MINUTES) {
        return { startMinute, endMinute };
      }
    }
  }
  return undefined;
}
