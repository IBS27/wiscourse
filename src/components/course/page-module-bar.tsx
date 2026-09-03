import { ChevronLeft, ChevronRight, ListTree } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ItemLink } from "./module-row";
import { itemTarget, type ModuleItemDoc, type PageModuleContext } from "./module-utils";
import { cn } from "@/lib/utils";

/**
 * Module context for a page (design 3-A): which module, how far in, and
 * every sibling one click away.
 */
export function PageModuleBar({
  context,
  courseId,
  onOpenItem,
}: {
  context: PageModuleContext;
  courseId: string;
  onOpenItem: (item: ModuleItemDoc) => void;
}) {
  const { module, items, index, previous, next } = context;

  return (
    <div className="border-b border-line bg-sunken">
      <div className="flex h-[42px] items-center gap-[10px] px-4 text-[12.5px] text-ink-3 md:px-5">
        <ListTree className="size-[13px] shrink-0" />
        <Link
          to="/courses/$courseId/modules"
          params={{ courseId }}
          hash={`module-${module.canvasId}`}
          className="truncate font-medium text-ink hover:underline"
        >
          {module.name}
        </Link>
        <span aria-hidden>·</span>
        <span className="tabular shrink-0">
          {index + 1} of {items.length}
        </span>

        <div className="ml-auto hidden shrink-0 items-center gap-1 md:flex">
          {previous !== undefined && (
            <StepButton item={previous} courseId={courseId} onOpenItem={onOpenItem} back />
          )}
          {next !== undefined && (
            <StepButton item={next} courseId={courseId} onOpenItem={onOpenItem} />
          )}
        </div>
      </div>

      {/* On mobile this is the bar's whole navigation, so it scrolls. */}
      <div className="flex gap-[6px] overflow-x-auto px-4 pb-[10px] md:px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item, i) => (
          <ItemLink
            key={item.canvasId}
            target={itemTarget(item, courseId)}
            onOpen={() => onOpenItem(item)}
            className={cn(
              "inline-flex h-6 max-w-[180px] shrink-0 items-center rounded-md px-[9px] text-xs font-medium",
              i === index ? "bg-today text-today-fg" : "bg-chip text-ink-2 hover:text-ink",
            )}
          >
            <span className="truncate">{item.title}</span>
          </ItemLink>
        ))}
      </div>
    </div>
  );
}

function StepButton({
  item,
  courseId,
  onOpenItem,
  back = false,
}: {
  item: ModuleItemDoc;
  courseId: string;
  onOpenItem: (item: ModuleItemDoc) => void;
  back?: boolean;
}) {
  return (
    <ItemLink
      target={itemTarget(item, courseId)}
      onOpen={() => onOpenItem(item)}
      className="inline-flex h-[26px] max-w-[180px] items-center gap-[5px] rounded-lg border border-line bg-surface px-[9px] text-xs font-medium text-ink-2 hover:bg-hover"
    >
      {back && <ChevronLeft className="size-3 shrink-0" />}
      <span className="truncate">{item.title}</span>
      {!back && <ChevronRight className="size-3 shrink-0" />}
    </ItemLink>
  );
}

/** The pair at the foot of the reading column. */
export function PagePrevNext({
  context,
  courseId,
  onOpenItem,
}: {
  context: PageModuleContext;
  courseId: string;
  onOpenItem: (item: ModuleItemDoc) => void;
}) {
  const { previous, next } = context;
  if (previous === undefined && next === undefined) return null;

  return (
    <div className="mt-7 flex border-t border-line">
      {previous !== undefined && (
        <ItemLink
          target={itemTarget(previous, courseId)}
          onOpen={() => onOpenItem(previous)}
          className="min-w-0 flex-1 py-[14px] pr-4 text-[13px] hover:text-ink"
        >
          <span className="block">
            <span className="mb-[2px] block text-[11px] text-ink-3">Previous</span>
            <span className="block truncate font-medium">{previous.title}</span>
          </span>
        </ItemLink>
      )}
      {next !== undefined && (
        <ItemLink
          target={itemTarget(next, courseId)}
          onOpen={() => onOpenItem(next)}
          className="min-w-0 flex-1 py-[14px] pl-4 text-right text-[13px] hover:text-ink"
        >
          <span className="block">
            <span className="mb-[2px] block text-[11px] text-ink-3">Next in module</span>
            <span className="block truncate font-medium">{next.title}</span>
          </span>
        </ItemLink>
      )}
    </div>
  );
}
