// Block fills and shared constants for the time grids, kept out of the
// component files so those stay component-only (fast refresh).

/**
 * Block fills: a tint of the course colour, deeper in dark mode. Local
 * events sit lighter with a dashed edge so a class and a self-made block
 * never read the same.
 */
export const BLOCK_FILL =
  "bg-[color-mix(in_srgb,var(--c)_16%,var(--surface))] hover:bg-[color-mix(in_srgb,var(--c)_22%,var(--surface))] dark:bg-[color-mix(in_srgb,var(--c)_26%,var(--surface))] dark:hover:bg-[color-mix(in_srgb,var(--c)_34%,var(--surface))]";

export const LOCAL_BLOCK_FILL =
  "bg-[color-mix(in_srgb,var(--c)_8%,var(--surface))] hover:bg-[color-mix(in_srgb,var(--c)_12%,var(--surface))] dark:bg-[color-mix(in_srgb,var(--c)_14%,var(--surface))] dark:hover:bg-[color-mix(in_srgb,var(--c)_20%,var(--surface))] outline-1 outline-offset-[-1px] outline-dashed outline-[color-mix(in_srgb,var(--c)_55%,transparent)]";

/** The muted second line inside a filled block. */
export const BLOCK_SUBTITLE = "text-[color-mix(in_srgb,var(--c)_70%,var(--ink))] opacity-85";

export function blockFill(local: boolean): string {
  return local ? LOCAL_BLOCK_FILL : BLOCK_FILL;
}

/**
 * A calm wash on today's column and header: visible at a glance, never so
 * strong it reads as a selected or disabled column.
 */
export const TODAY_TINT =
  "bg-[color-mix(in_srgb,var(--ink)_3.5%,transparent)] dark:bg-[color-mix(in_srgb,white_4%,transparent)]";

/**
 * A gutter hour label: hung just below its line rather than centred on it,
 * so the hour at the top of the view is never cut in half by the band.
 */
export const HOUR_LABEL =
  "absolute mt-[3px] text-[12px] leading-none whitespace-nowrap tabular text-ink-3";
