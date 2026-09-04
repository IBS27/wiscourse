import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { FileColumn } from "@/components/course/file-column";
import { FileList } from "@/components/course/file-list";
import { FilePreview, PreviewEmpty } from "@/components/course/file-preview";
import { FileTreePane } from "@/components/course/file-tree-pane";
import {
  buildTree,
  fileAddedAt,
  unreadFolderIds,
  type FileDoc,
} from "@/components/course/file-tree";
import { courseStyle, useCourses, useIsMobile, useNow } from "@/lib/hooks";
import { FRESH_MS, useSeen } from "@/lib/seen";
import { cn } from "@/lib/utils";

/** Which folder is open and which file is previewed — in the URL so page
 *  links, ⌘K results and reloads all land on the same view. */
export interface FilesSearch {
  folder?: number;
  file?: number;
}

function canvasId(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export const Route = createFileRoute("/courses/$courseId/files")({
  validateSearch: (search: Record<string, unknown>): FilesSearch => ({
    folder: canvasId(search.folder),
    file: canvasId(search.file),
  }),
  component: CourseFiles,
});

/** Wide enough for a PDF page to be readable, narrow enough to keep the list. */
const PREVIEW_WIDTH = "w-[330px] shrink-0 border-l border-line lg:w-[400px] xl:w-[460px]";

/**
 * 4-A on desktop (tree · list · preview), 4-B on mobile (one column, the
 * preview as a full-screen overlay). Selection is replaced rather than
 * pushed, so back leaves the tab instead of unwinding every row clicked.
 */
function CourseFiles() {
  const { courseId } = Route.useParams();
  const courseCanvasId = Number(courseId);
  const valid = Number.isInteger(courseCanvasId) && courseCanvasId > 0;
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { color } = useCourses();
  const data = useQuery(api.files.tree, valid ? { courseCanvasId } : "skip");
  const seen = useSeen("file");
  const now = useNow();
  const mobile = useIsMobile();

  const tree = useMemo(() => buildTree(data?.folders ?? [], data?.files ?? []), [data]);

  const selectedFile = search.file === undefined ? undefined : tree.filesById.get(search.file);
  const previewFile = selectedFile ?? (search.file === undefined ? undefined : { canvasId: search.file });
  // A deep link that names only a file still opens in the folder it lives in.
  const folderId = search.folder ?? selectedFile?.folderCanvasId ?? tree.root?.folder.canvasId;
  const folder = folderId === undefined ? undefined : tree.byId.get(folderId);

  /** Posted recently and never opened — the one thing a dot ever means here. */
  const isNew = (file: FileDoc) =>
    fileAddedAt(file) >= now - FRESH_MS && !seen.has(file.canvasId);
  const newCount = tree.files.filter(isNew).length;

  const selectFolder = (id: number) => {
    void navigate({ search: (prev) => ({ ...prev, folder: id }), replace: true });
  };
  const selectFile = (id: number | undefined) => {
    void navigate({ search: (prev) => ({ ...prev, file: id }), replace: true });
  };

  const style = courseStyle(color(valid ? courseCanvasId : undefined));

  if (data === undefined) return <FilesSkeleton mobile={mobile} />;
  if (tree.files.length === 0 && previewFile === undefined) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-10 text-[13px] text-ink-3">
        No files yet
      </div>
    );
  }

  if (mobile) {
    return (
      <div className="flex min-h-0 flex-1 flex-col" style={style}>
        <FileColumn
          tree={tree}
          folder={folder}
          newCount={newCount}
          isNew={isNew}
          onSelectFolder={selectFolder}
          onSelectFile={selectFile}
        />
        <Dialog
          open={previewFile !== undefined}
          onOpenChange={(open) => {
            if (!open) selectFile(undefined);
          }}
        >
          {previewFile !== undefined && (
            <DialogContent
              aria-describedby={undefined}
              className="top-0 left-0 flex h-dvh w-full max-w-none translate-x-0 flex-col rounded-none border-0"
              style={style}
            >
              <DialogTitle className="sr-only">{selectedFile?.displayName ?? "File"}</DialogTitle>
              {/* The back arrow is the only way out: a full-screen sheet has
                  no overlay left to click. */}
              <FilePreview
                key={previewFile.canvasId}
                file={previewFile}
                courseId={courseId}
                onClose={() => selectFile(undefined)}
                className="flex-1"
              />
            </DialogContent>
          )}
        </Dialog>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1" style={style}>
      <FileTreePane
        tree={tree}
        selectedFolderId={folderId}
        unreadFolders={unreadFolderIds(tree, isNew)}
        onSelect={selectFolder}
        className="w-[200px] shrink-0"
      />
      <FileList
        tree={tree}
        folder={folder}
        selectedFileId={selectedFile?.canvasId}
        isNew={isNew}
        onSelectFolder={selectFolder}
        onSelectFile={selectFile}
        className="min-h-0 flex-1"
      />
      {previewFile === undefined ? (
        <PreviewEmpty className={PREVIEW_WIDTH} />
      ) : (
        <FilePreview
          key={previewFile.canvasId}
          file={previewFile}
          courseId={courseId}
          className={PREVIEW_WIDTH}
        />
      )}
    </div>
  );
}

function FilesSkeleton({ mobile }: { mobile: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 animate-pulse">
      <div className={cn("min-w-0 flex-1", mobile && "w-full")}>
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <div key={row} className="flex h-11 items-center gap-[10px] border-b border-line px-4">
            <div className="size-[14px] rounded bg-chip" />
            <div className="h-[13px] w-1/3 rounded bg-chip" />
            <div className="ml-auto h-[13px] w-[52px] rounded bg-chip" />
          </div>
        ))}
      </div>
      {!mobile && (
        <div className={cn(PREVIEW_WIDTH, "space-y-3 bg-sunken p-5")}>
          <div className="h-4 w-2/3 rounded bg-chip" />
          <div className="h-[220px] w-full rounded bg-chip" />
        </div>
      )}
    </div>
  );
}
