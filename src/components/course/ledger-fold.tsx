/**
 * A collapsed group on the courses index, closed by default: past terms
 * and the "Other" bucket of orientation/advising courses both use it.
 */

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function LedgerFold({
  label,
  count,
  hint,
  children,
}: {
  label: string;
  count: number;
  hint?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-[9px] px-4 pt-5 pb-2 text-left text-[11.5px] font-semibold tracking-[0.09em] text-ink-3 uppercase md:px-5"
      >
        <ChevronRight
          className={cn("size-[13px] transition-transform", open && "rotate-90")}
          aria-hidden
        />
        {label}
        {hint && (
          <span className="hidden truncate text-[11.5px] font-normal tracking-normal normal-case text-ink-3 md:inline">
            · {hint}
          </span>
        )}
        <span className="ml-auto shrink-0 text-[11.5px] font-medium tracking-normal normal-case">
          {count} course{count === 1 ? "" : "s"}
        </span>
      </button>
      {open && children}
    </>
  );
}
