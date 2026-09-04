// Canvas hands the Files tab two flat arrays — folders naming their parent,
// files naming their folder. All the shape-building lives here so the three
// panes stay presentational and agree on counts, paths and ordering.

import type { Doc } from "../../../convex/_generated/dataModel";

export type FolderDoc = Doc<"folders">;
export type FileDoc = Doc<"files">;

export interface FolderNode {
  folder: FolderDoc;
  /** 0 for the root folder ("course files"). */
  depth: number;
  children: FolderNode[];
  /** Files directly in this folder, hidden ones dropped, sorted by name. */
  files: FileDoc[];
  /** Files here and in every folder underneath. */
  totalFiles: number;
}

export interface FolderTree {
  /** Undefined only when the course has no folders at all. */
  root: FolderNode | undefined;
  byId: Map<number, FolderNode>;
  filesById: Map<number, FileDoc>;
  /** Every visible file in the course, sorted by name. */
  files: FileDoc[];
}

/** "Week 2" before "Week 10", and case-insensitive. */
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function buildTree(folders: FolderDoc[], files: FileDoc[]): FolderTree {
  const byId = new Map<number, FolderNode>();
  for (const folder of folders) {
    byId.set(folder.canvasId, { folder, depth: 0, children: [], files: [], totalFiles: 0 });
  }

  // Canvas gives exactly one parentless folder per course.
  const roots: FolderNode[] = [];
  for (const node of byId.values()) {
    const parentId = node.folder.parentFolderCanvasId;
    const parent = parentId === undefined ? undefined : byId.get(parentId);
    if (parent === undefined) roots.push(node);
    else parent.children.push(node);
  }
  const root = roots[0];

  const filesById = new Map<number, FileDoc>();
  const visible: FileDoc[] = [];
  for (const file of files) {
    filesById.set(file.canvasId, file);
    if (file.hidden === true) continue;
    visible.push(file);
    const folderId = file.folderCanvasId;
    const holder = (folderId === undefined ? undefined : byId.get(folderId)) ?? root;
    holder?.files.push(file);
  }

  for (const node of byId.values()) {
    node.children.sort(
      (a, b) =>
        (a.folder.position ?? Number.MAX_SAFE_INTEGER) -
          (b.folder.position ?? Number.MAX_SAFE_INTEGER) ||
        collator.compare(a.folder.name, b.folder.name),
    );
    node.files.sort((a, b) => collator.compare(a.displayName, b.displayName));
  }

  if (root !== undefined) measure(root, 0);
  visible.sort((a, b) => collator.compare(a.displayName, b.displayName));
  return { root, byId, filesById, files: visible };
}

/** Depth and nested file total, cached on the node in one walk. */
function measure(node: FolderNode, depth: number): number {
  node.depth = depth;
  let total = node.files.length;
  for (const child of node.children) total += measure(child, depth + 1);
  node.totalFiles = total;
  return total;
}

/** Root first, target last. Empty when the folder is unknown. */
export function folderPath(
  tree: FolderTree,
  folderCanvasId: number | undefined,
): FolderNode[] {
  const path: FolderNode[] = [];
  let node = folderCanvasId === undefined ? undefined : tree.byId.get(folderCanvasId);
  while (node !== undefined) {
    path.unshift(node);
    const parentId = node.folder.parentFolderCanvasId;
    node = parentId === undefined ? undefined : tree.byId.get(parentId);
  }
  return path;
}

/** "Lectures / Week 4" — where a file lives, for rows outside their folder. */
export function folderPathLabel(
  tree: FolderTree,
  folderCanvasId: number | undefined,
): string {
  const path = folderPath(tree, folderCanvasId);
  if (path.length === 0) return "";
  const below = path.slice(1);
  return (below.length === 0 ? path : below).map((node) => node.folder.name).join(" / ");
}

/** Canvas timestamps are optional; the sync time is the last resort. */
export function fileAddedAt(file: FileDoc): number {
  return file.updatedAt ?? file.modifiedAt ?? file._creationTime;
}

/** Newest first, across the whole course. */
export function recentFiles(tree: FolderTree, limit: number): FileDoc[] {
  return [...tree.files].sort((a, b) => fileAddedAt(b) - fileAddedAt(a)).slice(0, limit);
}

/** Folders holding at least one file the caller considers new. */
export function unreadFolderIds(
  tree: FolderTree,
  isNew: (file: FileDoc) => boolean,
): Set<number> {
  const ids = new Set<number>();
  const walk = (node: FolderNode): boolean => {
    let any = node.files.some(isNew);
    for (const child of node.children) {
      if (walk(child)) any = true;
    }
    if (any) ids.add(node.folder.canvasId);
    return any;
  };
  if (tree.root !== undefined) walk(tree.root);
  return ids;
}
