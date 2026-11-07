import { useEffect, useRef } from "react";

/**
 * Marks whichever edge of a sideways-scrolling row still has content past
 * it (`data-fade-start` / `data-fade-end`), so the caller can fade that edge
 * and a clipped tab reads as "scroll for more".
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

/**
 * Brings `child` fully into the row with the least scroll: past the leading
 * edge it lands on the row's padding, so it lines up with the page gutter;
 * past the trailing edge it stops just clear of the `trail` (the fade and
 * its chevron). Only the row scrolls, never the page.
 */
export function revealInRow(row: HTMLElement, child: HTMLElement, trail = 32) {
  if (row.scrollWidth <= row.clientWidth) return;
  const lead = parseFloat(getComputedStyle(row).paddingLeft) || 16;
  const rowBox = row.getBoundingClientRect();
  const box = child.getBoundingClientRect();
  if (box.left < rowBox.left + lead) row.scrollLeft += box.left - rowBox.left - lead;
  else if (box.right > rowBox.right - trail) row.scrollLeft += box.right - (rowBox.right - trail);
}
