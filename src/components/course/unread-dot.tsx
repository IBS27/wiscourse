import { Dot } from "@/components/app/bits";
import { cn } from "@/lib/utils";

/** The one "you have not looked at this" mark. Needs `--c` in scope. */
export function UnreadDot({ className }: { className?: string }) {
  return <Dot className={cn("size-[6px]", className)} />;
}
