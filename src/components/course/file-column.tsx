import { ChevronLeft, ChevronRight, Folder, FolderOpen, Lock } from "lucide-react";
import { UnreadDot } from "./unread-dot";
import { FileTypeIcon } from "./file-icon";
import {
  fileAddedAt,
  folderPath,
  folderPathLabel,
  recentFiles,
  type FileDoc,
  type FolderNode,
  type FolderTree,
} from "./file-tree";
import { formatMonthDayYear } from "@/lib/dates";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

const RECENT_COUNT = 5;

/** Hairline inset to the name column, as on every other list. */
const ROW =
  "relative transition-colors outline-none hover:bg-hover active:bg-hover focus-visible:bg-hover after:absolute after:right-0 after:bottom-0 after:left-10 after:h-px after:bg-line";

/**
 * 4-B, the mobile Files tab: one column, folders as rows, and the five
 * newest files pinned under the root so what a student came for is one tap
 * away.
 */
export function FileColumn({
  tree,
  folder,
  newCount,
  isNew,
  onSelectFolder,
  onSelectFile,
  className,
}: {
  tree: FolderTree;
  folder: FolderNode | undefined;
  /** Recently added and never opened — the "3 new" in the header. */
  newCount: number;
  isNew: (file: FileDoc) => boolean;
  onSelectFolder: (canvasId: number) => void;
  onSelectFile: (canvasId: number) => void;
  className?: string;
}) {
  const crumbs = folderPath(tree, folder?.folder.canvasId);
  const atRoot = crumbs.length <= 1;
  const parent = crumbs.length >= 2 ? crumbs[crumbs.length - 2] : undefined;
  const recent = atRoot ? recentFiles(tree, RECENT_COUNT) : [];
  const empty = (folder?.children.length ?? 0) === 0 && (folder?.files.length ?? 0) === 0;

  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <div className="flex h-11 shrink-0 items-center gap-[6px] border-b border-line px-4 text-[12.5px] whitespace-nowrap text-ink-3">
        {parent !== undefined && (
          <button
            type="button"
            onClick={() => onSelectFolder(parent.folder.canvasId)}
            aria-label={`Back to ${parent.folder.name}`}
            className="-ml-2 shrink-0 rounded-md p-1 text-ink-3"
          >
            <ChevronLeft className="size-[18px]" />
          </button>
        )}
        <span className="truncate font-medium text-ink">{folder?.folder.name ?? "Files"}</span>
        <span className="ml-auto shrink-0 text-xs">
          {atRoot
            ? `${tree.files.length} file${tree.files.length === 1 ? "" : "s"}`
            : `${folder?.totalFiles ?? 0} file${folder?.totalFiles === 1 ? "" : "s"}`}
          {atRoot && newCount > 0 ? ` · ${newCount} new` : ""}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {(folder?.children ?? []).map((child) => (
          <button
            key={child.folder.canvasId}
            type="button"
            onClick={() => onSelectFolder(child.folder.canvasId)}
            className={cn("flex h-11 shrink-0 items-center gap-[10px] px-4 text-left text-[13px]", ROW)}
          >
            <Folder className="size-[14px] shrink-0 text-ink-3" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{child.folder.name}</span>
            <span className="tabular shrink-0 text-xs text-ink-3">
              {child.totalFiles} file{child.totalFiles === 1 ? "" : "s"}
            </span>
            <ChevronRight className="size-[14px] shrink-0 text-ink-3" aria-hidden />
          </button>
        ))}

        {(folder?.files ?? []).map((file) => (
          <FileRow
            key={file.canvasId}
            file={file}
            unread={isNew(file)}
            onSelect={() => onSelectFile(file.canvasId)}
          />
        ))}

        {empty && (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <FolderOpen className="size-5 text-ink-3" aria-hidden />
            <p className="text-[13px] text-ink-2">{atRoot ? "No files yet" : "This folder is empty"}</p>
          </div>
        )}

        {atRoot && recent.length > 0 && (
          <>
            <div className="px-4 pt-6 pb-2 text-[13px] font-semibold tracking-[-0.005em] text-ink">
              Recently added
            </div>
            {recent.map((file) => (
              <FileRow
                key={`recent-${file.canvasId}`}
                file={file}
                unread={isNew(file)}
                meta={`${folderPathLabel(tree, file.folderCanvasId)} · ${formatMonthDayYear(fileAddedAt(file))}`}
                onSelect={() => onSelectFile(file.canvasId)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function FileRow({
  file,
  unread,
  meta,
  onSelect,
}: {
  file: FileDoc;
  unread: boolean;
  /** Second line: where the file lives, for rows outside their folder. */
  meta?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn("flex min-h-11 shrink-0 items-center gap-[10px] px-4 py-[9px] text-left text-[13px]", ROW)}
    >
      {file.lockedForUser === true ? (
        <Lock className="size-[14px] shrink-0 text-ink-3" aria-label="Locked" />
      ) : (
        <FileTypeIcon contentType={file.contentType} filename={file.filename} />
      )}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate", unread && "font-medium")}>{file.displayName}</span>
        {meta !== undefined && (
          <span className="block truncate text-[11.5px] text-ink-3">{meta}</span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="tabular text-xs text-ink-3">{formatBytes(file.size)}</span>
        {unread && <UnreadDot />}
      </span>
    </button>
  );
}
