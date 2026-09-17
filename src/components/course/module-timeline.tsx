import { Clock } from "lucide-react";
import {
  contentItems,
  groupModulesByWeek,
  itemCountLabel,
  lockReason,
  moduleProgress,
  moduleTopic,
  type ModuleDoc,
  type ModuleWithItems,
} from "./module-utils";
import { ModuleRow } from "./module-row";
import type { ModuleRowContext } from "./module-context";
import { startOfMondayWeek } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * Modules as a term calendar (design 2-C); the current week is picked out in
 * the course color. Locked weeks stay collapsed to one line: there is nothing
 * to open yet, only a date to know.
 */
export function ModuleTimeline({
  modules,
  ctx,
  courseStartKey,
  todayKey,
}: {
  modules: ModuleWithItems[];
  ctx: ModuleRowContext;
  courseStartKey: string | undefined;
  todayKey: string;
}) {
  const groups = groupModulesByWeek(modules, courseStartKey);
  const byId = new Map<number, ModuleDoc>(modules.map((m) => [m.canvasId, m]));
  const thisWeek = startOfMondayWeek(todayKey);

  return (
    <div className="pb-6">
      {groups.map((group) => {
        const current = group.weekStart === thisWeek;
        const open = group.modules.filter((m) => m.state !== "locked");
        const viewed = open.reduce((n, m) => n + moduleProgress(m, ctx.isSeen).viewed, 0);
        const total = open.reduce((n, m) => n + contentItems(m.items).length, 0);

        return (
          <section
            key={group.key}
            className={cn(
              "grid grid-cols-1 border-b border-line md:grid-cols-[132px_minmax(0,1fr)] md:px-5",
              current && "bg-sunken",
            )}
          >
            <div className="px-4 pt-[14px] pb-1 text-[12.5px] text-ink-3 md:px-0 md:py-[14px] md:pr-4">
              <b
                className={cn(
                  "text-[13.5px] font-semibold tracking-[-0.01em] md:block",
                  current ? "text-c" : group.weekStart === undefined ? "text-ink-3" : "text-ink",
                )}
              >
                {group.label}
              </b>
              {group.range !== undefined && (
                <span className="md:block">
                  <span className="md:hidden"> · </span>
                  {group.range}
                </span>
              )}
              {total > 0 && !ctx.seenLoading && (
                <span className="tabular md:mt-[6px] md:block">
                  <span className="md:hidden"> · </span>
                  {viewed}/{total}
                </span>
              )}
            </div>

            <div className="py-[6px] md:border-l md:border-line">
              {group.modules.map((module) => (
                <ModuleBlock
                  key={module.canvasId}
                  module={module}
                  ctx={ctx}
                  byId={byId}
                  groupLabel={group.label}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ModuleBlock({
  module,
  ctx,
  byId,
  groupLabel,
}: {
  module: ModuleWithItems;
  ctx: ModuleRowContext;
  byId: Map<number, ModuleDoc>;
  groupLabel: string;
}) {
  const topic = moduleTopic(module.name);
  const title = topic === "" ? module.name : topic;

  if (module.state === "locked") {
    return (
      <LockedRow
        id={`module-${module.canvasId}`}
        title={title}
        detail={lockReason(module, byId)}
        meta={itemCountLabel(module)}
      />
    );
  }

  return (
    <div id={`module-${module.canvasId}`} className="scroll-mt-24">
      {topic !== "" && topic !== groupLabel && (
        <div className="px-4 pt-[6px] pb-[2px] text-[12.5px] font-medium text-ink-2 md:pl-[30px]">
          {title}
        </div>
      )}
      {module.items.map((item) => (
        <ModuleRow key={item.canvasId} item={item} ctx={ctx} dense />
      ))}
    </div>
  );
}

/** A locked module, collapsed to a single row. */
function LockedRow({
  id,
  title,
  detail,
  meta,
}: {
  id: string;
  title: string;
  detail: string;
  meta: string;
}) {
  return (
    <div
      id={id}
      className="flex scroll-mt-24 items-center gap-[10px] py-2 pr-4 pl-[30px] text-[13px] text-ink-3"
    >
      <span className="-ml-4 size-[6px] shrink-0" aria-hidden />
      <Clock className="size-[14px] shrink-0" />
      <span className="truncate">
        {title} · {detail}
      </span>
      <span className="tabular ml-auto shrink-0 text-[11.5px] whitespace-nowrap text-ink-3">
        {meta}
      </span>
    </div>
  );
}
