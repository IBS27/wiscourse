import {
  createContext, createElement, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore,
  type ReactNode, type SetStateAction,
} from "react";

/** Memory only, owned by one signed-in user. Also carries pending form submissions. */
export class DraftStore {
  private values = new Map<string, unknown>();
  private listeners = new Set<() => void>();
  subscribe = (notify: () => void) => {
    this.listeners.add(notify);
    return () => { this.listeners.delete(notify); };
  };
  read<T>(key: string, initial: T | (() => T)): T {
    if (!this.values.has(key)) {
      this.values.set(key, typeof initial === "function" ? (initial as () => T)() : initial);
    }
    return this.values.get(key) as T;
  }
  update<T>(key: string, next: SetStateAction<T>) {
    const previous = this.values.get(key) as T;
    const value = typeof next === "function" ? (next as (value: T) => T)(previous) : next;
    this.values.set(key, value);
    for (const notify of this.listeners) notify();
  }
  // Call on intentional form close, never on effect cleanup during auth recovery.
  discard(prefix: string) {
    for (const key of this.values.keys()) if (key.startsWith(prefix)) this.values.delete(key);
  }
}

export const DraftContext = createContext<DraftStore | null>(null);
export const DraftScope = createContext("");

export function useDraft<T>(name: string, initial: T | (() => T)) {
  const shared = useContext(DraftContext);
  const [local] = useState(() => new DraftStore());
  const store = shared ?? local;
  const scope = useContext(DraftScope);
  const key = `${scope}:${name}`;
  const value = useSyncExternalStore(store.subscribe, () => store.read(key, initial));
  const setValue = useCallback((next: SetStateAction<T>) => store.update(key, next), [store, key]);
  return [value, setValue] as const;
}

/**
 * An edit of a server value. The draft survives remounts while the server
 * value stays the same. Any new server value replaces it, and the stored pair
 * moves to that value, so an edit never resurfaces when the server later
 * returns to the value it was made against.
 */
export function useSourcedDraft(name: string, source: string) {
  const [draft, setDraft] = useDraft(name, { source, value: source });
  const stale = draft.source !== source;
  useEffect(() => {
    if (stale) setDraft({ source, value: source });
  }, [stale, source, setDraft]);
  const value = stale ? source : draft.value;
  const setValue = useCallback((next: string) => setDraft({ source, value: next }), [setDraft, source]);
  return [value, setValue] as const;
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
  }, [store, path]);
  return createElement(DraftScope, { value: path }, children);
}

export function useDiscardDrafts(group: string) {
  const store = useContext(DraftContext);
  const scope = useContext(DraftScope);
  return useCallback(() => store?.discard(`${scope}:${group}:`), [store, scope, group]);
}
