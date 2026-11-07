import { createElement, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, ChevronRight, ExternalLink, type LucideIcon } from "lucide-react";
import { ROW_ICON } from "./overview-icons";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { CourseMap } from "../../../convex/lib/courseMap";
import { CanvasHtml } from "@/components/reader/canvas-html";
import {
  defaultSection,
  formatDay,
  instructorSection,
  sectionResources,
  type MapResource,
} from "@/lib/interpreted-course";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ModuleWithItems } from "./module-utils";
import { cn } from "@/lib/utils";

function PageReader({
  courseId,
  slug,
  section,
  explicit,
}: {
  courseId: number;
  slug: string;
  section: string;
  explicit: boolean;
}) {
  const page = useQuery(api.pages.get, { courseCanvasId: courseId, url: slug });
  if (page === undefined)
    return (
      <p className="p-4 text-sm text-ink-3" role="status">
        Loading material…
      </p>
    );
  if (!page || page.contentUnavailable || page.lockedForUser || !page.published)
    return (
      <p className="p-4 text-sm text-ink-3">
        This page is currently unavailable. Open the original course material
        from the navigation above.
      </p>
    );
  const html = explicit
    ? page.body
    : instructorSection(page.body ?? "", section);
  if (!html) return null;
  return (
    <div className="mt-4 min-w-0 overflow-x-auto border-t border-line pt-4">
      <CanvasHtml html={html} courseId={courseId} />
    </div>
  );
}

type Section = CourseMap["sections"][number];
type Entry = NonNullable<Section["entries"]>[number];

/** Resource rows: the overview's row rhythm, hairlines inset to the title. */
const RES_ITEM =
  "relative after:absolute after:right-4 after:bottom-0 after:left-[43px] after:h-px after:bg-line last:after:hidden md:after:right-6 md:after:left-[51px]";
const RES_ROW =
  "group flex items-start gap-3 px-4 py-[10px] text-[14px] leading-[1.4] tracking-[-0.006em] text-ink no-underline transition-colors outline-none hover:bg-hover focus-visible:bg-hover md:px-6";
const RES_ICON = "mt-[2px] size-[15px] shrink-0 text-ink-3";
const RES_CHEVRON = `${RES_ICON} opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-aria-pressed:opacity-100`;

/** The kind a resource's link points at, drawn with the overview's row icons. */
function resourceIcon(href: string): LucideIcon {
  if (/^https?:\/\//i.test(href)) return ExternalLink;
  const todo = /^\/todo\/(assignment|quiz|discussion):/.exec(href)?.[1];
  if (todo === "quiz") return ROW_ICON.Quiz;
  if (todo === "discussion") return ROW_ICON.Discussion;
  if (todo === "assignment") return ROW_ICON.Assignment;
  if (/\/files(\?|\/|$)/.test(href)) return ROW_ICON.File;
  return ROW_ICON.Page;
}

/** A chapter's groups in calendar order; undated ones go last, in their own order. */
function byDate(entries: Entry[]): Entry[] {
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      if (a.e.date && b.e.date && a.e.date !== b.e.date) return a.e.date < b.e.date ? -1 : 1;
      if (!a.e.date !== !b.e.date) return a.e.date ? -1 : 1;
      return a.i - b.i;
    })
    .map(({ e }) => e);
}

/** Every date a section carries: its teaching range and its groups' days. */
function sectionDays(s: Section): string[] {
  return [
    ...(s.teachingDates ? [s.teachingDates.start, s.teachingDates.end] : []),
    ...(s.entries ?? []).flatMap((e) => (e.date ? [e.date] : [])),
  ].sort();
}

/**
 * The section to open on: the one whose dates bracket today, else the next
 * one to start, else the last one that ran; undated maps fall back to the
 * first chapter. Presentation only — reads dates already in the map.
 */
function currentSection(map: CourseMap, today: string): string {
  const spans = map.sections.flatMap((s) => {
    const days = sectionDays(s);
    return days.length ? [{ id: s.id, start: days[0], end: days[days.length - 1] }] : [];
  });
  const by = (key: "start" | "end", dir: 1 | -1) => (a: (typeof spans)[number], b: (typeof spans)[number]) =>
    a[key] < b[key] ? -dir : a[key] > b[key] ? dir : 0;
  return (
    spans.filter((s) => s.start <= today && s.end >= today).sort(by("start", -1))[0] ??
    spans.filter((s) => s.start > today).sort(by("start", 1))[0] ??
    spans.filter((s) => s.end < today).sort(by("end", -1))[0]
  )?.id ?? defaultSection(map, today);
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** "Today" / "This week" (the next seven days) / "Up next" for the first group not yet behind us. */
function nowLabel(date: string, today: string): string {
  if (date === today) return "Today";
  return daysBetween(today, date) < 7 ? "This week" : "Up next";
}

const STEP =
  "grid size-8 shrink-0 place-items-center rounded-lg border border-line text-ink-2 transition-colors outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-line-2 disabled:pointer-events-none disabled:opacity-40";

/**
 * Which chapter (or week) is open: the full title in a menu trigger, never
 * cut short, with a step back and forward beside it.
 */
function SectionSwitcher({
  label,
  noun,
  sections,
  active,
  onSelect,
}: {
  label: string;
  /** "chapter" / "week" / "section", for the trigger's tooltip. */
  noun: string;
  sections: Section[];
  active: string;
  onSelect: (id: string) => void;
}) {
  const index = sections.findIndex((s) => s.id === active);
  const current = sections[index];
  return (
    <nav aria-label={label} className="flex items-start gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${current?.title ?? ""}, ${index + 1} of ${sections.length}. Jump to ${noun}`}
          title={`Jump to ${noun}`}
          className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface py-[6px] pr-[10px] pl-3 text-left text-[13px] leading-[18px] font-medium text-ink transition-colors outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-line-2 data-[state=open]:bg-hover md:max-w-max md:flex-initial"
        >
          <span className="min-w-0 flex-1">{current?.title}</span>
          <span className="tabular shrink-0 text-[12px] font-normal text-ink-3">
            {index + 1} of {sections.length}
          </span>
          <ChevronDown className="size-[14px] shrink-0 text-ink-3" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-[min(440px,var(--radix-dropdown-menu-content-available-height))] w-max max-w-[min(440px,calc(100vw-32px))] min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
        >
          {sections.map((s) => (
            <DropdownMenuItem
              key={s.id}
              onSelect={() => onSelect(s.id)}
              aria-current={s.id === active ? "true" : undefined}
              className={cn(
                "h-auto min-h-8 py-[6px] leading-[18px] whitespace-normal",
                s.id === active && "font-medium",
              )}
            >
              <span className="min-w-0 flex-1">{s.title}</span>
              <Check className={cn(s.id !== active && "invisible")} aria-hidden />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {([-1, 1] as const).map((dir) => {
        const next = sections[index + dir];
        return (
          <button
            key={dir}
            type="button"
            aria-label={dir < 0 ? "Previous section" : "Next section"}
            title={next?.title}
            disabled={next === undefined}
            onClick={() => next && onSelect(next.id)}
            className={STEP}
          >
            <ChevronRight className={cn("size-4", dir < 0 && "rotate-180")} aria-hidden />
          </button>
        );
      })}
    </nav>
  );
}

export function InterpretedOverview({
  map,
  resources,
  modules,
  courseId,
  today,
}: {
  map: CourseMap;
  resources: MapResource[];
  modules: ModuleWithItems[];
  courseId: string;
  today: string;
}) {
  const [selection, setSelection] = useState<string>();
  const [page, setPage] = useState<string>();
  const active =
    map.sections.find((s) => s.id === selection) ??
    map.sections.find((s) => s.id === currentSection(map, today))!;
  const byId = new Map(resources.map((r) => [r.id, r]));
  const resolve = (ids: string[]) =>
    sectionResources(ids, resources, modules, courseId);
  const rows = resolve(active.resourceIds);

  const select = (id: string) => {
    setSelection(id);
    setPage(undefined);
  };
  const entries = byDate(active.entries ?? []);
  const nextEntry = entries.find((e) => e.date && e.date >= today);
  const chapterLayout = map.sections.some((s) =>
    /^chapter\s+\d/i.test(s.title),
  );
  const weekly =
    map.organization === "weekly" ||
    map.sections.some((s) => s.kind === "week" && s.entries?.length);
  const cards = map.organization === "resources";
  const source = active.evidence.find((e) =>
    e.sourceId.startsWith("page:"),
  )?.sourceId;
  const shownPage = page ?? source;
  const covered = new Set(
    map.sections.flatMap((s) =>
      resolve([
        ...s.resourceIds,
        ...(s.entries ?? []).flatMap((e) => e.resourceIds),
      ]).map((r) => r.href),
    ),
  );
  map.essentials.forEach((e) => {
    const r = byId.get(e.resourceId);
    if (r) covered.add(r.href);
  });
  const other = resources.filter(
    (r) =>
      !covered.has(r.href) &&
      !r.id.startsWith("module:") &&
      !r.id.startsWith("item:"),
  );
  const essentials = map.essentials.flatMap((e) => {
    const r = byId.get(e.resourceId);
    return r ? [{ label: e.label, href: r.href }] : [];
  });
  const planTitle = chapterLayout
    ? "Chapters"
    : weekly
      ? "Weekly course plan"
      : "Course materials";
  const review = (
    <Link
      to="/courses/$courseId/interpretation"
      params={{ courseId }}
      className="shrink-0 text-[12px] text-ink-3 transition-colors hover:text-ink"
    >
      Review AI grouping
      {map.conflicts.length > 0 && ` · ${map.conflicts.length} flagged`}
    </Link>
  );
  return (
    <section className="px-4 pt-6 pb-5 md:px-6">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-semibold tracking-[-0.005em] text-ink">
          {essentials.length > 0 ? "Course resources" : planTitle}
        </h2>
        {review}
      </div>
      {essentials.length > 0 && (
        <>
          <ul className="-mx-4 mb-6 md:-mx-6" aria-label="Course resources">
            {essentials.map((e, i) => (
              <li key={i} className={RES_ITEM}>
                <Link to={e.href} className={RES_ROW}>
                  {createElement(resourceIcon(e.href), { className: RES_ICON })}
                  <span className="min-w-0 flex-1">{e.label}</span>
                  <ChevronRight className={RES_CHEVRON} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <h2 className="mb-3 text-[13px] font-semibold tracking-[-0.005em] text-ink">{planTitle}</h2>
        </>
      )}
      {cards ? (
        <nav aria-label="Course sections" className="grid gap-1 sm:grid-cols-2">
          {map.sections.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={s.id === active.id}
              onClick={() => select(s.id)}
              className={cn(
                "rounded-md border px-3 py-[5px] text-left text-[12.5px] leading-[18px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-line-2",
                s.id === active.id
                  ? "border-line-2 bg-chip font-medium text-ink"
                  : "border-line text-ink-2 hover:bg-hover hover:text-ink",
              )}
            >
              {s.title}
            </button>
          ))}
        </nav>
      ) : (
        <SectionSwitcher
          label={chapterLayout ? "Chapter navigation" : "Course sections"}
          noun={chapterLayout ? "chapter" : weekly ? "week" : "section"}
          sections={map.sections}
          active={active.id}
          onSelect={select}
        />
      )}
      <div className="mt-4 min-w-0" aria-label="Selected course section">
        {active.teachingDates && !active.entries?.length && (
          <p className="tabular text-[12.5px] text-ink-3">
            {formatDay(active.teachingDates.start)}
            {active.teachingDates.end !== active.teachingDates.start &&
              ` – ${formatDay(active.teachingDates.end)}`}
          </p>
        )}
        {entries.length > 0 && (
          <ol aria-label={`${active.title} schedule`}>
            {entries.map((e, i) => {
              const links = resolve(e.resourceIds);
              const marker = e === nextEntry && e.date ? nowLabel(e.date, today) : undefined;
              return (
                <li
                  key={i}
                  aria-current={marker === "Today" ? "date" : undefined}
                  className="relative py-4 after:absolute after:right-0 after:bottom-0 after:left-0 after:h-px after:bg-line last:after:hidden first:pt-1"
                >
                  {(e.date || marker) && (
                    <p className="tabular mb-[3px] flex items-center gap-2 text-[12.5px] leading-[18px] text-ink-3">
                      {e.date && formatDay(e.date)}
                      {marker && (
                        <span className="rounded-full bg-chip px-[7px] text-[12px] leading-[18px] font-medium text-ink-2">
                          {marker}
                        </span>
                      )}
                    </p>
                  )}
                  <p className="text-[15px] leading-[1.35] font-semibold tracking-[-0.01em] text-ink">
                    {e.title}
                  </p>
                  {links.length > 0 && (
                    <ul className="mt-2 space-y-[5px]">
                      {links.map((r) => (
                        <li key={r.href}>
                          <Link
                            to={r.href}
                            className="inline-flex max-w-full items-start gap-[9px] text-[13.5px] leading-[1.45] text-ink-2 transition-colors hover:text-ink hover:underline hover:decoration-line-2 hover:underline-offset-4"
                          >
                            {createElement(resourceIcon(r.href), {
                              className: "mt-[3px] size-[14px] shrink-0 text-ink-3",
                            })}
                            <span className="min-w-0">{r.title}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {rows.length > 0 && (
          <>
            <h3
              className={cn(
                "mb-1 text-[13px] font-semibold tracking-[-0.005em] text-ink",
                (!!active.entries?.length || active.teachingDates !== undefined) && "mt-6",
              )}
            >
              Material
            </h3>
            <ul className="-mx-4 md:-mx-6">
              {rows.map((r) => {
                const external = /^https?:\/\//i.test(r.href);
                const body = (
                  <>
                    {createElement(resourceIcon(r.href), { className: RES_ICON })}
                    <span className="min-w-0 flex-1">{r.title}</span>
                    {external ? (
                      <ArrowUpRight className={RES_ICON} aria-hidden />
                    ) : (
                      <ChevronRight className={RES_CHEVRON} aria-hidden />
                    )}
                  </>
                );
                return (
                  <li key={r.href} className={RES_ITEM}>
                    {r.id.startsWith("page:") ? (
                      <button
                        type="button"
                        className={cn(RES_ROW, "w-full text-left", page === r.id && "bg-hover font-medium")}
                        onClick={() => setPage(r.id)}
                        aria-pressed={page === r.id}
                        aria-label={`Read ${r.title}`}
                      >
                        {body}
                      </button>
                    ) : external ? (
                      <a href={r.href} target="_blank" rel="noreferrer" className={RES_ROW}>
                        {body}
                      </a>
                    ) : (
                      <Link to={r.href} className={RES_ROW}>
                        {body}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {shownPage && (
          <PageReader
            key={`${active.id}:${shownPage}`}
            courseId={Number(courseId)}
            slug={shownPage.slice(5)}
            section={active.title}
            explicit={page !== undefined}
          />
        )}
      </div>
      <details className="group/more mt-6 text-[12.5px]">
        <summary className="inline-flex cursor-pointer list-none items-center gap-[6px] text-ink-3 transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-[14px] transition-transform group-open/more:rotate-90" aria-hidden />
          More course material ({other.length})
        </summary>
        <p className="mt-2 text-[12px] text-ink-3">
          Material outside these groups is still available here and in Modules
          and Files.
        </p>
        <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {other.map((r) => (
            <li key={r.id}>
              <Link
                to={r.href}
                className="text-[13px] text-ink-2 underline decoration-line-2 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink-3"
              >
                {r.title}
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
