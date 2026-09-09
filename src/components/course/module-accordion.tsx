import { useMemo, useState } from "react";
import { ChevronRight, Clock } from "lucide-react";
import {
  contentItems,
  itemCountLabel,
  lockReason,
  moduleProgress,
  type ModuleDoc,
  type ModuleWithItems,
} from "./module-utils";
import { ModuleRow } from "./module-row";
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
            className="scroll-mt-24 border-b border-line"
          >
            <button
              type="button"
              disabled={locked}
              aria-expanded={expanded}
              onClick={() => toggle(module.canvasId)}
              className={cn(
                "flex w-full items-center gap-[10px] px-4 pt-[13px] pb-3 text-left text-[13.5px] font-semibold tracking-[-0.01em] md:px-5",
                locked ? "cursor-default text-ink-3" : "hover:bg-hover",
                !locked && !expanded && "text-ink-2",
              )}
            >
              <ChevronRight
                className={cn(
                  "size-[14px] shrink-0 text-ink-3 transition-transform",
                  expanded && "rotate-90",
                  locked && "invisible",
                )}
              />
              <span className="truncate">{module.name}</span>
              {/* "0 of 6 viewed" before the seen rows land is a claim, not a
                  blank. Say nothing until it settles. */}
              {!locked && total > 0 && !ctx.seenLoading && (
                <span className="shrink-0 text-[11.5px] font-medium text-ink-3">
                  {viewed === total ? "All viewed" : `${viewed} of ${total} viewed`}
                </span>
              )}
              {locked && (
                <span className="ml-auto flex shrink-0 items-center gap-[6px] text-[11.5px] font-medium text-ink-3">
                  <Clock className="size-[13px]" />
                  {lockReason(module, byId)} · {itemCountLabel(module)}
                </span>
              )}
            </button>

            {expanded &&
              (contentItems(module.items).length === 0 ? (
                <div className="border-t border-line px-4 py-3 text-[12.5px] text-ink-3 md:px-5 md:pl-[46px]">
                  Nothing in this module yet.
                </div>
              ) : (
                module.items.map((item) => (
                  <ModuleRow key={item.canvasId} item={item} ctx={ctx} />
                ))
              ))}
          </section>
        );
      })}
    </div>
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
