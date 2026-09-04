import type { ComponentType, ReactNode } from "react";
import {
  File,
  FileText,
  GraduationCap,
  Megaphone,
  Moon,
  Plus,
  RefreshCw,
  Rows3,
  SquareCheck,
} from "lucide-react";
import { Kbd } from "@/components/app/bits";
import { UnreadDot } from "@/components/course/unread-dot";
import { formatAgo, formatMonthDay } from "@/lib/dates";
import { formatBytes } from "@/lib/format";
import { courseStyle } from "@/lib/hooks";
import {
  rowDomId,
  type Entry,
  type MatchRange,
  type SearchItem,
  type SearchKind,
} from "@/lib/search";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<SearchKind, ComponentType<{ className?: string }>> = {
  assignment: SquareCheck,
  page: FileText,
  file: File,
  announcement: Megaphone,
  module: Rows3,
  course: GraduationCap,
};

const ACTION_ICON = { "new-task": Plus, sync: RefreshCw, theme: Moon } as const;

export interface RowContext {
  /** Short course label, omitted once the palette is scoped to one course. */
  courseLabel?: string;
  courseColor: string;
  /** Never opened — the one place course colour shows in ⌘K. */
  unseen: boolean;
  /** Module name for a scoped result; replaces the generic type chip. */
  moduleName?: string;
  now: number;
}

export function PaletteRow({
  entry,
  active,
  mobile,
  context,
  onActivate,
  onHover,
}: {
  entry: Entry;
  active: boolean;
  mobile: boolean;
  context: RowContext;
  onActivate: () => void;
  onHover: () => void;
}) {
  const Icon =
    entry.type === "action"
      ? ACTION_ICON[entry.action]
      : entry.type === "result"
        ? KIND_ICON[entry.item.kind]
        : undefined;

  const showDot = entry.type === "result" && context.unseen;
  const meta =
    entry.type === "result"
      ? metaFor(entry.item, context)
      : entry.type === "action"
        ? entry.note
        : undefined;
  const chip = entry.type === "result" ? chipFor(entry.item, context) : undefined;
  const kbd = entry.type === "result" || entry.type === "action" ? entry.kbd : undefined;
  const code = entry.type === "result" ? context.courseLabel : undefined;
  const hasMeta = meta !== undefined && meta !== "";

  return (
    <div
      id={rowDomId(entry.id)}
      role="option"
      aria-selected={active}
      // Clicking a row must not pull focus out of the search input: it owns
      // the keymap, and "Show all" leaves the palette open.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onActivate}
      onMouseMove={onHover}
      style={courseStyle(context.courseColor)}
      className={cn(
        "flex cursor-pointer items-center gap-[10px] rounded-lg px-[10px] text-ink",
        mobile ? "h-11" : "h-[38px]",
        active && "bg-hover",
        entry.type === "showAll" && "text-ink-2",
      )}
    >
      <span className="grid w-[14px] shrink-0 place-items-center text-ink-3">
        {showDot ? <UnreadDot className="size-[7px]" /> : Icon && <Icon className="size-[14px]" />}
      </span>

      <span className="min-w-0 truncate">
        {entry.type === "result" ? (
          <Highlight text={entry.item.title} ranges={entry.ranges} />
        ) : (
          entry.label
        )}
      </span>

      {(code !== undefined || hasMeta) && (
        <span className="shrink-0 truncate text-[12px] text-ink-3">
          {code !== undefined && <span className="font-medium text-c">{code}</span>}
          {code !== undefined && hasMeta && " · "}
          {meta}
        </span>
      )}

      <span className="ml-auto flex shrink-0 items-center gap-2 pl-3 text-[11.5px] text-ink-3">
        {chip !== undefined && (
          <span className="rounded-[5px] bg-chip px-[6px] py-px text-[11px]">{chip}</span>
        )}
        {entry.type === "result" && entry.ago !== undefined && (
          <span>{formatAgo(entry.ago, context.now)}</span>
        )}
        {kbd !== undefined && !mobile && <Kbd>{kbd}</Kbd>}
        {active && !mobile && <Kbd>↵</Kbd>}
      </span>
    </div>
  );
}

/** Emboldens the characters the query matched, in place. */
function Highlight({ text, ranges }: { text: string; ranges: MatchRange[] }) {
  if (ranges.length === 0) return <>{text}</>;
  const out: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((r, i) => {
    if (r.start > cursor) out.push(text.slice(cursor, r.start));
    out.push(
      <b key={i} className="font-semibold text-ink">
        {text.slice(r.start, r.end)}
      </b>,
    );
    cursor = r.end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return <>{out}</>;
}

/** The secondary line: what tells two similarly-named things apart. */
function metaFor(item: SearchItem, ctx: RowContext): string | undefined {
  switch (item.kind) {
    case "assignment":
      if (item.score !== undefined && item.pointsPossible !== undefined) {
        return `${item.score}/${item.pointsPossible}`;
      }
      if (item.dueAt === undefined) return undefined;
      if (item.dueAt < ctx.now) return "overdue";
      return `due ${formatMonthDay(item.dueAt)}`;
    case "file":
      return lastSegment(item.folderPath);
    case "announcement":
      return item.postedAt === undefined ? undefined : formatAgo(item.postedAt, ctx.now);
    case "course":
      return item.courseCode;
    case "page":
    case "module":
      return undefined;
  }
}

/** The right-hand type chip: kind, size, module or item count. */
function chipFor(item: SearchItem, ctx: RowContext): string | undefined {
  switch (item.kind) {
    case "page":
      return ctx.moduleName ?? "Page";
    case "file":
      return item.size === undefined ? undefined : formatBytes(item.size);
    case "module":
      return item.itemCount === undefined ? undefined : `${item.itemCount} items`;
    default:
      return undefined;
  }
}

function lastSegment(path: string | undefined): string | undefined {
  if (path === undefined) return undefined;
  const parts = path.split("/").filter((p) => p.length > 0);
  const last = parts[parts.length - 1];
  return last === undefined || last === "course files" ? undefined : last;
}
