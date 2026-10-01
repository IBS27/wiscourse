// @vitest-environment jsdom
// The upload owner lifetime inside the real AuthProvider (with #11's gap
// handling): a Clerk gap keeps it, another account or a logout ends it.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { AuthProvider } from "../src/components/app/auth-provider";
import { useOwnerLifetime } from "../src/lib/owner-session";
import { createAuthServer, tokenFor } from "./helpers/auth-server";

const clerk = vi.hoisted(() => ({
  status: "ready", isLoaded: true, isSignedIn: true as boolean | undefined, userId: "user-A" as string | null | undefined,
  sessionId: "session-A" as string | null | undefined, sessionClaims: { aud: "convex" } as { aud: string } | null | undefined,
  orgId: null, orgRole: null, getToken: vi.fn<() => Promise<string | null>>(), signOut: vi.fn(),
}));
vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => clerk, useClerk: () => clerk, useSession: () => ({ session: { status: "active" } }),
  SignInButton: ({ children }: { children: ReactNode }) => children, RedirectToTasks: () => null,
}));

const clients: ConvexReactClient[] = [];
const seen: Array<{ owner: string; signal: AbortSignal }> = [];
function Probe() {
  const lifetime = useOwnerLifetime();
  useEffect(() => {
    const signal = lifetime?.signal();
    if (lifetime && signal && !seen.some((s) => s.signal === signal)) seen.push({ owner: lifetime.owner, signal });
  });
  return null;
}
function App() {
  const createClient = (url: string) => {
    const client = new ConvexReactClient(url, { webSocketConstructor: createAuthServer().WebSocket, logger: false, unsavedChangesWarning: false });
    clients.push(client);
    return client;
  };
  return <AuthProvider url="https://test.convex.cloud" createClient={createClient}><Probe /></AuthProvider>;
}
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
const signedIn = (user: string) => ({ status: "ready", isLoaded: true, isSignedIn: true, userId: user, sessionId: `session-${user}`, sessionClaims: { aud: "convex" } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.spyOn(console, "info").mockImplementation(() => {});
  Object.assign(clerk, signedIn("user-A"));
  clerk.getToken.mockReset().mockImplementation(async () => (clerk.userId ? tokenFor(clerk.userId) : null));
  seen.length = 0;
  clients.length = 0;
});
afterEach(async () => {
  cleanup();
  await Promise.all(clients.map((client) => client.close()));
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("keeps the owner's lifetime through a Clerk gap and ends it for another account", async () => {
  const view = render(<App />);
  await settle();
  const a = seen.find((s) => s.owner === "user-A")!;
  expect(a.signal.aborted).toBe(false);

  Object.assign(clerk, { status: "loading", isLoaded: false, isSignedIn: undefined, userId: undefined, sessionId: undefined, sessionClaims: undefined });
  view.rerender(<App />);
  await settle();
  Object.assign(clerk, signedIn("user-A"));
  view.rerender(<App />);
  await settle();
  expect(a.signal.aborted).toBe(false);
  expect(seen.filter((s) => s.owner === "user-A")).toHaveLength(1);

  Object.assign(clerk, signedIn("user-B"));
  view.rerender(<App />);
  await settle();
  expect(a.signal.aborted).toBe(true);
  expect(seen.find((s) => s.owner === "user-B")?.signal.aborted).toBe(false);
});

it("ends the owner's lifetime on a resolved logout", async () => {
  const view = render(<App />);
  await settle();
  const a = seen.find((s) => s.owner === "user-A")!;
  Object.assign(clerk, { status: "ready", isLoaded: true, isSignedIn: false, userId: null, sessionId: null, sessionClaims: null });
  view.rerender(<App />);
  await settle();
  expect(a.signal.aborted).toBe(true);
});
