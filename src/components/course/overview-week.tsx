import { useQuery } from "convex/react";
import { BookOpen } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { TodoItem } from "../../../convex/todos";
import { OverviewRow, SectionHead } from "./overview-row";
import { itemIcon, itemTarget, type ModuleWithItems } from "./module-utils";
import { moduleHref } from "@/lib/course-routes";
import { currentCourseSections } from "@/lib/course-structure";
import { formatDueRelative } from "@/lib/dates";
import { useSeen } from "@/lib/seen";

export function OverviewWeek({
  courseId,
  canvasId,
  modules,
  todayKey,
  courseYear,
  todos,
}: {
  courseId: string;
  canvasId: number;
  modules: ModuleWithItems[] | undefined;
  todos: TodoItem[] | undefined;
  todayKey: string;
  courseYear: number;
}) {
  const tree = useQuery(api.files.tree, { courseCanvasId: canvasId });
  const seen = useSeen("moduleItem");
  if (modules === undefined || modules.length === 0) return null;
  const current = currentCourseSections(modules, todayKey, courseYear);
  const files = new Map(
    (tree?.files ?? []).map((file) => [file.canvasId, file]),
  );
  const dueDates = new Map(
    (todos ?? []).flatMap((todo) =>
      todo.dueAt !== undefined ? [[todo.key, todo.dueAt] as const] : [],
    ),
  );
  return (
    <>
      {current.length > 0 && (
        <section>
          <SectionHead title="This week" />
          {current.map((module) => (
            <div key={module.canvasId}>
              <SectionHead
                title={module.name}
                to={moduleHref(courseId, module.canvasId)}
                muted
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
                    icon={itemIcon(item, files)}
                    title={item.title}
                    meta={
                      due === undefined
                        ? item.type
                        : `Due ${formatDueRelative(due, todayKey)}`
                    }
                    unread={
                      !seen.has(item.canvasId) &&
                      item.completionRequirement?.completed !== true
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
        <SectionHead title="Course materials" />
        {modules.map((module) => (
          <OverviewRow
            key={module.canvasId}
            icon={BookOpen}
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
