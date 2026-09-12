/**
 * What-if edits for one course: hypothetical scores keyed by assignment,
 * kept in this browser only. Canvas is never written, and the edits survive
 * a reload so a plan made on Monday is still there on Friday.
 *
 * The key carries the Clerk user id: two students on one laptop must never
 * inherit each other's hypotheticals.
 */

import { useCallback, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";

function storageKey(userId: string | null | undefined, courseCanvasId: number): string {
  return `whatif:${userId ?? "anon"}:${courseCanvasId}`;
}

function read(key: string): Map<number, number> {
  const edits = new Map<number, number>();
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return edits; // storage denied; what-if simply does not persist
  }
  if (raw === null) return edits;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return edits;
    for (const [id, score] of Object.entries(parsed as Record<string, unknown>)) {
      const canvasId = Number(id);
      if (Number.isFinite(canvasId) && typeof score === "number" && Number.isFinite(score)) {
        edits.set(canvasId, score);
      }
    }
  } catch {
    // A corrupt entry is not worth a crash; the student starts clean.
  }
  return edits;
}

function write(key: string, edits: Map<number, number>): void {
  try {
    if (edits.size === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(Object.fromEntries(edits)));
  } catch {
    // Private mode: the edits live for this page view only.
  }
}

export interface WhatIf {
  edits: ReadonlyMap<number, number>;
  /** Bumped by `reset`, so score fields can re-key on it. */
  version: number;
  /** `undefined` clears the row back to whatever Canvas says. */
  set: (assignmentCanvasId: number, score: number | undefined) => void;
  reset: () => void;
}

/**
 * Mount this under a `key={courseCanvasId}` — the edits are per course.
 * `known` is the set of assignment ids the loaded gradebook actually has;
 * anything else in storage is dropped from view and from the next write, so
 * a deleted assignment can never show up as an unattributable edit.
 */
export function useWhatIf(courseCanvasId: number, known?: ReadonlySet<number>): WhatIf {
  const { userId } = useAuth();
  const key = storageKey(userId, courseCanvasId);
  const [stored, setStored] = useState(() => read(key));
  const [version, setVersion] = useState(0);

  const edits = useMemo(
    () =>
      known === undefined
        ? stored
        : new Map([...stored].filter(([canvasId]) => known.has(canvasId))),
    [stored, known],
  );

  const set = useCallback(
    (assignmentCanvasId: number, score: number | undefined) => {
      const next = new Map(edits);
      if (score === undefined) next.delete(assignmentCanvasId);
      else next.set(assignmentCanvasId, score);
      write(key, next);
      setStored(next);
    },
    [edits, key],
  );

  const reset = useCallback(() => {
    write(key, new Map());
    setStored(new Map());
    setVersion((n) => n + 1);
  }, [key]);

  return { edits, version, set, reset };
}
