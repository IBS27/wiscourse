/**
 * Canvas module-item and feed types, mapped onto the lucide icons the
 * design draws them with. Kept apart from the row component so the row
 * file only exports components.
 */

import type { ComponentType } from "react";
import {
  CircleHelp,
  Clock,
  ExternalLink,
  File as FileIcon,
  FileText,
  Megaphone,
  MessageSquare,
  ClipboardList,
  GraduationCap,
} from "lucide-react";

export type RowIcon = ComponentType<{ className?: string }>;

export const ROW_ICON = {
  Assignment: ClipboardList,
  Quiz: CircleHelp,
  Discussion: MessageSquare,
  Page: FileText,
  File: FileIcon,
  ExternalUrl: ExternalLink,
  ExternalTool: ExternalLink,
  SubHeader: FileText,
  announcement: Megaphone,
  grade: GraduationCap,
  change: Clock,
  locked: Clock,
} satisfies Record<string, RowIcon>;

/**
 * Row chrome for every overview list: the Home row's gutters and rhythm,
 * hairlines inset to the title column, none under the last row.
 */
export const OVERVIEW_ROW =
  "group relative flex w-full items-start gap-3 py-[9px] pr-4 pl-4 text-left text-ink no-underline transition-colors outline-none after:absolute after:right-4 after:bottom-0 after:left-[43px] after:h-px after:bg-line last:after:hidden md:pr-6 md:pl-6 md:after:right-6 md:after:left-[51px]";
