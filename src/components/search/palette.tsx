import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { LoaderCircle, Search, SearchX, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Kbd } from "@/components/app/bits";
import { PaletteRow, type RowContext } from "./palette-row";
import { PreviewPane } from "./preview-pane";
import {
  announcementsHref,
  courseHref,
  fileHref,
  moduleHref,
  pageHref,
  todoHref,
} from "@/lib/course-routes";
import { formatSince } from "@/lib/dates";
import { courseLabel, courseStyle, courseTitle, useCourses } from "@/lib/hooks";
import { normalizeCode } from "@/lib/quickAdd";
import { useQuickAdd } from "@/lib/quick-add-context";
import {
  buildSearchItems,
  filterByType,
  groupHits,
  keyOf,
  matchRanges,
  parseScopedQuery,
  rankItems,
  rowDomId,
  TYPE_FILTERS,
  type Entry,
  type EntrySection,
  type GroupId,
  type SearchIndex,
  type SearchItem,
  type SearchKind,
  type TypeFilter,
} from "@/lib/search";
import { useSeen, type Seen, type SeenKind } from "@/lib/seen";
import { setTheme } from "@/lib/theme";
import { useSyncInfo } from "@/lib/sync-info";
import { cn } from "@/lib/utils";

/** How many rows a group shows before "Show all n". */
const GROUP_PREVIEW = 3;

const NO_GROUPS: ReadonlySet<GroupId> = new Set();

type Recents = FunctionReturnType<typeof api.seenState.recent>;

/** Seen kinds ⌘K can turn back into a row; `discussion` ids only name announcements. */
const RECENT_TO_KIND: Partial<Record<SeenKind, SearchKind>> = {
  page: "page",
  file: "file",
  discussion: "announcement",
  assignment: "assignment",
  grade: "assignment",
  assignmentChange: "assignment",
};

const MODULE_KIND: Partial<Record<string, SearchKind>> = {
  Assignment: "assignment",
  Quiz: "assignment",
  File: "file",
  Discussion: "announcement",
  Page: "page",
};

export interface PaletteProps {
  mobile: boolean;
  scope: number | undefined;
  index: SearchIndex | undefined;
  recents: Recents | undefined;
  onScope: (courseCanvasId: number | undefined) => void;
  onClose: () => void;
}

export function Palette({ mobile, scope, index, recents, onScope, onClose }: PaletteProps) {
  const navigate = useNavigate();
  const quickAdd = useQuickAdd();
  const info = useSyncInfo();
  const requestSync = useMutation(api.sync.requestSync);
  const { current: currentCourses, visible, byId, label, color } = useCourses();
  const [now] = useState(() => Date.now());

  const modules = useQuery(
    api.modules.listByCourse,
    scope === undefined ? "skip" : { courseCanvasId: scope },
  );

  const seen: Partial<Record<SearchKind, Seen>> = {
    assignment: useSeen("assignment"),
    page: useSeen("page"),
    file: useSeen("file"),
    announcement: useSeen("discussion"),
  };

  const [query, setQuery] = useState("");
  const [rawFilter, setRawFilter] = useState<TypeFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filter: TypeFilter = scope !== undefined && rawFilter === "course" ? "all" : rawFilter;

  // "Show all" is remembered against the result set it was pressed on, so a
  // new query collapses the groups again without an effect to reset it.
  const resultKey = `${scope ?? ""}|${filter}|${query.trim()}`;
  const [openGroups, setOpenGroups] = useState<{ key: string; groups: ReadonlySet<GroupId> }>({
    key: "",
    groups: NO_GROUPS,
  });
  const expanded = openGroups.key === resultKey ? openGroups.groups : NO_GROUPS;

  const items = useMemo(() => (index === undefined ? [] : buildSearchItems(index)), [index]);
  const byKey = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const pool = useMemo(() => {
    const inScope =
      scope === undefined
        ? items
        : items.filter((i) => i.courseCanvasId === scope && i.kind !== "course");
    return filterByType(inScope, filter);
  }, [items, scope, filter]);

  const hits = useMemo(() => rankItems(pool, query, now), [pool, query, now]);
  const groups = useMemo(() => groupHits(hits, scope !== undefined), [hits, scope]);

  const onChange = (value: string) => {
    const parsed = parseScopedQuery(value, currentCourses);
    if (parsed.courseCanvasId !== undefined) onScope(parsed.courseCanvasId);
    setQuery(parsed.courseCanvasId === undefined ? value : parsed.query);
  };

  const moduleContext = useMemo(() => {
    const context = new Map<string, { name: string; next?: string }>();
    for (const module of modules ?? []) {
      module.items.forEach((item, i) => {
        const kind = MODULE_KIND[item.type];
        const id = kind === "page" ? item.pageUrl : item.contentCanvasId;
        if (kind === undefined || id === undefined) return;
        context.set(keyOf(kind, id), { name: module.name, next: module.items[i + 1]?.title });
      });
    }
    return context;
  }, [modules]);

  const itemKey = (item: SearchItem) =>
    keyOf(item.kind, item.kind === "page" ? (item.pageSlug ?? "") : item.canvasId);

  const rowContext = (entry: Entry): RowContext => {
    if (entry.type !== "result") return { courseColor: color(undefined), now };
    const item = entry.item;
    return {
      courseLabel: scope !== undefined ? undefined : label(item.courseCanvasId),
      courseColor: color(item.courseCanvasId),
      moduleName: scope === undefined ? undefined : moduleContext.get(itemKey(item))?.name,
      now,
    };
  };

  const browsing = scope === undefined && filter === "all" && query.trim().length < 2;

  const sections: EntrySection[] = [];
  if (browsing) {
    sections.push({
      id: "actions",
      label: "Actions",
      entries: [
        { id: "action:new-task", type: "action", action: "new-task", label: "New task" },
        {
          id: "action:sync",
          type: "action",
          action: "sync",
          label: "Sync now",
          note: syncNote(info, now),
        },
        { id: "action:theme", type: "action", action: "theme", label: "Toggle theme" },
      ],
    });

    const recent: Entry[] = [];
    const used = new Set<string>();
    for (const row of recents ?? []) {
      const kind = RECENT_TO_KIND[row.kind];
      const item = kind === undefined ? undefined : byKey.get(keyOf(kind, row.canvasId));
      if (item === undefined || used.has(item.id)) continue;
      used.add(item.id);
      recent.push({ id: `recent:${item.id}`, type: "result", item, ranges: [], ago: row.seenAt });
      if (recent.length === 5) break;
    }
    if (recent.length > 0) sections.push({ id: "recent", label: "Recent", entries: recent });

    if (visible.length > 0) {
      sections.push({
        id: "goto",
        label: "Go to",
        entries: visible.slice(0, 9).map((course, i) => ({
          id: `goto:${course.canvasId}`,
          type: "result",
          item: {
            id: keyOf("course", course.canvasId),
            kind: "course",
            canvasId: course.canvasId,
            courseCanvasId: course.canvasId,
            title: courseTitle(course),
            folded: "",
            htmlUrl:
              byKey.get(keyOf("course", course.canvasId))?.htmlUrl ?? courseHref(course.canvasId),
            courseCode: course.courseCode,
          },
          ranges: [],
          kbd: `⌥${i + 1}`,
        })),
      });
    }
  } else {
    for (const group of groups) {
      const open = expanded.has(group.id);
      const shown = open ? group.hits : group.hits.slice(0, GROUP_PREVIEW);
      const entries: Entry[] = shown.map((hit) => {
        // Courses read by their plain title; the short code sits in the course column.
        const course = hit.item.kind === "course" ? byId.get(hit.item.canvasId) : undefined;
        if (course === undefined) {
          return { id: hit.item.id, type: "result", item: hit.item, ranges: hit.ranges };
        }
        const title = courseTitle(course);
        return {
          id: hit.item.id,
          type: "result",
          item: { ...hit.item, title },
          ranges: matchRanges(query, title),
        };
      });
      if (!open && group.hits.length > shown.length) {
        entries.push({
          id: `show-all:${group.id}`,
          type: "showAll",
          group: group.id,
          label: `Show all ${group.hits.length}`,
        });
      }
      sections.push({ id: group.id, label: group.label, entries });
    }

    if (query.trim().length >= 2) {
      sections.push({
        id: "actions",
        label: "Actions",
        entries: [
          {
            id: "action:new-task",
            type: "action",
            action: "new-task",
            label: `New task “${query.trim()}”`,
          },
        ],
      });
    }
  }

  const entries = sections.flatMap((s) => s.entries);
  const activeIndex = Math.max(
    0,
    entries.findIndex((e) => e.id === selectedId),
  );
  const current = entries[activeIndex];

  useEffect(() => {
    if (current === undefined) return;
    document.getElementById(rowDomId(current.id))?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const activate = (entry: Entry | undefined, inCanvas: boolean) => {
    if (entry === undefined) return;
    if (entry.type === "showAll") {
      setOpenGroups((prev) => ({
        key: resultKey,
        groups: new Set(prev.key === resultKey ? prev.groups : []).add(entry.group),
      }));
      const revealed = groups.find((g) => g.id === entry.group)?.hits[GROUP_PREVIEW];
      if (revealed !== undefined) setSelectedId(revealed.item.id);
      return;
    }
    if (entry.type === "action") {
      if (entry.action === "new-task") {
        onClose();
        quickAdd.open(query.trim());
      } else if (entry.action === "sync") {
        void requestSync({});
        onClose();
      } else {
        // Left open on purpose: you want to see what you just switched to.
        setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark");
      }
      return;
    }
    if (inCanvas) {
      window.open(entry.item.htmlUrl, "_blank", "noopener,noreferrer");
      return;
    }
    onClose();
    void navigate({ to: internalHref(entry.item) });
  };

  const move = (delta: number) => {
    if (entries.length === 0) return;
    const next = (activeIndex + delta + entries.length) % entries.length;
    setSelectedId(entries[next].id);
  };

  const cycleFilter = (delta: number) => {
    const list = filterTabs(scope !== undefined);
    const at = list.findIndex((t) => t.id === filter);
    setRawFilter(list[(at + delta + list.length) % list.length].id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      activate(current, event.metaKey || event.ctrlKey);
    } else if (event.key === "Tab") {
      event.preventDefault();
      cycleFilter(event.shiftKey ? -1 : 1);
    } else if (event.key === "Backspace" && query.length === 0 && scope !== undefined) {
      event.preventDefault();
      onScope(undefined);
    } else if (event.altKey && !event.metaKey && !event.ctrlKey) {
      const digit = /^Digit([1-9])$/.exec(event.code);
      const course = digit === null ? undefined : visible[Number(digit[1]) - 1];
      if (course !== undefined) {
        event.preventDefault();
        onClose();
        void navigate({ to: courseHref(course.canvasId) });
      }
    }
  };

  const scopeCourse = scope === undefined ? undefined : byId.get(scope);
  const tabs = filterTabs(scope !== undefined);
  const showTabs = mobile || browsing || filter !== "all";
  const previewItem = current?.type === "result" ? current.item : undefined;
  const previewModule = previewItem === undefined ? undefined : moduleContext.get(itemKey(previewItem));
  const noMatches = !browsing && index !== undefined && hits.length === 0 && entries.length > 0;
  const example = visible[0] === undefined ? undefined : normalizeCode(courseLabel(visible[0]));

  return (
    <div className={cn("flex min-h-0 flex-col", mobile && "h-full")}>
      <div
        className={cn(
          "flex shrink-0 items-center gap-3 border-b border-line",
          mobile ? "h-14 pr-3 pl-4" : "h-14 px-[18px]",
        )}
      >
        <Search className="size-[17px] shrink-0 text-ink-3" />
        {scopeCourse !== undefined && (
          <span
            style={courseStyle(color(scopeCourse.canvasId))}
            className="inline-flex h-[26px] shrink-0 items-center gap-[6px] rounded-full bg-chip pr-[5px] pl-[10px] text-[12.5px] font-medium text-ink-2"
          >
            <span className="size-[7px] rounded-full bg-c" />
            {courseLabel(scopeCourse)}
            <button
              type="button"
              aria-label="Clear course scope"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onScope(undefined);
                inputRef.current?.focus();
              }}
              className="grid size-[18px] place-items-center rounded-full text-ink-3 transition-colors hover:bg-hover hover:text-ink"
            >
              <X className="size-[11px]" />
            </button>
          </span>
        )}
        <input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            scopeCourse === undefined
              ? "Search assignments, pages, files…"
              : `Search ${courseLabel(scopeCourse)}…`
          }
          spellCheck={false}
          autoComplete="off"
          role="combobox"
          aria-expanded
          aria-controls="ck-list"
          aria-label="Search"
          aria-activedescendant={current === undefined ? undefined : rowDomId(current.id)}
          className="min-w-0 flex-1 bg-transparent text-[16px] tracking-[-0.01em] outline-none placeholder:text-ink-3"
        />
        {mobile ? (
          <button
            type="button"
            onClick={onClose}
            className="h-8 shrink-0 rounded-md px-2 text-[14px] font-medium text-ink-2 transition-colors hover:bg-hover"
          >
            Cancel
          </button>
        ) : (
          <Kbd className="shrink-0">esc</Kbd>
        )}
      </div>

      {showTabs && (
        <div
          className={cn(
            "flex shrink-0 gap-1 border-b border-line px-3 py-2",
            mobile && "overflow-x-auto whitespace-nowrap [scrollbar-width:none]",
          )}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              // Focus has to stay in the input: it owns the keymap, and the
              // app listens for bare keys everywhere else.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setRawFilter(tab.id)}
              aria-pressed={tab.id === filter}
              className={cn(
                "flex h-7 shrink-0 items-center rounded-md px-[10px] text-[12.5px] font-medium transition-colors",
                tab.id === filter
                  ? "bg-chip text-ink shadow-[inset_0_0_0_1px_var(--line)]"
                  : "text-ink-3 hover:bg-hover hover:text-ink-2",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div
          id="ck-list"
          role="listbox"
          aria-label="Results"
          className={cn(
            "min-w-0 flex-1 overflow-y-auto px-2 pb-2",
            mobile ? "" : "max-h-[min(460px,62vh)]",
          )}
        >
          {noMatches && (
            <div className="flex flex-col items-center gap-[6px] px-4 pt-8 pb-4 text-center">
              <SearchX className="size-[18px] text-ink-3" />
              <p className="text-[13.5px] font-medium text-ink">No results for “{query.trim()}”</p>
              <p className="text-[12.5px] text-ink-3">
                {filter === "all"
                  ? "Try fewer letters, or part of a word."
                  : "Try another filter, or fewer letters."}
              </p>
            </div>
          )}
          {entries.length === 0 ? (
            <div className="flex flex-col items-center gap-[6px] px-4 py-10 text-center">
              {index === undefined ? (
                <>
                  <LoaderCircle className="size-[18px] animate-spin text-ink-3 motion-reduce:animate-none" />
                  <p className="text-[13px] text-ink-3">Loading your courses…</p>
                </>
              ) : query.trim().length === 0 ? (
                <>
                  <Search className="size-[18px] text-ink-3" />
                  <p className="text-[13px] text-ink-2">Nothing here yet</p>
                </>
              ) : (
                <>
                  <SearchX className="size-[18px] text-ink-3" />
                  <p className="text-[13.5px] font-medium text-ink">
                    No results for “{query.trim()}”
                  </p>
                  <p className="text-[12.5px] text-ink-3">
                    {filter === "all"
                      ? "Try fewer letters, or part of a word."
                      : "Try another filter, or fewer letters."}
                  </p>
                </>
              )}
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.id} role="group" aria-labelledby={`ck-g-${section.id}`}>
                <div
                  id={`ck-g-${section.id}`}
                  className="px-3 pt-[14px] pb-[6px] text-[12px] font-medium text-ink-3"
                >
                  {section.label}
                </div>
                {section.entries.map((entry) => (
                  <PaletteRow
                    key={entry.id}
                    entry={entry}
                    active={entry.id === current?.id}
                    mobile={mobile}
                    context={rowContext(entry)}
                    onActivate={() => activate(entry, false)}
                    onHover={() => setSelectedId(entry.id)}
                  />
                ))}
              </div>
            ))
          )}
        </div>

        {scope !== undefined && !mobile && (
          <PreviewPane
            item={previewItem}
            moduleName={previewModule?.name}
            nextTitle={previewModule?.next}
            seenTracked={previewItem !== undefined && seen[previewItem.kind] !== undefined}
            seenAt={
              previewItem === undefined
                ? undefined
                : seen[previewItem.kind]?.seenAt(previewItem.canvasId)
            }
          />
        )}
      </div>

      {!mobile && (
        <div className="flex h-10 shrink-0 items-center gap-4 border-t border-line bg-sunken px-[18px] text-[12px] text-ink-3">
          {scope !== undefined ? (
            <>
              <Hint kbd="↑↓">move</Hint>
              <Hint kbd="↵">open</Hint>
              <Hint kbd="⌘↵">open in Canvas</Hint>
              <span className="ml-auto">
                <Hint kbd="⌫">all courses</Hint>
              </span>
            </>
          ) : browsing ? (
            <>
              <Hint kbd="↑↓">move</Hint>
              <Hint kbd="↵">open</Hint>
              <Hint kbd="⇥">filter</Hint>
              {example !== undefined && (
                <span className="ml-auto">
                  Type <span className="font-medium text-ink-2">#{example}</span> to search one
                  course
                </span>
              )}
            </>
          ) : (
            <>
              <Hint kbd="↑↓">move</Hint>
              <Hint kbd="↵">open</Hint>
              <Hint kbd="⌘↵">open in Canvas</Hint>
              <span className="ml-auto tabular">
                {hits.length} result{hits.length === 1 ? "" : "s"}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Hint({ kbd, children }: { kbd: string; children: string }) {
  return (
    <span className="flex items-center gap-[6px]">
      <Kbd className="min-w-[20px] text-center">{kbd}</Kbd>
      {children}
    </span>
  );
}

function filterTabs(scoped: boolean) {
  return scoped ? TYPE_FILTERS.filter((t) => t.id !== "course") : TYPE_FILTERS;
}

function syncNote(info: ReturnType<typeof useSyncInfo>, now: number): string {
  if (info === undefined || !info.connected) return "not connected";
  if (info.syncing) return "syncing…";
  if (info.lastSyncedAt === undefined) return "never synced";
  return `last ${formatSince(info.lastSyncedAt, now)}`;
}

function internalHref(item: SearchItem): string {
  switch (item.kind) {
    case "assignment":
      return todoHref("assignment", item.canvasId);
    case "page":
      return pageHref(item.courseCanvasId, item.pageSlug ?? "");
    case "file":
      return fileHref(item.courseCanvasId, item.canvasId, item.folderCanvasId);
    case "announcement":
      return announcementsHref(item.courseCanvasId, item.canvasId);
    case "module":
      return moduleHref(item.courseCanvasId, item.canvasId);
    case "course":
      return courseHref(item.canvasId);
  }
}
