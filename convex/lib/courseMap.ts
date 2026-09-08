import { v, type Infer } from "convex/values";
import { z } from "zod";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export const INTERPRETER_MODEL = "gpt-5.6-luna";
export const INTERPRETER_VERSION = "course-map-v4";
export const hashContent = (value: unknown): string =>
  bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(value))));

const evidence = v.object({ sourceId: v.string(), quote: v.string() });
const dates = v.union(
  v.null(),
  v.object({ start: v.string(), end: v.string() }),
);
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
export const courseMapSchema = z.object({
  organization: z.enum(["weekly", "topical", "resources", "mixed"]),
  summary: z.string().max(1600),
  sections: z
    .array(
      z.object({
        id: id,
        title: z.string().max(200),
        kind: z.enum(["week", "topic", "resources"]),
        resourceIds: z.array(id).min(1).max(300),
        teachingDates: z
          .object({
            start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          })
          .nullable(),
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
  year: number;
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
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
    new RegExp(`\\b${month}/${day}(?:/${year}|\\b)`).test(quote) ||
    new RegExp(
      `\\b${months[month - 1]}[a-z]*\\s+(?:${day}\\b|\\d{1,2}\\s*[-–—&]\\s*${day}\\b)`,
      "i",
    ).test(quote)
  );
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
    section.resourceIds.forEach(checkId);
    checkEvidence(section.evidence);
    if (section.teachingDates) {
      const { start, end } = section.teachingDates;
      try {
        if (
          start > end ||
          Number(start.slice(0, 4)) < snapshot.year ||
          Number(end.slice(0, 4)) > snapshot.year + 1 ||
          !section.evidence.some((e) => dateInQuote(start, e.quote)) ||
          !section.evidence.some((e) => dateInQuote(end, e.quote))
        ) {
          issues.push(
            `Teaching dates lack consistent source evidence: ${section.title}`,
          );
        }
      } catch {
        issues.push(`Invalid teaching date: ${section.title}`);
      }
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
