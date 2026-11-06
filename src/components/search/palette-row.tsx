import type { ComponentType, ReactNode } from "react";
import {
  ChevronDown,
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
import { Kbd, CourseTag } from "@/components/app/bits";
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
  /** Never opened: a small dot on the kind icon. */
  unseen: boolean;
  /** Module name for a scoped result. */
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
        : ChevronDown;

  const details =
    entry.type === "result"
      ? detailsFor(entry.item, context, entry.ago)
      : entry.type === "action" && entry.note !== undefined
        ? [entry.note]
        : [];
  const kbd = entry.type === "result" || entry.type === "action" ? entry.kbd : undefined;
  const code = entry.type === "result" ? context.courseLabel : undefined;
  const showAll = entry.type === "showAll";

  const title =
    entry.type === "result" ? (
      <Highlight text={entry.item.title} ranges={entry.ranges} />
    ) : (
      entry.label
    );

  const meta = details.length > 0 && (
    <span className="truncate">
      {details.map((d, i) => (
        <span key={i}>
          {i > 0 && <span className="px-[5px] opacity-60">·</span>}
          {d}
        </span>
      ))}
    </span>
  );

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
        "flex cursor-pointer items-center gap-3 rounded-lg px-3 text-ink transition-colors duration-75",
        showAll ? "h-8 text-[13px] text-ink-3" : mobile ? "min-h-[52px] py-2" : "h-10",
        active && "bg-hover",
        active && showAll && "text-ink-2",
      )}
    >
      <span
        className={cn("grid w-4 shrink-0 place-items-center", active ? "text-ink-2" : "text-ink-3")}
      >
        <Icon className={showAll ? "size-[14px]" : "size-[15px]"} />
      </span>

      {mobile && !showAll ? (
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="truncate text-[15px] leading-tight">{title}</span>
          {(code !== undefined || meta) && (
            <span className="flex min-w-0 items-center text-[12.5px] text-ink-3">
              {code !== undefined && <CourseTag className="shrink-0">{code}</CourseTag>}
              {code !== undefined && meta && <span className="px-[6px] opacity-60">·</span>}
              {meta}
            </span>
          )}
        </span>
      ) : (
        <>
          <span className={cn("min-w-0 flex-1 truncate", !showAll && "text-[14px]")}>{title}</span>
          {meta && (
            <span className="flex max-w-[45%] shrink-0 text-[12px] tabular text-ink-3">{meta}</span>
          )}
          {kbd !== undefined && <Kbd className="shrink-0">{kbd}</Kbd>}
          {code !== undefined && (
            <CourseTag className="w-[92px] shrink-0 text-[12px]">{code}</CourseTag>
          )}
        </>
      )}

      {entry.type === "result" && (
        <span className="grid w-[6px] shrink-0 place-items-center" aria-hidden>
          {context.unseen && <UnreadDot />}
        </span>
      )}
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

/** The quiet details after the title: what tells two similar things apart. */
function detailsFor(item: SearchItem, ctx: RowContext, ago: number | undefined): string[] {
  const out: string[] = [];
  switch (item.kind) {
    case "assignment":
      if (item.score !== undefined && item.pointsPossible !== undefined) {
        out.push(`${item.score}/${item.pointsPossible}`);
      } else if (item.dueAt !== undefined) {
        out.push(`Due ${formatMonthDay(item.dueAt)}`);
      }
      break;
    case "page":
      if (ctx.moduleName !== undefined) out.push(ctx.moduleName);
      break;
    case "file": {
      const folder = lastSegment(item.folderPath);
      if (folder !== undefined) out.push(folder);
      if (item.size !== undefined) out.push(formatBytes(item.size));
      break;
    }
    case "announcement":
      if (item.postedAt !== undefined && ago === undefined) out.push(formatAgo(item.postedAt, ctx.now));
      break;
    case "module":
      if (item.itemCount !== undefined) {
        out.push(`${item.itemCount} item${item.itemCount === 1 ? "" : "s"}`);
      }
      break;
    case "course":
      break;
  }
  if (ago !== undefined) out.push(formatAgo(ago, ctx.now));
  return out;
}

function lastSegment(path: string | undefined): string | undefined {
  if (path === undefined) return undefined;
  const parts = path.split("/").filter((p) => p.length > 0);
  const last = parts[parts.length - 1];
  return last === undefined || last === "course files" ? undefined : last;
}
