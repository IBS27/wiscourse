// Canvas course names at UW–Madison look like
// "MATH234: Calculus--Functions of Several Variables (001) FA26". Lists and
// chips want the short code ("MATH 234"); headers want the plain title.

type Named = { name: string; courseCode: string; nickname?: string };

// SUBJECT + number, a colon, the title, then optional "(sections)" and term.
const UW_NAME = /^([A-Za-z][A-Za-z &]*?)\s?(\d{2,4}[A-Z]?):\s*(.+?)(?:\s*\(([\d\s,]+)\))?(?:\s+((?:FA|SP|SU|WI)\d{2}))?\s*$/;

export type ParsedName = { code: string; title: string; sections?: string; term?: string };

/** Canvas writes a dash as "--"; titles read it as a spaced em dash. */
function dashed(s: string): string {
  return s.replace(/\s*--\s*/g, " — ");
}

export function parseCourseName(name: string): ParsedName | undefined {
  const m = UW_NAME.exec(name.trim());
  if (!m) return undefined;
  const subject = m[1].trim().replace(/\s+and\s+/i, "/").toUpperCase();
  return {
    code: `${subject} ${m[2]}`,
    title: dashed(m[3]),
    sections: m[4]?.trim(),
    term: m[5],
  };
}

// UW's Canvas often puts the full title in `courseCode` ("Career Fair
// Preparation"); only a genuinely short code is worth showing beside a name.
export function shortCode(c: { name: string; courseCode: string }): string | undefined {
  const parsed = parseCourseName(c.name);
  if (parsed) return parsed.code;
  const code = c.courseCode.trim();
  if (code.length === 0 || code.length > 14 || code === c.name.trim()) return undefined;
  return code;
}

/** Compact name for chips, rows and pickers: nickname, else "MATH 234". */
export function courseLabel(c: Named): string {
  return c.nickname ?? shortCode(c) ?? dashed(c.name);
}

/** Readable title for headers: nickname, else the name without code/section/term. */
export function courseTitle(c: Named): string {
  return c.nickname ?? parseCourseName(c.name)?.title ?? dashed(c.name);
}
