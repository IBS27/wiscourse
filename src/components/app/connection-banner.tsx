import { useEffect, useState, type ReactNode } from "react";
import { useConvexConnectionState } from "convex/react";
import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnline } from "@/lib/online";
import { useSignOut } from "@/lib/sign-out";
import { cn } from "@/lib/utils";

// Brief socket drops (a laptop waking, a network handoff) heal on their own.
const GRACE_MS = 4_000;

/**
 * What the auth layer is doing about a session it cannot confirm right now,
 * while the app stays open: retrying on its own, out of attempts, refused by
 * Clerk (`expired`), misconfigured (`unverified`), or waiting on Clerk itself
 * (`session`).
 */
export type AuthNotice = {
  kind: "retrying" | "stalled" | "expired" | "unverified" | "session";
  retry: () => void;
};

/**
 * Says when the app is showing saved data because it cannot reach the
 * backend or confirm the session. Queries keep their last results and writes
 * wait in the queue, so this informs rather than blocks. Only a session the
 * backend has dropped gets a screen of its own.
 */
export function ConnectionBanner({ auth = null }: { auth?: AuthNotice | null }) {
  const online = useOnline();
  const { hasEverConnected, isWebSocketConnected } = useConvexConnectionState();
  if (online && (isWebSocketConnected || !hasEverConnected) && auth === null) return null;
  // Offline explains everything else, and nothing here can be retried until it ends.
  const kind = online ? auth?.kind ?? "retrying" : "offline";
  const actions = kind !== "offline" && kind !== "retrying";
  return (
    <Delayed ms={GRACE_MS}>
      <div
        className={cn(
          "fixed inset-x-0 bottom-[84px] z-50 mx-auto flex w-fit max-w-[calc(100%-24px)] items-center gap-2 border border-line bg-surface px-3 py-[6px] text-xs text-ink-2 shadow-sm md:bottom-4",
          actions ? "flex-wrap justify-center rounded-xl" : "rounded-full",
        )}
      >
        <WifiOff className="size-[13px] shrink-0 text-ink-3" />
        <span role="status">
          {kind === "offline" ? "You're offline. Showing saved data; changes send when you reconnect."
            : kind === "expired" ? "Your session ended. Sign in again to keep working."
              : kind === "unverified" ? "We couldn't verify your account. Showing saved data."
                : kind === "session" ? "We couldn't confirm your sign-in. Showing saved data."
                  : kind === "stalled" ? "We couldn't reconnect. Showing saved data."
                    : "Reconnecting… Showing saved data."}
        </span>
        {actions && (
          <>
            {kind === "expired" && <SignInAgain />}
            {kind !== "session" && <Button size="xs" variant="outline" onClick={auth?.retry}>Retry</Button>}
            {kind !== "expired" && <Button size="xs" variant="outline" onClick={() => window.location.reload()}>Reload</Button>}
          </>
        )}
      </div>
    </Delayed>
  );
}

/** Signing out is the way back to the sign-in screen for a session Clerk has refused. */
function SignInAgain() {
  const { run, pending, error } = useSignOut();
  return <>
    <Button size="xs" onClick={() => void run()} disabled={pending}>{pending ? "Signing out…" : "Sign in again"}</Button>
    {error && <span role="alert" className="basis-full text-center text-destructive">{error}</span>}
  </>;
}

function Delayed({ ms, children }: { ms: number; children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return ready ? children : null;
}
