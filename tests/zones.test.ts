import { describe, expect, it } from "vitest";
import {
  addDaysKey,
  dayKeyIn,
  daysBetween,
  minuteOfDayIn,
  weekdayOfKey,
  zonedToUtc,
} from "../convex/lib/zones";
import { expandMeetings } from "../convex/lib/meetings";
import { buildIcs, icsEscape } from "../convex/lib/ics";
import type { Id } from "../convex/_generated/dataModel";

const CHICAGO = "America/Chicago";

describe("zones", () => {
  it("round-trips a wall-clock time across DST", () => {
    // 2026-03-08 is the spring-forward day in the US.
    for (const [key, minute] of [
      ["2026-03-07", 9 * 60 + 55],
      ["2026-03-09", 9 * 60 + 55],
      ["2026-11-02", 14 * 60 + 30],
      ["2026-09-10", 23 * 60 + 59],
    ] as const) {
      const ms = zonedToUtc(key, minute, CHICAGO);
      expect(dayKeyIn(ms, CHICAGO)).toBe(key);
      expect(minuteOfDayIn(ms, CHICAGO)).toBe(minute);
    }
  });

  it("uses the right offset on each side of a DST change", () => {
    // CST is UTC-6, CDT is UTC-5.
    expect(zonedToUtc("2026-03-07", 12 * 60, CHICAGO)).toBe(Date.UTC(2026, 2, 7, 18));
    expect(zonedToUtc("2026-03-09", 12 * 60, CHICAGO)).toBe(Date.UTC(2026, 2, 9, 17));
  });

  it("does day-key arithmetic without a zone", () => {
    expect(addDaysKey("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDaysKey("2026-01-01", -1)).toBe("2025-12-31");
    expect(weekdayOfKey("2026-09-10")).toBe(4); // Thursday
    expect(daysBetween("2026-09-10", "2026-09-17")).toBe(7);
  });

  it("keys the same instant differently per zone", () => {
    const ms = Date.UTC(2026, 8, 11, 3, 30); // 03:30Z = 22:30 CDT the day before
    expect(dayKeyIn(ms, "UTC")).toBe("2026-09-11");
    expect(dayKeyIn(ms, CHICAGO)).toBe("2026-09-10");
  });
});

describe("expandMeetings", () => {
  const id = "m1" as Id<"courseMeetings">;
  const lecture = {
    _id: id,
    courseCanvasId: 1,
    kind: "lecture" as const,
    days: [1, 3, 5], // Mon Wed Fri
    startMinute: 9 * 60 + 55,
    endMinute: 10 * 60 + 45,
    location: "CS 1240",
  };
  const week = {
    start: zonedToUtc("2026-09-07", 0, CHICAGO),
    end: zonedToUtc("2026-09-14", 0, CHICAGO),
  };

  it("expands within the range at the campus wall clock", () => {
    const out = expandMeetings([lecture], week.start, week.end, () => undefined);
    expect(out.map((o) => o.day)).toEqual(["2026-09-07", "2026-09-09", "2026-09-11"]);
    expect(minuteOfDayIn(out[0].startAt, CHICAGO)).toBe(9 * 60 + 55);
    expect(out[0].endAt - out[0].startAt).toBe(50 * 60_000);
  });

  it("respects term bounds and explicit bounds", () => {
    const term = { startAt: zonedToUtc("2026-09-09", 0, CHICAGO), endAt: zonedToUtc("2026-12-18", 0, CHICAGO) };
    expect(expandMeetings([lecture], week.start, week.end, () => term).map((o) => o.day)).toEqual([
      "2026-09-09",
      "2026-09-11",
    ]);
    const bounded = { ...lecture, startsOn: "2026-09-11", endsOn: "2026-09-11" };
    expect(expandMeetings([bounded], week.start, week.end, () => term).map((o) => o.day)).toEqual([
      "2026-09-11",
    ]);
  });

  it("drops malformed meetings", () => {
    expect(expandMeetings([{ ...lecture, endMinute: lecture.startMinute }], week.start, week.end, () => undefined)).toEqual([]);
    expect(expandMeetings([{ ...lecture, days: [] }], week.start, week.end, () => undefined)).toEqual([]);
  });
});

describe("ics", () => {
  it("escapes and folds", () => {
    expect(icsEscape("a;b,c\nd\\e")).toBe("a\\;b\\,c\\nd\\\\e");
    const text = buildIcs(
      [
        {
          uid: "x@wiscourse",
          title: "T".repeat(120),
          startAt: Date.UTC(2026, 8, 10, 17),
          endAt: Date.UTC(2026, 8, 10, 18),
        },
        { uid: "d@wiscourse", title: "Plan", startAt: 0, allDayKey: "2026-09-12" },
      ],
      "wiscourse",
      Date.UTC(2026, 8, 1),
    );
    expect(text).toContain("DTSTART:20260910T170000Z");
    expect(text).toContain("DTEND:20260910T180000Z");
    expect(text).toContain("DTSTART;VALUE=DATE:20260912");
    expect(text).toContain("DTEND;VALUE=DATE:20260913");
    const span = buildIcs([{ uid: "s@w", title: "Break", startAt: 0, allDayKey: "2026-03-14", allDayEndKey: "2026-03-22" }], "c", 0);
    expect(span).toContain("DTEND;VALUE=DATE:20260323");
    for (const line of text.split("\r\n")) expect(line.length).toBeLessThanOrEqual(75);
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("folds by octets without splitting a character", () => {
    const title = "x".repeat(65) + "🎓 end";
    const text = buildIcs([{ uid: "u@w", title, startAt: 0, endAt: 1 }], "c", 0);
    const encoder = new TextEncoder();
    for (const line of text.split("\r\n")) expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    expect(text.replace(/\r\n /g, "")).toContain(`SUMMARY:${title}`);
  });
});
