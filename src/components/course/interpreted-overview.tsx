import { useState } from "react";
import { ChevronRight, FileText, ArrowUpRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { CourseMap } from "../../../convex/lib/courseMap";
import { CanvasHtml } from "@/components/reader/canvas-html";
import {
  defaultSection,
  instructorSection,
  sectionResources,
  type MapResource,
} from "@/lib/interpreted-course";
import type { ModuleWithItems } from "./module-utils";

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
  const active =
    map.sections.find((s) => s.id === selection) ??
    map.sections.find((s) => s.id === defaultSection(map, today))!;
  const byId = new Map(resources.map((r) => [r.id, r]));
  const rows = sectionResources(
    active.resourceIds,
    resources,
    modules,
    courseId,
  );
  const chapterLayout = map.sections.some((s) =>
    /^chapter\s+\d/i.test(s.title),
  );
  const weekly = map.organization === "weekly";
  const cards = map.organization === "resources";
  const source = active.evidence.find((e) =>
    e.sourceId.startsWith("page:"),
  )?.sourceId;
  const shownPage = page ?? source;
  const covered = new Set(
    map.sections.flatMap((s) =>
      sectionResources(s.resourceIds, resources, modules, courseId).map(
        (r) => r.href,
      ),
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
    <section className="px-4 pt-5 pb-5 md:px-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em]">
          {chapterLayout
            ? "Chapters & course resources"
            : weekly
              ? "Weekly course plan"
              : "Course materials"}
        </h2>
        <Link
          to="/courses/$courseId/interpretation"
          params={{ courseId }}
          className="text-[11px] text-ink-3 hover:text-ink-2"
        >
          Review interpretation
          {map.conflicts.length > 0 && ` · ${map.conflicts.length} flagged`}
        </Link>
      </div>
      {map.essentials.length > 0 && (
        <div
          className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line pb-4"
          aria-label="Course essentials"
        >
          {map.essentials.map((e, i) => {
            const r = byId.get(e.resourceId);
            return r ? (
              <Link
                key={i}
                to={r.href}
                className="inline-flex max-w-full items-center gap-1 text-[11.5px] leading-4 text-ink-2 hover:text-ink"
                title={e.label}
              >
                <span className="line-clamp-1">{e.label}</span>
                <ArrowUpRight
                  className="size-3 shrink-0 text-ink-3"
                  aria-hidden
                />
              </Link>
            ) : null;
          })}
        </div>
      )}
      <div
        className={
          cards
            ? "space-y-4"
            : "grid min-w-0 items-start gap-4 xl:grid-cols-[200px_minmax(0,1fr)] xl:gap-5"
        }
      >
        <nav
          aria-label={chapterLayout ? "Chapter navigation" : "Course sections"}
          className={
            cards
              ? "grid gap-1 sm:grid-cols-2"
              : "flex min-w-0 gap-1 overflow-x-auto pb-2 xl:block xl:max-h-[420px] xl:space-y-0.5 xl:overflow-y-auto xl:border-r xl:border-line xl:pr-3"
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
              className={`max-w-[220px] shrink-0 rounded-r-md border-l-2 px-2.5 py-2 text-left text-[12px] leading-[17px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-c/40 xl:w-full xl:max-w-none ${s.id === active.id ? "border-c bg-hover font-medium text-ink" : "border-transparent text-ink-2 hover:bg-hover hover:text-ink"}`}
            >
              <span className="line-clamp-2">{s.title}</span>
              {s.teachingDates && (
                <span className="mt-1 block text-xs font-normal">
                  {s.teachingDates.start} – {s.teachingDates.end}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="min-w-0" aria-label="Selected course section">
          <h3 className="pt-1 text-[13px] leading-5 font-semibold">
            {active.title}
          </h3>
          {active.teachingDates && (
            <p className="mt-1 text-xs text-ink-3">
              Teaching dates: {active.teachingDates.start} –{" "}
              {active.teachingDates.end}
            </p>
          )}
          <ul className="mt-2 max-h-80 overflow-y-auto divide-y divide-line rounded-lg border border-line">
            {rows.map((r) => (
              <li key={r.href}>
                {r.id.startsWith("page:") ? (
                  <button
                    type="button"
                    className={`group flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-[13px] leading-[18px] hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-c/40 ${page === r.id ? "bg-hover" : ""}`}
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
                    className="flex items-start gap-2.5 px-3 py-2.5 text-[13px] leading-[18px] hover:bg-hover"
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
      </div>
      <details className="mt-4 border-t border-line pt-3 text-[12px]">
        <summary className="cursor-pointer text-ink-3 hover:text-ink-2">
          More course material ({other.length})
        </summary>
        <p className="mt-2 text-xs text-ink-3">
          Material outside these groups is still available here and in Modules
          and Files.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {other.map((r) => (
            <li key={r.id}>
              <Link
                to={r.href}
                className="text-sm underline underline-offset-4"
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
