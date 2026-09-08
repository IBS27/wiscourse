import { parseDocument } from "htmlparser2";
import { hashContent } from "./courseMap";

/** Text retains table boundaries, headings, and safe Canvas resource references. */
export function courseText(html: string, courseId: number): string {
  const document = parseDocument(html);
  const walk = (node: (typeof document.children)[number]): string => {
    if (node.type === "text") return node.data;
    if (!("attribs" in node))
      return "children" in node ? node.children.map(walk).join("") : "";
    if (
      ["script", "style", "iframe", "form", "input", "img"].includes(node.name)
    )
      return "";
    const text = node.children.map(walk).join("");
    if (node.name === "a") {
      const href = node.attribs.href ?? "";
      const match = new RegExp(
        `^(?:https://[^/]+)?/courses/${courseId}/(pages|files|assignments)/([^/?#]+)`,
      ).exec(href);
      return match
        ? `${text} [${match[1] === "pages" ? "page" : match[1] === "files" ? "file" : "assignment"}:${match[2]}]`
        : text;
    }
    if (["td", "th"].includes(node.name)) return `${text} | `;
    if (
      [
        "p",
        "div",
        "li",
        "tr",
        "h1",
        "h2",
        "h3",
        "h4",
        "br",
        "section",
      ].includes(node.name)
    )
      return `${text}\n`;
    return text;
  };
  return document.children
    .map(walk)
    .join("")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
}

const relevantFields: Record<string, string[]> = {
  courses: [
    "name",
    "courseCode",
    "startAt",
    "endAt",
    "termStartAt",
    "termEndAt",
    "defaultView",
    "syllabusBody",
    "enrollmentState",
  ],
  pages: [
    "title",
    "url",
    "body",
    "isFrontPage",
    "contentUnavailable",
    "lockedForUser",
    "published",
  ],
  modules: ["name", "position", "state", "published"],
  moduleItems: [
    "title",
    "moduleCanvasId",
    "position",
    "indent",
    "type",
    "contentCanvasId",
    "pageUrl",
    "externalUrl",
    "published",
  ],
  files: [
    "displayName",
    "filename",
    "folderCanvasId",
    "contentType",
    "size",
    "updatedAt",
    "modifiedAt",
    "lockedForUser",
    "hidden",
  ],
  assignments: ["name", "description", "dueAt", "lockedForUser"],
};
export function sourceFingerprint(
  table: string,
  row: object,
): string | undefined {
  const fields = relevantFields[table];
  if (!fields) return undefined;
  const record = row as Record<string, unknown>;
  return hashContent(
    fields.map((key) => [
      key,
      table === "modules" && key === "state"
        ? record[key] === "locked"
        : (record[key] ?? null),
    ]),
  );
}
