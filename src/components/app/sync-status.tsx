import { RefreshCw } from "lucide-react";
import { useSyncInfo } from "@/lib/sync-info";
import { formatSince } from "@/lib/dates";
import { useCourses, useNow } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export function SyncStatusLine({ compact = false, className }: { compact?: boolean; className?: string }) {
  const info = useSyncInfo();
  const { courses } = useCourses();
  const now = useNow();
  if (info === undefined) return <div className={cn("h-4", className)} />;

  let text: string;
  if (!info.connected) text = "Canvas not connected";
  else if (info.invalid) text = "Canvas token expired — reconnect in Settings";
  else if (info.syncing) text = info.firstSync ? "First sync in progress…" : "Syncing…";
  else if (info.error) text = "Last sync failed";
  else if (info.lastSyncedAt === undefined) text = "Waiting for first sync";
  else text = `Synced ${formatSince(info.lastSyncedAt, now)}`;

  return (
    <div className={cn("flex items-center gap-[6px] text-xs text-ink-3", className)}>
      <RefreshCw className={cn("size-[13px]", info.syncing && "animate-spin")} />
      <span className={cn((info.invalid || info.error) && "text-red")}>{text}</span>
      {!compact && info.connected && courses.length > 0 && (
        <>
          <span className="opacity-50">·</span>
          <span>{courses.length} courses</span>
        </>
      )}
    </div>
  );
}
