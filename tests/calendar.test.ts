import { describe, expect, it } from "vitest";
import {
  blockGeometry,
  buildDayModels,
  clockTimeMeridiem,
  denseTime,
  eventCourseId,
  gridBounds,
  hourLabel,
  layoutBlocks,
  minuteRange,
  monthDays,
  parseMeetsHint,
  shiftMonth,
  timeInputValue,
  minuteFromTimeInput,
  mondayWeekDays,
  type CalendarEvent,
  type TimeBlock,
} from "../src/lib/calendar";
import { zonedToUtc } from "../convex/lib/zones";
import type { MeetingOccurrence } from "../convex/lib/meetings";
import type { TodoItem } from "../convex/todos";
import type { Id } from "../convex/_generated/dataModel";

const ZONE = "America/Chicago";

function at(day: string, minute: number): number {
  return zonedToUtc(day, minute, ZONE);
}

function block(start: number, end: number, id = `${start}`): TimeBlock {
  return {
    id,
    kind: "meeting",
    day: "2026-09-10",
    title: id,
    startMinute: start,
    endMinute: end,
    startAt: at("2026-09-10", start),
    endAt: at("2026-09-10", end),
    local: false,
  };
}

function todo(partial: Partial<TodoItem> & { key: string; title: string }): TodoItem {
  return { kind: "local", submission: "none", subtasks: [], ...partial };
}

describe("time labels", () => {
  it("writes ranges with an en dash and no meridiem", () => {
    expect(minuteRange(11 * 60, 12 * 60 + 15)).toBe("11:00 – 12:15");
    expect(minuteRange(14 * 60 + 30, 15 * 60 + 45)).toBe("2:30 – 3:45");
  });

  it("writes dense and lone times", () => {
    expect(denseTime(23 * 60 + 59)).toBe("11:59p");
    expect(denseTime(17 * 60)).toBe("5:00p");
    expect(denseTime(9 * 60 + 5)).toBe("9:05a");
    expect(denseTime(0)).toBe("12:00a");
    expect(clockTimeMeridiem(17 * 60)).toBe("5:00 PM");
    expect(clockTimeMeridiem(12 * 60)).toBe("12:00 PM");
  });

  it("labels the gutter", () => {
    expect(hourLabel(8)).toBe("8 AM");
    expect(hourLabel(12)).toBe("Noon");
    expect(hourLabel(13)).toBe("1 PM");
    expect(hourLabel(0)).toBe("12 AM");
  });

  it("round-trips the time input value", () => {
    expect(timeInputValue(9 * 60 + 55)).toBe("09:55");
    expect(minuteFromTimeInput("09:55")).toBe(9 * 60 + 55);
  });
});

describe("grid bounds", () => {
  it("defaults to 8 AM – 6 PM", () => {
    const bounds = gridBounds([]);
    expect(bounds.startMinute).toBe(8 * 60);
    expect(bounds.endMinute).toBe(18 * 60);
    expect(bounds.hours).toHaveLength(10);
    expect(bounds.height).toBe(10 + 10 * 48);
  });

  it("grows on whole hours to fit the earliest and latest block", () => {
    const bounds = gridBounds([block(7 * 60 + 45, 8 * 60 + 45), block(18 * 60, 19 * 60 + 10)]);
    expect(bounds.startMinute).toBe(7 * 60);
    expect(bounds.endMinute).toBe(20 * 60);
  });

  it("keeps a multi-day block at its start time, running off the bottom", () => {
    // 2 PM until midnight: it is meant to overflow the 8 AM – 6 PM grid,
    // not to be pulled up so that it fits.
    const bounds = gridBounds([]);
    expect(blockGeometry({ startMinute: 14 * 60, endMinute: 24 * 60 }, bounds)).toEqual({
      top: 10 + 6 * 48,
      height: 480,
    });
  });

  it("nudges a padded block up so its 40px minimum stays in the grid", () => {
    const bounds = gridBounds([]);
    const late = blockGeometry({ startMinute: 17 * 60 + 50, endMinute: 18 * 60 }, bounds);
    expect(late.height).toBe(40);
    expect(late.top + late.height).toBe(bounds.height);
  });

  it("never renders a block shorter than 40px", () => {
    const bounds = gridBounds([]);
    const tiny = blockGeometry({ startMinute: 9 * 60, endMinute: 9 * 60 + 15 }, bounds);
    expect(tiny.height).toBe(40);
    const lecture = blockGeometry({ startMinute: 11 * 60, endMinute: 12 * 60 + 15 }, bounds);
    expect(lecture.height).toBe(60);
    expect(lecture.top).toBe(10 + 3 * 48);
  });
});

describe("overlap layout", () => {
  it("gives non-overlapping blocks the whole column", () => {
    const laid = layoutBlocks([block(540, 600, "a"), block(600, 660, "b")]);
    expect(laid.map((b) => [b.lane, b.lanes])).toEqual([
      [0, 1],
      [0, 1],
    ]);
  });

  it("splits a column between blocks that overlap", () => {
    const laid = layoutBlocks([block(540, 660, "a"), block(600, 720, "b")]);
    expect(laid.find((b) => b.id === "a")).toMatchObject({ lane: 0, lanes: 2 });
    expect(laid.find((b) => b.id === "b")).toMatchObject({ lane: 1, lanes: 2 });
  });

  it("reuses a lane once it is free inside the same cluster", () => {
    // a 9–11, b 9:30–10:30, c 10:30–11 → c slots back into b's lane.
    const laid = layoutBlocks([block(540, 660, "a"), block(570, 630, "b"), block(630, 660, "c")]);
    expect(laid.every((b) => b.lanes === 2)).toBe(true);
    expect(laid.find((b) => b.id === "c")?.lane).toBe(1);
  });

  it("keeps short blocks apart, because each still draws 40px tall", () => {
    // 9:00–9:15 and 9:15–9:30 do not overlap in minutes, but both render
    // 40px (50 minutes) tall, so they would sit on top of each other.
    const laid = layoutBlocks([block(540, 555, "a"), block(555, 570, "b")]);
    expect(laid.every((b) => b.lanes === 2)).toBe(true);
  });

  it("clips a block that runs past midnight in the viewer's zone", () => {
    const late = buildDayModels({
      days: ["2026-09-10"],
      todos: [],
      events: [],
      meetings: [
        {
          meetingId: "m9" as Id<"courseMeetings">,
          courseCanvasId: 1,
          kind: "seminar",
          day: "2026-09-10",
          startAt: at("2026-09-10", 18 * 60),
          endAt: at("2026-09-10", 20 * 60),
        },
      ],
      // Chicago 6 PM is 1 AM the next day in Berlin; the block has to stop
      // at midnight rather than wrap to a negative height.
      zone: "Europe/Berlin",
      courseLabel: () => undefined,
    });
    const blocks = [...late.values()].flatMap((m) => m.blocks);
    for (const b of blocks) expect(b.endMinute).toBeGreaterThan(b.startMinute);
  });
});

describe("day models", () => {
  const events: CalendarEvent[] = [
    {
      _id: "e1",
      source: "canvas",
      title: "Labor Day — no classes",
      startAt: at("2026-09-07", 0),
      allDay: true,
      contextCode: "course_1",
    },
    {
      _id: "e2",
      source: "local",
      title: "Study group",
      startAt: at("2026-09-13", 16 * 60),
      endAt: at("2026-09-13", 18 * 60),
      location: "College Library",
    },
  ];

  const meetings: MeetingOccurrence[] = [
    {
      meetingId: "m1" as Id<"courseMeetings">,
      courseCanvasId: 1,
      kind: "lecture",
      day: "2026-09-10",
      startAt: at("2026-09-10", 11 * 60),
      endAt: at("2026-09-10", 12 * 60 + 15),
      location: "Van Vleck B102",
    },
  ];

  const todos: TodoItem[] = [
    todo({ key: "a1", title: "Problem Set 3", dueAt: at("2026-09-10", 17 * 60), courseCanvasId: 1 }),
    todo({ key: "a2", title: "Email prof", plannedDay: "2026-09-10" }),
    // Planned on the day it is due: one line, not two.
    todo({ key: "a3", title: "Quiz 2", dueAt: at("2026-09-10", 23 * 60 + 59), plannedDay: "2026-09-10" }),
    todo({ key: "a4", title: "Done already", plannedDay: "2026-09-10", doneAt: at("2026-09-09", 600) }),
  ];

  const days = mondayWeekDays("2026-09-10");
  const models = buildDayModels({
    days,
    todos,
    events,
    meetings,
    zone: ZONE,
    courseLabel: (id) => (id === 1 ? "MATH 340" : undefined),
  });

  it("covers Monday to Sunday", () => {
    expect(days[0]).toBe("2026-09-07");
    expect(days[6]).toBe("2026-09-13");
  });

  it("puts due times in the due list and plans in the plan list", () => {
    const thursday = models.get("2026-09-10")!;
    expect(thursday.due.map((i) => i.key)).toEqual(["a1", "a3"]);
    expect(thursday.planned.map((i) => i.key)).toEqual(["a2"]);
  });

  it("keeps all-day events out of the grid", () => {
    expect(models.get("2026-09-07")!.allDay.map((e) => e._id)).toEqual(["e1"]);
    expect(models.get("2026-09-07")!.blocks).toHaveLength(0);
  });

  it("builds meeting blocks with the course label and minutes of the day", () => {
    const [meeting] = models.get("2026-09-10")!.blocks;
    expect(meeting.code).toBe("MATH 340");
    expect(meeting.title).toBe("Lecture");
    expect(meeting.startMinute).toBe(11 * 60);
    expect(meeting.endMinute).toBe(12 * 60 + 15);
    expect(meeting.subtitle).toBe("Van Vleck B102");
  });

  it("marks local events so they render lighter", () => {
    const [event] = models.get("2026-09-13")!.blocks;
    expect(event).toMatchObject({ kind: "event", local: true, startMinute: 16 * 60 });
  });

  it("pins all-day events to the campus day, the way the ICS feed does", () => {
    // Midnight in Madison is still the previous evening in Honolulu; the
    // holiday must not slide a day for a student who travels.
    const abroad = buildDayModels({
      days,
      todos,
      events,
      meetings,
      zone: "Pacific/Honolulu",
      courseLabel: () => undefined,
    });
    expect(abroad.get("2026-09-07")!.allDay.map((e) => e._id)).toEqual(["e1"]);
  });
});

describe("multi-day events", () => {
  const days = mondayWeekDays("2026-09-10");
  const build = (events: CalendarEvent[]) =>
    buildDayModels({
      days,
      todos: [],
      events,
      meetings: [],
      zone: ZONE,
      courseLabel: () => undefined,
    });

  it("puts a week-long all-day event on every day it covers", () => {
    const models = build([
      {
        _id: "break",
        source: "canvas",
        title: "Spring Break — no classes",
        startAt: at("2026-09-08", 0),
        endAt: at("2026-09-11", 0),
        allDay: true,
      },
    ]);
    const on = days.filter((d) => models.get(d)!.allDay.length === 1);
    expect(on).toEqual(["2026-09-08", "2026-09-09", "2026-09-10"]);
    // An all-day event is never a grid block.
    expect(days.every((d) => models.get(d)!.blocks.length === 0)).toBe(true);
  });

  it("blocks the first day of a timed run and bands the rest", () => {
    const models = build([
      {
        _id: "conf",
        source: "local",
        title: "Conference",
        startAt: at("2026-09-09", 13 * 60),
        endAt: at("2026-09-11", 15 * 60),
      },
    ]);
    const [block] = models.get("2026-09-09")!.blocks;
    expect(block).toMatchObject({ startMinute: 13 * 60, endMinute: 24 * 60 });
    expect(models.get("2026-09-10")!.allDay).toHaveLength(1);
    expect(models.get("2026-09-11")!.allDay).toHaveLength(1);
    expect(models.get("2026-09-11")!.blocks).toHaveLength(0);
    expect(models.get("2026-09-12")!.allDay).toHaveLength(0);
  });

  it("still shows an event that started before the window", () => {
    const models = build([
      {
        _id: "long",
        source: "canvas",
        title: "Study abroad fair",
        startAt: at("2026-09-04", 9 * 60),
        endAt: at("2026-09-09", 17 * 60),
      },
    ]);
    expect(models.get("2026-09-07")!.allDay).toHaveLength(1);
    expect(models.get("2026-09-09")!.allDay).toHaveLength(1);
    expect(models.get("2026-09-10")!.allDay).toHaveLength(0);
  });

  it("does not spill an event that ends exactly at midnight", () => {
    const models = build([
      {
        _id: "late",
        source: "local",
        title: "Lab session",
        startAt: at("2026-09-09", 22 * 60),
        endAt: at("2026-09-10", 0),
      },
    ]);
    expect(models.get("2026-09-09")!.blocks).toHaveLength(1);
    expect(models.get("2026-09-10")!.allDay).toHaveLength(0);
    expect(models.get("2026-09-10")!.blocks).toHaveLength(0);
  });
});

describe("month grid", () => {
  it("starts on the Monday before the 1st and covers the month", () => {
    const days = monthDays("2026-09-10");
    expect(days[0]).toBe("2026-08-31");
    expect(days).toHaveLength(35);
    expect(days[days.length - 1]).toBe("2026-10-04");
  });

  it("uses six rows when the month needs them", () => {
    // August 2026 starts on a Saturday.
    expect(monthDays("2026-08-15")).toHaveLength(42);
  });
});

describe("event course", () => {
  it("reads the course from a Canvas context code", () => {
    expect(eventCourseId({ _id: "x", source: "canvas", title: "t", startAt: 0, contextCode: "course_537" })).toBe(537);
    expect(eventCourseId({ _id: "x", source: "canvas", title: "t", startAt: 0, contextCode: "user_9" })).toBeUndefined();
    expect(eventCourseId({ _id: "x", source: "local", title: "t", startAt: 0, courseCanvasId: 4 })).toBe(4);
  });
});

describe("syllabus hint", () => {
  it("parses the common UW shapes", () => {
    expect(parseMeetsHint("MWF 9:55-10:45")).toEqual({
      days: [1, 3, 5],
      startMinute: 9 * 60 + 55,
      endMinute: 10 * 60 + 45,
    });
    expect(parseMeetsHint("TR 1:20–2:10 PM")).toEqual({
      days: [2, 4],
      startMinute: 13 * 60 + 20,
      endMinute: 14 * 60 + 10,
    });
    expect(parseMeetsHint("Tuesdays and Thursdays, 11:00 AM – 12:15 PM")).toEqual({
      days: [2, 4],
      startMinute: 11 * 60,
      endMinute: 12 * 60 + 15,
    });
  });

  it("reads a range that carries only the closing meridiem", () => {
    expect(parseMeetsHint("MW 11:00 – 12:15 PM")).toEqual({
      days: [1, 3],
      startMinute: 11 * 60,
      endMinute: 12 * 60 + 15,
    });
  });

  it("gives up rather than guessing", () => {
    expect(parseMeetsHint(undefined)).toBeUndefined();
    expect(parseMeetsHint("See Canvas for meeting times")).toBeUndefined();
    expect(parseMeetsHint("MWF")).toBeUndefined();
    // A term's date range is not a meeting time.
    expect(parseMeetsHint("MWF, Sep 2-Dec 15")).toBeUndefined();
    // Words that merely start like a weekday are not weekdays.
    expect(parseMeetsHint("Monitor the forum, Satellite room, 9:55-10:45")).toBeUndefined();
  });
});

describe("month navigation", () => {
  it("clamps to the length of the month it lands in", () => {
    expect(shiftMonth("2026-03-31", -1)).toBe("2026-02-28");
    expect(shiftMonth("2026-01-31", -1)).toBe("2025-12-31");
    expect(shiftMonth("2026-12-15", 1)).toBe("2027-01-15");
    expect(shiftMonth("2028-01-31", 1)).toBe("2028-02-29");
  });
});
