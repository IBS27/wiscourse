import { ChevronLeft, ChevronRight, Folder, Lock } from "lucide-react";
import { SectionLabel } from "@/components/app/bits";
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
            className="flex h-11 shrink-0 items-center gap-[10px] border-b border-line px-4 text-left text-[13px] active:bg-hover"
          >
            <Folder className="size-[14px] shrink-0 text-ink-3" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{child.folder.name}</span>
            <span className="tabular shrink-0 text-xs text-ink-3">
              {child.totalFiles} item{child.totalFiles === 1 ? "" : "s"}
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
          <p className="p-6 text-center text-[13px] text-ink-3">
            {atRoot ? "No files yet" : "This folder is empty"}
          </p>
        )}

        {atRoot && recent.length > 0 && (
          <>
            <SectionLabel className="px-4 pt-4 pb-[6px]">Recently added</SectionLabel>
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
      className="flex shrink-0 items-center gap-[10px] border-b border-line px-4 py-[9px] text-left text-[13px] active:bg-hover"
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
