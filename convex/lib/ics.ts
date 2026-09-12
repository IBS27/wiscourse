// A minimal iCalendar writer (RFC 5545). Every event is emitted as a
// concrete VEVENT in UTC — no RRULE or VTIMEZONE — so a subscribing
// calendar never has to agree with us about DST.

export interface IcsEvent {
  uid: string;
  title: string;
  startAt: number;
  /** Omitted for instant items (a due time). */
  endAt?: number;
  /** All-day events take a date, not an instant; `startAt` is ignored then. */
  allDayKey?: string;
  /** Last day of a multi-day all-day event (inclusive). */
  allDayEndKey?: string;
  description?: string;
  location?: string;
  url?: string;
  /** Sequence bumps make subscribers refresh a changed event. */
  updatedAt?: number;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function nextDayKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

export function icsUtc(ms: number): string {
  const d = new Date(ms);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

export function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

const MAX_LINE_OCTETS = 75;
const encoder = new TextEncoder();

/**
 * RFC 5545 §3.1: a content line is at most 75 octets; longer ones continue
 * on a line starting with a space. Folds fall between characters (never
 * inside a surrogate pair) and are measured in UTF-8 bytes.
 */
function fold(line: string): string {
  const lines: string[] = [];
  let current = "";
  let octets = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (octets + size > MAX_LINE_OCTETS) {
      lines.push(current);
      current = " ";
      octets = 1;
    }
    current += char;
    octets += size;
  }
  lines.push(current);
  return lines.join("\r\n");
}

function property(name: string, value: string | undefined): string[] {
  return value === undefined || value === "" ? [] : [fold(`${name}:${value}`)];
}

export function buildIcs(events: IcsEvent[], calendarName: string, now: number = Date.now()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//wiscourse//calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...property("X-WR-CALNAME", icsEscape(calendarName)),
    "X-PUBLISHED-TTL:PT1H",
  ];
  const stamp = icsUtc(now);
  for (const event of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(...property("UID", event.uid));
    lines.push(`DTSTAMP:${stamp}`);
    if (event.allDayKey !== undefined) {
      lines.push(`DTSTART;VALUE=DATE:${event.allDayKey.replace(/-/g, "")}`);
      // DTEND on a DATE value is exclusive, so a one-day event ends tomorrow.
      const last = event.allDayEndKey !== undefined && event.allDayEndKey > event.allDayKey
        ? event.allDayEndKey
        : event.allDayKey;
      lines.push(`DTEND;VALUE=DATE:${nextDayKey(last).replace(/-/g, "")}`);
    } else {
      lines.push(`DTSTART:${icsUtc(event.startAt)}`);
      if (event.endAt !== undefined && event.endAt > event.startAt) {
        lines.push(`DTEND:${icsUtc(event.endAt)}`);
      }
    }
    lines.push(...property("SUMMARY", icsEscape(event.title)));
    lines.push(...property("DESCRIPTION", event.description === undefined ? undefined : icsEscape(event.description)));
    lines.push(...property("LOCATION", event.location === undefined ? undefined : icsEscape(event.location)));
    lines.push(...property("URL", event.url));
    if (event.updatedAt !== undefined) {
      lines.push(`LAST-MODIFIED:${icsUtc(event.updatedAt)}`);
      // Minutes since the epoch stay below 2^31 until the year 6053.
      lines.push(`SEQUENCE:${Math.floor(event.updatedAt / 60_000)}`);
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
