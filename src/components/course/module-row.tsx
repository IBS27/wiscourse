import { createElement, type CSSProperties, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Check, Clock } from "lucide-react";
import { Pill } from "@/components/app/bits";
import type { ModuleRowContext } from "./module-context";
import {
  itemIcon,
  itemStatus,
  itemTarget,
  type ItemStatus,
  type ItemTarget,
  type ModuleItemDoc,
} from "./module-utils";
import { cn } from "@/lib/utils";

/** One module item: type icon · title · meta. */
export function ModuleRow({
  item,
  ctx,
  dense = false,
  className,
}: {
  item: ModuleItemDoc;
  ctx: ModuleRowContext;
  /** The timeline's tighter gutter, without the row rule. */
  dense?: boolean;
  className?: string;
}) {
  const id = `item-${item.canvasId}`;
  // `--pl` is the icon column: under the module title in the accordion,
  // tighter in the timeline. Indents step in from there.
  const style = { paddingLeft: `calc(var(--pl) + ${item.indent * 22}px)` } as CSSProperties;
  const gutter = dense
    ? "[--pl:30px] pr-4"
    : "[--pl:40px] pr-4 md:[--pl:48px] md:pr-6";

  if (item.type === "SubHeader") {
    return (
      <div
        id={id}
        className={cn(
          "scroll-mt-24 pt-4 pb-[6px] text-[12.5px] font-medium text-ink-2",
          gutter,
          className,
        )}
        style={style}
      >
        {item.title}
      </div>
    );
  }

  const target = itemTarget(item, ctx.courseId);

  return (
    <ItemLink
      id={id}
      target={target}
      onOpen={() => ctx.open(item)}
      className={cn(
        "relative flex min-h-10 scroll-mt-24 items-center gap-[10px] py-[9px] text-[13px] text-ink transition-colors outline-none hover:bg-hover focus-visible:bg-hover",
        gutter,
        // Hairline above each row, inset to the title column.
        !dense &&
          "before:absolute before:top-0 before:right-4 before:left-[calc(var(--pl)+24px)] before:h-px before:bg-line md:before:right-6",
        className,
      )}
      style={style}
    >
      {createElement(itemIcon(item, ctx.files), {
        className: "size-[14px] shrink-0 text-ink-3",
      })}
      {/* One weight for every item: the module's progress says what's been viewed. */}
      <span className="line-clamp-2 min-w-0 md:truncate">{item.title}</span>
      {target.kind === "external" && (
        <ArrowUpRight className="-ml-[4px] size-3 shrink-0 text-ink-3" />
      )}
      <StatusMeta status={itemStatus(item, ctx.status)} />
    </ItemLink>
  );
}

/** The three shapes a module target comes in: a route, Canvas, or nowhere. */
export function ItemLink({
  target,
  onOpen,
  id,
  className,
  style,
  children,
}: {
  target: ItemTarget;
  onOpen?: () => void;
  id?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  if (target.kind === "internal") {
    return (
      <Link
        id={id}
        to={target.to}
        search={target.search ?? {}}
        onClick={onOpen}
        className={className}
        style={style}
      >
        {children}
      </Link>
    );
  }
  if (target.kind === "external") {
    return (
      <a
        id={id}
        href={target.href}
        target="_blank"
        rel="noreferrer"
        onClick={onOpen}
        className={className}
        style={style}
      >
        {children}
      </a>
    );
  }
  return (
    <div id={id} className={className} style={style}>
      {children}
    </div>
  );
}

function StatusMeta({ status }: { status: ItemStatus }) {
  if (status.kind === "none") return null;
  return (
    <span className="tabular ml-auto shrink-0 pl-3 text-[12px] whitespace-nowrap text-ink-3">
      {status.kind === "overdue" ? (
        <span className="flex items-center gap-[5px] text-ink-2">
          <Clock className="size-3 text-red" aria-hidden />
          Overdue
        </span>
      ) : status.kind === "submitted" ? (
        <Pill className="h-[20px] text-[12px]">
          <Check />
          Submitted
        </Pill>
      ) : (
        status.text
      )}
    </span>
  );
}
