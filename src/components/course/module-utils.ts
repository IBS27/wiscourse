import { teachingRange } from "@/lib/course-structure";
import {
  ExternalLink,
  File as FileIcon,
  FileText,
  ListChecks,
  MessagesSquare,
  SquareCheckBig,
  type LucideIcon,
} from "lucide-react";
import type { Doc } from "../../../convex/_generated/dataModel";
import type { TodoItem } from "../../../convex/todos";
import { extensionOf, fileIcon } from "./file-kinds";
import { isDone, isOverdue } from "@/lib/agenda";
import {
  DAY_MS,
  addDays,
  dayKeyOf,
  formatDayShort,
  formatMonthDay,
  formatWeekRange,
  formatWeekday,
  startOfDay,
  startOfMondayWeek,
} from "@/lib/dates";
import { formatBytes } from "@/lib/format";
import { folderHref, pageHref, todoHref, todoKey, type TodoKind } from "@/lib/course-routes";

export type ModuleDoc = Doc<"modules">;
export type ModuleItemDoc = Doc<"moduleItems">;
export type ModuleWithItems = ModuleDoc & { items: ModuleItemDoc[] };
export type FileDoc = Doc<"files">;

/** Share of datable modules above which the timeline is worth showing. */
const TIMELINE_THRESHOLD = 0.6;

// ── links ───────────────────────────────────────────────────────────────────

export type ItemTarget =
  // `to` is the route path and `search` its params: a query string baked
  // into `to` would sail past the route's `validateSearch`.
  | { kind: "internal"; to: string; search?: { file: number } }
  | { kind: "external"; href: string }
  | { kind: "none" };

const TODO_KIND: Partial<Record<ModuleItemDoc["type"], TodoKind>> = {
  Assignment: "assignment",
  Quiz: "quiz",
  Discussion: "discussion",
};

export function itemTarget(item: ModuleItemDoc, courseId: number | string): ItemTarget {
  switch (item.type) {
    case "SubHeader":
      return { kind: "none" };
    case "Page":
      return item.pageUrl === undefined
        ? external(item.htmlUrl)
        : { kind: "internal", to: pageHref(courseId, item.pageUrl) };
    case "File":
      return item.contentCanvasId === undefined
        ? external(item.htmlUrl)
        : { kind: "internal", to: folderHref(courseId), search: { file: item.contentCanvasId } };
    case "ExternalUrl":
      return external(item.externalUrl ?? item.htmlUrl);
    case "ExternalTool":
      return external(item.htmlUrl ?? item.externalUrl);
    default: {
      const kind = TODO_KIND[item.type];
      // Graded quizzes and discussions keep their own key: `todos.get`
      // re-resolves it onto the assignment the item really is.
      return kind === undefined || item.contentCanvasId === undefined
        ? external(item.htmlUrl)
        : { kind: "internal", to: todoHref(kind, item.contentCanvasId) };
    }
  }
}

function external(href: string | undefined): ItemTarget {
  return href === undefined || href === "" ? { kind: "none" } : { kind: "external", href };
}

// ── meta ────────────────────────────────────────────────────────────────────

/** The right-hand column of a row: a word, or one of two pills. */
export type ItemStatus =
  | { kind: "text"; text: string }
  | { kind: "overdue" }
  /** Canvas has the work; the pill is a claim about the submission. */
  | { kind: "submitted" }
  | { kind: "none" };

export interface StatusContext {
  files: Map<number, FileDoc>;
  /** Keyed by `todoKey(kind, canvasId)`. */
  todos: Map<string, TodoItem>;
  /** `quiz:<id>` / `discussion:<id>` → the assignment todo Canvas mirrors it as. */
  assignmentOf: Map<string, TodoItem>;
  todayKey: string;
  now: number;
}

export function itemStatus(item: ModuleItemDoc, ctx: StatusContext): ItemStatus {
  switch (item.type) {
    case "SubHeader":
      return { kind: "none" };
    case "Page":
      return { kind: "text", text: "Page" };
    case "File": {
      const file =
        item.contentCanvasId === undefined ? undefined : ctx.files.get(item.contentCanvasId);
      return { kind: "text", text: file === undefined ? "File" : fileMeta(file) };
    }
    case "ExternalTool":
      return { kind: "text", text: "Opens in Canvas" };
    case "ExternalUrl":
      return { kind: "text", text: externalLabel(item.externalUrl ?? item.htmlUrl) };
    default:
      return todoStatus(item, ctx);
  }
}

/** "PDF · 2.4 MB". */
export function fileMeta(file: { filename: string; size: number }): string {
  return `${extensionOf(file.filename).toUpperCase() || "File"} · ${formatBytes(file.size)}`;
}

function todoStatus(item: ModuleItemDoc, ctx: StatusContext): ItemStatus {
  const todo = findTodo(item, ctx);
  if (todo === undefined) {
    // Outside the todo window (or ungraded): say what it is, not when.
    const noun = item.type === "Quiz" || item.type === "Discussion" ? item.type : "Assignment";
    return { kind: "text", text: noun };
  }
  if (todo.submission === "submitted" || todo.submission === "graded") return { kind: "submitted" };
  if (isDone(todo)) return { kind: "text", text: "Done" };
  if (isOverdue(todo, ctx.now)) return { kind: "overdue" };
  return todo.dueAt === undefined
    ? { kind: "none" }
    : { kind: "text", text: dueLabel(todo.dueAt, ctx.todayKey) };
}

/** The todo a module row stands for, by its own key or its assignment's. */
function findTodo(item: ModuleItemDoc, ctx: StatusContext): TodoItem | undefined {
  const kind = TODO_KIND[item.type];
  if (kind === undefined || item.contentCanvasId === undefined) return undefined;
  const key = todoKey(kind, item.contentCanvasId);
  return ctx.todos.get(key) ?? ctx.assignmentOf.get(key);
}

/** "Today" · "Tomorrow" · "Fri" · "Fri Sep 4". */
export function dueLabel(dueAt: number, todayKey: string): string {
  const key = dayKeyOf(dueAt);
  if (key === todayKey) return "Today";
  if (key === addDays(todayKey, 1)) return "Tomorrow";
  const days = daysBetween(todayKey, key);
  return days > 0 && days < 7 ? formatWeekday(key) : formatDayShort(key);
}

function externalLabel(href: string | undefined): string {
  if (href === undefined) return "Link";
  try {
    const host = new URL(href).hostname.replace(/^www\./, "");
    return /(^|\.)instructure\.com$|^canvas\./.test(host) ? "Opens in Canvas" : host;
  } catch {
    return "Link";
  }
}

// ── weeks ───────────────────────────────────────────────────────────────────

function daysBetween(from: string, to: string): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

/** "Week 4 — Threads" → 4. Canvas names are the only week source we get. */
export function weekNumberInName(name: string): number | undefined {
  const match = /week\s*0*(\d{1,2})\b/i.exec(name);
  if (match === null) return undefined;
  const n = Number(match[1]);
  return n >= 1 && n <= 52 ? n : undefined;
}

/** The module name without its "Week 4 —" prefix, when it has one. */
export function moduleTopic(name: string): string {
  return name.replace(/^\s*(module|unit|week)\s*0*\d{1,2}\s*[:.–—-]*\s*/i, "").trim();
}

interface ModuleWeek {
  weekStart: string;
  weekNumber?: number;
}

/** Only instructor-authored teaching dates establish a calendar position. */
function moduleWeek(
  module: Pick<ModuleDoc, "name" | "unlockAt">,
  courseStartKey: string | undefined,
): ModuleWeek | undefined {
  if (courseStartKey === undefined) return undefined;
  const range = teachingRange(module.name, Number(courseStartKey.slice(0, 4)));
  return range === undefined ? undefined : {
    weekStart: startOfMondayWeek(range.start), weekNumber: weekNumberInName(module.name),
  };
}

// Locked modules count too: the weeks still to come are the best dated, and
// a course judged on unlocked modules alone would start as an accordion and
// turn into a timeline as the term went on.
export function shouldUseTimeline(
  modules: ModuleWithItems[],
  courseStartKey: string | undefined,
): boolean {
  if (modules.length < 2) return false;
  const dated = modules.filter((m) => moduleWeek(m, courseStartKey) !== undefined).length;
  return dated / modules.length >= TIMELINE_THRESHOLD;
}

export interface WeekGroup {
  /** The Monday's day key, or "undated". */
  key: string;
  weekStart?: string;
  /** "Week 3", else the Monday's date. */
  label: string;
  /** "Aug 10 – 14", weekdays only. */
  range?: string;
  modules: ModuleWithItems[];
}

export function groupModulesByWeek(
  modules: ModuleWithItems[],
  courseStartKey: string | undefined,
): WeekGroup[] {
  const weeks = new Map<string, { weekNumber?: number; modules: ModuleWithItems[] }>();
  const undated: ModuleWithItems[] = [];

  for (const module of modules) {
    const week = moduleWeek(module, courseStartKey);
    if (week === undefined) {
      undated.push(module);
      continue;
    }
    const existing = weeks.get(week.weekStart);
    if (existing === undefined) {
      weeks.set(week.weekStart, { weekNumber: week.weekNumber, modules: [module] });
    } else {
      existing.weekNumber ??= week.weekNumber;
      existing.modules.push(module);
    }
  }

  const groups: WeekGroup[] = [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, week]) => ({
      key: weekStart,
      weekStart,
      label:
        week.weekNumber === undefined
          ? formatMonthDay(startOfDay(weekStart).getTime())
          : `Week ${week.weekNumber}`,
      range: formatWeekRange(weekStart),
      modules: week.modules.sort((a, b) => a.position - b.position),
    }));

  if (undated.length > 0) {
    groups.push({
      key: "undated",
      label: "Undated",
      modules: undated.sort((a, b) => a.position - b.position),
    });
  }
  return groups;
}

// ── module state ────────────────────────────────────────────────────────────

export interface PageModuleContext {
  module: ModuleWithItems;
  /** Content items only — sub-headers are not steps. */
  items: ModuleItemDoc[];
  index: number;
  item: ModuleItemDoc;
  previous?: ModuleItemDoc;
  next?: ModuleItemDoc;
}

/** Where a page sits in its course's modules. Slugs are unique per course. */
export function findPageModule(
  modules: ModuleWithItems[] | undefined,
  slug: string,
): PageModuleContext | undefined {
  for (const module of modules ?? []) {
    const items = contentItems(module.items);
    const index = items.findIndex((item) => item.type === "Page" && item.pageUrl === slug);
    if (index >= 0) {
      return {
        module,
        items,
        index,
        item: items[index],
        previous: items[index - 1],
        next: items[index + 1],
      };
    }
  }
  return undefined;
}

export function isModuleLocked(module: Pick<ModuleDoc, "state">): boolean {
  return module.state === "locked";
}

/** Items that count towards "3 of 6" — headers are not content. */
export function contentItems(items: ModuleItemDoc[]): ModuleItemDoc[] {
  return items.filter((item) => item.type !== "SubHeader");
}

export function moduleProgress(
  module: ModuleWithItems,
  isSeen: (item: ModuleItemDoc) => boolean,
): { viewed: number; total: number } {
  const items = contentItems(module.items);
  return { viewed: items.filter(isSeen).length, total: items.length };
}

export function itemCountLabel(module: ModuleWithItems): string {
  const n = module.items.length > 0 ? contentItems(module.items).length : (module.itemCount ?? 0);
  return `${n} item${n === 1 ? "" : "s"}`;
}

/** Why a module is closed: a date, else the module that has to come first. */
export function lockReason(
  module: Pick<ModuleDoc, "unlockAt" | "prerequisiteModuleCanvasIds">,
  byId: Map<number, ModuleDoc>,
): string {
  if (module.unlockAt !== undefined) {
    return `Unlocks ${formatDayShort(dayKeyOf(module.unlockAt))}`;
  }
  for (const id of module.prerequisiteModuleCanvasIds) {
    const prereq = byId.get(id);
    if (prereq === undefined) continue;
    const week = weekNumberInName(prereq.name);
    return `Requires ${week === undefined ? prereq.name : `Week ${week}`}`;
  }
  return "Locked";
}

// ── icons ───────────────────────────────────────────────────────────────────

const TYPE_ICON: Partial<Record<ModuleItemDoc["type"], LucideIcon>> = {
  Page: FileText,
  Assignment: SquareCheckBig,
  Quiz: ListChecks,
  Discussion: MessagesSquare,
  ExternalUrl: ExternalLink,
  ExternalTool: ExternalLink,
};

/** Type icon; files narrow further by content type. */
export function itemIcon(item: ModuleItemDoc, files?: Map<number, FileDoc>): LucideIcon {
  if (item.type === "File") {
    const file =
      item.contentCanvasId === undefined ? undefined : files?.get(item.contentCanvasId);
    return file === undefined ? FileIcon : fileIcon(file.contentType, file.filename);
  }
  return TYPE_ICON[item.type] ?? FileIcon;
}
