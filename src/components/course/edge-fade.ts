import { useEffect, useRef } from "react";

/**
 * Fades whichever edge of a sideways-scrolling row still has content past
 * it, so a clipped tab or chip reads as "scroll for more". Pair the ref
 * with `EDGE_FADE`; the hook only flips the two data attributes.
 */
export function useEdgeFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.dataset.fadeStart = String(el.scrollLeft > 1);
      el.dataset.fadeEnd = String(el.scrollLeft < max - 1);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    // Children too: a badge arriving widens a tab without resizing the row.
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
    observer?.observe(el);
    for (const child of el.children) observer?.observe(child);
    return () => {
      el.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, []);
  return ref;
}

/** A 20px mask on each edge that `useEdgeFade` marks as overflowing. */
export const EDGE_FADE =
  "[--fade-l:0px] [--fade-r:0px] data-[fade-start=true]:[--fade-l:20px] data-[fade-end=true]:[--fade-r:20px] [mask-image:linear-gradient(to_right,transparent,#000_var(--fade-l),#000_calc(100%_-_var(--fade-r)),transparent)]";

/**
 * Brings `child` fully into the row, landing 16px from the start edge so
 * the item before it never shows as a clipped sliver. Only the row
 * scrolls, never the page.
 */
export function revealInRow(row: HTMLElement, child: HTMLElement) {
  if (row.scrollWidth <= row.clientWidth) return;
  const rowBox = row.getBoundingClientRect();
  const box = child.getBoundingClientRect();
  // Under a faded edge counts as hidden.
  if (box.left >= rowBox.left + 16 && box.right <= rowBox.right - 16) return;
  row.scrollLeft += box.left - rowBox.left - 16;
}
