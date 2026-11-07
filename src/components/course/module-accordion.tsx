import { useMemo, useState } from "react";
import { Check, ChevronRight, Clock, Inbox } from "lucide-react";
import {
  contentItems,
  itemCountLabel,
  lockReason,
  moduleProgress,
  showsItemIcons,
  type ModuleDoc,
  type ModuleWithItems,
} from "./module-utils";
import { ModuleRow } from "./module-row";
import { Meter } from "@/components/grades/bits";
import type { ModuleRowContext } from "./module-context";
import { cn } from "@/lib/utils";

/**
 * Modules as an accordion (design 1-A), the fallback for courses whose
 * modules carry no dates. One module is open on arrival: the one a student
 * is most likely mid-way through, or the one a hash points at.
 */
export function ModuleAccordion({
  modules,
  ctx,
  focusModuleId,
}: {
  modules: ModuleWithItems[];
  ctx: ModuleRowContext;
  /** `#module-<id>` / the module holding `#item-<id>`: always open. */
  focusModuleId?: number;
}) {
  const byId = useMemo(
    () => new Map<number, ModuleDoc>(modules.map((m) => [m.canvasId, m])),
    [modules],
  );
  const [toggled, setToggled] = useState<{ focus?: number; ids: Set<number> }>();
  const seed = focusModuleId ?? currentModule(modules, ctx);
  const open = new Set(toggled?.ids ?? (seed === undefined ? [] : [seed]));
  if (focusModuleId !== undefined && toggled?.focus !== focusModuleId) open.add(focusModuleId);

  const showIcon = useMemo(() => showsItemIcons(modules), [modules]);

  const toggle = (canvasId: number) => {
    const next = new Set(open);
    if (!next.delete(canvasId)) next.add(canvasId);
    setToggled({ focus: focusModuleId, ids: next });
  };

  return (
    <div className="pb-6">
      {modules.map((module) => {
        const locked = module.state === "locked";
        const expanded = !locked && open.has(module.canvasId);
        const { viewed, total } = moduleProgress(module, ctx.isSeen);

        return (
          <section
            key={module.canvasId}
            id={`module-${module.canvasId}`}
            className="relative scroll-mt-24 after:absolute after:right-4 after:bottom-0 after:left-4 after:h-px after:bg-line md:after:right-6 md:after:left-6"
          >
            <button
              type="button"
              disabled={locked}
              aria-expanded={expanded}
              onClick={() => toggle(module.canvasId)}
              className={cn(
                "group flex min-h-12 w-full items-center gap-[10px] px-4 py-3 text-left text-[14px] font-semibold tracking-[-0.01em] transition-colors outline-none md:px-6",
                locked ? "cursor-default text-ink-3" : "text-ink hover:bg-hover focus-visible:bg-hover",
              )}
            >
              <ChevronRight
                className={cn(
                  "size-[14px] shrink-0 text-ink-3 transition-transform group-hover:text-ink-2",
                  expanded && "rotate-90",
                  locked && "invisible",
                )}
              />
              <span className="line-clamp-2 min-w-0 md:truncate">{module.name}</span>
              {/* "0 of 6 viewed" before the seen rows land is a claim, not a
                  blank. Say nothing until it settles. */}
              {!locked && total > 0 && !ctx.seenLoading && (
                <Progress viewed={viewed} total={total} />
              )}
              {locked && (
                <span className="ml-auto flex shrink-0 items-center gap-[6px] pl-3 text-[12px] font-normal text-ink-3">
                  <Clock className="size-[13px]" />
                  {lockReason(module, byId)} · {itemCountLabel(module)}
                </span>
              )}
            </button>

            {expanded &&
              (contentItems(module.items).length === 0 ? (
                <div className="flex items-center gap-[10px] py-3 pr-4 pl-10 text-[12.5px] text-ink-3 md:pl-12">
                  <Inbox className="size-[14px] shrink-0" aria-hidden />
                  Nothing in this module yet.
                </div>
              ) : (
                <div className="pb-2">
                  {module.items.map((item) => (
                    <ModuleRow key={item.canvasId} item={item} ctx={ctx} showIcon={showIcon} />
                  ))}
                </div>
              ))}
          </section>
        );
      })}
    </div>
  );
}

/**
 * Untouched modules give their size, finished ones say so, and only a
 * module part-way through gets the meter and a percent.
 */
function Progress({ viewed, total }: { viewed: number; total: number }) {
  const pct = Math.round((viewed / total) * 100);
  return (
    <span className="tabular ml-auto flex shrink-0 items-center gap-[10px] pl-3 text-[12px] font-normal tracking-normal text-ink-3">
      {viewed === 0 ? (
        `${total} item${total === 1 ? "" : "s"}`
      ) : viewed === total ? (
        <span className="flex items-center gap-1">
          <Check className="size-[13px]" aria-hidden />
          Done
        </span>
      ) : (
        <>
          <Meter fraction={viewed / total} className="w-[88px]" tone="neutral" />
          <span className="w-8 text-right">
            {pct}%<span className="sr-only"> viewed</span>
          </span>
        </>
      )}
    </span>
  );
}

/** The first open module with something unread, else the last one open. */
function currentModule(
  modules: ModuleWithItems[],
  ctx: ModuleRowContext,
): number | undefined {
  const open = modules.filter((m) => m.state !== "locked");
  const unread = open.find((m) => contentItems(m.items).some((item) => !ctx.isSeen(item)));
  const last: ModuleWithItems | undefined = open[open.length - 1];
  return (unread ?? last)?.canvasId;
}
