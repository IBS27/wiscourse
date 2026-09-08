import type { Course } from "./hooks";

export type Instructor = NonNullable<Course["instructors"]>[number];

// Only source-verified instructors may be presented as teaching the course.
export function leadInstructor(
  course: Course | undefined,
): Instructor | undefined {
  return course?.verifiedInstructors?.[0];
}
export function otherInstructors(course: Course | undefined): Instructor[] {
  return (course?.verifiedInstructors ?? []).slice(1);
}

/** "Arpaci-Dusseau" — handles the "Chen, L." form Canvas sometimes stores. */
export function familyName(
  instructor: Instructor | undefined,
): string | undefined {
  const name = instructor?.name.trim() ?? "";
  if (name === "") return undefined;
  const comma = name.indexOf(",");
  return comma > 0 ? name.slice(0, comma) : name.split(/\s+/).pop();
}
