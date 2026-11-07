// The item grammar from docs/calendar.html: one mark per kind, course colour
// as the only hue. Every calendar surface — bands, month cells, popover rows,
// the mobile day list — draws its items with these.

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type MarkKind = "meeting" | "due" | "planned" | "event" | "done";

/**
 * `legend` draws the key version (Settings' Include list): every shape
 * optically balanced in one 12px box, in ink-3, so the four read as a set.
 */
export function Mark({
  kind,
  legend,
  className,
}: {
  kind: MarkKind;
  legend?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid size-[14px] shrink-0 place-items-center",
        legend && "size-3 [--c:var(--ink-3)]",
        className,
      )}
      aria-hidden
    >
      {kind === "meeting" && (
        <i className={cn("block h-3 w-[3px] rounded-[2px] bg-c", legend && "h-[11px]")} />
      )}
      {kind === "due" && <i className={cn("block size-[7px] rounded-full bg-c", legend && "size-[9px]")} />}
      {kind === "event" && (
        <i
          className={cn(
            "block size-[7px] rounded-full shadow-[inset_0_0_0_1.5px_var(--c)]",
            legend && "size-[10px]",
          )}
        />
      )}
      {kind === "planned" && (
        <i
          className={cn(
            "block size-[11px] rounded-[3px] border-[1.5px] border-c opacity-85",
            legend && "size-[10px] rounded-[2.5px] opacity-100",
          )}
        />
      )}
      {kind === "done" && <Check className="size-[12px] text-ink-3" strokeWidth={2.75} />}
    </span>
  );
}
