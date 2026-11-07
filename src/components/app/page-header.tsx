import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { ProfileMenu } from "./profile-menu";
import { openSearch } from "@/lib/search-context";
import { cn } from "@/lib/utils";

/**
 * The one page frame. Every top bar is exactly 64px with its rule at y=64,
 * and its title block is a fixed 42px (24px title line + 2px + 16px subtitle
 * line) centred in it, so the title's top sits at y=11 on every page whether
 * or not a subtitle is shown. Bars that cannot use PageHeader (calendar,
 * course hub, chats) compose these same pieces.
 */
export const HEADER_BAR = "h-16 shrink-0 border-b border-line px-4 md:px-6";

/** Round 36px header button; the search button and the avatar share its size. */
export const HEADER_BUTTON =
  "grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-ink-2 transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:outline-none";

export function PageHeader({
  title,
  subtitle,
  actions,
  contentClassName,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** A left-aligned max width shared with the page body, e.g. "max-w-[720px]". */
  contentClassName?: string;
}) {
  return (
    <header className={HEADER_BAR}>
      <div className={cn("flex h-full w-full items-center justify-between gap-5", contentClassName)}>
        <HeaderTitle title={title} subtitle={subtitle} />
        <div className="flex shrink-0 items-center gap-2 md:gap-3">
          {actions}
          <MobileHeaderSlot />
        </div>
      </div>
    </header>
  );
}

/** The fixed 42px title block; the subtitle line is reserved even when empty. */
export function HeaderTitle({
  title,
  subtitle,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-[42px] min-w-0 flex-col", className)}>
      <h1 className="page-title h-6 truncate leading-6">{title}</h1>
      <div className="mt-[2px] h-4 min-w-0 truncate text-[12.5px] leading-4 text-ink-3">
        {subtitle}
      </div>
    </div>
  );
}

/** Phones only: the same right slot on every top-level page — search, then the account. */
export function MobileHeaderSlot() {
  return (
    <div className="flex shrink-0 items-center gap-2 md:hidden">
      <button type="button" aria-label="Search" onClick={() => openSearch()} className={HEADER_BUTTON}>
        <Search className="size-[16px]" />
      </button>
      <ProfileMenu variant="avatar" />
    </div>
  );
}
