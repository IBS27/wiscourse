export { classifyCourses } from "../../convex/lib/terms";

/** "Fall 2026-2027" (UW's naming) → "Fall 2026"; other names pass through. */
export function formatTerm(name: string | undefined): string | undefined {
  if (name === undefined) return undefined;
  const sort = termSortKey(name);
  if (sort === undefined) return name;
  const m = /^(Fall|Spring|Summer|Winter)/i.exec(name.trim())!;
  return `${m[1]} ${Math.floor(sort / 10)}`;
}

// Canvas names academic-year terms "Spring 2024-2025": fall sits in the first
// year, spring and summer in the second. Returns year * 10 + season order,
// or undefined for terms without a season ("Ongoing").
const SEASON: Record<string, { order: number; second: boolean }> = {
  winter: { order: 0, second: true },
  spring: { order: 1, second: true },
  summer: { order: 2, second: true },
  fall: { order: 3, second: false },
};
export function termSortKey(name: string): number | undefined {
  const m = /^(Fall|Spring|Summer|Winter)\s+(\d{4})(?:-(\d{4}))?$/i.exec(name.trim());
  if (!m) return undefined;
  const season = SEASON[m[1].toLowerCase()];
  const first = Number(m[2]);
  const year = m[3] !== undefined && season.second ? Number(m[3]) : first;
  return year * 10 + season.order;
}
