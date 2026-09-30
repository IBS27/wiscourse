import { useEffect, useState, type ReactNode } from "react";
import { useConvexConnectionState } from "convex/react";
import { WifiOff } from "lucide-react";
import { useOnline } from "@/lib/online";

// Brief socket drops (a laptop waking, a network handoff) heal on their own.
const GRACE_MS = 4_000;

/**
 * Says when the app is showing saved data because it cannot reach the
 * backend. Queries keep their last results and writes wait in the queue,
 * so this informs rather than blocks. Auth failures have their own screen.
 */
export function ConnectionBanner() {
  const online = useOnline();
  const { hasEverConnected, isWebSocketConnected } = useConvexConnectionState();
  if (online && (isWebSocketConnected || !hasEverConnected)) return null;
  return (
    <Delayed ms={GRACE_MS}>
      <div
        role="status"
        className="fixed inset-x-0 bottom-[84px] z-50 mx-auto flex w-fit max-w-[calc(100%-24px)] items-center gap-2 rounded-full border border-line bg-surface px-3 py-[6px] text-xs text-ink-2 shadow-sm md:bottom-4"
      >
        <WifiOff className="size-[13px] shrink-0 text-ink-3" />
        {online
          ? "Reconnecting… Showing saved data."
          : "You're offline. Showing saved data; changes send when you reconnect."}
      </div>
    </Delayed>
  );
}

function Delayed({ ms, children }: { ms: number; children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return ready ? children : null;
}
