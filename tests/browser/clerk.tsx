/* eslint-disable react-refresh/only-export-components -- test-only shim mirrors the Clerk SDK exports */
import { useSyncExternalStore, type ReactNode } from "react";
import { tokenFor } from "../helpers/auth-server";

const listeners = new Set<() => void>();
let state = {
  userId: "test-A", isSignedIn: true, isLoaded: true,
  status: "ready" as "ready" | "error",
  tokenMode: "normal" as "normal" | "hang" | "configuration",
  failSignOut: false,
};
export function change(next: Partial<typeof state>) {
  state = { ...state, ...next };
  for (const notify of listeners) notify();
}
function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => { listeners.delete(notify); };
}
export const useTestSession = () => useSyncExternalStore(subscribe, () => state);
const getToken = async () => {
  if (state.tokenMode === "hang") return new Promise<string>(() => {});
  if (state.tokenMode === "configuration") throw { status: 404 };
  return tokenFor(state.userId);
};
const signOut = async () => {
  if (state.failSignOut) throw new Error("test sign-out failure");
  change({ isSignedIn: false });
};
export function useAuth() {
  const session = useTestSession();
  return {
    ...session, userId: session.isSignedIn ? session.userId : null,
    sessionId: session.isSignedIn ? `session-${session.userId}` : null,
    sessionClaims: { aud: "convex" }, orgId: null, orgRole: null, getToken,
  };
}
export function useClerk() { return { ...useTestSession(), signOut }; }
export function useSession() { return { session: useTestSession().isSignedIn ? { status: "active" } : null }; }
export function SignInButton({ children }: { children: ReactNode }) {
  return <div onClick={() => change({ isSignedIn: true, tokenMode: "normal" })}>{children}</div>;
}
export function RedirectToTasks() { return <p>Complete sign-in tasks</p>; }
