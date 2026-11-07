/**
 * Row chrome shared by every "New" list (Home rail, course rail, mobile Home).
 * 16px padding, then a fixed 12px unread column (see FeedRowBody), so the dot
 * never crowds the panel edge and read rows keep the same indent.
 */
export const FEED_ROW =
  "group relative flex gap-[10px] py-[10px] pr-4 pl-4 text-inherit no-underline transition-colors after:absolute after:right-4 after:bottom-0 after:left-[63px] after:h-px after:bg-line last:after:hidden hover:bg-hover";
