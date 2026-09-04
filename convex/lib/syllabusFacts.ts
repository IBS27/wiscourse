export interface SyllabusFacts {
  meets?: string;
  location?: string;
  officeHours?: string;
  textbook?: string;
}

const MEETING_PATTERN =
  /\b(?:MWF|TTh|TR|MW|Th|Tu|M|T|W|R|F)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[–—-]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i;

/** Extract a few common facts from syllabus HTML. */
export function parseSyllabusFacts(syllabusBody: string | undefined): SyllabusFacts {
  if (!syllabusBody) return {};
  const lines = toPlainText(syllabusBody)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const text = lines.join("\n");
  const meets = text.match(MEETING_PATTERN)?.[0]?.trim() ||
    labeledValue(lines, /^(?:meets|meeting\s+times?|class\s+times?|lectures?)\b/i);
  const location = labeledValue(lines, /^(?:location|classroom|room)\b/i);
  const officeHours = labeledValue(lines, /^office\s+hours?\b/i);
  const textbook = labeledValue(lines, /^(?:(?:required\s+)?textbooks?|required\s+(?:texts?|readings?))\b/i);
  return { meets: meets || undefined, location: location || undefined,
    officeHours: officeHours || undefined, textbook: textbook || undefined };
}

function labeledValue(lines: string[], label: RegExp): string | undefined {
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(label);
    if (!match || match.index !== 0) continue;
    const value = lines[index].slice(match[0].length).replace(/^\s*[:–—-]\s*/, "").trim();
    return value || lines[index + 1] || undefined;
  }
}

function toPlainText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|tr|h[1-6]|section|article|table)>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&", nbsp: " ", quot: '"', lt: "<", gt: ">", apos: "'",
    rsquo: "’", ndash: "–", mdash: "—",
  };
  return text.replace(/&([a-z]+);/gi, (entity, name: string) =>
    named[name.toLowerCase()] ?? entity,
  );
}
