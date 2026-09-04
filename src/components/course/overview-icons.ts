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
  SquareCheck,
  Star,
} from "lucide-react";

export type RowIcon = ComponentType<{ className?: string }>;

export const ROW_ICON = {
  Assignment: SquareCheck,
  Quiz: CircleHelp,
  Discussion: MessageSquare,
  Page: FileText,
  File: FileIcon,
  ExternalUrl: ExternalLink,
  ExternalTool: ExternalLink,
  SubHeader: FileText,
  announcement: Megaphone,
  grade: Star,
  change: Clock,
  locked: Clock,
} satisfies Record<string, RowIcon>;
