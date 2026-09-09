export { classifyCourses } from "../../convex/lib/terms";

/** "Fall 2026-2027" (UW's naming) → "Fall 2026"; other names pass through. */
export function formatTerm(name: string | undefined): string | undefined {
  if (name === undefined) return undefined;
  const m = /^(Fall|Spring|Summer|Winter)\s+(\d{4})-\d{4}$/i.exec(name.trim());
  return m ? `${m[1]} ${m[2]}` : name;
}
