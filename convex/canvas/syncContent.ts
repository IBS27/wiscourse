// Per-course content sync: modules + module items always, pages/folders/
// files only on a full sync. Pure helper — no registered Convex functions
// live here; the action in sync.ts calls this, and every write goes through
// the internalMutations in ../storeContent.ts.
//
// Two Canvas quirks drive the shape of this file:
// 1. `include[]=items` on /modules is best-effort — Canvas drops `items`
//    for modules past a size threshold, so those need a follow-up call.
// 2. A disabled listing does not mean linked content is unavailable. Fetch
//    front pages and explicit module/page links independently of listings.

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
  opts: { full: boolean; syllabusBody?: string; courseUrl?: string },
): Promise<void> {
  const items = await syncModules(ctx, userId, client, courseCanvasId);
  if (!opts.full) return;
  const linkedFiles = await syncPages(
    ctx,
    userId,
    client,
    courseCanvasId,
    items,
    opts,
  );
  await syncFolders(ctx, userId, client, courseCanvasId);
  await syncFiles(
    ctx,
    userId,
    client,
    courseCanvasId,
    new Set([
      ...linkedFiles,
      ...items.flatMap((item) =>
        item.type === "File" && item.contentCanvasId !== undefined
          ? [item.contentCanvasId]
          : [],
      ),
    ]),
  );
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
): Promise<ModuleItemRow[]> {
  const modules = await tolerateDisabledTab(
    () =>
      client.getPaginated<CanvasModule>(`/courses/${courseCanvasId}/modules`, {
        "include[]": ["items", "content_details"],
      }),
    null,
  );
  if (modules === null) return [];

  const moduleRows: ModuleRow[] = [];
  const itemRows: ModuleItemRow[] = [];

  let completeItems = true;
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
      module.items !== undefined &&
      module.items.length >= (module.items_count ?? module.items.length)
        ? module.items
        : await tolerateDisabledTab(
            () =>
              client.getPaginated<CanvasModuleItem>(
                `/courses/${courseCanvasId}/modules/${module.id}/items`,
                { "include[]": ["content_details"] },
              ),
            null,
          );
    if (items === null) completeItems = false;

    for (const item of items ?? []) {
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
    prune: completeItems,
  });
  return itemRows;
}

// ---------------------------------------------------------------------------
// Pages, folders, files (full sync only)

async function syncPages(
  ctx: ActionCtx,
  userId: string,
  client: CanvasClient,
  courseCanvasId: number,
  items: ModuleItemRow[],
  source: { syllabusBody?: string; courseUrl?: string },
): Promise<Set<number>> {
  const listed = await tolerateDisabledTab(
    () =>
      client.getPaginated<CanvasPage>(`/courses/${courseCanvasId}/pages`, {
        "include[]": ["body"],
      }),
    null,
  );
  const front = await tolerateDisabledTab(
    () => client.get<CanvasPage>(`/courses/${courseCanvasId}/front_page`),
    null,
  );
  const pages = new Map((listed ?? []).map((page) => [page.url, page]));
  if (front !== null) pages.set(front.url, { ...front, front_page: true });
  const pending = new Set([
    ...pages.keys(),
    ...items.flatMap((item) =>
      item.type === "Page" && item.pageUrl ? [item.pageUrl] : [],
    ),
  ]);
  const syllabusLinks = source.courseUrl
    ? courseContentLinks(
        source.syllabusBody ?? "",
        source.courseUrl,
        courseCanvasId,
      )
    : undefined;
  for (const slug of syllabusLinks?.pages ?? []) pending.add(slug);
  const files = new Set<number>(syllabusLinks?.files);
  const keep: number[] = [];
  let batch: PageRow[] = [];
  // A finite traversal of same-course links. Fail visibly instead of pruning
  // against a truncated graph. All requests share the job's sequential client.
  let visited = 0;
  for (const slug of pending) {
    if (++visited > 2000)
      throw new Error("Course page traversal exceeded 2000 pages");
    let page = pages.get(slug);
    if (page?.body == null && page?.locked_for_user !== true) {
      const detail = await tolerateDisabledTab(
        () =>
          client.get<CanvasPage>(
            `/courses/${courseCanvasId}/pages/${encodeURIComponent(slug)}`,
          ),
        null,
      );
      if (detail === null) {
        await ctx.runMutation(internal.storeContent.markPageUnavailable, {
          userId,
          courseCanvasId,
          url: slug,
        });
        if (page) keep.push(page.page_id);
        continue;
      }
      page = detail;
    }
    if (!page) continue;
    keep.push(page.page_id);
    if (!page.locked_for_user) {
      const links = courseContentLinks(
        page.body ?? "",
        page.html_url,
        courseCanvasId,
      );
      for (const linked of links.pages) pending.add(linked);
      for (const file of links.files) files.add(file);
    }
    batch.push({
      canvasId: page.page_id,
      url: page.url,
      title: page.title,
      body: page.locked_for_user ? "" : (page.body ?? undefined),
      contentUnavailable: page.locked_for_user === true || page.body == null,
      isFrontPage: page.front_page ?? false,
      published: page.published ?? false,
      updatedAt: toMillis(page.updated_at),
      htmlUrl: page.html_url,
      lockedForUser: page.locked_for_user,
    });
    if (batch.length === 10) {
      await ctx.runMutation(internal.storeContent.upsertPages, {
        userId,
        courseCanvasId,
        rows: batch,
        prune: false,
      });
      batch = [];
    }
  }
  await ctx.runMutation(internal.storeContent.upsertPages, {
    userId,
    courseCanvasId,
    rows: batch,
    prune: false,
  });
  // Only a successful listing is authoritative about removals. It must also
  // retain pages discovered through direct links that the listing omitted.
  if (listed !== null) {
    await ctx.runMutation(internal.storeContent.prunePages, {
      userId,
      courseCanvasId,
      keepCanvasIds: keep,
    });
  }
  await ctx.runMutation(internal.storeContent.setFrontPage, {
    userId,
    courseCanvasId,
    canvasId: front?.page_id ?? null,
  });
  return files;
}

/** Extract only Canvas links in the current course, never external URLs. */
export function courseContentLinks(
  html: string,
  base: string,
  courseId: number,
): { pages: Set<string>; files: Set<number> } {
  const pages = new Set<string>();
  const files = new Set<number>();
  const origin = new URL(base).origin;
  for (const match of html.matchAll(
    /(?:href|src|data-api-endpoint)\s*=\s*["']([^"']+)["']/gi,
  )) {
    try {
      const url = new URL(match[1].replace(/&amp;/g, "&"), base);
      if (url.origin !== origin) continue;
      const path = url.pathname.replace(/^\/api\/v1/, "");
      const page = new RegExp(`^/courses/${courseId}/pages/([^/]+)$`).exec(
        path,
      );
      if (page) pages.add(decodeURIComponent(page[1]));
      const file = new RegExp(
        `^(?:/courses/${courseId})?/files/(\\d+)(?:/(?:download|preview))?$`,
      ).exec(path);
      if (file) files.add(Number(file[1]));
    } catch {
      /* Malformed instructor links are not fetch targets. */
    }
  }
  return { pages, files };
}

async function syncFolders(
  ctx: ActionCtx,
  userId: string,
  client: CanvasClient,
  courseCanvasId: number,
): Promise<void> {
  const folders = await tolerateDisabledTab(
    () =>
      client.getPaginated<CanvasFolder>(`/courses/${courseCanvasId}/folders`),
    null,
  );
  if (folders === null) return;
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
  linkedIds: Set<number>,
): Promise<void> {
  const files = await tolerateDisabledTab(
    () => client.getPaginated<CanvasFile>(`/courses/${courseCanvasId}/files`),
    null,
  );
  const byId = new Map((files ?? []).map((file) => [file.id, file]));
  for (const id of linkedIds) {
    if (byId.has(id)) continue;
    const file = await tolerateDisabledTab(
      () => client.get<CanvasFile>(`/courses/${courseCanvasId}/files/${id}`),
      null,
    );
    if (file !== null) byId.set(file.id, file);
  }
  const rows: FileRow[] = [...byId.values()].map((file) => ({
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
    prune: files !== null,
  });
}

// ---------------------------------------------------------------------------
// Helpers
