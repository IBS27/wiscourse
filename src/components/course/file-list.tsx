import { useMemo, useState } from "react";
import { FolderOpen, Lock, Search, SearchX } from "lucide-react";
import { FileTypeIcon } from "./file-icon";
import {
  folderPath,
  folderPathLabel,
  recentFiles,
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

const RECENT_COUNT = 8;

interface Section {
  label?: string;
  rows: Row[];
}

/**
 * The middle pane of 4-A. Subfolders live only in the tree beside it, so
 * this pane is files: the open folder's own, with the newest across the
 * course pinned above them at the root. The filter does double duty: empty
 * it narrows the open folder, typed it searches the whole course and each
 * row carries the folder it came from.
 */
export function FileList({
  tree,
  folder,
  selectedFileId,
  isNew,
  compact = false,
  onSelectFolder,
  onSelectFile,
  className,
}: {
  tree: FolderTree;
  folder: FolderNode | undefined;
  selectedFileId: number | undefined;
  isNew: (file: FileDoc) => boolean;
  /** A preview is open beside the list: names only. */
  compact?: boolean;
  onSelectFolder: (canvasId: number) => void;
  onSelectFile: (canvasId: number) => void;
  className?: string;
}) {
  const [filter, setFilter] = useState("");
  const query = filter.trim().toLowerCase();
  const searching = query !== "";

  const crumbs = folderPath(tree, folder?.folder.canvasId);
  const atRoot = crumbs.length <= 1;

  const sections = useMemo<Section[]>(() => {
    if (searching) {
      const rows = tree.files
        .filter((file) => file.displayName.toLowerCase().includes(query))
        .map((file) => ({ file, path: folderPathLabel(tree, file.folderCanvasId) }));
      return [{ rows }];
    }
    const own = (folder?.files ?? []).map((file) => ({ file }));
    if (!atRoot) return [{ rows: own }];
    const recent = recentFiles(tree, RECENT_COUNT).map((file) => ({
      file,
      path: folderPathLabel(tree, file.folderCanvasId),
    }));
    if (recent.length === 0) return [{ rows: own }];
    return own.length === 0
      ? [{ label: "Recently added", rows: recent }]
      : [
          { label: "Recently added", rows: recent },
          { label: "In this folder", rows: own },
        ];
  }, [tree, folder, query, searching, atRoot]);
  const total = sections.reduce((n, section) => n + section.rows.length, 0);
  const subfolders = folder?.children.length ?? 0;

  const rowCls = cn(
    "relative grid min-h-10 w-full items-center gap-x-3 px-4 py-[7px] text-left text-[13px] transition-colors outline-none hover:bg-hover focus-visible:bg-hover",
    "grid-cols-[minmax(0,1fr)] after:absolute after:right-4 after:bottom-0 after:left-10 after:h-px after:bg-line",
  );

  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <div className="flex h-11 shrink-0 items-center gap-[6px] border-b border-line px-4 text-[12.5px] whitespace-nowrap text-ink-3">
        <div className="flex min-w-0 items-center gap-[6px] overflow-hidden">
          {searching ? (
            <span className="truncate">
              {total} result{total === 1 ? "" : "s"} in this course
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

      {total === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          {searching ? (
            <SearchX className="size-5 text-ink-3" aria-hidden />
          ) : (
            <FolderOpen className="size-5 text-ink-3" aria-hidden />
          )}
          <p className="text-[13px] text-ink-2">
            {searching
              ? `No files match “${filter.trim()}”`
              : subfolders > 0
                ? "No files directly in this folder"
                : "This folder is empty"}
          </p>
          {!searching && subfolders > 0 && (
            <p className="text-[12.5px] text-ink-3">
              Its {subfolders} subfolder{subfolders === 1 ? " is" : "s are"} in the list on the left.
            </p>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          {sections.map((section) => (
            <div key={section.label ?? "files"}>
              {section.label !== undefined && (
                <div className="px-4 pt-5 pb-2 text-[13px] font-semibold tracking-[-0.005em] text-ink">
                  {section.label}
                </div>
              )}
              {section.rows.map(({ file, path }) => {
                const selected = file.canvasId === selectedFileId;
                const unread = isNew(file);
                // "Recently added" already says it; the pill marks new files
                // only where they sit among older ones.
                const pill = unread && section.label !== "Recently added";
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
                      <span
                        className={cn(
                          compact ? "line-clamp-2 leading-[1.4]" : "truncate",
                          "min-w-0 flex-1 text-ink",
                        )}
                      >
                        {file.displayName}
                      </span>
                      {unread && !pill && <span className="sr-only">(new)</span>}
                      {/* What the tab's "12 new" counts, visible on each file. */}
                      {pill && (
                        <span className="shrink-0 rounded-full bg-chip px-[7px] py-px text-[11.5px] font-medium text-ink-2">
                          New
                        </span>
                      )}
                      {/* Where it lives, in a fixed right column: only for rows out of their folder. */}
                      {path !== undefined && path !== "" && !compact && (
                        <span className="w-[160px] shrink-0 truncate text-right text-[12.5px] text-ink-3" title={path}>
                          {path}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
