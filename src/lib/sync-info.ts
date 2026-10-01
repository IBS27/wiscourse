import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SYNC_DELAYED_MS } from "../../convex/lib/syncCadence";

export type SyncInfo = {
  connected: boolean;
  /** The Canvas host this account is connected to, e.g. "canvas.wisc.edu". */
  instance?: string;
  syncing: boolean;
  error?: string;
  lastSyncedAt?: number;
  firstSync: boolean;
  expiresAt?: number;
  invalid: boolean;
};

// Memoised: consumers derive lists from this, and a fresh object every
// render would invalidate every one of their `useMemo`s.
export function useSyncInfo(): SyncInfo | undefined {
  const status = useQuery(api.credentials.status);
  return useMemo(() => {
    if (status === undefined || status === null) return undefined;
    if (!status.connected) {
      return { connected: false, syncing: false, firstSync: false, invalid: false };
    }
    const s = status.sync;
    const last = Math.max(s?.lastDeltaSyncAt ?? 0, s?.lastFullSyncAt ?? 0, s?.lastTripwireAt ?? 0);
    return {
      connected: true,
      instance: status.instance,
      syncing: s?.status === "syncing",
      error: s?.status === "error" ? s.lastError : undefined,
      lastSyncedAt: last > 0 ? last : undefined,
      firstSync: s?.lastFullSyncAt === undefined,
      expiresAt: status.expiresAt,
      invalid: status.credentialStatus === "invalid",
    };
  }, [status]);
}

/**
 * Background sync has stopped reporting without an error: the scheduler or
 * queue is stuck, or polling is switched off.
 */
export function isSyncDelayed(info: SyncInfo, now: number): boolean {
  return info.connected && !info.invalid && !info.syncing && info.error === undefined
    && info.lastSyncedAt !== undefined && now - info.lastSyncedAt > SYNC_DELAYED_MS;
}
