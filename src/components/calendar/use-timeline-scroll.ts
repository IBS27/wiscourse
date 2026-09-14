import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const USER_INPUT = ["wheel", "touchstart", "pointerdown", "keydown"] as const;

/**
 * Opens a scrolling timeline at `top`. The offset is re-applied after each
 * render until it is reached — the container is shorter before the day's
 * data lands and clamps an early scroll — and never again once the user
 * has scrolled it themselves, so paging to another day or week does not
 * yank them back to the morning.
 */
export function useTimelineScroll(ref: RefObject<HTMLElement | null>, top: number) {
  const settled = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null || settled.current) return;
    el.scrollTop = top;
    if (Math.abs(el.scrollTop - top) < 1) settled.current = true;
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
