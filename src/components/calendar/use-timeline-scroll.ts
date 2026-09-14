import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

// `mousedown` covers scrollbar drags, which browsers do not report as
// pointer events.
const USER_INPUT = ["wheel", "touchstart", "pointerdown", "mousedown", "keydown"] as const;

/**
 * Opens a scrolling timeline at `top`. The offset is re-applied after each
 * render until the container has laid out and reached it (clamped to how
 * far it can scroll) — an early scroll on an unsized container is dropped —
 * and never again once the user has scrolled it themselves, so paging to
 * another day or week does not yank them back to the morning.
 */
export function useTimelineScroll(ref: RefObject<HTMLElement | null>, top: number) {
  const settled = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null || settled.current) return;
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 0) return;
    el.scrollTop = top;
    if (Math.abs(el.scrollTop - Math.min(top, max)) < 1) settled.current = true;
  });

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const settle = () => {
      settled.current = true;
    };
    for (const type of USER_INPUT) el.addEventListener(type, settle, { passive: true });
    return () => {
      for (const type of USER_INPUT) el.removeEventListener(type, settle);
    };
  }, [ref]);
}
