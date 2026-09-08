"use node";
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { requireUserId } from "./lib/auth";

import { readCoursePdf } from "./lib/coursePdf";

const LIMIT = 10 * 1024 * 1024;
/** Fetch bytes on the server so attachment headers and cross-origin restrictions cannot block rendering. */
export const pdf = action({
  args: { fileCanvasId: v.number() },
  returns: v.bytes(),
  handler: async (ctx, args): Promise<ArrayBuffer> => {
    await requireUserId(ctx);
    const file = await ctx.runAction(api.files.freshUrl, args);
    if (file.contentType !== "application/pdf" || file.size > LIMIT)
      throw new Error("PDF exceeds preview limits");
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
    return bytes.buffer;
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
