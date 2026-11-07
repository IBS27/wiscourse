import type { TodoItem } from "../../../convex/todos";
import { OverviewRow, SectionHead } from "./overview-row";
import { SECTION_COUNT } from "./overview-icons";
import { itemIcon, itemTarget, showsItemIcons, type ModuleWithItems } from "./module-utils";
import { moduleHref } from "@/lib/course-routes";
import { currentCourseSections } from "@/lib/course-structure";
import { formatDueRelative } from "@/lib/dates";
import { useSeen } from "@/lib/seen";

export function OverviewWeek({
  courseId,
  modules,
  todayKey,
  courseYear,
  todos,
}: {
  courseId: string;
  modules: ModuleWithItems[] | undefined;
  todos: TodoItem[] | undefined;
  todayKey: string;
  courseYear: number;
}) {
  const seen = useSeen("moduleItem");
  if (modules === undefined || modules.length === 0) return null;
  const current = currentCourseSections(modules, todayKey, courseYear);
  const showIcons = showsItemIcons(current);
  const dueDates = new Map(
    (todos ?? []).flatMap((todo) =>
      todo.dueAt !== undefined ? [[todo.key, todo.dueAt] as const] : [],
    ),
  );
  return (
    <>
      {current.length > 0 && (
        <section>
          <SectionHead title="This week" className="pb-0" />
          {current.map((module) => (
            <div key={module.canvasId}>
              <SectionHead
                title={module.name}
                to={moduleHref(courseId, module.canvasId)}
                muted
                className="pt-4"
              />
              {module.items.map((item) => {
                if (item.type === "SubHeader")
                  return (
                    <SectionHead key={item.canvasId} title={item.title} muted />
                  );
                const target = itemTarget(item, courseId);
                const due =
                  item.contentCanvasId === undefined
                    ? undefined
                    : dueDates.get(
                        `${item.type.toLowerCase()}:${item.contentCanvasId}`,
                      );
                return (
                  <OverviewRow
                    key={item.canvasId}
                    icon={showIcons ? itemIcon(item) : undefined}
                    title={item.title}
                    meta={
                      due === undefined
                        ? typeLabel(item.type)
                        : `Due ${formatDueRelative(due, todayKey)}`
                    }
                    to={
                      target.kind === "internal"
                        ? target.to +
                          (target.search ? `?file=${target.search.file}` : "")
                        : undefined
                    }
                    href={target.kind === "external" ? target.href : undefined}
                    onClick={() => seen.mark(item.canvasId)}
                  />
                );
              })}
            </div>
          ))}
        </section>
      )}
      <section>
        <SectionHead
          title="Course materials"
          right={<span className={SECTION_COUNT}>{modules.length}</span>}
        />
        {modules.map((module) => (
          <OverviewRow
            key={module.canvasId}
            title={module.name}
            meta={
              module.state === "locked"
                ? "Locked in Canvas"
                : `${module.items.filter((item) => item.type !== "SubHeader").length} items`
            }
            to={moduleHref(courseId, module.canvasId)}
          />
        ))}
      </section>
    </>
  );
}

/** Canvas' "ExternalUrl" and friends, as a person would say them. */
function typeLabel(type: string): string {
  switch (type) {
    case "ExternalUrl":
      return "Link";
    case "ExternalTool":
      return "Opens in Canvas";
    default:
      return type;
  }
}
