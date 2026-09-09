import { expect, it } from "vitest";
import { identifyInstructors } from "../convex/lib/instructorEvidence";
const staff = [
  { name: "Hemanjali Gasada", role: "teacher" as const },
  { name: "James Sorenson", role: "teacher" as const },
  { name: "Cassie Williams", role: "teacher" as const },
];
it("uses instructor labels, not enrollment order or teacher roles", () => {
  expect(
    identifyInstructors(
      "Instructor: James Sorenson\nTeaching Assistants: Hemanjali Gasada",
      staff,
    ).map((p) => p.name),
  ).toEqual(["James Sorenson"]);
  expect(
    identifyInstructors("Teaching Assistants: James Sorenson", staff),
  ).toEqual([]);
});
it("matches a titled surname and takes contact email from its source", () => {
  expect(
    identifyInstructors(
      "Instructor: Dr Williams (cassie.williams@wisc.edu)\nTAs: Emma Hayes",
      staff,
    ),
  ).toEqual([
    {
      name: "Cassie Williams",
      email: "cassie.williams@wisc.edu",
      role: "teacher",
    },
  ]);
});
it("preserves multiple explicitly named faculty", () => {
  expect(
    identifyInstructors(
      "Professor Rich Townsend\nProfessor Nicholas McConnell",
      [
        { name: "Richard Townsend", role: "teacher" },
        { name: "Nicholas Mcconnell", role: "teacher" },
      ],
    ).map((p) => p.name),
  ).toEqual(["Richard Townsend", "Nicholas Mcconnell"]);
});
