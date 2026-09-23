import type { CourseMap } from "../../convex/lib/courseMap";
import type { Doc } from "../../convex/_generated/dataModel";
import {
  itemTarget,
  type ModuleWithItems,
} from "@/components/course/module-utils";

export type MapResource = { id: string; title: string; href: string };
export type Interpretation = Pick<
  Doc<"courseInterpretations">,
  "map" | "resources" | "sourceRevision" | "resultRevision"
>;
const normalizeTitle = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** False when every section only restates a whole page, which the original Overview already shows better. */
export function addsStructure(
  map: CourseMap,
  resources: MapResource[],
): boolean {
  const titles = new Map(resources.map((r) => [r.id, normalizeTitle(r.title)]));
  return map.sections.some(
    (s) =>
      !!s.entries?.length ||
      !s.resourceIds.some(
        (id) =>
          /^(page|course):/.test(id) &&
          titles.get(id) === normalizeTitle(s.title),
      ),
  );
}
export function usableInterpretation(
  state: Interpretation | null | undefined,
): state is Interpretation & { map: CourseMap; resources: MapResource[] } {
  return (
    !!state?.map?.sections.length &&
    !!state.resources?.length &&
    state.resultRevision === state.sourceRevision &&
    addsStructure(state.map, state.resources)
  );
}
export function sectionResources(
  ids: string[],
  resources: MapResource[],
  modules: ModuleWithItems[],
  courseId: string,
): MapResource[] {
  const byId = new Map(resources.map((r) => [r.id, r]));
  const items = new Map(
    modules.flatMap((m) => m.items.map((i) => [i.canvasId, i] as const)),
  );
  const result: MapResource[] = [];
  const seen = new Set<string>();
  const add = (id: string) => {
    const module = id.startsWith("module:")
      ? modules.find((m) => m.canvasId === Number(id.slice(7)))
      : undefined;
    if (module && module.state !== "locked") {
      module.items.forEach((i) => add(`item:${i.canvasId}`));
      return;
    }
    let r = byId.get(id);
    const item = id.startsWith("item:")
      ? items.get(Number(id.slice(5)))
      : undefined;
    if (item) {
      if (item.type === "SubHeader" || item.published === false) return;
      const target = itemTarget(item, courseId);
      if (target.kind !== "none")
        r = {
          id:
            item.type === "Page" && item.pageUrl ? `page:${item.pageUrl}` : id,
          title: item.title,
          href:
            target.kind === "internal"
              ? target.to + (target.search ? `?file=${target.search.file}` : "")
              : target.href,
        };
    }
    if (
      r &&
      (/^\/(?!\/)/.test(r.href) || /^https?:\/\//i.test(r.href)) &&
      !seen.has(r.href)
    ) {
      seen.add(r.href);
      result.push(r);
    }
  };
  ids.forEach(add);
  return result;
}
/** The current dated section, else the next upcoming one, else the instructor's main group. */
export function defaultSection(map: CourseMap, today: string): string {
  const dated = map.sections.filter((s) => s.teachingDates);
  return (
    dated.find(
      (s) => s.teachingDates!.start <= today && s.teachingDates!.end >= today,
    ) ??
    dated
      .filter((s) => s.teachingDates!.start > today)
      .sort((a, b) =>
        a.teachingDates!.start.localeCompare(b.teachingDates!.start),
      )[0] ??
    map.sections.find((s) => /^chapter\s+\d/i.test(s.title)) ??
    map.sections.find((s) => /^lectures?$/i.test(s.title)) ??
    map.sections[0]
  ).id;
}

const dayFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
/** "Tue, Sep 22" for a YYYY-MM-DD key, independent of the viewer's zone. */
export function formatDay(key: string): string {
  return dayFormat.format(new Date(`${key}T00:00:00Z`));
}

/** Extract an existing instructor section, never generate or rewrite its content. */
export function instructorSection(html: string, title: string): string | null {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const heading = [...doc.querySelectorAll("h1,h2,h3,h4,h5,h6,p")].find(
    (e) => normalizeTitle(e.textContent ?? "") === normalizeTitle(title),
  );
  if (!heading) return null;
  const isHeading = (e: Element) =>
    /^H[1-6]$/.test(e.tagName) ||
    (e.tagName === "P" &&
      !!e.querySelector('[style*="24pt"], [style*="32px"]'));
  const parts: string[] = [];
  for (
    let node = heading.nextElementSibling;
    node && !isHeading(node);
    node = node.nextElementSibling
  )
    parts.push(node.outerHTML);
  return parts.join("").trim() || null;
}
