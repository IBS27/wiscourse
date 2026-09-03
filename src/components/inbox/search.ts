// The Inbox keeps its whole view in the URL, so deep links from Home, ⌘K
// and the nav badge all land on the same list and a reload keeps it.

export type InboxType = "announcement" | "grade" | "change" | "assignment";

const TYPES: InboxType[] = ["announcement", "grade", "change", "assignment"];

export interface InboxSearch {
  /** Feed key of the selected item, e.g. `grade:12345`. */
  item?: string;
  type?: InboxType;
  /** Canvas id of the course the list is scoped to. */
  course?: number;
  unread?: boolean;
}

export function parseInboxSearch(search: Record<string, unknown>): InboxSearch {
  const course = Number(search.course);
  return {
    item: typeof search.item === "string" && search.item !== "" ? search.item : undefined,
    type: TYPES.find((t) => t === search.type),
    course: Number.isInteger(course) && course > 0 ? course : undefined,
    unread: search.unread === true || search.unread === "true" ? true : undefined,
  };
}
