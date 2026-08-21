import { useClerk, useUser } from "@clerk/clerk-react";
import { useMutation } from "convex/react";
import { Link } from "@tanstack/react-router";
import {
  ChevronRight,
  ChevronsUpDown,
  KeyRound,
  LogOut,
  Monitor,
  Moon,
  RefreshCw,
  Settings,
  Sun,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  dropdownItemClass,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "./bits";
import { useSyncInfo } from "@/lib/sync-info";
import { setTheme, useTheme, type Theme } from "@/lib/theme";
import { DAY_MS, formatSince } from "@/lib/dates";
import { useNow } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const THEME_LABEL: Record<Theme, string> = { light: "Light", dark: "Dark", system: "System" };
const THEME_ICON: Record<Theme, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };

export function ProfileMenu({ variant = "sidebar" }: { variant?: "sidebar" | "avatar" }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const theme = useTheme();
  const info = useSyncInfo();
  const now = useNow();
  const requestSync = useMutation(api.sync.requestSync);

  const name = user?.fullName ?? user?.username ?? "Account";
  const email = user?.primaryEmailAddress?.emailAddress;
  const initials =
    (user?.firstName?.[0] ?? "") + (user?.lastName?.[0] ?? "") || name.slice(0, 2).toUpperCase();

  const daysLeft =
    info?.expiresAt === undefined ? undefined : Math.ceil((info.expiresAt - now) / DAY_MS);
  const attention = info?.invalid === true || (daysLeft !== undefined && daysLeft <= 14);
  const ThemeIcon = THEME_ICON[theme];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "sidebar" ? (
          <button
            type="button"
            className="flex h-[34px] w-full items-center gap-[9px] rounded-lg px-2 text-[13px] font-medium text-ink-2 outline-none hover:bg-hover hover:text-ink data-[state=open]:bg-hover data-[state=open]:text-ink"
          >
            <Avatar initials={initials} attention={attention} />
            <span className="truncate">{name}</span>
            <ChevronsUpDown className="ml-auto size-[14px] text-ink-3" />
          </button>
        ) : (
          <button type="button" className="rounded-full outline-none" aria-label="Account">
            <Avatar initials={initials} attention={attention} size={30} />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={variant === "sidebar" ? "top" : "bottom"} align={variant === "sidebar" ? "start" : "end"}>
        <div className="px-2 pt-[6px] pb-[7px]">
          <div className="font-medium text-ink">{name}</div>
          {email && <div className="mt-px text-[11.5px] text-ink-3">{email}</div>}
        </div>
        <DropdownMenuSeparator />
        {info?.connected && (attention || daysLeft !== undefined) && (
          <>
            <DropdownMenuItem asChild className={cn(attention && "[&_svg]:text-red")}>
              <Link to="/settings">
                <KeyRound />
                {info.invalid ? "Reconnect Canvas" : "Renew token"}
                <span className={cn("ml-auto text-xs text-ink-3", attention && "text-red")}>
                  {info.invalid
                    ? "expired"
                    : daysLeft !== undefined
                      ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
                      : ""}
                </span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings />
            Settings
            <Kbd className="ml-auto">⌘ ,</Kbd>
          </Link>
        </DropdownMenuItem>
        {info?.connected && (
          <DropdownMenuItem onSelect={() => void requestSync()}>
            <RefreshCw />
            Sync now
            <span className="ml-auto text-xs text-ink-3">
              {info.syncing
                ? "syncing…"
                : info.lastSyncedAt !== undefined
                  ? formatSince(info.lastSyncedAt, now)
                  : ""}
            </span>
          </DropdownMenuItem>
        )}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={dropdownItemClass}>
            <ThemeIcon />
            Theme
            <span className="ml-auto flex items-center gap-1 text-xs text-ink-3">
              {THEME_LABEL[theme]}
              <ChevronRight className="size-3!" />
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
              {(["system", "light", "dark"] as const).map((t) => {
                const Icon = THEME_ICON[t];
                return (
                  <DropdownMenuRadioItem key={t} value={t}>
                    <Icon />
                    {THEME_LABEL[t]}
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Avatar({ initials, attention, size = 22 }: { initials: string; attention: boolean; size?: number }) {
  return (
    <span
      className="relative grid shrink-0 place-items-center rounded-full border border-line bg-chip text-[10px] font-semibold text-ink-2"
      style={{ width: size, height: size }}
    >
      {initials}
      {attention && (
        <span className="absolute -top-[2px] -right-[2px] size-2 rounded-full border-2 border-sidebar bg-red" />
      )}
    </span>
  );
}
