import { dayKeyOf, formatDayShort, formatTime } from "@/lib/dates";
import { formatBytes } from "@/lib/format";
import { type SearchItem } from "@/lib/search";

const KIND_LABEL = {
  assignment: "Assignment",
  page: "Page",
  file: "File",
  announcement: "Announcement",
  module: "Module",
  course: "Course",
} as const;

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
      <aside className="w-[250px] shrink-0 border-l border-line bg-sunken p-[14px] text-[12.5px] text-ink-3">
        Nothing highlighted.
      </aside>
    );
  }

  const meta = [KIND_LABEL[item.kind], moduleName, timing(item)].filter(
    (part): part is string => part !== undefined,
  );

  return (
    <aside className="w-[250px] shrink-0 border-l border-line bg-sunken p-[14px] text-[12.5px] text-ink-2">
      <div className="mb-[3px] text-[13.5px] leading-snug font-semibold tracking-[-0.01em] text-ink">
        {item.title}
      </div>
      <div className="mb-3 text-[11.5px] text-ink-3">{meta.join(" · ")}</div>

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
      {nextTitle !== undefined && <Kv label="Next" value={nextTitle} />}
    </aside>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-t border-line py-[6px] text-[12px]">
      <span className="shrink-0">{label}</span>
      <span className="truncate font-medium text-ink">{value}</span>
    </div>
  );
}

/** "due Fri Aug 21, 11:59 PM" / "updated Aug 18" / "posted Aug 18". */
function timing(item: SearchItem): string | undefined {
  if (item.kind === "assignment" && item.dueAt !== undefined) {
    return `due ${formatDayShort(dayKeyOf(item.dueAt))}, ${formatTime(item.dueAt)}`;
  }
  if (item.kind === "announcement" && item.postedAt !== undefined) {
    return `posted ${formatDayShort(dayKeyOf(item.postedAt))}`;
  }
  if (item.updatedAt !== undefined) {
    return `updated ${formatDayShort(dayKeyOf(item.updatedAt))}`;
  }
  return undefined;
}
