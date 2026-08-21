import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Dot({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <span
      className={cn("inline-block size-[7px] shrink-0 rounded-full bg-c", className)}
      style={style}
    />
  );
}

export function Pill({
  tone = "default",
  className,
  children,
}: {
  tone?: "default" | "red" | "outline";
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[21px] shrink-0 items-center gap-[5px] rounded-md px-2 text-[11.5px] font-medium whitespace-nowrap [&_svg]:size-[13px]",
        tone === "default" && "bg-chip text-ink-2",
        tone === "red" && "bg-red-bg text-red",
        tone === "outline" && "text-ink-3 shadow-[inset_0_0_0_1px_var(--line)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Chip({
  solid,
  className,
  children,
}: {
  solid?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-[6px] rounded-md px-[9px] text-xs font-medium [&_svg]:size-[13px]",
        solid ? "bg-today text-today-fg" : "bg-chip text-ink-2",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "rounded-[5px] border border-line bg-surface px-[5px] py-px font-sans text-[11px] font-medium text-ink-3",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function CountBadge({ n, className }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span
      className={cn(
        "rounded-full bg-chip px-[6px] py-px text-[11px] font-semibold text-ink-3",
        className,
      )}
    >
      {n}
    </span>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("eyebrow", className)}>{children}</div>;
}
