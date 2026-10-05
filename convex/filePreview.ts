"use node";
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { resolveFile } from "./files";
import { requireUserId } from "./lib/auth";

import { readCoursePdf } from "./lib/coursePdf";

const LIMIT = 50 * 1024 * 1024;
/**
 * URL of a PDF preview in the shared Convex-storage cache (convex/pdfCache.ts),
 * for when `pdfCache.pdfUrl` has none at the version Canvas reports. Canvas
 * confirms the caller's access and the current version first (the only
 * Canvas call); on a cache miss the server downloads the bytes, so attachment
 * headers and cross-origin restrictions cannot block rendering, and stores
 * them for every later view. "busy" while a sync holds the user's Canvas
 * lease: synced metadata cannot vouch for what goes in the shared cache, so
 * the viewer retries shortly.
 */
export const pdf = action({
  args: { fileCanvasId: v.number() },
  returns: v.union(
    v.object({ status: v.literal("ready"), url: v.string() }),
    v.object({ status: v.literal("busy") }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<{ status: "ready"; url: string } | { status: "busy" }> => {
    const userId = await requireUserId(ctx);
    const resolved = await resolveFile(ctx, userId, args.fileCanvasId);
    if (resolved.status === "busy") return { status: "busy" };
    const { file, credential } = resolved;
    if (file.contentType !== "application/pdf" || file.size > LIMIT)
      throw new Error("PDF exceeds preview limits");
    const version = {
      userId,
      credential,
      fileCanvasId: args.fileCanvasId,
      size: file.size,
      updatedAt: file.updatedAt,
    };
    const cached = await ctx.runQuery(internal.pdfCache.lookup, version);
    if (cached !== null) return { status: "ready", url: cached };
    const response = await fetch(file.url, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok || !response.body) throw new Error("PDF download failed");
    if (Number(response.headers.get("content-length")) > LIMIT) {
      await response.body.cancel();
      throw new Error("PDF exceeds preview limits");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > LIMIT) throw new Error("PDF exceeds preview limits");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-")
      throw new Error("File is not a PDF");
    const storageId = await ctx.storage.store(
      new Blob([bytes], { type: "application/pdf" }),
    );
    let url: string | null = null;
    try {
      url = await ctx.runMutation(internal.pdfCache.record, {
        ...version,
        storageId,
      });
    } finally {
      if (url === null) await ctx.storage.delete(storageId);
    }
    if (url === null)
      throw new Error("Canvas connection changed. Please retry.");
    return { status: "ready", url };
  },
});

export const staffText = internalAction({
  args: { userId: v.string(), courseCanvasId: v.number() },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const urls: string[] = await ctx.runQuery(
      internal.courseStaff.documents,
      args,
    );
    const parts: string[] = [];
    for (const url of urls) {
      try {
        parts.push(
          (await readCoursePdf(url, AbortSignal.timeout(30_000))).text,
        );
      } catch {
        /* Unreadable sources cannot establish instructor identity. */
      }
    }
    return parts.join("\n");
  },
});
