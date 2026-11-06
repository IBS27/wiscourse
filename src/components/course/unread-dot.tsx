import { Dot } from "@/components/app/bits";
import { cn } from "@/lib/utils";

/** The one "you have not looked at this" mark. Neutral, so it never reads as a course colour. */
export function UnreadDot({ className }: { className?: string }) {
  return <Dot className={cn("size-[6px] bg-unread", className)} />;
}
