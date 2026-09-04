import { createElement, type CSSProperties, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Check } from "lucide-react";
import { Pill } from "@/components/app/bits";
import { UnreadDot } from "./unread-dot";
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

/** One module item: unread gutter · type icon · title · meta. */
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
  const style = {
    paddingLeft: (dense ? 22 : 46) + item.indent * 22,
    paddingRight: dense ? 16 : 20,
  };

  if (item.type === "SubHeader") {
    return (
      <div
        id={id}
        className={cn("eyebrow scroll-mt-24 pt-[14px] pb-[6px]", className)}
        style={style}
      >
        {item.title}
      </div>
    );
  }

  const target = itemTarget(item, ctx.courseId);
  const unread = !ctx.isSeen(item);

  return (
    <ItemLink
      id={id}
      target={target}
      onOpen={() => ctx.open(item)}
      className={cn(
        "flex scroll-mt-24 items-center gap-[10px] py-2 text-[13px] text-ink hover:bg-hover",
        !dense && "border-t border-line",
        className,
      )}
      style={style}
    >
      {unread ? (
        <UnreadDot className="-ml-4" />
      ) : (
        <span className="-ml-4 size-[6px] shrink-0" aria-hidden />
      )}
      {createElement(itemIcon(item, ctx.files), {
        className: "size-[14px] shrink-0 text-ink-3",
      })}
      <span className={cn("truncate", unread && "font-medium")}>{item.title}</span>
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
    <span className="tabular ml-auto shrink-0 text-[11.5px] whitespace-nowrap text-ink-3">
      {status.kind === "overdue" ? (
        <Pill tone="red" className="h-[19px] text-[11px]">
          Overdue
        </Pill>
      ) : status.kind === "submitted" ? (
        <Pill className="h-[19px] text-[11px]">
          <Check />
          Submitted
        </Pill>
      ) : (
        status.text
      )}
    </span>
  );
}
