"use node";

// Extracts the text of syllabus PDFs right after a full sync, so search and
// Ask can read them without waiting for a course interpretation to run.

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { readCoursePdf } from "./lib/coursePdf";

const READ_TIMEOUT_MS = 60_000;

export const extractSyllabi = internalAction({
  args: { userId: v.string(), courseCanvasId: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const pending = await ctx.runQuery(internal.courseSources.pendingSyllabusFiles, args);
    for (const file of pending) {
      try {
        // The download URL was refreshed by the sync that scheduled this job.
        const document = await readCoursePdf(file.url, AbortSignal.timeout(READ_TIMEOUT_MS));
        await ctx.runMutation(internal.courseSources.storeDocument, {
          ...args,
          fileCanvasId: file.canvasId,
          fingerprint: file.fingerprint,
          ...document,
        });
      } catch (error) {
        // Unreadable or oversized PDFs stay unextracted; the next full sync retries.
        console.warn(`Syllabus extraction skipped for file ${file.canvasId}`, error);
      }
    }
    return null;
  },
});
