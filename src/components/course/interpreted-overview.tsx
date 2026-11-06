import { useEffect, useState } from "react";
import { ChevronRight, FileText, ArrowUpRight } from "lucide-react";
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
import { EDGE_FADE, revealInRow, useEdgeFade } from "./edge-fade";
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
  const navRef = useEdgeFade<HTMLElement>();
  const active =
    map.sections.find((s) => s.id === selection) ??
    map.sections.find((s) => s.id === defaultSection(map, today))!;
  const byId = new Map(resources.map((r) => [r.id, r]));
  const resolve = (ids: string[]) =>
    sectionResources(ids, resources, modules, courseId);
  const rows = resolve(active.resourceIds);

  // The sections are a sideways chip strip; bring the open one into view. Only the strip scrolls, never the page.
  useEffect(() => {
    const nav = navRef.current;
    const chip = nav?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (nav && chip) revealInRow(nav, chip);
  }, [active.id, navRef]);
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
      <div className={cn("group/strip flex min-w-0 items-center gap-2", cards && "block")}>
        <nav
          ref={navRef}
          aria-label={chapterLayout ? "Chapter navigation" : "Course sections"}
          className={
            cards
              ? "grid gap-1 sm:grid-cols-2"
              : cn(
                  "-mx-4 flex min-w-0 flex-1 scroll-px-4 gap-2 overflow-x-auto px-4 py-px [scrollbar-width:none] md:mr-0 md:-ml-6 md:scroll-px-6 md:pr-0 md:pl-6 [&::-webkit-scrollbar]:hidden",
                  EDGE_FADE,
                )
          }
        >
          {map.sections.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={s.id === active.id}
              onClick={() => {
                setSelection(s.id);
                setPage(undefined);
              }}
              title={s.title}
              className={cn(
                "shrink-0 rounded-full border px-3 py-[5px] text-left text-[12.5px] leading-[18px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-line-2",
                cards ? "max-w-none rounded-md" : "max-w-[200px]",
                s.id === active.id
                  ? "border-line-2 bg-chip font-medium text-ink"
                  : "border-line text-ink-2 hover:bg-hover hover:text-ink",
              )}
            >
              <span className="block truncate">{s.title}</span>
            </button>
          ))}
        </nav>
        {!cards && (
          // A mouse has no sideways scroll; these only show while the strip overflows.
          <div className="hidden shrink-0 items-center gap-[2px] md:group-has-[[data-fade-end=true]]/strip:flex md:group-has-[[data-fade-start=true]]/strip:flex">
            {([-1, 1] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                aria-label={dir < 0 ? "Earlier sections" : "Later sections"}
                onClick={() =>
                  navRef.current?.scrollBy({
                    left: dir * navRef.current.clientWidth * 0.7,
                    behavior: "smooth",
                  })
                }
                className={cn(
                  "grid size-7 place-items-center rounded-md text-ink-3 transition-colors outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-line-2",
                  dir < 0
                    ? "opacity-40 group-has-[[data-fade-start=true]]/strip:opacity-100"
                    : "opacity-40 group-has-[[data-fade-end=true]]/strip:opacity-100",
                )}
              >
                <ChevronRight className={cn("size-4", dir < 0 && "rotate-180")} aria-hidden />
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="mt-4 min-w-0" aria-label="Selected course section">
        {active.teachingDates && !active.entries?.length && (
          <p className="tabular text-[12.5px] text-ink-3">
            {formatDay(active.teachingDates.start)}
            {active.teachingDates.end !== active.teachingDates.start &&
              ` – ${formatDay(active.teachingDates.end)}`}
          </p>
        )}
        {!!active.entries?.length && (
          <ol aria-label={`${active.title} schedule`}>
            {active.entries.map((e, i) => {
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
