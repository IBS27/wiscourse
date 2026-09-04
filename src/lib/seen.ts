import { useCallback, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Infer } from "convex/values";
import { api } from "../../convex/_generated/api";
import type { entityKind } from "../../convex/schema";
import { DAY_MS } from "./dates";

export type SeenKind = Infer<typeof entityKind>;

/** How long something stays "new" unopened. Matches `files.fresh`. */
export const FRESH_MS = 14 * DAY_MS;

export interface Seen {
  loading: boolean;
  /** Seen, and — when `version` is given — seen at *that* version, so a
   * regrade or a re-post makes the item new again. */
  has: (canvasId: number, version?: string) => boolean;
  seenAt: (canvasId: number) => number | undefined;
  mark: (canvasId: number, version?: string) => void;
}

// One subscription per kind, shared by every component on the page: Convex
// dedupes identical queries, so a list, its tab dot and ⌘K read the same rows.
export function useSeen(kind: SeenKind): Seen {
  const rows = useQuery(api.seenState.list, { kind });
  const markSeen = useMutation(api.seenState.markSeen);

  const byId = useMemo(() => {
    const map = new Map<number, { seenAt: number; seenVersion?: string }>();
    for (const row of rows ?? []) map.set(row.canvasId, row);
    return map;
  }, [rows]);

  const has = useCallback(
    (canvasId: number, version?: string) => {
      const row = byId.get(canvasId);
      return row !== undefined && (version === undefined || row.seenVersion === version);
    },
    [byId],
  );

  const seenAt = useCallback((canvasId: number) => byId.get(canvasId)?.seenAt, [byId]);

  const mark = useCallback(
    (canvasId: number, version?: string) => {
      if (has(canvasId, version)) return;
      void markSeen({ kind, canvasId, seenVersion: version });
    },
    [has, kind, markSeen],
  );

  // Nothing should flash an unread dot while the rows are in flight.
  return useMemo(
    () =>
      rows === undefined
        ? { loading: true, has: () => true, seenAt: () => undefined, mark }
        : { loading: false, has, seenAt, mark },
    [rows, has, seenAt, mark],
  );
}

/** Marks once per (kind, id, version); pass `undefined` while still loading. */
export function useMarkSeenOnMount(
  kind: SeenKind,
  canvasId: number | undefined,
  version?: string,
): void {
  const markSeen = useMutation(api.seenState.markSeen);
  useEffect(() => {
    if (canvasId === undefined || !Number.isFinite(canvasId)) return;
    void markSeen({ kind, canvasId, seenVersion: version });
  }, [kind, canvasId, version, markSeen]);
}
