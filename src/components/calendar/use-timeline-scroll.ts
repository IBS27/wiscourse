import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

// `mousedown` covers scrollbar drags, which browsers do not report as
// pointer events.
const USER_INPUT = ["wheel", "touchstart", "pointerdown", "mousedown", "keydown"] as const;

/**
 * Opens a scrolling timeline at `top`, rounded down to a whole `step` (an
 * hour) so the first visible hour label sits fully clear of the headers.
 *
 * The offset is re-applied after each render and whenever the container is
 * resized — the bands above the grid grow as data arrives, which changes
 * how far it can scroll — until the user scrolls it themselves. After that
 * it is never touched again, so paging to another day or week does not yank
 * them back to the morning.
 */
export function useTimelineScroll(ref: RefObject<HTMLElement | null>, top: number, step: number) {
  const settled = useRef(false);
  const target = useRef(top);

  useLayoutEffect(() => {
    target.current = top;
    if (!settled.current) scrollTo(ref.current, top, step);
  });

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const settle = () => {
      settled.current = true;
    };
    const resize =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(() => {
            if (!settled.current) scrollTo(el, target.current, step);
          });
    resize?.observe(el);
    for (const type of USER_INPUT) el.addEventListener(type, settle, { passive: true });
    return () => {
      resize?.disconnect();
      for (const type of USER_INPUT) el.removeEventListener(type, settle);
    };
  }, [ref, step]);
}

/**
 * Snaps after clamping, so even a clamped offset lands on an hour line. A
 * pixel of slack keeps rounding from dropping the view a whole hour.
 */
function scrollTo(el: HTMLElement | null, top: number, step: number) {
  if (el === null) return;
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 0) return;
  el.scrollTop = Math.floor((Math.min(top, max) + 1) / step) * step;
}
