import { useCallback } from "react";
import { useAuth, useClerk } from "@clerk/clerk-react";
import type { Id } from "../../convex/_generated/dataModel";
import { belongsToUser } from "@/lib/auth-recovery";
import { useOwnerLifetime } from "@/lib/owner-session";

export class UploadError extends Error {}

const OWNER_CHANGED = "Your account changed before this finished. Nothing was submitted.";

/**
 * One confirmation's uploads, bound to the owner who confirmed. Every step
 * checks that this owner's session is still alive and still the account
 * Clerk reports; a token for anyone else is never used, and disposal aborts
 * the request in flight and stops the rest.
 */
export interface OwnerRun {
  upload: (file: File) => Promise<Id<"_storage">>;
  /** Throws unless the confirming owner is still current; call before the final mutation. */
  ensureCurrent: () => void;
}

/** Rejects once `signal` aborts; a later result is ignored. */
function unlessAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new UploadError(OWNER_CHANGED));
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

/**
 * Starts owner-bound uploads to the upload HTTP action, which stores each file
 * and records it as the token's user in the same request. The token is the one
 * the Convex client uses: native Convex audience, or Clerk's "convex" template.
 */
export function useOwnerBoundUploads(): () => OwnerRun {
  const lifetime = useOwnerLifetime();
  const clerk = useClerk();
  const { getToken, sessionClaims } = useAuth();
  const audience = sessionClaims?.aud;
  const nativeToken = audience === "convex" || (Array.isArray(audience) && audience.includes("convex"));
  return useCallback(() => {
    const signal = lifetime?.signal() ?? null;
    if (lifetime === null || signal === null) throw new UploadError(OWNER_CHANGED);
    const owner = lifetime.owner;
    // Clerk's live state can show the next account before React disposes this owner.
    const ensureCurrent = () => {
      if (signal.aborted || clerk.user?.id !== owner) throw new UploadError(OWNER_CHANGED);
    };
    const upload = async (file: File): Promise<Id<"_storage">> => {
      ensureCurrent();
      const token = await unlessAborted(getToken(nativeToken ? {} : { template: "convex" }), signal);
      ensureCurrent();
      if (!token) throw new UploadError("Your session expired. Sign in again, then retry.");
      if (!belongsToUser(token, owner)) throw new UploadError(OWNER_CHANGED);
      const response = await fetch(`${import.meta.env.VITE_CONVEX_SITE_URL}/submissions/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": file.type || "application/octet-stream" },
        body: file,
        signal,
      }).catch((error: unknown) => {
        if (signal.aborted) throw new UploadError(OWNER_CHANGED);
        throw error;
      });
      const reply = (await response.json().catch(() => ({}))) as { storageId?: Id<"_storage">; error?: string };
      ensureCurrent();
      if (!response.ok || reply.storageId === undefined) {
        throw new UploadError(`"${file.name}" did not upload${reply.error ? `: ${reply.error}` : ` (error ${response.status})`}.`);
      }
      return reply.storageId;
    };
    return { upload, ensureCurrent };
  }, [lifetime, clerk, getToken, nativeToken]);
}
