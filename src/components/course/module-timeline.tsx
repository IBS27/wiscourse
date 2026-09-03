import { Fragment } from "react";
import { Clock } from "lucide-react";
import {
  contentItems,
  groupModulesByWeek,
  isModuleLocked,
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
 * Modules as a term calendar (design 2-C), with a "Now" line where today
 * falls. Locked weeks stay collapsed to one line: there is nothing to open
 * yet, only a date to know.
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
  // Before the first week that has not finished; -1 once every week is past.
  const nowIndex = groups.findIndex((g) => g.weekStart !== undefined && g.weekStart >= thisWeek);

  return (
    <div className="pb-6 md:px-5">
      {groups.map((group, index) => {
        const current = group.weekStart === thisWeek;
        const open = group.modules.filter((m) => !isModuleLocked(m));
        const viewed = open.reduce((n, m) => n + moduleProgress(m, ctx.isSeen).viewed, 0);
        const total = open.reduce((n, m) => n + contentItems(m.items).length, 0);

        return (
          <Fragment key={group.key}>
            {index === nowIndex && <NowMarker />}
            <section
              className={cn(
                "grid grid-cols-1 border-b border-line md:grid-cols-[132px_minmax(0,1fr)]",
                current && "bg-sunken/60",
              )}
            >
              <div className="px-4 pt-[14px] pb-1 text-[12.5px] text-ink-3 md:px-0 md:py-[14px] md:pr-4">
                <b
                  className={cn(
                    "text-[13.5px] font-semibold tracking-[-0.01em] md:block",
                    current ? "text-ink" : group.weekStart === undefined ? "text-ink-3" : "text-ink",
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

              <div className="relative py-[6px] md:border-l md:border-line">
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-[18px] -left-[4px] hidden size-[7px] rounded-full md:block",
                    current ? "bg-c" : "border border-line-2 bg-surface",
                  )}
                />
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
          </Fragment>
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

  if (isModuleLocked(module)) {
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
        <div className="px-4 pt-[6px] pb-[2px] text-[12.5px] font-medium text-ink-2 md:pl-[22px]">
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
      className="flex scroll-mt-24 items-center gap-[10px] py-2 pr-4 pl-[22px] text-[13px] text-ink-3"
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

function NowMarker() {
  return (
    <div className="grid grid-cols-1 items-center md:grid-cols-[132px_minmax(0,1fr)]">
      <div className="px-4 pb-1 md:px-0 md:pr-4 md:pb-0">
        <span className="rounded-[4px] bg-today px-[5px] py-px text-[10px] font-semibold tracking-[0.09em] text-today-fg uppercase">
          Now
        </span>
      </div>
      <div className="h-px bg-line-2" />
    </div>
  );
}
