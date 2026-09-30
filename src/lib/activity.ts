import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { HEARTBEAT_DEDUPE_MS, HEARTBEAT_MS } from "../../convex/lib/syncCadence";

const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;

/**
 * Tells the backend the app is open and in use, which moves Canvas polling
 * from every 15 minutes to every 2. Beats follow input, so a tab left open
 * overnight lapses to the idle cadence on its own.
 */
export function useActivityHeartbeat() {
  const beat = useMutation(api.syncSchedule.heartbeat);
  const last = useRef(-Infinity);
  useEffect(() => {
    const send = (gap: number) => {
      const now = Date.now();
      if (document.visibilityState !== "visible" || !navigator.onLine || now - last.current < gap) return;
      last.current = now;
      // Best effort: a missed beat only means the slower cadence.
      beat().catch(() => {});
    };
    const onActivity = () => send(HEARTBEAT_MS);
    // A return from another tab or a reconnect counts at once: the backend
    // then probes Canvas on its next tick.
    const onReturn = () => send(HEARTBEAT_DEDUPE_MS);
    onReturn();
    const options = { capture: true, passive: true };
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, onActivity, options);
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    window.addEventListener("online", onReturn);
    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity, options);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
      window.removeEventListener("online", onReturn);
    };
  }, [beat]);
}
