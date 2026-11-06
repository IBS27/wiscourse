import type { ReactNode } from "react";
import { ProfileMenu } from "./profile-menu";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  actions,
  contentClassName,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Narrows the header row to a centred content column, e.g. "max-w-[720px]". */
  contentClassName?: string;
}) {
  return (
    <header className="flex min-h-[64px] items-center border-b border-line py-3">
      <div className={cn("mx-auto flex w-full items-center justify-between gap-5 px-4 md:px-6", contentClassName)}>
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <div className="mt-[2px] text-[12.5px] text-ink-3">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-3">
          {actions}
          <span className="md:hidden">
            <ProfileMenu variant="avatar" />
          </span>
        </div>
      </div>
    </header>
  );
}
