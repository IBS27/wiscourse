import type { Course } from "./hooks";

export type Instructor = NonNullable<Course["verifiedInstructors"]>[number];

/** "Arpaci-Dusseau" — handles the "Chen, L." form Canvas sometimes stores. */
export function familyName(
  instructor: Instructor | undefined,
): string | undefined {
  const name = instructor?.name.trim() ?? "";
  if (name === "") return undefined;
  const comma = name.indexOf(",");
  return comma > 0 ? name.slice(0, comma) : name.split(/\s+/).pop();
}
