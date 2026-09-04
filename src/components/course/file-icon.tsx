import { createElement } from "react";
import { fileIcon } from "./file-kinds";
import { cn } from "@/lib/utils";

/** The type icon on every file row and on the download card. */
export function FileTypeIcon({
  contentType,
  filename,
  className,
}: {
  contentType: string;
  filename: string;
  className?: string;
}) {
  return createElement(fileIcon(contentType, filename), {
    className: cn("size-[14px] shrink-0 text-ink-3", className),
    "aria-hidden": true,
  });
}
