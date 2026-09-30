import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * One signed-in owner's lifetime in the app. `signal()` aborts when this
 * owner's session is disposed (sign-out or another account); work started
 * for the owner holds its signal, so it stays dead even if the same account
 * later returns with a new session. Null outside a live session.
 */
export class OwnerLifetime {
  private controller: AbortController | null = null;
  constructor(readonly owner: string) {}
  signal(): AbortSignal | null {
    return this.controller?.signal ?? null;
  }
  /** Called per effect setup, so StrictMode's discarded setup leaves no aborted signal in use. */
  start(): () => void {
    const current = new AbortController();
    this.controller = current;
    return () => {
      current.abort();
      if (this.controller === current) this.controller = null;
    };
  }
}

export const OwnerSessionContext = createContext<OwnerLifetime | null>(null);

export function OwnerSession({ owner, children }: { owner: string; children: ReactNode }) {
  // Keyed by owner in the provider, so one instance serves one owner.
  const [lifetime] = useState(() => new OwnerLifetime(owner));
  useEffect(() => lifetime.start(), [lifetime]);
  return createElement(OwnerSessionContext, { value: lifetime }, children);
}

export function useOwnerLifetime(): OwnerLifetime | null {
  return useContext(OwnerSessionContext);
}
