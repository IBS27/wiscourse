import { useEffect, useRef } from "react";

/**
 * Marks whichever edge of a sideways-scrolling row still has content past
 * it (`data-fade-start` / `data-fade-end`), so the caller can fade that edge
 * and a clipped tab reads as "scroll for more". It also sets, on the row's
 * parent, how far in from each edge the first partly hidden child reaches
 * (`--cover-start` / `--cover-end`), so an overlay that wide hides the
 * clipped child whole instead of cutting a label mid-word.
 */
export function useEdgeFade<T extends HTMLElement>(
  /** The overlays' resting widths: a child reaching under one counts as clipped. */
  inset = { start: 16, end: 32 },
) {
  const { start: leadInset, end: trailInset } = inset;
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.dataset.fadeStart = String(el.scrollLeft > 1);
      el.dataset.fadeEnd = String(el.scrollLeft < max - 1);
      const row = el.getBoundingClientRect();
      let start = 0;
      let end = 0;
      for (const child of el.children) {
        const box = child.getBoundingClientRect();
        const lead = row.left + leadInset;
        const trail = row.right - trailInset;
        if (box.left < lead - 1 && box.right > row.left) start = Math.max(start, box.right - row.left);
        if (box.right > trail + 1 && box.left < row.right) end = Math.max(end, row.right - box.left);
      }
      // Past the child into the gap, so the cover's fade never touches it.
      el.parentElement?.style.setProperty("--cover-start", `${start && start + 14}px`);
      el.parentElement?.style.setProperty("--cover-end", `${end && end + 14}px`);
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
  }, [leadInset, trailInset]);
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
