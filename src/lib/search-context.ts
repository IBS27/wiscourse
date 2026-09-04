// Opening ⌘K from anywhere without threading a callback through the tree:
// the palette mounts once in the root route and listens; callers fire.

const SEARCH_EVENT = "wiscourse:open-search";

/** Optional pre-scope: the palette opens filtered to one course. */
export interface SearchScope {
  courseId?: number;
}

export function openSearch(scope?: SearchScope): void {
  window.dispatchEvent(new CustomEvent<SearchScope>(SEARCH_EVENT, { detail: scope ?? {} }));
}

/** Subscribe to open requests; returns the unsubscribe. */
export function onOpenSearch(handler: (scope: SearchScope) => void): () => void {
  const listener = (event: Event) => {
    handler(event instanceof CustomEvent ? ((event.detail as SearchScope) ?? {}) : {});
  };
  window.addEventListener(SEARCH_EVENT, listener);
  return () => window.removeEventListener(SEARCH_EVENT, listener);
}
