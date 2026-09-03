import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import { matchCourse, type QuickAddCourse } from "./quickAdd";

export type SearchIndex = FunctionReturnType<typeof api.search.index>;

export type SearchKind =
  | "assignment"
  | "page"
  | "file"
  | "announcement"
  | "module"
  | "course";

/** One searchable thing, flattened out of the per-kind index arrays. */
export interface SearchItem {
  /** Stable across renders; also the listbox option id. */
  id: string;
  kind: SearchKind;
  canvasId: number;
  /** For a course row this is the course itself. */
  courseCanvasId: number;
  title: string;
  /** `title` folded once, for ranking. */
  folded: string;
  htmlUrl: string;
  /** When this thing last changed; a due date is not recency, see `recencyOf`. */
  at?: number;
  // Kind-specific extras, all optional so one row type covers every kind.
  pageSlug?: string;
  folderCanvasId?: number;
  folderPath?: string;
  size?: number;
  dueAt?: number;
  score?: number;
  pointsPossible?: number;
  postedAt?: number;
  updatedAt?: number;
  itemCount?: number;
  courseCode?: string;
}

export interface MatchRange {
  start: number;
  end: number;
}

interface Match {
  score: number;
  /** Character ranges of `title` to embolden, ascending and disjoint. */
  ranges: MatchRange[];
}

interface SearchHit {
  item: SearchItem;
  score: number;
  ranges: MatchRange[];
}

/** Case- and accent-insensitive, but length-preserving: ranges index the original. */
export function fold(s: string): string {
  const lower = s.toLowerCase();
  const base = lower.length === s.length ? lower : s;
  const stripped = base.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return stripped.length === base.length ? stripped : base;
}

const WORD_BREAK = /[\s\-_/.:,·—–([{]/;

// Tiers are far enough apart that the per-match adjustments below can never
// promote one tier above another; within a tier, ties fall through to recency.
const EXACT = 5000;
const PREFIX = 4000;
const WORD = 3000;
const SUBSTRING = 2000;
const FUZZY = 1000;

/** One whitespace-free needle against one haystack; both already folded. */
function matchTerm(term: string, text: string): Match | null {
  if (term.length === 0) return { score: 0, ranges: [] };

  if (text === term) return { score: EXACT, ranges: [range(0, text.length)] };
  if (text.startsWith(term)) return { score: PREFIX, ranges: [range(0, term.length)] };

  for (let i = 1; i <= text.length - term.length; i += 1) {
    if (!WORD_BREAK.test(text[i - 1])) continue;
    if (text.startsWith(term, i)) {
      return { score: WORD - Math.min(i, 100), ranges: [range(i, i + term.length)] };
    }
  }

  const at = text.indexOf(term);
  if (at >= 0) {
    return { score: SUBSTRING - Math.min(at, 100), ranges: [range(at, at + term.length)] };
  }

  return subsequence(term, text);
}

/** Characters in order but not adjacent: "mwsv" → "Multithreaded Web Server". */
function subsequence(term: string, text: string): Match | null {
  const hits: number[] = [];
  let cursor = 0;
  for (const ch of term) {
    const at = text.indexOf(ch, cursor);
    if (at < 0) return null;
    hits.push(at);
    cursor = at + 1;
  }
  const span = hits[hits.length - 1] - hits[0] + 1;
  // Tight, early runs beat characters scattered across a long title.
  const compact = Math.round((100 * term.length) / span);
  return {
    score: FUZZY + compact - Math.min(hits[0], 100),
    ranges: mergeRanges(hits.map((i) => range(i, i + 1))),
  };
}

function range(start: number, end: number): MatchRange {
  return { start, end };
}

function mergeRanges(ranges: MatchRange[]): MatchRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: MatchRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last !== undefined && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** Both arguments already folded. Every word has to match; the weakest sets the tier. */
function matchFolded(query: string, text: string): Match | null {
  if (query.length === 0) return { score: 0, ranges: [] };

  const whole = matchTerm(query, text);
  if (whole !== null && whole.score >= SUBSTRING) return whole;

  const terms = query.split(/\s+/).filter((t) => t.length > 0);
  if (terms.length < 2) return whole;

  let score = Infinity;
  const ranges: MatchRange[] = [];
  for (const term of terms) {
    const m = matchTerm(term, text);
    if (m === null) return null;
    score = Math.min(score, m.score);
    ranges.push(...m.ranges);
  }
  const combined: Match = { score, ranges: mergeRanges(ranges) };
  return whole !== null && whole.score > combined.score ? whole : combined;
}

export function keyOf(kind: SearchKind, id: string | number): string {
  return `${kind}:${id}`;
}

function itemOf(
  kind: SearchKind,
  row: { canvasId: number; courseCanvasId: number; htmlUrl: string },
  title: string,
  extra?: Partial<SearchItem>,
): SearchItem {
  return {
    id: keyOf(kind, row.canvasId),
    kind,
    canvasId: row.canvasId,
    courseCanvasId: row.courseCanvasId,
    title,
    folded: fold(title),
    htmlUrl: row.htmlUrl,
    ...extra,
  };
}

/** Flatten the per-kind arrays into one ranked-over list. */
export function buildSearchItems(index: SearchIndex): SearchItem[] {
  return [
    ...index.courses.map((c) =>
      itemOf("course", { ...c, courseCanvasId: c.canvasId }, c.name, {
        courseCode: c.courseCode,
      }),
    ),
    ...index.assignments.map((a) =>
      itemOf("assignment", a, a.name, {
        dueAt: a.dueAt,
        score: a.score,
        pointsPossible: a.pointsPossible,
      }),
    ),
    ...index.pages.map((p) =>
      itemOf("page", p, p.title, { at: p.updatedAt, updatedAt: p.updatedAt, pageSlug: p.url }),
    ),
    ...index.files.map((f) =>
      itemOf("file", f, f.displayName, {
        at: f.updatedAt,
        updatedAt: f.updatedAt,
        folderCanvasId: f.folderCanvasId,
        folderPath: f.folderPath,
        size: f.size,
      }),
    ),
    ...index.announcements.map((a) =>
      itemOf("announcement", a, a.title, { at: a.postedAt, postedAt: a.postedAt }),
    ),
    ...index.modules.map((m) => itemOf("module", m, m.name, { itemCount: m.itemCount })),
  ];
}

/**
 * How "current" an item is, higher first. An assignment's only timestamp runs
 * into the future, so it is folded around `now`: nearest to today wins.
 */
function recencyOf(item: SearchItem, now: number): number {
  if (item.kind === "assignment") {
    return item.dueAt === undefined ? 0 : now - Math.abs(now - item.dueAt);
  }
  return item.at ?? 0;
}

/** Rank, drop the misses, order by score then recency. Empty query keeps everything. */
export function rankItems(items: SearchItem[], query: string, now: number): SearchHit[] {
  const q = fold(query.trim());
  if (q.length === 0) {
    return [...items]
      .sort(
        (a, b) => recencyOf(b, now) - recencyOf(a, now) || a.title.localeCompare(b.title),
      )
      .map((item) => ({ item, score: 0, ranges: [] }));
  }

  const hits: SearchHit[] = [];
  for (const item of items) {
    const m = matchFolded(q, item.folded);
    if (m === null) continue;
    hits.push({ item, score: m.score, ranges: m.ranges });
  }
  hits.sort(
    (a, b) =>
      b.score - a.score ||
      recencyOf(b.item, now) - recencyOf(a.item, now) ||
      a.item.title.localeCompare(b.item.title),
  );
  return hits;
}

interface ScopedQuery {
  /** The query with a resolved `#code` removed. */
  query: string;
  courseCanvasId?: number;
}

/** The first `#tag` that resolves to a course scopes the palette and drops out. */
export function parseScopedQuery(raw: string, courses: QuickAddCourse[]): ScopedQuery {
  const words = raw.split(/\s+/).filter((w) => w.length > 0);
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (!word.startsWith("#") || word.length < 2) continue;
    // A tag still being typed (`#c`) only scopes on an exact code/nickname
    // match; once a space follows it, prefix matching kicks in.
    const complete = i < words.length - 1 || /\s$/.test(raw);
    const course = matchCourse(word.slice(1), courses, { exact: !complete });
    if (course === undefined) continue;
    return {
      query: [...words.slice(0, i), ...words.slice(i + 1)].join(" "),
      courseCanvasId: course.canvasId,
    };
  }
  return { query: raw };
}

export type TypeFilter = "all" | "assignment" | "page" | "file" | "announcement" | "course";

export const TYPE_FILTERS: { id: TypeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "assignment", label: "Assignments" },
  { id: "page", label: "Pages" },
  { id: "file", label: "Files" },
  { id: "announcement", label: "Announcements" },
  { id: "course", label: "Courses" },
];

export function filterByType(items: SearchItem[], filter: TypeFilter): SearchItem[] {
  if (filter === "all") return items;
  return items.filter((item) => item.kind === filter);
}

export type GroupId =
  | "assignments"
  | "pagesFiles"
  | "pages"
  | "files"
  | "announcements"
  | "modules"
  | "courses";

const GROUP_OF: Record<SearchKind, GroupId> = {
  assignment: "assignments",
  page: "pagesFiles",
  file: "pagesFiles",
  announcement: "announcements",
  module: "modules",
  course: "courses",
};

/** Pages and files split apart once a course scope makes the extra header worth its line. */
const SPLIT_GROUP_OF: Partial<Record<SearchKind, GroupId>> = { page: "pages", file: "files" };

/** Insertion order is render order. */
const GROUP_LABEL: Record<GroupId, string> = {
  assignments: "Assignments",
  pagesFiles: "Pages · Files",
  pages: "Pages",
  files: "Files",
  announcements: "Announcements",
  modules: "Modules",
  courses: "Courses",
};

interface SearchGroup {
  id: GroupId;
  label: string;
  hits: SearchHit[];
}

/** Groups render in a fixed order and only when non-empty. */
export function groupHits(hits: SearchHit[], splitPagesFiles: boolean): SearchGroup[] {
  const buckets = new Map<GroupId, SearchHit[]>();
  for (const hit of hits) {
    const id =
      (splitPagesFiles ? SPLIT_GROUP_OF[hit.item.kind] : undefined) ?? GROUP_OF[hit.item.kind];
    const bucket = buckets.get(id);
    if (bucket === undefined) buckets.set(id, [hit]);
    else bucket.push(hit);
  }
  return (Object.keys(GROUP_LABEL) as GroupId[])
    .map((id) => ({ id, label: GROUP_LABEL[id], hits: buckets.get(id) ?? [] }))
    .filter((group) => group.hits.length > 0);
}

type ActionId = "new-task" | "sync" | "theme";

/** One selectable line. The palette flattens its sections into these. */
export type Entry =
  | {
      id: string;
      type: "result";
      item: SearchItem;
      ranges: MatchRange[];
      /** "seen at" for a Recent row, rendered on the right. */
      ago?: number;
      kbd?: string;
    }
  | { id: string; type: "action"; action: ActionId; label: string; note?: string; kbd?: string }
  | { id: string; type: "showAll"; group: GroupId; label: string };

export interface EntrySection {
  id: string;
  label: string;
  entries: Entry[];
}

/** DOM id for a row; entry ids carry colons, `aria-activedescendant` cannot. */
export function rowDomId(entryId: string): string {
  return `ck-${entryId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}
