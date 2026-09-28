export const AUTH_TIMEOUT = 10_000;

export type AuthFailure = "timeout" | "unavailable" | "configuration" | "session" | "unknown";

function classifyFailure(error: unknown): AuthFailure {
  if (typeof error !== "object" || error === null) return "unknown";
  const status = "status" in error ? error.status : undefined;
  if (status === 401) return "session";
  if (status === 400 || status === 404) return "configuration";
  if (status === 429 || (typeof status === "number" && status >= 500) || error instanceof TypeError) return "unavailable";
  return "unknown";
}

// Never include tokens, claims, user IDs, or raw SDK errors in diagnostics.
export function reportAuthEvent(event: string, reason?: AuthFailure) {
  console.info("[auth]", { event, ...(reason ? { reason } : {}) });
}

// A continuity check, not JWT verification. Convex still verifies the signature.
// Clerk's global getToken helper can observe a new account before React commits
// that account's new client. Never feed that token to the previous user's queue.
function belongsToUser(token: string, userId: string | null | undefined): boolean {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(payload), char => char.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof userId === "string" && typeof claims === "object" && claims !== null
      && "sub" in claims && claims.sub === userId;
  } catch {
    return false;
  }
}

/** Bounds every fetch, including the SDK's otherwise invisible background refresh. */
export function createTokenFetcher({ getToken, userId, nativeToken, forceFresh, onFailure }: {
  getToken: (options: { template?: string; skipCache: boolean }) => Promise<string | null>;
  userId: string | null | undefined;
  nativeToken: boolean;
  forceFresh: boolean;
  onFailure: (failure: AuthFailure | null) => void;
}) {
  const pending = new Set<() => void>();
  let requestId = 0;
  const fetchAccessToken = ({ forceRefreshToken }: { forceRefreshToken: boolean }): Promise<string | null> => {
    const id = ++requestId;
    const skipCache = forceRefreshToken || forceFresh;
    forceFresh = false;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (token: string | null, failure?: AuthFailure, cancelled = false) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        pending.delete(cancel);
        if (!cancelled && id === requestId) {
          onFailure(failure ?? null);
          if (failure) reportAuthEvent("token-fetch-failed", failure);
        }
        resolve(token);
      };
      const cancel = () => finish(null, undefined, true);
      const timer = setTimeout(() => finish(null, "timeout"), AUTH_TIMEOUT);
      pending.add(cancel);
      // The microtask also catches synchronous SDK errors. Late results are ignored.
      void Promise.resolve().then(() => settled ? null : getToken({
        ...(nativeToken ? {} : { template: "convex" }), skipCache,
      })).then(
        (token) => token && belongsToUser(token, userId) ? finish(token) : finish(null, "session"),
        (error: unknown) => finish(null, classifyFailure(error)),
      );
    });
  };
  return { fetchAccessToken, cancelPending: () => { for (const cancel of pending) cancel(); } };
}
