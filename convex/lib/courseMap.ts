import { v, type Infer } from "convex/values";
import { z } from "zod";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export const INTERPRETER_MODEL = "gpt-6-luna";
export const INTERPRETER_VERSION = "course-map-v5";
export const hashContent = (value: unknown): string =>
  bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(value))));

const evidence = v.object({ sourceId: v.string(), quote: v.string() });
const dates = v.union(
  v.null(),
  v.object({ start: v.string(), end: v.string() }),
);
const entry = v.object({
  title: v.string(),
  date: v.union(v.null(), v.string()),
  resourceIds: v.array(v.string()),
  evidence: v.array(evidence),
});
export const courseMapValidator = v.object({
  organization: v.union(
    v.literal("weekly"),
    v.literal("topical"),
    v.literal("resources"),
    v.literal("mixed"),
  ),
  summary: v.string(),
  sections: v.array(
    v.object({
      id: v.string(),
      title: v.string(),
      kind: v.union(
        v.literal("week"),
        v.literal("topic"),
        v.literal("resources"),
      ),
      resourceIds: v.array(v.string()),
      teachingDates: dates,
      // Optional so maps stored before dated entries existed still validate.
      entries: v.optional(v.array(entry)),
      evidence: v.array(evidence),
    }),
  ),
  essentials: v.array(
    v.object({
      label: v.string(),
      resourceId: v.string(),
      evidence: v.array(evidence),
    }),
  ),
  conflicts: v.array(
    v.object({ message: v.string(), evidence: v.array(evidence) }),
  ),
  unresolvedResourceIds: v.array(v.string()),
});
export type CourseMap = Infer<typeof courseMapValidator>;
const proof = z
  .array(
    z.object({
      sourceId: z.string().max(200),
      quote: z.string().min(8).max(600),
    }),
  )
  .min(1)
  .max(5);
const id = z.string().min(1).max(200);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
// Entries give month and day only; the model garbles years it composes itself.
const monthDay = z.object({
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
});
export const courseMapSchema = z.object({
  organization: z.enum(["weekly", "topical", "resources", "mixed"]),
  summary: z.string().max(1600),
  sections: z
    .array(
      z.object({
        id: id,
        title: z.string().max(200),
        kind: z.enum(["week", "topic", "resources"]),
        resourceIds: z.array(id).max(300),
        teachingDates: z.object({ start: day, end: day }).nullable(),
        entries: z
          .array(
            z.object({
              title: z.string().max(200),
              date: monthDay.nullable(),
              resourceIds: z.array(id).max(20),
              evidence: proof.max(2),
            }),
          )
          .max(40),
        evidence: proof,
      }),
    )
    .min(1)
    .max(40),
  essentials: z
    .array(
      z.object({ label: z.string().max(200), resourceId: id, evidence: proof }),
    )
    .max(20),
  conflicts: z
    .array(z.object({ message: z.string().max(600), evidence: proof }))
    .max(20),
  unresolvedResourceIds: z.array(id).max(1000),
});
/** Model output, before tidyCourseMap turns it into a stored CourseMap. */
export type CourseMapDraft = z.infer<typeof courseMapSchema>;
/** Calendar year and 1-based month in which the course starts. */
export interface CourseTerm {
  year: number;
  month: number;
}
export const resourceValidator = v.object({
  id: v.string(),
  kind: v.union(
    v.literal("course"),
    v.literal("module"),
    v.literal("item"),
    v.literal("page"),
    v.literal("file"),
    v.literal("assignment"),
  ),
  title: v.string(),
  href: v.string(),
  text: v.string(),
  fingerprint: v.string(),
  available: v.boolean(),
  parentId: v.optional(v.string()),
  targetId: v.optional(v.string()),
  position: v.optional(v.number()),
  priority: v.optional(v.boolean()),
  file: v.optional(
    v.object({
      canvasId: v.number(),
      contentType: v.string(),
      size: v.number(),
      downloadUrl: v.string(),
      updatedAt: v.optional(v.number()),
      modifiedAt: v.optional(v.number()),
    }),
  ),
});
export type CourseResource = Infer<typeof resourceValidator>;
export const resultResourceValidator = v.object({
  id: v.string(),
  title: v.string(),
  href: v.string(),
});
export interface CourseSnapshot {
  revision: number;
  hash: string;
  resources: CourseResource[];
}

// Quotes are compared ignoring typography the model often straightens.
const normalize = (text: string) =>
  text
    .normalize("NFKC")
    .replace(/\u00ad/g, "")
    .replace(/[\u2018\u2019\u201b\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201e\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
function dateInQuote(date: string, quote: string): boolean {
  const [year, month, day] = date.split("-").map(Number);
  if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)
    return false;
  const months = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const years = quote.match(/\b20\d{2}\b/g) ?? [];
  if (years.some((value) => Number(value) !== year)) return false;
  return (
    quote.includes(date) ||
    new RegExp(
      `\\b0?${month}/0?${day}(?:/(?:${year}|${year % 100})\\b|(?![/\\d]))`,
    ).test(quote) ||
    new RegExp(
      `\\b${months[month - 1]}[a-z]*\\.?\\s+(?:${day}\\b|\\d{1,2}\\s*[-–—&]\\s*${day}\\b)`,
      "i",
    ).test(quote)
  );
}

function supported(date: string, year: number, quotes: string[]): boolean {
  try {
    const y = Number(date.slice(0, 4));
    return (
      y >= year && y <= year + 1 && quotes.some((q) => dateInQuote(date, q))
    );
  } catch {
    return false;
  }
}

/**
 * Deterministic cleanup before validation. Dates are optional, so unsupported
 * ones are removed rather than failing the map. Known but unavailable resources
 * move to unresolved, and anything the map places is never also unresolved.
 */
export function tidyCourseMap(
  map: CourseMapDraft,
  term: CourseTerm,
  resources: readonly CourseResource[],
): CourseMap {
  const { year } = term;
  // Months before the term starts belong to the following calendar year.
  const dayKey = ({ month, day }: { month: number; day: number }) =>
    `${month >= term.month - 1 ? year : year + 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const byId = new Map(resources.map((r) => [r.id, r]));
  const unavailable = new Set<string>();
  // Unknown IDs are kept so validation still rejects them.
  const usable = (id: string) => {
    if (byId.get(id)?.available !== false) return true;
    unavailable.add(id);
    return false;
  };
  const kept = map.sections.flatMap((section) => {
    const resourceIds = section.resourceIds.filter(usable);
    const entries = section.entries?.map((e) => ({
      ...e,
      resourceIds: e.resourceIds.filter(usable),
    }));
    const emptied =
      !resourceIds.length &&
      !entries?.length &&
      section.resourceIds.length > 0;
    return emptied
      ? []
      : [{ ...section, resourceIds, ...(entries && { entries }) }];
  });
  const essentials = map.essentials.filter((e) => usable(e.resourceId));
  const sections = kept.map((section) => {
    const entries = section.entries?.map((e) => {
      const date = e.date && dayKey(e.date);
      return {
        ...e,
        date:
          date &&
          supported(
            date,
            year,
            e.evidence.map((x) => x.quote),
          )
            ? date
            : null,
      };
    });
    const quotes = [
      ...section.evidence,
      ...(entries ?? []).flatMap((e) => e.evidence),
    ].map((e) => e.quote);
    let { teachingDates } = section;
    if (
      teachingDates &&
      !(
        teachingDates.start <= teachingDates.end &&
        supported(teachingDates.start, year, quotes) &&
        supported(teachingDates.end, year, quotes)
      )
    )
      teachingDates = null;
    // A week spans its validated meetings when its own range is missing.
    const days = (entries ?? []).flatMap((e) => (e.date ? [e.date] : []));
    if (!teachingDates && section.kind === "week" && days.length) {
      days.sort();
      teachingDates = { start: days[0], end: days[days.length - 1] };
    }
    return { ...section, teachingDates, ...(entries && { entries }) };
  });
  // Modules are the instructor's own organization; never drop a non-empty one.
  const inSections = new Set(
    sections.flatMap((s) => [
      ...s.resourceIds,
      ...(s.entries ?? []).flatMap((e) => e.resourceIds),
    ]),
  );
  const covered = (r: CourseResource) =>
    inSections.has(r.id) || (!!r.targetId && inSections.has(r.targetId));
  const position = (s: CourseMap["sections"][number]) =>
    byId.get(s.resourceIds.find((id) => id.startsWith("module:")) ?? "")
      ?.position;
  for (const module of resources) {
    if (module.kind !== "module" || !module.available || covered(module))
      continue;
    const items = resources.filter(
      (r) => r.parentId === module.id && r.available,
    );
    if (!items.length || items.some(covered)) continue;
    const at = sections.findIndex(
      (s) => (position(s) ?? -Infinity) > (module.position ?? Infinity),
    );
    sections.splice(at < 0 ? sections.length : at, 0, {
      id: module.id,
      title: module.title,
      kind: "resources",
      resourceIds: [module.id],
      teachingDates: null,
      entries: [],
      evidence: [{ sourceId: module.id, quote: module.title }],
    });
  }
  const placed = new Set([
    ...sections.flatMap((s) => [
      ...s.resourceIds,
      ...(s.entries ?? []).flatMap((e) => e.resourceIds),
    ]),
    ...essentials.map((e) => e.resourceId),
  ]);
  for (const r of resources)
    if (placed.has(r.id) || (r.parentId && placed.has(r.parentId))) {
      placed.add(r.id);
      if (r.targetId) placed.add(r.targetId);
    }
  return {
    ...map,
    sections,
    essentials,
    unresolvedResourceIds: [
      ...new Set([...map.unresolvedResourceIds, ...unavailable]),
    ].filter((id) => !placed.has(id)),
  };
}

/** Structural and provenance checks; semantic accuracy still needs human review. */
export function validateCourseMap(
  map: CourseMap,
  snapshot: CourseSnapshot,
  evidenceTexts: ReadonlyMap<string, string | readonly string[]>,
): string[] {
  const issues: string[] = [];
  const resources = new Map(snapshot.resources.map((r) => [r.id, r]));
  const checkId = (id: string) => {
    if (!resources.get(id)?.available)
      issues.push(`Unknown or unavailable resource: ${id}`);
  };
  const checkEvidence = (items: CourseMap["sections"][number]["evidence"]) => {
    for (const item of items) {
      checkId(item.sourceId);
      const text = evidenceTexts.get(item.sourceId);
      const excerpts = typeof text === "string" ? [text] : (text ?? []);
      if (
        !item.quote.trim() ||
        !excerpts.some((excerpt) =>
          normalize(excerpt).includes(normalize(item.quote)),
        )
      )
        issues.push(`Evidence does not match source: ${item.sourceId}`);
    }
  };
  if (new Set(map.sections.map((s) => s.id)).size !== map.sections.length)
    issues.push("Section IDs must be unique");
  for (const section of map.sections) {
    if (!section.resourceIds.length && !section.entries?.length)
      issues.push(`Section has no resources or entries: ${section.id}`);
    section.resourceIds.forEach(checkId);
    checkEvidence(section.evidence);
    for (const entry of section.entries ?? []) {
      entry.resourceIds.forEach(checkId);
      checkEvidence(entry.evidence);
    }
  }
  for (const item of map.essentials) {
    checkId(item.resourceId);
    checkEvidence(item.evidence);
  }
  for (const conflict of map.conflicts) checkEvidence(conflict.evidence);
  // Unavailable resources may be acknowledged as unresolved, but must exist.
  for (const id of map.unresolvedResourceIds)
    if (!resources.has(id)) issues.push(`Unknown unresolved resource: ${id}`);
  return [...new Set(issues)];
}
