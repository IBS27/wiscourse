import type { ReactNode } from "react";
import { ProfileMenu } from "./profile-menu";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-5 border-b border-line px-4 py-[14px] md:px-5">
      <div>
        <div className="text-[15px] font-semibold tracking-[-0.015em]">{title}</div>
        {subtitle && <div className="mt-[3px] text-xs text-ink-3">{subtitle}</div>}
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
