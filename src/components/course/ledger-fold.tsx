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
    <section className="first-of-type:mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "group flex h-11 w-full items-center gap-2 px-4 text-left transition-colors outline-none hover:bg-hover focus-visible:bg-hover md:px-6",
          open && "border-b border-line",
        )}
      >
        <ChevronRight
          className={cn(
            "size-[14px] shrink-0 text-ink-3 transition-transform group-hover:text-ink-2",
            open && "rotate-90",
          )}
          aria-hidden
        />
        <span className="shrink-0 text-[13px] font-medium text-ink-2 group-hover:text-ink">
          {label}
        </span>
        {hint && <span className="hidden truncate text-[12.5px] text-ink-3 md:inline">{hint}</span>}
        <span className="tabular ml-auto shrink-0 pl-3 text-[12.5px] text-ink-3">
          {count} course{count === 1 ? "" : "s"}
        </span>
      </button>
      {open && <div className="pb-2">{children}</div>}
    </section>
  );
}
