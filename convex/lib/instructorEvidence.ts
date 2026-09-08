export type StaffMember = {
  name: string;
  email?: string;
  role: "teacher" | "ta";
};
const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/);
/** Only explicit teaching-role labels establish identity; roster order never does. */
export function identifyInstructors(
  text: string,
  staff: StaffMember[],
): StaffMember[] {
  const lines = text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const found = new Map<string, StaffMember>();
  let contactUntil = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^instructor(?:s)?\s+contact\s+information\s*:/i.test(line)) {
      contactUntil = i + 24;
      continue;
    }
    const inContact = i < contactUntil && /^Dr\.?\s+/i.test(line);
    if (
      !inContact &&
      !/^(?:(?:course|lecture\s+\d+)\s+)?instructors?\s*:|^professor\s+|^lecturers?\s*:/i.test(
        line,
      )
    )
      continue;
    let evidence = line;
    if (/^(?:instructors?|lecturers?)\s*:\s*$/i.test(line))
      evidence += " " + (lines[i + 1] ?? "");
    evidence = evidence.split(/\b(?:TAs?|teaching assistants?)\s*:/i)[0];
    const tokens = words(evidence);
    const matches = staff.filter((person) => {
      const parts = words(person.name);
      return (
        (person.email &&
          evidence.toLowerCase().includes(person.email.toLowerCase())) ||
        (tokens.includes(parts.at(-1)!) &&
          (tokens.includes(parts[0]) ||
            /\b(?:dr|professor)\.?\s+/i.test(evidence)))
      );
    });
    if (matches.length === 0) {
      const name = evidence
        .replace(
          /^(?:professor|dr\.?)\s+|^(?:instructors?|lecturers?)\s*:\s*/i,
          "",
        )
        .split(/[,(|]/)[0]
        .trim();
      if (/^[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){1,3}$/u.test(name))
        matches.push({ name, role: "teacher" });
    }
    const contact = [
      evidence,
      ...lines
        .slice(i + 1, i + 4)
        .filter((s) => !/^TA|^teaching assistant|^professor|^Dr\./i.test(s)),
    ].join(" ");
    const email = contact.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0];
    for (const person of matches)
      found.set(person.name, {
        ...person,
        ...(matches.length === 1 && email ? { email } : {}),
        role: "teacher",
      });
  }
  return [...found.values()];
}
