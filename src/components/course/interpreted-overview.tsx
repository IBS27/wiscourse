import { useState } from "react";
import { ArrowUpRight, Check, ChevronDown, ChevronRight, FileText } from "lucide-react";
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

const STEP =
  "grid size-8 shrink-0 place-items-center rounded-lg border border-line text-ink-2 transition-colors outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-line-2 disabled:pointer-events-none disabled:opacity-40";

/**
 * Which chapter (or week) is open: the full title in a menu trigger, never
 * cut short, with a step back and forward beside it.
 */
function SectionSwitcher({
  label,
  sections,
  active,
  onSelect,
}: {
  label: string;
  sections: Section[];
  active: string;
  onSelect: (id: string) => void;
}) {
  const index = sections.findIndex((s) => s.id === active);
  const current = sections[index];
  return (
    <nav aria-label={label} className="flex items-start gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface py-[6px] pr-[10px] pl-3 text-left text-[13px] leading-[18px] font-medium text-ink transition-colors outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-line-2 data-[state=open]:bg-hover md:max-w-max md:flex-initial">
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
    map.sections.find((s) => s.id === defaultSection(map, today))!;
  const byId = new Map(resources.map((r) => [r.id, r]));
  const resolve = (ids: string[]) =>
    sectionResources(ids, resources, modules, courseId);
  const rows = resolve(active.resourceIds);

  const select = (id: string) => {
    setSelection(id);
    setPage(undefined);
  };
  const entries = byDate(active.entries ?? []);
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
  return (
    <section className="px-4 pt-6 pb-5 md:px-6">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-semibold tracking-[-0.005em] text-ink">
          {chapterLayout
            ? "Chapters & course resources"
            : weekly
              ? "Weekly course plan"
              : "Course materials"}
        </h2>
        <Link
          to="/courses/$courseId/interpretation"
          params={{ courseId }}
          className="text-[12px] text-ink-3 transition-colors hover:text-ink"
        >
          Review AI grouping
          {map.conflicts.length > 0 && ` · ${map.conflicts.length} flagged`}
        </Link>
      </div>
      {map.essentials.length > 0 && (
        <ul className="mb-5 space-y-px" aria-label="Course essentials">
          {map.essentials.map((e, i) => {
            const r = byId.get(e.resourceId);
            return r ? (
              <li key={i}>
                <Link
                  to={r.href}
                  className="-mx-2 flex items-start gap-[10px] rounded-md px-2 py-[6px] text-[13px] leading-[1.4] text-ink-2 transition-colors outline-none hover:bg-hover hover:text-ink focus-visible:bg-hover"
                >
                  <FileText className="mt-[2px] size-[14px] shrink-0 text-ink-3" aria-hidden />
                  <span className="min-w-0">{e.label}</span>
                </Link>
              </li>
            ) : null;
          })}
        </ul>
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
              return (
                <li key={i} className="border-b border-line py-3 first:pt-1 last:border-b-0">
                  {e.date && (
                    <p className="tabular text-[12.5px] leading-[1.4] text-ink-3">
                      {formatDay(e.date)}
                    </p>
                  )}
                  <p
                    className={cn(
                      "mt-[2px] text-[15px] leading-[1.35] font-semibold tracking-[-0.01em]",
                      e.date && e.date < today ? "text-ink-2" : "text-ink",
                    )}
                  >
                    {e.title}
                  </p>
                  {links.length > 0 && (
                    <div className="mt-[6px] flex flex-wrap gap-x-5 gap-y-1">
                      {links.map((r) => (
                        <Link
                          key={r.href}
                          to={r.href}
                          className="inline-flex min-w-0 items-center gap-[6px] text-[12.5px] leading-[1.5] text-ink-2 transition-colors hover:text-ink hover:underline"
                        >
                          <FileText className="size-3 shrink-0 text-ink-3" aria-hidden />
                          {r.title}
                        </Link>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {rows.length > 0 && (
          <ul
            className={cn(
              "max-h-80 overflow-y-auto border-t border-line",
              (!!active.entries?.length || active.teachingDates !== undefined) && "mt-3",
            )}
          >
            {rows.map((r) => (
              <li key={r.href}>
                {r.id.startsWith("page:") ? (
                  <button
                    type="button"
                    className={cn(
                      "group flex w-full items-start gap-[10px] border-b border-line px-2 py-[9px] text-left text-[13px] leading-[18px] transition-colors outline-none hover:bg-hover focus-visible:bg-hover",
                      page === r.id && "bg-hover font-medium",
                    )}
                    onClick={() => setPage(r.id)}
                    aria-pressed={page === r.id}
                    aria-label={`Read ${r.title}`}
                  >
                    <FileText
                      className="mt-0.5 size-3.5 shrink-0 text-ink-3"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">{r.title}</span>
                    <ChevronRight
                      className="mt-0.5 size-3.5 shrink-0 text-ink-3 group-hover:text-ink-2"
                      aria-hidden
                    />
                  </button>
                ) : (
                  <Link
                    to={r.href}
                    className="flex items-start gap-[10px] border-b border-line px-2 py-[9px] text-[13px] leading-[18px] transition-colors outline-none hover:bg-hover focus-visible:bg-hover"
                  >
                    <FileText
                      className="mt-0.5 size-3.5 shrink-0 text-ink-3"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">{r.title}</span>
                    <ArrowUpRight
                      className="mt-0.5 size-3.5 shrink-0 text-ink-3"
                      aria-hidden
                    />
                  </Link>
                )}
              </li>
            ))}
          </ul>
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
