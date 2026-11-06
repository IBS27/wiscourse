import type { ReactNode } from "react";
import { ProfileMenu } from "./profile-menu";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="flex min-h-[64px] items-center justify-between gap-5 border-b border-line px-4 py-3 md:px-6">
      <div>
        <div className="page-title">{title}</div>
        {subtitle && <div className="mt-[2px] text-[12.5px] text-ink-3">{subtitle}</div>}
      </div>
      <div className="flex items-center gap-3">
        {actions}
        <span className="md:hidden">
          <ProfileMenu variant="avatar" />
        </span>
      </div>
    </header>
  );
}
