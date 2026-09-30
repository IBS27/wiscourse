import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { HEARTBEAT_MS } from "../../convex/lib/syncCadence";

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
    // Input, a return to the tab, and a reconnect all count as use. One gap
    // covers them all: the backend's active window outlasts it, so a return
    // after the window lapsed always beats, and the backend then probes Canvas
    // on its next tick.
    const send = () => {
      const now = Date.now();
      if (document.visibilityState !== "visible" || !navigator.onLine || now - last.current < HEARTBEAT_MS) return;
      last.current = now;
      // Best effort: a missed beat only means the slower cadence.
      beat().catch(() => {});
    };
    send();
    const options = { capture: true, passive: true };
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, send, options);
    document.addEventListener("visibilitychange", send);
    window.addEventListener("focus", send);
    window.addEventListener("online", send);
    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, send, options);
      document.removeEventListener("visibilitychange", send);
      window.removeEventListener("focus", send);
      window.removeEventListener("online", send);
    };
  }, [beat]);
}
