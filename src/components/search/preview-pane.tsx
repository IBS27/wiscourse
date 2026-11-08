import type { ComponentType } from "react";
import {
  File,
  FileText,
  GraduationCap,
  Megaphone,
  MousePointerClick,
  Rows3,
  ClipboardList,
} from "lucide-react";
import { dayKeyOf, formatDayShort, formatTime } from "@/lib/dates";
import { formatBytes } from "@/lib/format";
import { type SearchItem, type SearchKind } from "@/lib/search";

const KIND: Record<SearchKind, { label: string; icon: ComponentType<{ className?: string }> }> = {
  assignment: { label: "Assignment", icon: ClipboardList },
  page: { label: "Page", icon: FileText },
  file: { label: "File", icon: File },
  announcement: { label: "Announcement", icon: Megaphone },
  module: { label: "Module", icon: Rows3 },
  course: { label: "Course", icon: GraduationCap },
};

/**
 * The course-scoped palette's right-hand pane: enough about the highlighted
 * result to decide without opening it. The search index carries no bodies,
 * so there is no snippet to show — everything here is already in memory.
 */
export function PreviewPane({
  item,
  moduleName,
  nextTitle,
  seenAt,
  seenTracked,
}: {
  item: SearchItem | undefined;
  moduleName?: string;
  nextTitle?: string;
  seenAt?: number;
  /** False for kinds with no seen store — better no row than a wrong one. */
  seenTracked: boolean;
}) {
  if (item === undefined) {
    return (
      <aside className="flex w-[280px] shrink-0 flex-col items-center justify-center gap-2 border-l border-line bg-sunken px-6 text-center text-[12.5px] text-ink-3">
        <MousePointerClick className="size-[18px]" />
        Highlight a result to see its details.
      </aside>
    );
  }

  const { label, icon: Icon } = KIND[item.kind];
  const when = timing(item);
  const next = nextTitle?.trim();

  return (
    <aside className="flex w-[280px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-line bg-sunken p-[18px]">
      <div>
        <div className="mb-2 flex items-center gap-[6px] text-[12px] text-ink-3">
          <Icon className="size-[13px]" />
          {label}
          {moduleName !== undefined && (
            <>
              <span className="opacity-60">·</span>
              <span className="truncate">{moduleName}</span>
            </>
          )}
        </div>
        <div className="text-[15px] leading-[1.35] font-semibold tracking-[-0.015em] text-pretty text-ink">
          {item.title}
        </div>
        {when !== undefined && <div className="mt-1 text-[12.5px] text-ink-2">{when}</div>}
      </div>

      <dl className="flex flex-col gap-[2px] border-t border-line pt-3 text-[12.5px]">
        {seenTracked && (
          <Kv
            label="Viewed"
            value={seenAt === undefined ? "Never" : formatDayShort(dayKeyOf(seenAt))}
          />
        )}
        {item.kind === "file" && item.size !== undefined && (
          <Kv label="Size" value={formatBytes(item.size)} />
        )}
        {item.kind === "assignment" && item.pointsPossible !== undefined && (
          <Kv label="Points" value={String(item.pointsPossible)} />
        )}
        {item.kind === "module" && item.itemCount !== undefined && (
          <Kv label="Items" value={String(item.itemCount)} />
        )}
      </dl>

      {next !== undefined && next !== "" && (
        <div className="border-t border-line pt-3">
          <div className="mb-1 text-[12px] text-ink-3">Next in module</div>
          <div className="line-clamp-2 text-[12.5px] leading-[1.45] text-ink-2">{next}</div>
        </div>
      )}
    </aside>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="shrink-0 text-ink-3">{label}</dt>
      <dd className="min-w-0 truncate font-medium text-ink tabular">{value}</dd>
    </div>
  );
}

/** "Due Fri Aug 21, 11:59 PM" / "Updated Aug 18" / "Posted Aug 18". */
function timing(item: SearchItem): string | undefined {
  if (item.kind === "assignment" && item.dueAt !== undefined) {
    return `Due ${formatDayShort(dayKeyOf(item.dueAt))}, ${formatTime(item.dueAt)}`;
  }
  if (item.kind === "announcement" && item.postedAt !== undefined) {
    return `Posted ${formatDayShort(dayKeyOf(item.postedAt))}`;
  }
  if (item.updatedAt !== undefined) {
    return `Updated ${formatDayShort(dayKeyOf(item.updatedAt))}`;
  }
  return undefined;
}
