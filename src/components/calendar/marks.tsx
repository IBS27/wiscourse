// The item grammar from docs/calendar.html: one mark per kind, course colour
// as the only hue. Every calendar surface — bands, month cells, popover rows,
// the mobile day list — draws its items with these.

import { cn } from "@/lib/utils";

export type MarkKind = "meeting" | "due" | "planned" | "event" | "done";

export function Mark({ kind, className }: { kind: MarkKind; className?: string }) {
  return (
    <span className={cn("grid size-[14px] shrink-0 place-items-center", className)} aria-hidden>
      {kind === "meeting" && <i className="block h-3 w-[3px] rounded-[2px] bg-c" />}
      {kind === "due" && <i className="block size-[7px] rounded-full bg-c" />}
      {kind === "event" && (
        <i className="block size-[7px] rounded-full shadow-[inset_0_0_0_1.5px_var(--c)]" />
      )}
      {kind === "planned" && (
        <i className="block size-[11px] rounded-[3px] border-[1.5px] border-c opacity-85" />
      )}
      {kind === "done" && <i className="block size-[11px] rounded-full bg-ink-3" />}
    </span>
  );
}
