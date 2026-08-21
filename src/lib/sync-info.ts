import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export type SyncInfo = {
  connected: boolean;
  syncing: boolean;
  error?: string;
  lastSyncedAt?: number;
  firstSync: boolean;
  expiresAt?: number;
  invalid: boolean;
};

export function useSyncInfo(): SyncInfo | undefined {
  const status = useQuery(api.credentials.status);
  if (status === undefined || status === null) return undefined;
  if (!status.connected) {
    return { connected: false, syncing: false, firstSync: false, invalid: false };
  }
  const s = status.sync;
  const last = Math.max(s?.lastDeltaSyncAt ?? 0, s?.lastFullSyncAt ?? 0, s?.lastTripwireAt ?? 0);
  return {
    connected: true,
    syncing: s?.status === "syncing",
    error: s?.status === "error" ? s.lastError : undefined,
    lastSyncedAt: last > 0 ? last : undefined,
    firstSync: s?.lastFullSyncAt === undefined,
    expiresAt: status.expiresAt,
    invalid: status.credentialStatus === "invalid",
  };
}
