import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Folder, FolderOpen, Images } from "lucide-react";
import { folderPath, splitAssetFolders, type FolderNode, type FolderTree } from "./file-tree";
import { cn } from "@/lib/utils";

/** The left pane of 4-A: Canvas' folder hierarchy, and the only place
 *  subfolders are listed. Folders above the selection are forced open — a
 *  deep link cannot land on a hidden row — and the selected folder opens
 *  by default so its subfolders show. Canvas' image-asset folders fold
 *  into one "Course images" group under the folders people named. */
export function FileTreePane({
  tree,
  selectedFolderId,
  onSelect,
  className,
}: {
  tree: FolderTree;
  selectedFolderId: number | undefined;
  onSelect: (folderCanvasId: number) => void;
  className?: string;
}) {
  const [overrides, setOverrides] = useState<ReadonlyMap<number, boolean>>(
    () => new Map<number, boolean>(),
  );
  /** Parents whose "Course images" group the student opened. */
  const [openGroups, setOpenGroups] = useState<ReadonlySet<number>>(() => new Set<number>());

  /** Root to selection. All but the last are forced open. */
  const path = useMemo(
    () => new Set(folderPath(tree, selectedFolderId).map((node) => node.folder.canvasId)),
    [tree, selectedFolderId],
  );

  const rootId = tree.root?.folder.canvasId;
  const ancestor = (canvasId: number) => path.has(canvasId) && canvasId !== selectedFolderId;
  const isOpen = (canvasId: number) =>
    ancestor(canvasId) ||
    (overrides.get(canvasId) ?? (canvasId === rootId || canvasId === selectedFolderId));

  const toggle = (canvasId: number) => {
    const closing = isOpen(canvasId);
    setOverrides((prev) => new Map(prev).set(canvasId, !closing));
    // Collapsing a folder that holds the selection would hide it, so the
    // folder becomes the selection instead.
    if (closing && ancestor(canvasId)) onSelect(canvasId);
  };

  const groupOpen = (parentId: number, assets: FolderNode[]) =>
    openGroups.has(parentId) || assets.some((node) => path.has(node.folder.canvasId));
  const toggleGroup = (parentId: number) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (!next.delete(parentId)) next.add(parentId);
      return next;
    });

  if (tree.root === undefined) return null;

  return (
    <nav
      aria-label="Folders"
      className={cn("overflow-y-auto border-r border-line bg-surface px-2 py-[6px] text-[13px]", className)}
    >
      <FolderRows
        node={tree.root}
        indent={0}
        isOpen={isOpen}
        groupOpen={groupOpen}
        selectedFolderId={selectedFolderId}
        onSelect={onSelect}
        onToggle={toggle}
        onToggleGroup={toggleGroup}
      />
    </nav>
  );
}

const ROW = "flex h-[30px] items-center rounded-md pr-2 transition-colors";
const indentStyle = (level: number) => ({ paddingLeft: 2 + level * 14 });

function FolderRows({
  node,
  indent,
  isOpen,
  groupOpen,
  selectedFolderId,
  onSelect,
  onToggle,
  onToggleGroup,
}: {
  node: FolderNode;
  /** Levels added by enclosing "Course images" groups. */
  indent: number;
  isOpen: (canvasId: number) => boolean;
  groupOpen: (parentId: number, assets: FolderNode[]) => boolean;
  selectedFolderId: number | undefined;
  onSelect: (canvasId: number) => void;
  onToggle: (canvasId: number) => void;
  onToggleGroup: (parentId: number) => void;
}) {
  const id = node.folder.canvasId;
  const open = isOpen(id);
  const selected = selectedFolderId === id;
  const hasChildren = node.children.length > 0;
  const level = node.depth + indent;
  const { named, assets } = splitAssetFolders(node.children);
  const assetsOpen = open && assets.length > 0 && groupOpen(id, assets);

  const rows = (list: FolderNode[], extra: number) =>
    list.map((child) => (
      <FolderRows
        key={child.folder.canvasId}
        node={child}
        indent={extra}
        isOpen={isOpen}
        groupOpen={groupOpen}
        selectedFolderId={selectedFolderId}
        onSelect={onSelect}
        onToggle={onToggle}
        onToggleGroup={onToggleGroup}
      />
    ));

  return (
    <>
      <div
        className={cn(
          ROW,
          selected
            ? "bg-chip font-medium text-ink"
            : "text-ink-2 hover:bg-hover hover:text-ink",
        )}
        style={indentStyle(level)}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(id)}
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${node.folder.name}`}
            className="grid size-[18px] shrink-0 place-items-center rounded text-ink-3 transition-colors hover:text-ink"
          >
            {open ? (
              <ChevronDown className="size-[14px]" />
            ) : (
              <ChevronRight className="size-[14px]" />
            )}
          </button>
        ) : (
          <span className="size-[18px] shrink-0" aria-hidden />
        )}
        <button
          type="button"
          onClick={() => onSelect(id)}
          aria-current={selected ? "true" : undefined}
          title={node.folder.name}
          className="flex min-w-0 flex-1 items-center gap-2 py-1 pl-[2px] text-left outline-none focus-visible:underline"
        >
          {open && hasChildren ? (
            <FolderOpen className="size-[14px] shrink-0 text-ink-3" aria-hidden />
          ) : (
            <Folder className="size-[14px] shrink-0 text-ink-3" aria-hidden />
          )}
          <span className="truncate">{node.folder.name}</span>
          <span className="tabular ml-auto shrink-0 pl-2 text-[11.5px] font-normal text-ink-3">
            {node.totalFiles}
          </span>
        </button>
      </div>

      {open && rows(named, indent)}
      {open && assets.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => onToggleGroup(id)}
            aria-expanded={assetsOpen}
            className={cn(
              ROW,
              "w-full gap-2 text-left text-ink-3 outline-none hover:bg-hover hover:text-ink-2 focus-visible:bg-hover",
            )}
            style={indentStyle(level + 1)}
          >
            <span className="grid size-[18px] shrink-0 place-items-center">
              {assetsOpen ? (
                <ChevronDown className="size-[14px]" aria-hidden />
              ) : (
                <ChevronRight className="size-[14px]" aria-hidden />
              )}
            </span>
            <Images className="-ml-[6px] size-[14px] shrink-0" aria-hidden />
            <span className="truncate">Course images</span>
            <span className="tabular ml-auto shrink-0 pl-2 text-[11.5px]">
              {assets.length} folder{assets.length === 1 ? "" : "s"}
            </span>
          </button>
          {assetsOpen && rows(assets, indent + 1)}
        </>
      )}
    </>
  );
}
