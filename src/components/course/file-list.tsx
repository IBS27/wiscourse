import { useMemo, useState } from "react";
import { Folder, FolderOpen, Lock, Search, SearchX } from "lucide-react";
import { UnreadDot } from "./unread-dot";
import { FileTypeIcon } from "./file-icon";
import {
  folderPath,
  folderPathLabel,
  type FileDoc,
  type FolderNode,
  type FolderTree,
} from "./file-tree";
import { cn } from "@/lib/utils";

interface Row {
  file: FileDoc;
  /** Only in search results, where the row is out of its folder's context. */
  path?: string;
}

/** Name · folder count · new-dot; the count drops while a preview is open. */
const COLS = "grid-cols-[minmax(0,1fr)_72px_6px] gap-x-5";
const COLS_COMPACT = "grid-cols-[minmax(0,1fr)_6px] gap-x-3";

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
  unreadFolders,
  compact = false,
  onSelectFolder,
  onSelectFile,
  className,
}: {
  tree: FolderTree;
  folder: FolderNode | undefined;
  selectedFileId: number | undefined;
  isNew: (file: FileDoc) => boolean;
  /** Folders holding an unseen, recently added file. */
  unreadFolders: Set<number>;
  /** A preview is open beside the list: names only. */
  compact?: boolean;
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

  const folders = searching ? [] : (folder?.children ?? []);
  const crumbs = folderPath(tree, folder?.folder.canvasId);
  const cols = compact ? COLS_COMPACT : COLS;
  const rowCls = cn(
    "relative grid min-h-10 w-full items-center px-4 py-[7px] text-left text-[13px] transition-colors outline-none hover:bg-hover focus-visible:bg-hover",
    "after:absolute after:right-0 after:bottom-0 after:left-10 after:h-px after:bg-line",
    cols,
  );

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
                {i > 0 && (
                  <span className="text-line-2" aria-hidden>
                    /
                  </span>
                )}
                {i === crumbs.length - 1 ? (
                  <span className="truncate font-medium text-ink">{node.folder.name}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectFolder(node.folder.canvasId)}
                    className="truncate rounded px-[2px] transition-colors hover:text-ink"
                  >
                    {node.folder.name}
                  </button>
                )}
              </span>
            ))
          )}
        </div>
        <label className="ml-auto flex h-7 w-[140px] shrink-0 items-center gap-[7px] rounded-md border border-line bg-surface px-[9px] transition-colors focus-within:border-line-2 xl:w-[180px]">
          <Search className="size-[13px] shrink-0 text-ink-3" aria-hidden />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter files…"
            aria-label="Filter files"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-3"
          />
        </label>
      </div>

      {rows.length === 0 && folders.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          {searching ? (
            <SearchX className="size-5 text-ink-3" aria-hidden />
          ) : (
            <FolderOpen className="size-5 text-ink-3" aria-hidden />
          )}
          <p className="text-[13px] text-ink-2">
            {searching ? `No files match “${filter.trim()}”` : "This folder is empty"}
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {folders.map((child) => (
            <button
              key={child.folder.canvasId}
              type="button"
              onClick={() => onSelectFolder(child.folder.canvasId)}
              className={rowCls}
            >
              <span className="flex min-w-0 items-center gap-[10px]">
                <Folder className="size-[14px] shrink-0 text-ink-3" aria-hidden />
                <span className="truncate">{child.folder.name}</span>
              </span>
              {!compact && (
                <>
                  <span className="tabular text-right text-[12px] text-ink-3">
                    {child.totalFiles} file{child.totalFiles === 1 ? "" : "s"}
                  </span>
                </>
              )}
              <span className="flex justify-end">
                {unreadFolders.has(child.folder.canvasId) && <UnreadDot />}
              </span>
            </button>
          ))}
          {rows.map(({ file, path }) => {
            const selected = file.canvasId === selectedFileId;
            const unread = isNew(file);
            return (
              <button
                key={file.canvasId}
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={() => onSelectFile(file.canvasId)}
                className={cn(rowCls, selected && "bg-chip hover:bg-chip")}
              >
                <span className="flex min-w-0 items-center gap-[10px]">
                  {file.lockedForUser === true ? (
                    <Lock className="size-[14px] shrink-0 text-ink-3" aria-label="Locked" />
                  ) : (
                    <FileTypeIcon contentType={file.contentType} filename={file.filename} />
                  )}
                  <span className="min-w-0">
                    <span
                      className={cn(
                        compact ? "line-clamp-2 leading-[1.4]" : "block truncate",
                        unread && "font-medium",
                      )}
                    >
                      {file.displayName}
                    </span>
                    {path !== undefined && path !== "" && (
                      <span className="block truncate text-[12px] text-ink-3">{path}</span>
                    )}
                  </span>
                </span>
                {!compact && <span />}
                <span className="flex justify-end">{unread && <UnreadDot />}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
