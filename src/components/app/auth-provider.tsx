import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef,
  useState, type ReactNode,
} from "react";
import { RedirectToTasks, SignInButton, useAuth, useClerk, useSession } from "@clerk/clerk-react";
import { ConvexProviderWithAuth, ConvexReactClient, useConvexAuth } from "convex/react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { AUTH_TIMEOUT, createTokenFetcher, reportAuthEvent, type AuthFailure } from "@/lib/auth-recovery";
import { DraftContext, DraftStore } from "@/lib/drafts";
import { useSignOut } from "@/lib/sign-out";
import { useOnline } from "@/lib/online";

const RecoveryContext = createContext<{
  owner: string;
  generation: number;
  retry: () => void;
  failure: AuthFailure | null;
  reportFailure: (failure: AuthFailure | null) => void;
} | null>(null);

const createConvexClient = (url: string) => new ConvexReactClient(url);

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
  // A temporary Clerk loading/error state that reports no user hides the app
  // but retains its owner, queue and drafts. A confirmed logout, or any report
  // of a different user, even an unresolved one, disposes of them.
  const owner = resolved || identity !== null ? identity : lastOwner;
  if (lastOwner !== owner) setLastOwner(owner);
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
  const [drafts] = useState(() => new DraftStore());
  const { sessionId, orgId, orgRole } = useAuth();
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
    <DraftContext value={drafts}>
      <BackendSession key={JSON.stringify([sessionId, orgId, orgRole])} owner={owner} client={client}>
        {children}
      </BackendSession>
    </DraftContext>
  );
}

function BackendSession({ owner, client, children }: { owner: string; client: ConvexReactClient; children: ReactNode }) {
  const [generation, setGeneration] = useState(0);
  const [failure, reportFailure] = useState<AuthFailure | null>(null);
  const retry = useCallback(() => {
    reportFailure(null);
    setGeneration(value => value + 1);
    reportAuthEvent("retry");
  }, []);
  const recovery = useMemo(() => ({ owner, generation, retry, failure, reportFailure }), [owner, generation, retry, failure]);
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
  const { owner, generation, reportFailure } = useContext(RecoveryContext)!;
  const audience = sessionClaims?.aud;
  const nativeToken = audience === "convex" || (Array.isArray(audience) && audience.includes("convex"));
  // Bound to the client's owner, never to whoever Clerk reports right now:
  // Clerk can report the next account before this client is disposed.
  const fetcher = useMemo(() => createTokenFetcher({
    getToken, userId: owner, nativeToken, forceFresh: generation > 0, onFailure: reportFailure,
  }), [getToken, owner, nativeToken, generation, reportFailure]);
  useEffect(() => () => fetcher.cancelPending(), [fetcher]);
  // While Clerk reports another account, leave this client's auth untouched;
  // the provider above disposes of it in the same render.
  const foreign = isSignedIn === true && userId !== owner;
  return useMemo(() => ({
    isLoading: !isLoaded || foreign,
    isAuthenticated: isSignedIn ?? false,
    fetchAccessToken: fetcher.fetchAccessToken,
  }), [isLoaded, foreign, isSignedIn, fetcher]);
}

function AuthBoundary({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { status } = useClerk();
  const { isAuthenticated, isLoading, isRefreshing } = useConvexAuth();
  const state = !isLoaded || status === "error" ? "session-loading"
    : !isSignedIn ? "signed-out" : !isAuthenticated ? "reconnecting"
      : isRefreshing ? "refreshing" : "authenticated";
  useEffect(() => reportAuthEvent(state), [state]);
  if (!isLoaded || status === "error" || !isSignedIn) {
    return <SessionLoading failed={status === "error" || status === "degraded"} />;
  }
  // The recovery controller also watches a server-rejected refresh while the SDK
  // still reports authenticated. Protected queries/writes are unmounted meanwhile.
  if (!isAuthenticated || isRefreshing) return <ConnectionRecovery isLoading={isLoading || isRefreshing} initialLoading={isLoading && !isRefreshing} />;
  return children;
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

function ConnectionRecovery({ isLoading, initialLoading }: { isLoading: boolean; initialLoading: boolean }) {
  const { retry, failure } = useContext(RecoveryContext)!;
  const online = useOnline();
  const [attempt, setAttempt] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const lastRetry = useRef(-Infinity);
  const permanent = failure === "configuration";
  const retryNow = useCallback(() => {
    if (!navigator.onLine || Date.now() - lastRetry.current < 1_000) return;
    lastRetry.current = Date.now();
    setAttempt(1);
    setExhausted(false);
    retry();
  }, [retry]);

  useEffect(() => {
    if (!online || exhausted || permanent) return;
    const timeout = setTimeout(() => {
      if (attempt >= RETRY_DELAYS.length) {
        setExhausted(true);
        reportAuthEvent("retries-exhausted");
      } else {
        lastRetry.current = Date.now();
        setAttempt(value => value + 1);
        retry();
      }
    }, isLoading ? AUTH_TIMEOUT : (RETRY_DELAYS[attempt] ?? AUTH_TIMEOUT));
    return () => clearTimeout(timeout);
  }, [attempt, exhausted, isLoading, online, permanent, retry]);

  useEffect(() => {
    // Exhausted attempts are no longer healthy handshakes, even if the SDK is
    // still loading. A network or tab return can start a new bounded attempt.
    if ((isLoading && !exhausted) || permanent) return;
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
  }, [isLoading, exhausted, permanent, retryNow]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <p role="status" className="text-ink-3">
        {!online ? "You're offline. We'll reconnect when you're back online."
          : permanent ? "We couldn't verify your account. Please reload or try again later."
            : exhausted ? "We couldn't reconnect. Please try again."
              : initialLoading && attempt === 0 ? "Loading…" : "Reconnecting…"}
      </p>
      {(exhausted || permanent || !online) && (
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={retryNow} disabled={!online}>Retry</Button>
          <Button variant="outline" onClick={() => window.location.reload()}>Reload</Button>
        </div>
      )}
      <SignOutAction />
    </div>
  );
}

function SignOutAction() {
  const { run, pending, error } = useSignOut();
  return <>
    <Button variant="ghost" onClick={() => void run()} disabled={pending}>{pending ? "Signing out…" : "Sign out"}</Button>
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
