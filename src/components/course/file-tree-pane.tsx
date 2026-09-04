import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { UnreadDot } from "./unread-dot";
import { folderPath, type FolderNode, type FolderTree } from "./file-tree";
import { cn } from "@/lib/utils";

/** The left pane of 4-A: Canvas' folder hierarchy. Folders above the
 *  selection are forced open — a deep link cannot land on a hidden row. */
export function FileTreePane({
  tree,
  selectedFolderId,
  unreadFolders,
  onSelect,
  className,
}: {
  tree: FolderTree;
  selectedFolderId: number | undefined;
  /** Folders holding an unseen, recently added file. */
  unreadFolders: Set<number>;
  onSelect: (folderCanvasId: number) => void;
  className?: string;
}) {
  const [overrides, setOverrides] = useState<ReadonlyMap<number, boolean>>(
    () => new Map<number, boolean>(),
  );

  /** Strict ancestors of the selection — forced open. */
  const ancestors = useMemo(() => {
    const path = folderPath(tree, selectedFolderId);
    return new Set(path.slice(0, -1).map((node) => node.folder.canvasId));
  }, [tree, selectedFolderId]);

  const rootId = tree.root?.folder.canvasId;
  const isOpen = (canvasId: number) =>
    ancestors.has(canvasId) || (overrides.get(canvasId) ?? canvasId === rootId);

  const toggle = (canvasId: number) => {
    const closing = isOpen(canvasId);
    setOverrides((prev) => new Map(prev).set(canvasId, !closing));
    // Collapsing a folder that holds the selection would hide it, so the
    // folder becomes the selection instead.
    if (closing && ancestors.has(canvasId)) onSelect(canvasId);
  };

  if (tree.root === undefined) return null;

  return (
    <nav
      aria-label="Folders"
      className={cn("overflow-y-auto border-r border-line bg-sunken p-2 text-[13px]", className)}
    >
      <FolderRows
        node={tree.root}
        isOpen={isOpen}
        selectedFolderId={selectedFolderId}
        unreadFolders={unreadFolders}
        onSelect={onSelect}
        onToggle={toggle}
      />
    </nav>
  );
}

function FolderRows({
  node,
  isOpen,
  selectedFolderId,
  unreadFolders,
  onSelect,
  onToggle,
}: {
  node: FolderNode;
  isOpen: (canvasId: number) => boolean;
  selectedFolderId: number | undefined;
  unreadFolders: Set<number>;
  onSelect: (canvasId: number) => void;
  onToggle: (canvasId: number) => void;
}) {
  const id = node.folder.canvasId;
  const open = isOpen(id);
  const selected = selectedFolderId === id;
  const hasChildren = node.children.length > 0;

  return (
    <>
      <div
        className={cn(
          "flex h-7 items-center rounded-[7px] pr-2 text-ink-2 hover:bg-hover",
          selected && "bg-surface text-ink shadow-[inset_0_0_0_1px_var(--line)]",
        )}
        style={{ paddingLeft: 4 + node.depth * 14 }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(id)}
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${node.folder.name}`}
            className="grid size-[18px] shrink-0 place-items-center rounded text-ink-3 hover:text-ink-2"
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
          className="flex min-w-0 flex-1 items-center gap-2 py-1 pl-1 text-left"
        >
          <span className="truncate">{node.folder.name}</span>
          <span className="ml-auto flex shrink-0 items-center gap-[6px] pl-2">
            {unreadFolders.has(id) && <UnreadDot />}
            <span className="text-[11px] text-ink-3 tabular">{node.totalFiles}</span>
          </span>
        </button>
      </div>

      {open &&
        node.children.map((child) => (
          <FolderRows
            key={child.folder.canvasId}
            node={child}
            isOpen={isOpen}
            selectedFolderId={selectedFolderId}
            unreadFolders={unreadFolders}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}
