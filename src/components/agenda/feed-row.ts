/**
 * Row chrome shared by every "New" list. Padding, then a fixed 12px unread
 * column (see FeedRowBody), so the dot never crowds the panel edge and read
 * rows keep the same indent. The divider starts under the title (inset +
 * 12px column + 10px gap) and stops at the same right inset.
 */

/** Mobile Home: the 16px phone gutter. */
export const FEED_ROW =
  "group relative flex gap-[10px] py-[10px] pr-4 pl-4 text-inherit no-underline transition-colors after:absolute after:right-4 after:bottom-0 after:left-[38px] after:h-px after:bg-line last:after:hidden hover:bg-hover";

/** The 340px desktop rails (Home, course): a 20px inset. */
export const RAIL_FEED_ROW =
  "group relative flex gap-[10px] py-[10px] pr-5 pl-5 text-inherit no-underline transition-colors after:absolute after:right-5 after:bottom-0 after:left-[42px] after:h-px after:bg-line last:after:hidden hover:bg-hover";
