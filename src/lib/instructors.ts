import type { Course } from "./hooks";

export type Instructor = NonNullable<Course["instructors"]>[number];

// Role is no guide — UW enrolls TAs as TeacherEnrollment — but Canvas puts
// the instructor first and the rest of the staff after them.
export function leadInstructor(course: Course | undefined): Instructor | undefined {
  return course?.instructors?.[0];
}

export function otherInstructors(course: Course | undefined): Instructor[] {
  return (course?.instructors ?? []).slice(1);
}

/** "Arpaci-Dusseau" — handles the "Chen, L." form Canvas sometimes stores. */
export function familyName(instructor: Instructor | undefined): string | undefined {
  const name = instructor?.name.trim() ?? "";
  if (name === "") return undefined;
  const comma = name.indexOf(",");
  return comma > 0 ? name.slice(0, comma) : name.split(/\s+/).pop();
}
