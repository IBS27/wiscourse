import { useMemo, useState } from "react";
import { Lock, Search } from "lucide-react";
import { UnreadDot } from "./unread-dot";
import { FileTypeIcon } from "./file-icon";
import {
  fileAddedAt,
  folderPath,
  folderPathLabel,
  type FileDoc,
  type FolderNode,
  type FolderTree,
} from "./file-tree";
import { formatMonthDayYear } from "@/lib/dates";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Row {
  file: FileDoc;
  /** Only in search results, where the row is out of its folder's context. */
  path?: string;
}

/**
 * The middle pane of 4-A. The filter does double duty: empty it narrows the
 * open folder, typed it searches the whole course and each row carries the
 * folder it came from.
 */
export function FileList({
  tree,
  folder,
  selectedFileId,
  isNew,
  onSelectFolder,
  onSelectFile,
  className,
}: {
  tree: FolderTree;
  folder: FolderNode | undefined;
  selectedFileId: number | undefined;
  isNew: (file: FileDoc) => boolean;
  onSelectFolder: (canvasId: number) => void;
  onSelectFile: (canvasId: number) => void;
  className?: string;
}) {
  const [filter, setFilter] = useState("");
  const query = filter.trim().toLowerCase();
  const searching = query !== "";

  const rows = useMemo<Row[]>(() => {
    if (!searching) return (folder?.files ?? []).map((file) => ({ file }));
    return tree.files
      .filter((file) => file.displayName.toLowerCase().includes(query))
      .map((file) => ({ file, path: folderPathLabel(tree, file.folderCanvasId) }));
  }, [tree, folder, query, searching]);

  const crumbs = folderPath(tree, folder?.folder.canvasId);

  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <div className="flex h-11 shrink-0 items-center gap-[6px] border-b border-line px-4 text-[12.5px] whitespace-nowrap text-ink-3">
        <div className="flex min-w-0 items-center gap-[6px] overflow-hidden">
          {searching ? (
            <span className="truncate">
              {rows.length} result{rows.length === 1 ? "" : "s"} in this course
            </span>
          ) : (
            crumbs.map((node, i) => (
              <span key={node.folder.canvasId} className="flex min-w-0 items-center gap-[6px]">
                {i > 0 && <span aria-hidden>/</span>}
                {i === crumbs.length - 1 ? (
                  <span className="truncate font-medium text-ink">{node.folder.name}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectFolder(node.folder.canvasId)}
                    className="truncate hover:text-ink-2"
                  >
                    {node.folder.name}
                  </button>
                )}
              </span>
            ))
          )}
        </div>
        <label className="ml-auto flex h-7 w-[150px] shrink-0 items-center gap-[7px] rounded-[7px] border border-line bg-surface px-[9px] focus-within:border-line-2">
          <Search className="size-[13px] shrink-0 text-ink-3" aria-hidden />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter…"
            aria-label="Filter files"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-3"
          />
        </label>
      </div>

      <div className="eyebrow grid h-8 shrink-0 grid-cols-[minmax(0,1fr)_70px_64px_20px] items-center gap-3 border-b border-line px-4">
        <span>Name</span>
        <span>Size</span>
        <span>Added</span>
        <span className="sr-only">New</span>
      </div>

      {rows.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center text-[13px] text-ink-2">
          {searching ? `No files match “${filter.trim()}”` : "This folder is empty"}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {rows.map(({ file, path }) => {
            const selected = file.canvasId === selectedFileId;
            const unread = isNew(file);
            return (
              <button
                key={file.canvasId}
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelectFile(file.canvasId)}
                className={cn(
                  "grid min-h-10 w-full grid-cols-[minmax(0,1fr)_70px_64px_20px] items-center gap-3 border-b border-line px-4 py-[7px] text-left text-[13px] hover:bg-hover",
                  selected && "bg-hover shadow-[inset_2px_0_0_var(--c)]",
                )}
              >
                <span className="flex min-w-0 items-center gap-[10px]">
                  {file.lockedForUser === true ? (
                    <Lock className="size-[14px] shrink-0 text-ink-3" aria-label="Locked" />
                  ) : (
                    <FileTypeIcon contentType={file.contentType} filename={file.filename} />
                  )}
                  <span className="min-w-0">
                    <span className={cn("block truncate", unread && "font-medium")}>
                      {file.displayName}
                    </span>
                    {path !== undefined && path !== "" && (
                      <span className="block truncate text-[11.5px] text-ink-3">{path}</span>
                    )}
                  </span>
                </span>
                <span className="tabular text-xs text-ink-3">{formatBytes(file.size)}</span>
                <span className="tabular text-xs text-ink-3">
                  {formatMonthDayYear(fileAddedAt(file))}
                </span>
                <span className="flex justify-end">{unread && <UnreadDot />}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
