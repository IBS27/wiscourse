// Stands in for `@/lib/submission-upload` in the preview: the same request
// goes to this server, which runs the real upload HTTP action as the preview
// student. No Clerk session or Convex deployment is involved.
import { useCallback } from "react";
import type { Id } from "../../convex/_generated/dataModel";

export class UploadError extends Error {}

export function useSubmissionUpload() {
  return useCallback(async (file: File): Promise<Id<"_storage">> => {
    const response = await fetch("/__mock/upload", {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    const reply = (await response.json().catch(() => ({}))) as { storageId?: Id<"_storage">; error?: string };
    if (!response.ok || reply.storageId === undefined) {
      throw new UploadError(`"${file.name}" did not upload${reply.error ? `: ${reply.error}` : ` (error ${response.status})`}.`);
    }
    return reply.storageId;
  }, []);
}
