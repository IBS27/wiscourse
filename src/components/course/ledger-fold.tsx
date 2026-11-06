/**
 * A collapsed group on the courses and grades indexes, closed by default:
 * one 40px row per past term, and the "Other" bucket of orientation and
 * advising courses. Rows sit flush with a hairline under each, so a run of
 * them reads as one list.
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
    <section>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group relative flex h-10 w-full items-center gap-2 px-4 text-left transition-colors outline-none after:absolute after:right-4 after:bottom-0 after:left-4 after:h-px after:bg-line hover:bg-hover focus-visible:bg-hover md:px-6 md:after:right-6 md:after:left-6"
      >
        <ChevronRight
          className={cn(
            "size-[14px] shrink-0 text-ink-3 transition-transform group-hover:text-ink-2",
            open && "rotate-90",
          )}
          aria-hidden
        />
        <span
          className={cn(
            "shrink-0 text-[13px] transition-colors group-hover:text-ink",
            open ? "font-medium text-ink" : "text-ink-2",
          )}
        >
          {label}
        </span>
        {hint && <span className="hidden truncate text-[12.5px] text-ink-3 md:inline">{hint}</span>}
        <span className="tabular ml-auto shrink-0 pl-3 text-[12.5px] text-ink-3">
          {count} course{count === 1 ? "" : "s"}
        </span>
      </button>
      {open && children}
    </section>
  );
}
