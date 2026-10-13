export const AUTH_TIMEOUT = 10_000;

export type AuthFailure = "timeout" | "unavailable" | "configuration" | "expired" | "session" | "unknown";

function classifyFailure(error: unknown): AuthFailure {
  if (typeof error !== "object" || error === null) return "unknown";
  const status = "status" in error ? error.status : undefined;
  // Clerk refuses the session itself: it expired or was revoked.
  if (status === 401) return "expired";
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
export function belongsToUser(token: string, userId: string | null | undefined): boolean {
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

/**
 * Holds requests while closed. A pending token request keeps the Convex socket
 * paused, so queued writes wait instead of going out without auth.
 */
export function createGate(open: boolean) {
  let waiters: (() => void)[] = [];
  return {
    set(next: boolean) {
      open = next;
      if (!open) return;
      const ready = waiters;
      waiters = [];
      for (const resolve of ready) resolve();
    },
    wait: (): Promise<void> => open ? Promise.resolve() : new Promise(resolve => { waiters.push(resolve); }),
  };
}

/** Holds the newest value for code that must keep its identity when the value changes. */
export function createLatest<T>(value: T) {
  return {
    get: () => value,
    set(next: T) { value = next; },
  };
}

/**
 * Bounds every fetch, including the SDK's otherwise invisible background
 * refresh: past the bound, or on an error, the failure goes to the recovery
 * UI and the request is held. The bound starts once `whenReady` settles;
 * waiting for it is not a failure.
 *
 * A request is never answered with null: Convex would drop to anonymous
 * auth and send the owner's queued writes without it. It stays pending,
 * keeping the socket paused or stopped, until it or `retryPending` gets a
 * token, a new fetcher replaces it, or the client is disposed. Retrying in
 * place also lets the SDK finish its own reauthentication, which is what
 * restarts a stopped socket.
 *
 * Nor is a forced refresh answered with the token it is meant to replace:
 * Convex treats that as no token at all. Clerk can issue the same token twice
 * within one second, so the request is held and tried again.
 */
export function createTokenFetcher({ getToken, userId, forceFresh, onFailure, whenReady }: {
  getToken: (options: { skipCache: boolean }) => Promise<string | null>;
  userId: string | null | undefined;
  forceFresh: boolean;
  onFailure: (failure: AuthFailure | null) => void;
  whenReady?: () => Promise<void>;
}) {
  const pending = new Map<() => void, () => void>(); // cancel -> retry
  let requestId = 0;
  let delivered: string | null = null;
  const fetchAccessToken = ({ forceRefreshToken }: { forceRefreshToken: boolean }): Promise<string | null> => {
    const id = ++requestId;
    let skipCache = forceRefreshToken || forceFresh;
    forceFresh = false;
    return new Promise((resolve) => {
      let settled = false;
      let round = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      // Only a token or a cancellation settles the request.
      const finish = (token: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        pending.delete(cancel);
        // Convex keeps a token only from its newest request, so only that one
        // can be the token a later refresh is meant to replace.
        if (token !== null && id === requestId) {
          delivered = token;
          onFailure(null);
        }
        resolve(token);
      };
      // A superseded attempt's failure is ignored; any valid token is taken.
      const fail = (failure: AuthFailure, attempt: number) => {
        if (settled || attempt !== round) return;
        clearTimeout(timer);
        if (id === requestId) {
          onFailure(failure);
          reportAuthEvent("token-fetch-failed", failure);
        }
      };
      const request = () => {
        const attempt = ++round;
        clearTimeout(timer);
        // The microtask also catches synchronous SDK errors.
        void (whenReady?.() ?? Promise.resolve()).then(() => {
          if (settled || attempt !== round) return undefined;
          timer = setTimeout(() => fail("timeout", attempt), AUTH_TIMEOUT);
          return getToken({ skipCache });
        }).then(
          (token) => {
            if (token === undefined) return;
            if (!token || !belongsToUser(token, userId)) fail("session", attempt);
            else if (forceRefreshToken && token === delivered) fail("unavailable", attempt);
            else finish(token);
          },
          (error: unknown) => fail(classifyFailure(error), attempt),
        );
      };
      const retry = () => {
        skipCache = true;
        request();
      };
      const cancel = () => finish(null);
      pending.set(cancel, retry);
      request();
    });
  };
  return {
    fetchAccessToken,
    cancelPending: () => { for (const cancel of [...pending.keys()]) cancel(); },
    /** Requests every unsettled token again. False when none is pending. */
    retryPending: () => {
      if (pending.size === 0) return false;
      for (const retry of [...pending.values()]) retry();
      return true;
    },
  };
}
