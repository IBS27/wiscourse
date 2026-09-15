import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { SignInButton, useAuth } from "@clerk/clerk-react";
import { ConvexProviderWithAuth, useConvexAuth, type ConvexReactClient } from "convex/react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

const RecoveryContext = createContext<{ generation: number; retry: () => void } | null>(null);

export function AuthProvider({ client, children }: { client: ConvexReactClient; children: ReactNode }) {
  const [generation, setGeneration] = useState(0);
  const retry = useCallback(() => setGeneration((value) => value + 1), []);
  const recovery = useMemo(() => ({ generation, retry }), [generation, retry]);

  return (
    <RecoveryContext value={recovery}>
      <ConvexProviderWithAuth client={client} useAuth={useClerkAuth}>
        <AuthBoundary>{children}</AuthBoundary>
      </ConvexProviderWithAuth>
    </RecoveryContext>
  );
}

// A new fetcher lets the provider restart setAuth with its own callbacks and
// subscription cleanup. Calling client.setAuth separately would replace them.
function useClerkAuth() {
  const { isLoaded, isSignedIn, getToken, sessionId, sessionClaims, orgId, orgRole } = useAuth();
  const { generation } = useContext(RecoveryContext)!;
  const audience = sessionClaims?.aud;
  const nativeToken = audience === "convex" || (Array.isArray(audience) && audience.includes("convex"));
  const fetchAccessToken = useCallback(async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
    try {
      return await getToken({
        ...(nativeToken ? {} : { template: "convex" }),
        skipCache: forceRefreshToken || generation > 0,
      });
    } catch {
      // Clerk can fail to fetch while offline without ending the session.
      return null;
    }
    // Session and organization changes must also restart backend authentication.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken, nativeToken, sessionId, orgId, orgRole, generation]);

  return useMemo(() => ({
    isLoading: !isLoaded,
    isAuthenticated: isSignedIn ?? false,
    fetchAccessToken,
  }), [isLoaded, isSignedIn, fetchAccessToken]);
}

function AuthBoundary({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, sessionId } = useAuth();
  const { isAuthenticated, isLoading } = useConvexAuth();

  if (!isLoaded) {
    return <div role="status" className="flex min-h-dvh items-center justify-center text-ink-3">Loading…</div>;
  }
  if (!isSignedIn) return <SignIn />;
  if (!isAuthenticated) return <ConnectionRecovery key={sessionId} isLoading={isLoading} />;
  return children;
}

function subscribeOnline(notify: () => void) {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}

const RETRY_DELAYS = [1_000, 2_000, 5_000];
const AUTH_TIMEOUT = 10_000;

// Mounted only while a Clerk session is waiting for Convex. Recovery success or
// sign-out unmounts this component, clearing timers and the retry budget.
function ConnectionRecovery({ isLoading }: { isLoading: boolean }) {
  const { retry } = useContext(RecoveryContext)!;
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine);
  const [attempt, setAttempt] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const lastRetry = useRef(-Infinity);

  const retryNow = useCallback(() => {
    if (!navigator.onLine || Date.now() - lastRetry.current < 1_000) return;
    lastRetry.current = Date.now();
    setAttempt(1);
    setExhausted(false);
    retry();
  }, [retry]);

  useEffect(() => {
    if (!online || exhausted) return;
    // Give the SDK's active handshake time to finish, including its normal
    // initial login. Also bound a stalled token request/server confirmation.
    const timeout = setTimeout(() => {
      if (attempt >= RETRY_DELAYS.length) {
        setExhausted(true);
      } else {
        lastRetry.current = Date.now();
        setAttempt((value) => value + 1);
        retry();
      }
    }, isLoading ? AUTH_TIMEOUT : (RETRY_DELAYS[attempt] ?? AUTH_TIMEOUT));
    return () => clearTimeout(timeout);
  }, [attempt, exhausted, isLoading, online, retry]);

  useEffect(() => {
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
  }, [retryNow]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <p role="status" className="text-ink-3">
        {!online ? "You're offline. We'll reconnect when you're back online."
          : exhausted ? "We couldn't reconnect. Please try again."
            : "Reconnecting…"}
      </p>
      {(exhausted || !online) && <Button onClick={retryNow} disabled={!online}>Retry</Button>}
    </div>
  );
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
