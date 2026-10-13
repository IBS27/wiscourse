import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef,
  useState, type ReactNode,
} from "react";
import { RedirectToTasks, SignInButton, useAuth, useClerk, useSession } from "@clerk/clerk-react";
import { ConvexProviderWithAuth, type ConvexReactClient, useConvexAuth } from "convex/react";
import { Button } from "@/components/ui/button";
import { ConnectionBanner, type AuthNotice } from "@/components/app/connection-banner";
import { Logo } from "@/components/logo";
import { AUTH_TIMEOUT, createGate, createLatest, createTokenFetcher, reportAuthEvent, type AuthFailure } from "@/lib/auth-recovery";
import { OwnerConvexClient } from "@/lib/convex-client";
import { DraftContext, DraftStore, forgetKeptDrafts } from "@/lib/drafts";
import { OwnerSession } from "@/lib/owner-session";
import { useSignOut } from "@/lib/sign-out";
import { useOnline } from "@/lib/online";

type TokenFetcher = ReturnType<typeof createTokenFetcher>;

const RecoveryContext = createContext<{
  owner: string;
  fetcherRef: { current: TokenFetcher | null };
  generation: number;
  retry: (restart: boolean) => void;
  failure: AuthFailure | null;
  reportFailure: (failure: AuthFailure | null) => void;
} | null>(null);

const createConvexClient = (url: string): ConvexReactClient => new OwnerConvexClient(url);

export function AuthProvider({ url, createClient = createConvexClient, children }: {
  url: string;
  createClient?: (url: string) => ConvexReactClient;
  children: ReactNode;
}) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { session } = useSession();
  const { status } = useClerk();
  const resolved = isLoaded && status !== "error" && !(status === "degraded" && !isSignedIn);
  const identity = isSignedIn ? userId ?? null : null;
  const [lastOwner, setLastOwner] = useState<string | null>(identity);
  // A temporary Clerk loading/error state that reports no user retains the
  // owner, with its client, queue and drafts. A confirmed logout, or any report
  // of a different user, even an unresolved one, disposes of them.
  const owner = resolved || identity !== null ? identity : lastOwner;
  if (lastOwner !== owner) setLastOwner(owner);
  useEffect(() => {
    // The same rule for drafts kept in this tab's storage.
    if (resolved || identity !== null) forgetKeptDrafts(identity);
  }, [resolved, identity]);
  if (owner) {
    return <UserSession key={JSON.stringify([owner, url])} owner={owner} url={url} createClient={createClient}>{children}</UserSession>;
  }
  if (!resolved) return <SessionLoading failed={status === "error" || status === "degraded"} />;
  if (session?.status === "pending") return <RedirectToTasks />;
  return <SignIn />;
}

function UserSession({ owner, url, createClient, children }: {
  owner: string;
  url: string;
  createClient: (url: string) => ConvexReactClient;
  children: ReactNode;
}) {
  const [client, setClient] = useState<ConvexReactClient | null>(null);
  const [drafts] = useState(() => new DraftStore(owner));
  useEffect(() => drafts.attach(), [drafts]);
  const { sessionId, orgId, orgRole } = useAuth();
  // A new session or organization restarts the backend session. A Clerk gap
  // reports no session at all; it keeps the last one, since remounting would
  // clear this client's auth.
  const reportedSession = sessionId ? JSON.stringify([sessionId, orgId, orgRole]) : null;
  const [sessionKey, setSessionKey] = useState(reportedSession ?? "");
  if (reportedSession !== null && reportedSession !== sessionKey) setSessionKey(reportedSession);
  useEffect(() => {
    // Allocate in the effect: StrictMode's discarded render must not own a socket.
    // Each setup gets a fresh client, including StrictMode's second setup.
    const next = createClient(url);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronizing an external client with its resource lifetime
    setClient(next);
    // React cleans parent effects before child subscriptions. Let the provider
    // clear auth and queries before closing this owner's now-detached client.
    return () => { queueMicrotask(() => { void next.close(); }); };
  }, [url, createClient]);
  if (!client) return <Loading />;
  return (
    <OwnerSession owner={owner}>
      <DraftContext value={drafts}>
        <BackendSession key={sessionKey} owner={owner} client={client}>
          {children}
        </BackendSession>
      </DraftContext>
    </OwnerSession>
  );
}

function BackendSession({ owner, client, children }: { owner: string; client: ConvexReactClient; children: ReactNode }) {
  const [generation, setGeneration] = useState(0);
  const [failure, reportFailure] = useState<AuthFailure | null>(null);
  const fetcherRef = useRef<TokenFetcher | null>(null);
  const retry = useCallback((restart: boolean) => {
    reportAuthEvent("retry");
    // Pending requests are retried in place; their success clears the failure.
    if (fetcherRef.current?.retryPending()) return;
    // Otherwise Convex has given up on this auth, so start it again. Starting
    // again clears the client's auth first, and queries still mounted would
    // rerun without it, so only a session whose app is hidden may restart.
    if (!restart) return;
    reportFailure(null);
    setGeneration(value => value + 1);
  }, []);
  const recovery = useMemo(() => ({ owner, fetcherRef, generation, retry, failure, reportFailure }), [owner, generation, retry, failure]);
  return (
    <RecoveryContext value={recovery}>
      <ConvexProviderWithAuth client={client} useAuth={useClerkAuth}>
        <AuthBoundary>{children}</AuthBoundary>
      </ConvexProviderWithAuth>
    </RecoveryContext>
  );
}

function useClerkAuth() {
  const { isLoaded, isSignedIn, userId, getToken, sessionClaims } = useAuth();
  const { owner, fetcherRef, generation, reportFailure } = useContext(RecoveryContext)!;
  const signedIn = isLoaded && isSignedIn === true;
  // While Clerk reports another account, leave this client's auth untouched;
  // the provider above disposes of it in the same render.
  const foreign = signedIn && userId !== owner;
  // The provider keeps this owner only through a Clerk gap: a temporary state
  // that reports no user. Any change to what this hook returns makes Convex
  // clear the client's auth, after which its queued writes go out anonymously
  // and the app's mounted queries rerun without it. So through a gap the owner
  // stays authenticated with the same fetcher, and token requests wait for
  // Clerk to return. For the same reason the fetcher reads Clerk's token
  // function and audience when called, and is replaced only by a restart.
  const gap = !signedIn;
  const audience = sessionClaims?.aud;
  const reportedNative = audience === "convex" || (Array.isArray(audience) && audience.includes("convex"));
  const [nativeToken, setNativeToken] = useState(reportedNative);
  if (!gap && nativeToken !== reportedNative) setNativeToken(reportedNative);
  const [gate] = useState(() => createGate(!gap));
  useEffect(() => gate.set(!gap), [gate, gap]);
  const [clerkToken] = useState(() => createLatest({ getToken, nativeToken }));
  useEffect(() => clerkToken.set({ getToken, nativeToken }), [clerkToken, getToken, nativeToken]);
  // Bound to the client's owner, never to whoever Clerk reports right now:
  // Clerk can report the next account before this client is disposed.
  const fetcher = useMemo(() => createTokenFetcher({
    getToken: ({ skipCache }) => {
      const { getToken, nativeToken } = clerkToken.get();
      return getToken({ ...(nativeToken ? {} : { template: "convex" }), skipCache });
    },
    userId: owner, forceFresh: generation > 0, onFailure: reportFailure, whenReady: gate.wait,
  }), [clerkToken, owner, generation, reportFailure, gate]);
  useEffect(() => {
    fetcherRef.current = fetcher;
    return () => {
      fetcher.cancelPending();
      if (fetcherRef.current === fetcher) fetcherRef.current = null;
    };
  }, [fetcherRef, fetcher]);
  return useMemo(() => ({
    isLoading: foreign,
    isAuthenticated: !foreign,
    fetchAccessToken: fetcher.fetchAccessToken,
  }), [foreign, fetcher]);
}

function AuthBoundary({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { failure } = useContext(RecoveryContext)!;
  const { status } = useClerk();
  const { isAuthenticated, isLoading, isRefreshing } = useConvexAuth();
  // A Clerk gap: no user reported, while the provider above keeps this owner.
  const gap = !isLoaded || status === "error" || !isSignedIn;
  const [established, setEstablished] = useState(false);
  if (isAuthenticated && !gap && !established) setEstablished(true);
  const state = !isLoaded || status === "error" ? "session-loading"
    : !isSignedIn ? "signed-out" : !isAuthenticated ? "reconnecting"
      : isRefreshing ? "refreshing" : "authenticated";
  useEffect(() => reportAuthEvent(state), [state]);
  // The recovery controller also watches a server-rejected refresh while the SDK
  // still reports authenticated, and a failed token request, which the SDK
  // never sees. A reported failure ends the handshake even though its request
  // stays pending.
  const handshaking = (isLoading || isRefreshing) && failure === null;
  const recovery = useRecovery({
    active: !gap && (!isAuthenticated || isRefreshing || failure !== null),
    handshaking,
    restart: !isAuthenticated,
  });
  // Once the session is established the app stays open while the backend
  // still holds this owner's auth: through a Clerk gap, a refresh the server
  // asked for, and a failed token request. The socket is paused or stopped
  // until the owner's token arrives, so queries keep their last results and
  // writes wait. Recovery is reported by the banner instead of a screen.
  const open = isAuthenticated && (established || !gap);
  if (gap && !open) return <SessionLoading failed={status === "error" || status === "degraded"} />;
  if (!open) return <ConnectionRecovery recovery={recovery} initialLoading={handshaking} />;
  const kind: AuthNotice["kind"] | null = gap ? "session"
    : failure === "expired" ? "expired"
      : failure === "configuration" ? "unverified"
        : recovery.exhausted ? "stalled"
          : isRefreshing || failure !== null ? "retrying" : null;
  return <>
    {children}
    <ConnectionBanner auth={kind && { kind, retry: recovery.retryNow }} />
  </>;
}

function Loading() {
  return <div role="status" className="flex min-h-dvh items-center justify-center text-ink-3">Loading…</div>;
}

function SessionLoading({ failed }: { failed: boolean }) {
  const online = useOnline();
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setTimedOut(true);
      reportAuthEvent("session-load-timeout", "timeout");
    }, AUTH_TIMEOUT);
    return () => clearTimeout(timer);
  }, []);
  if (!failed && !timedOut && online) return <Loading />;
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <p role="status" className="text-ink-3">
        {online ? "We couldn't load your sign-in session. Please reload to try again." : "You're offline. Reconnect, then reload to check your session."}
      </p>
      <Button onClick={() => window.location.reload()} disabled={!online}>Reload</Button>
    </div>
  );
}

const RETRY_DELAYS = [1_000, 2_000, 5_000];

/**
 * Drives recovery for the whole backend session, whether a screen or the
 * banner reports it. Each interruption gets its own retry budget. `restart`
 * lets a retry start auth again when no token request is pending.
 */
function useRecovery({ active, handshaking, restart }: { active: boolean; handshaking: boolean; restart: boolean }) {
  const { retry, failure } = useContext(RecoveryContext)!;
  const online = useOnline();
  const [attempt, setAttempt] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  if (!active && (attempt !== 0 || exhausted)) {
    setAttempt(0);
    setExhausted(false);
  }
  const lastRetry = useRef(-Infinity);
  // Retrying cannot fix these; the user decides what happens next.
  const stopped = failure === "configuration" || failure === "expired";
  const retryNow = useCallback(() => {
    if (!navigator.onLine || Date.now() - lastRetry.current < 1_000) return;
    lastRetry.current = Date.now();
    setAttempt(1);
    setExhausted(false);
    retry(restart);
  }, [retry, restart]);

  useEffect(() => {
    if (!active || !online || exhausted || stopped) return;
    const timeout = setTimeout(() => {
      if (attempt >= RETRY_DELAYS.length) {
        setExhausted(true);
        reportAuthEvent("retries-exhausted");
      } else {
        lastRetry.current = Date.now();
        setAttempt(value => value + 1);
        retry(restart);
      }
    }, handshaking ? AUTH_TIMEOUT : (RETRY_DELAYS[attempt] ?? AUTH_TIMEOUT));
    return () => clearTimeout(timeout);
  }, [active, attempt, exhausted, handshaking, online, stopped, retry, restart]);

  useEffect(() => {
    // Exhausted attempts are no longer healthy handshakes, even if the SDK is
    // still loading. A network or tab return can start a new bounded attempt.
    if (!active || (handshaking && !exhausted) || stopped) return;
    const resume = () => {
      if (document.visibilityState === "visible") retryNow();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
    };
  }, [active, handshaking, exhausted, stopped, retryNow]);

  return { online, attempt, exhausted, failure, retryNow };
}

/** The screen for a session the backend does not hold: the first handshake, or auth it gave up on. */
function ConnectionRecovery({ recovery, initialLoading }: { recovery: ReturnType<typeof useRecovery>; initialLoading: boolean }) {
  const { online, attempt, exhausted, failure, retryNow } = recovery;
  const permanent = failure === "configuration";
  const expired = failure === "expired";
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <p role="status" className="text-ink-3">
        {!online ? "You're offline. We'll reconnect when you're back online."
          : expired ? "Your session ended. Sign in again to continue."
            : permanent ? "We couldn't verify your account. Please reload or try again later."
              : exhausted ? "We couldn't reconnect. Please try again."
                : initialLoading && attempt === 0 ? "Loading…" : "Reconnecting…"}
      </p>
      {(exhausted || permanent || expired || !online) && (
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={retryNow} disabled={!online}>Retry</Button>
          <Button variant="outline" onClick={() => window.location.reload()}>Reload</Button>
        </div>
      )}
      <SignOutAction label={expired ? "Sign in again" : "Sign out"} />
    </div>
  );
}

function SignOutAction({ label }: { label: string }) {
  const { run, pending, error } = useSignOut();
  return <>
    <Button variant="ghost" onClick={() => void run()} disabled={pending}>{pending ? "Signing out…" : label}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </>;
}

function SignIn() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="space-y-2">
        <h1><Logo className="text-4xl" /></h1>
        <p className="max-w-md text-ink-2">
          A fast, reliable interface for Canvas at UW–Madison. Your courses,
          assignments, calendar, and tasks in one place.
        </p>
      </div>
      <SignInButton mode="modal"><Button size="lg">Sign in</Button></SignInButton>
      <a href="/privacy.html" className="text-sm text-ink-3 underline underline-offset-4">Privacy policy</a>
    </div>
  );
}
