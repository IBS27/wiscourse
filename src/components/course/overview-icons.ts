/**
 * Canvas module-item and feed types, mapped onto the lucide icons the
 * design draws them with. Kept apart from the row component so the row
 * file only exports components.
 */

import type { ComponentType } from "react";
import {
  CircleHelp,
  Clock,
  ClipboardList,
  FileText,
  GraduationCap,
  Link2,
  Megaphone,
  MessagesSquare,
  Paperclip,
} from "lucide-react";

export type RowIcon = ComponentType<{ className?: string }>;

/**
 * One icon per kind of course item, the same in every course list
 * (overview, modules): quiz, assignment, page, file, discussion and link
 * never share a glyph. The Files tab narrows files by type on its own.
 */
export const ROW_ICON = {
  Assignment: ClipboardList,
  Quiz: CircleHelp,
  Discussion: MessagesSquare,
  Page: FileText,
  File: Paperclip,
  ExternalUrl: Link2,
  ExternalTool: Link2,
  SubHeader: FileText,
  announcement: Megaphone,
  grade: GraduationCap,
  change: Clock,
  locked: Clock,
} satisfies Record<string, RowIcon>;

/**
 * A list shows its icon column only when the icons tell rows apart: when
 * every row would draw the same glyph, the column is noise.
 */
export function iconsDiffer(icons: readonly RowIcon[]): boolean {
  return new Set(icons).size > 1;
}

/**
 * A list's section label ("Due", "Course resources", "Chapters"): Home's
 * section heading — 13px semibold ink, quiet meta beside it, count right.
 */
export const SECTION_TITLE = "text-[13px] leading-[20px] font-semibold tracking-[-0.005em] text-ink";

/** The count at a section heading's right edge, as Home draws it. */
export const SECTION_COUNT = "tabular text-[12px] font-medium text-ink-3";

/**
 * Row chrome for every overview list: the Home row's gutters and rhythm,
 * hairlines inset to the title column, none under the last row.
 */
export const OVERVIEW_ROW =
  "group relative flex w-full items-start gap-3 py-[9px] pr-4 pl-4 text-left text-ink no-underline transition-colors outline-none after:absolute after:right-4 after:bottom-0 after:left-[43px] after:h-px after:bg-line last:after:hidden md:pr-6 md:pl-6 md:after:right-6 md:after:left-[51px]";

/** OVERVIEW_ROW's hairline when the list draws no icon column. */
export const OVERVIEW_ROW_NO_ICON = "after:left-4 md:after:left-6";
