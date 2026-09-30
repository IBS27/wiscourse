import { useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import type { Id } from "../../convex/_generated/dataModel";

export class UploadError extends Error {}

/**
 * Sends one submission file to the upload HTTP action, which stores it and
 * records it as this user's in the same request. The token is the one the
 * Convex client uses: native Convex audience, or Clerk's "convex" template.
 */
export function useSubmissionUpload() {
  const { getToken, sessionClaims } = useAuth();
  const audience = sessionClaims?.aud;
  const nativeToken = audience === "convex" || (Array.isArray(audience) && audience.includes("convex"));
  return useCallback(async (file: File): Promise<Id<"_storage">> => {
    const token = await getToken(nativeToken ? {} : { template: "convex" });
    if (!token) throw new UploadError("Your session expired. Sign in again, then retry.");
    const response = await fetch(`${import.meta.env.VITE_CONVEX_SITE_URL}/submissions/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    const reply = (await response.json().catch(() => ({}))) as { storageId?: Id<"_storage">; error?: string };
    if (!response.ok || reply.storageId === undefined) {
      throw new UploadError(`"${file.name}" did not upload${reply.error ? `: ${reply.error}` : ` (error ${response.status})`}.`);
    }
    return reply.storageId;
  }, [getToken, nativeToken]);
}
