// Per-course content sync: modules + module items always, pages/folders/
// files only on a full sync. Pure helper — no registered Convex functions
// live here; the action in sync.ts calls this, and every write goes through
// the internalMutations in ../storeContent.ts.
//
// Two Canvas quirks drive the shape of this file:
// 1. `include[]=items` on /modules is best-effort — Canvas drops `items`
//    for modules past a size threshold, so those need a follow-up call.
// 2. Instructors can hide the Modules/Pages/Files nav tabs, and the
//    matching endpoints then answer 401/403. That is "this course has no
//    such content", not an error: we upsert an empty, pruning set so
//    previously synced rows disappear.

import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { tolerateDisabledTab, type CanvasClient } from "./client";
import {
  toMillis,
  type CanvasFile,
  type CanvasFolder,
  type CanvasModule,
  type CanvasModuleItem,
  type CanvasPage,
} from "./types";
import type {
  FileRow,
  FolderRow,
  ModuleItemRow,
  ModuleRow,
  PageRow,
} from "../storeContent";

const MODULE_STATES = new Set(["locked", "unlocked", "started", "completed"]);

const MODULE_ITEM_TYPES = new Set([
  "Assignment",
  "Page",
  "File",
  "Discussion",
  "Quiz",
  "ExternalUrl",
  "ExternalTool",
  "SubHeader",
]);

export async function syncCourseContent(
  ctx: ActionCtx,
  userId: string,
  client: CanvasClient,
  courseCanvasId: number,
  opts: { full: boolean },
): Promise<void> {
  await syncModules(ctx, userId, client, courseCanvasId);
  if (!opts.full) return;
  await syncPages(ctx, userId, client, courseCanvasId);
  await syncFolders(ctx, userId, client, courseCanvasId);
  await syncFiles(ctx, userId, client, courseCanvasId);
}

// ---------------------------------------------------------------------------
// Modules

// Modules run on delta syncs too: `state` and per-item completion flip as
// the student works through a course, and nothing else reports that.
async function syncModules(
  ctx: ActionCtx,
  userId: string,
  client: CanvasClient,
  courseCanvasId: number,
): Promise<void> {
  const modules = await tolerateDisabledTab(() =>
    client.getPaginated<CanvasModule>(`/courses/${courseCanvasId}/modules`, {
      "include[]": ["items", "content_details"],
    }),
    [],
  );

  const moduleRows: ModuleRow[] = [];
  const itemRows: ModuleItemRow[] = [];

  for (const module of modules) {
    moduleRows.push({
      canvasId: module.id,
      name: module.name,
      position: module.position,
      unlockAt: toMillis(module.unlock_at),
      state:
        module.state !== undefined && MODULE_STATES.has(module.state)
          ? module.state
          : undefined,
      prerequisiteModuleCanvasIds: module.prerequisite_module_ids ?? [],
      requireSequentialProgress: module.require_sequential_progress ?? false,
      published: module.published,
      itemCount: module.items_count,
    });

    // Canvas omits `items` entirely for large modules; only those need the
    // extra request.
    const items =
      module.items ??
      (await tolerateDisabledTab(() =>
        client.getPaginated<CanvasModuleItem>(
          `/courses/${courseCanvasId}/modules/${module.id}/items`,
          { "include[]": ["content_details"] },
        ),
      [],
      ));

    for (const item of items) {
      if (!MODULE_ITEM_TYPES.has(item.type)) continue;
      itemRows.push({
        canvasId: item.id,
        moduleCanvasId: item.module_id ?? module.id,
        position: item.position,
        indent: item.indent ?? 0,
        type: item.type,
        title: item.title,
        contentCanvasId: item.content_id,
        pageUrl: item.page_url,
        externalUrl: item.external_url,
        htmlUrl: item.html_url,
        published: item.published,
        completionRequirement: item.completion_requirement
          ? {
              type: item.completion_requirement.type,
              minScore: item.completion_requirement.min_score,
              completed: item.completion_requirement.completed,
            }
          : undefined,
      });
    }
  }

  // Always the complete module set, so pruning is safe on delta syncs too.
  await ctx.runMutation(internal.storeContent.upsertModules, {
    userId,
    courseCanvasId,
    rows: moduleRows,
    prune: true,
  });
  await ctx.runMutation(internal.storeContent.upsertModuleItems, {
    userId,
    courseCanvasId,
    rows: itemRows,
    prune: true,
  });
}

// ---------------------------------------------------------------------------
// Pages, folders, files (full sync only)

async function syncPages(
  ctx: ActionCtx,
  userId: string,
  client: CanvasClient,
  courseCanvasId: number,
): Promise<void> {
  const pages = await tolerateDisabledTab(() =>
    client.getPaginated<CanvasPage>(`/courses/${courseCanvasId}/pages`, {
      "include[]": ["body"],
    }),
    [],
  );
  // If Canvas declines to inline a body we leave it undefined rather than
  // firing one GET /pages/:url per page; pages.get can fill it in later.
  const rows: PageRow[] = pages.map((page) => ({
    canvasId: page.page_id,
    url: page.url,
    title: page.title,
    body: page.body ?? undefined,
    isFrontPage: page.front_page ?? false,
    published: page.published ?? false,
    updatedAt: toMillis(page.updated_at),
    htmlUrl: page.html_url,
    lockedForUser: page.locked_for_user,
  }));
  await ctx.runMutation(internal.storeContent.upsertPages, {
    userId,
    courseCanvasId,
    rows,
    prune: true,
  });
}

async function syncFolders(
  ctx: ActionCtx,
  userId: string,
  client: CanvasClient,
  courseCanvasId: number,
): Promise<void> {
  const folders = await tolerateDisabledTab(() =>
    client.getPaginated<CanvasFolder>(`/courses/${courseCanvasId}/folders`),
    [],
  );
  const rows: FolderRow[] = folders.map((folder) => ({
    canvasId: folder.id,
    parentFolderCanvasId: folder.parent_folder_id ?? undefined,
    name: folder.name,
    fullName: folder.full_name,
    position: folder.position ?? undefined,
    filesCount: folder.files_count,
    foldersCount: folder.folders_count,
    lockedForUser: folder.locked_for_user,
  }));
  await ctx.runMutation(internal.storeContent.upsertFolders, {
    userId,
    courseCanvasId,
    rows,
    prune: true,
  });
}

async function syncFiles(
  ctx: ActionCtx,
  userId: string,
  client: CanvasClient,
  courseCanvasId: number,
): Promise<void> {
  const files = await tolerateDisabledTab(() =>
    client.getPaginated<CanvasFile>(`/courses/${courseCanvasId}/files`),
    [],
  );
  const rows: FileRow[] = files.map((file) => ({
    canvasId: file.id,
    folderCanvasId: file.folder_id ?? undefined,
    displayName: file.display_name,
    filename: file.filename,
    contentType: file["content-type"],
    size: file.size,
    url: file.url,
    thumbnailUrl: file.thumbnail_url ?? undefined,
    updatedAt: toMillis(file.updated_at),
    modifiedAt: toMillis(file.modified_at),
    lockedForUser: file.locked_for_user,
    hidden: file.hidden,
  }));
  await ctx.runMutation(internal.storeContent.upsertFiles, {
    userId,
    courseCanvasId,
    rows,
    prune: true,
  });
}

// ---------------------------------------------------------------------------
// Helpers

