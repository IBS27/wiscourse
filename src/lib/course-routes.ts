/** Canvas kinds that open in the shared todo detail at `/todo/$key`. */
export type TodoKind = "assignment" | "quiz" | "discussion";

/** Where a link found in Canvas HTML should go. */
export type CanvasLink =
  | { kind: "internal"; to: string }
  /** A course file; the Files surface owns the preview, hence the split. */
  | { kind: "file"; fileId: number; courseId: number }
  | { kind: "external"; href: string };

/** UW–Madison's Canvas. Overridden by the connected instance when known. */
export const DEFAULT_CANVAS_HOST = "canvas.wisc.edu";

export function canvasUrl(path: string, instance?: string): string {
  const host = (instance ?? DEFAULT_CANVAS_HOST).replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `https://${host}/${path.replace(/^\/+/, "")}`;
}

export function canvasCourseUrl(courseId: number | string, instance?: string): string {
  return canvasUrl(`courses/${courseId}`, instance);
}

// ── wiscourse routes ────────────────────────────────────────────────────────

export function courseHref(courseId: number | string): string {
  return `/courses/${courseId}`;
}

export function pageHref(courseId: number | string, slug: string): string {
  return `/courses/${courseId}/pages/${encodeURIComponent(slug)}`;
}

/** Files keep their state in search params so deep links survive a reload. */
export function fileHref(
  courseId: number | string,
  fileId: number,
  folderId?: number,
): string {
  const params = new URLSearchParams({ file: String(fileId) });
  if (folderId !== undefined) params.set("folder", String(folderId));
  return `/courses/${courseId}/files?${params.toString()}`;
}

export function folderHref(courseId: number | string, folderId?: number): string {
  return folderId === undefined
    ? `/courses/${courseId}/files`
    : `/courses/${courseId}/files?folder=${folderId}`;
}

export function moduleHref(courseId: number | string, moduleId: number): string {
  return `/courses/${courseId}/modules#module-${moduleId}`;
}

function moduleItemHref(courseId: number | string, itemId: number): string {
  return `/courses/${courseId}/modules#item-${itemId}`;
}

export function announcementsHref(courseId: number | string, canvasId?: number): string {
  return canvasId === undefined
    ? `/courses/${courseId}/announcements`
    : `/courses/${courseId}/announcements?item=announcement:${canvasId}`;
}

function syllabusHref(courseId: number | string): string {
  return `/courses/${courseId}/syllabus`;
}

export function modulesHref(courseId: number | string): string {
  return `/courses/${courseId}/modules`;
}

/** Assignments, quizzes and graded discussions all open at `/todo/$key`. */
export function todoHref(kind: TodoKind, canvasId: number): string {
  return `/todo/${todoKey(kind, canvasId)}`;
}

export function todoKey(kind: TodoKind, canvasId: number): string {
  return `${kind}:${canvasId}`;
}

// ── Canvas → wiscourse ──────────────────────────────────────────────────────

const NON_WEB = /^(mailto:|tel:|sms:|javascript:|data:|blob:)/i;

// Host-agnostic on purpose: the same course is `canvas.wisc.edu` for one
// student and an `*.instructure.com` vanity host for another. `courseId` is
// the course the HTML was authored in, used only for links that omit it.
export function rewriteCanvasHref(href: string, courseId: number): CanvasLink {
  const raw = href.trim();
  if (raw === "" || NON_WEB.test(raw)) return { kind: "external", href: raw };

  let url: URL;
  try {
    url = new URL(raw, canvasUrl("/"));
  } catch {
    return { kind: "external", href: raw };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { kind: "external", href: raw };
  }

  const path = url.pathname.replace(/\/+$/, "");
  const inCourse = /^\/courses\/(\d+)(\/.*)?$/.exec(path);
  if (inCourse !== null) {
    return withinCourse(Number(inCourse[1]), inCourse[2] ?? "") ?? { kind: "external", href: url.href };
  }
  // Course-less shapes Canvas also emits, resolved against the course the
  // HTML belongs to. Deliberately narrow: everything else is external.
  if (/^\/(files|pages)\//.test(path)) {
    const bare = withinCourse(courseId, path);
    if (bare !== undefined) return bare;
  }
  return { kind: "external", href: url.href };
}

/** Instructor HTML can carry malformed percent-escapes; keep the raw slug then. */
function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** `rest` is the path after `/courses/:id`, always starting with `/` or empty. */
function withinCourse(courseId: number, rest: string): CanvasLink | undefined {
  if (rest === "") return { kind: "internal", to: courseHref(courseId) };

  const file = /^\/files\/(\d+)(\/(download|preview))?$/.exec(rest);
  if (file !== null) return { kind: "file", fileId: Number(file[1]), courseId };
  const page = /^\/pages\/([^/]+)$/.exec(rest);
  if (page !== null) return { kind: "internal", to: pageHref(courseId, safeDecode(page[1])) };
  const moduleItem = /^\/modules\/items\/(\d+)$/.exec(rest);
  if (moduleItem !== null) {
    return { kind: "internal", to: moduleItemHref(courseId, Number(moduleItem[1])) };
  }
  const module = /^\/modules\/(\d+)$/.exec(rest);
  if (module !== null) return { kind: "internal", to: moduleHref(courseId, Number(module[1])) };
  const announcement = /^\/announcements\/(\d+)$/.exec(rest);
  if (announcement !== null) {
    return { kind: "internal", to: announcementsHref(courseId, Number(announcement[1])) };
  }
  const todo = /^\/(assignments|quizzes|discussion_topics)\/(\d+)(\/.*)?$/.exec(rest);
  if (todo !== null) {
    const kind: TodoKind =
      todo[1] === "assignments" ? "assignment" : todo[1] === "quizzes" ? "quiz" : "discussion";
    return { kind: "internal", to: todoHref(kind, Number(todo[2])) };
  }

  if (rest === "/assignments/syllabus" || rest === "/syllabus") {
    return { kind: "internal", to: syllabusHref(courseId) };
  }
  if (rest === "/modules") return { kind: "internal", to: modulesHref(courseId) };
  if (rest === "/files") return { kind: "internal", to: folderHref(courseId) };
  if (rest === "/announcements") return { kind: "internal", to: announcementsHref(courseId) };
  if (rest === "/grades") return { kind: "internal", to: `/courses/${courseId}/grades` };

  return undefined;
}
