import {
  createContext, createElement, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore,
  type ReactNode, type SetStateAction,
} from "react";

const KEPT_PREFIX = "wiscourse:drafts:";

// Storage can be unavailable or full; kept drafts then fall back to memory.
function tabStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function loadKept(owner: string): Record<string, string> {
  try {
    const stored: unknown = JSON.parse(tabStorage()?.getItem(KEPT_PREFIX + owner) ?? "{}");
    if (typeof stored !== "object" || stored === null) return {};
    return Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}

/** Drops every kept draft in this tab except `owner`'s. */
export function forgetKeptDrafts(owner: string | null) {
  try {
    const storage = tabStorage();
    if (!storage) return;
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    for (const key of keys) {
      if (key?.startsWith(KEPT_PREFIX) && key !== KEPT_PREFIX + owner) storage.removeItem(key);
    }
  } catch {
    // Nothing was kept if storage cannot be read.
  }
}

/**
 * Owned by one signed-in user. Also carries pending form submissions. Memory
 * only, except the text drafts a form asks to keep: with an `owner`, those are
 * mirrored to this tab's session storage and survive a reload or a tab the
 * browser discarded.
 */
export class DraftStore {
  private values = new Map<string, unknown>();
  private listeners = new Set<() => void>();
  private kept = new Set<string>();
  private live = false;
  private readonly owner: string | undefined;
  constructor(owner?: string) {
    this.owner = owner;
    if (owner === undefined) return;
    for (const [key, value] of Object.entries(loadKept(owner))) {
      this.values.set(key, value);
      this.kept.add(key);
    }
  }
  subscribe = (notify: () => void) => {
    this.listeners.add(notify);
    return () => { this.listeners.delete(notify); };
  };
  /**
   * Kept drafts reach storage only while the owner's session is mounted, so
   * work that finishes after a sign-out cannot write them back. Called per
   * effect setup.
   */
  attach(): () => void {
    this.live = true;
    return () => { this.live = false; };
  }
  read<T>(key: string, initial: T | (() => T)): T {
    if (!this.values.has(key)) {
      this.values.set(key, typeof initial === "function" ? (initial as () => T)() : initial);
    }
    return this.values.get(key) as T;
  }
  /** Reads a text draft and keeps it in storage from now on. */
  readKept(key: string): string {
    this.kept.add(key);
    const value = this.read<unknown>(key, "");
    return typeof value === "string" ? value : "";
  }
  update<T>(key: string, next: SetStateAction<T>) {
    const previous = this.values.get(key) as T;
    const value = typeof next === "function" ? (next as (value: T) => T)(previous) : next;
    this.values.set(key, value);
    if (this.kept.has(key)) this.store();
    for (const notify of this.listeners) notify();
  }
  /** Updates a draft only if it still exists; a discarded draft stays discarded. */
  revise<T>(key: string, next: (value: T) => T) {
    if (this.values.has(key)) this.update(key, next);
  }
  // Call on intentional form close, never on effect cleanup during auth recovery.
  discard(prefix: string) {
    let kept = false;
    for (const key of this.values.keys()) {
      if (!key.startsWith(prefix)) continue;
      this.values.delete(key);
      kept = this.kept.delete(key) || kept;
    }
    if (kept) this.store();
  }
  /** Drops the kept drafts of every other route: a reload can land somewhere else. */
  leaveOtherRoutes(path: string) {
    let left = false;
    for (const key of [...this.kept]) {
      // Route scopes are paths; app-wide drafts have no scope.
      if (!key.startsWith("/") || key.startsWith(`${path}:`)) continue;
      this.values.delete(key);
      this.kept.delete(key);
      left = true;
    }
    if (left) this.store();
  }
  private store() {
    if (this.owner === undefined || !this.live) return;
    const text: Record<string, string> = {};
    for (const key of this.kept) {
      const value = this.values.get(key);
      if (typeof value === "string" && value !== "") text[key] = value;
    }
    try {
      const storage = tabStorage();
      if (Object.keys(text).length === 0) storage?.removeItem(KEPT_PREFIX + this.owner);
      else storage?.setItem(KEPT_PREFIX + this.owner, JSON.stringify(text));
    } catch {
      // The draft stays in memory.
    }
  }
}

export const DraftContext = createContext<DraftStore | null>(null);
export const DraftScope = createContext("");

function useDraftSlot(name: string) {
  const shared = useContext(DraftContext);
  const [local] = useState(() => new DraftStore());
  const scope = useContext(DraftScope);
  return { store: shared ?? local, key: `${scope}:${name}` };
}

export function useDraft<T>(name: string, initial: T | (() => T)) {
  const { store, key } = useDraftSlot(name);
  const value = useSyncExternalStore(store.subscribe, () => store.read(key, initial));
  const setValue = useCallback((next: SetStateAction<T>) => store.update(key, next), [store, key]);
  return [value, setValue] as const;
}

/**
 * A text draft that also survives a reload or a tab the browser discarded.
 * Never use it for secrets, or for the state of work in flight.
 */
export function useKeptDraft(name: string) {
  const { store, key } = useDraftSlot(name);
  const value = useSyncExternalStore(store.subscribe, () => store.readKept(key));
  const setValue = useCallback((next: SetStateAction<string>) => store.update(key, next), [store, key]);
  return [value, setValue] as const;
}

/** An edit of `source`; `sending` is the value of a save still in flight. */
type Sourced = { source: string; value: string; sending?: string };

// A new server value replaces the edit, unless it is this edit's own save
// coming back: then the edit, including anything typed since, stays on top.
function rebase(draft: Sourced, source: string): Sourced {
  return source === draft.sending ? { source, value: draft.value } : { source, value: source };
}

/**
 * An edit of a server value. The draft survives remounts while the server
 * value stays the same; any other new server value replaces it, so an edit
 * never resurfaces when the server later returns to the value it was made
 * against.
 *
 * `save(sent, send)` records `sent` as in flight. Success moves the draft
 * onto `sent` even while the view is unmounted, so server changes the view
 * never sees cannot revive a saved edit. An edit typed during the save stays
 * on top; after a failure the unsaved edit stays.
 */
export function useSourcedDraft(name: string, source: string) {
  const { store, key } = useDraftSlot(name);
  const [draft, setDraft] = useDraft<Sourced>(name, { source, value: source });
  const stale = draft.source !== source;
  useEffect(() => {
    if (stale) store.revise<Sourced>(key, (current) => current.source === source ? current : rebase(current, source));
  }, [stale, source, store, key]);
  const value = stale ? rebase(draft, source).value : draft.value;
  const setValue = useCallback((next: string) => setDraft((current) => ({
    source, value: next, sending: current.source === source ? current.sending : undefined,
  })), [setDraft, source]);
  const save = useCallback(async (sent: string, send: (value: string) => Promise<unknown>) => {
    setDraft({ source, value: sent, sending: sent });
    try {
      await send(sent);
    } catch (error) {
      store.revise<Sourced>(key, (current) => current.sending === sent ? { source: current.source, value: current.value } : current);
      throw error;
    }
    store.revise<Sourced>(key, (current) => current.sending === sent ? { source: sent, value: current.value } : current);
  }, [setDraft, store, key, source]);
  return [value, setValue, save] as const;
}

/**
 * Scopes drafts to a route. They survive auth remounts on that route and are
 * dropped when the user navigates away, as component state was before.
 */
export function DraftRoute({ path, children }: { path: string; children: ReactNode }) {
  const store = useContext(DraftContext);
  const previous = useRef(path);
  useEffect(() => {
    // Not a cleanup: an auth remount unmounts this component without leaving the route.
    if (previous.current !== path) store?.discard(`${previous.current}:`);
    previous.current = path;
    store?.leaveOtherRoutes(path);
  }, [store, path]);
  return createElement(DraftScope, { value: path }, children);
}

export function useDiscardDrafts(group: string) {
  const store = useContext(DraftContext);
  const scope = useContext(DraftScope);
  return useCallback(() => store?.discard(`${scope}:${group}:`), [store, scope, group]);
}
