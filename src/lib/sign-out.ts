import { useCallback, useRef, useState } from "react";
import { useClerk } from "@clerk/clerk-react";
import { AUTH_TIMEOUT, reportAuthEvent } from "./auth-recovery";

export function useSignOut() {
  const { signOut } = useClerk();
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        signOut(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Sign-out timed out")), AUTH_TIMEOUT);
        }),
      ]);
    } catch {
      setError("Couldn't sign out. Check your connection and try again.");
      reportAuthEvent("sign-out-failed", "unavailable");
    } finally {
      clearTimeout(timer);
      inFlight.current = false;
      setPending(false);
    }
  }, [signOut]);
  return { run, pending, error };
}
