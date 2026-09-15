// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { AuthProvider } from "../src/components/app/auth-provider";

const clerk = vi.hoisted(() => ({
  isLoaded: true,
  isSignedIn: true,
  sessionId: "session-1" as string | null,
  sessionClaims: { aud: "convex" },
  orgId: null as string | null,
  orgRole: null as string | null,
  getToken: vi.fn<() => Promise<string | null>>(),
}));
vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => clerk,
  SignInButton: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

let client: ConvexReactClient;
let reportAuth: ((authenticated: boolean) => void) | undefined;
let acceptToken: boolean;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  Object.assign(clerk, {
    isLoaded: true, isSignedIn: true, sessionId: "session-1",
    sessionClaims: { aud: "convex" }, orgId: null, orgRole: null,
  });
  clerk.getToken.mockReset().mockResolvedValue("test-token");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  client = new ConvexReactClient("https://example.convex.cloud", { logger: false });
  acceptToken = true;
  reportAuth = undefined;
  // Keep the real React auth provider and its callback/cleanup lifecycle.
  // Only replace the network handshake so failures and delays are deterministic.
  vi.spyOn(client, "setAuth").mockImplementation((fetchToken, onChange) => {
    reportAuth = onChange;
    void fetchToken({ forceRefreshToken: false }).then((token) => onChange?.(Boolean(token) && acceptToken));
  });
  vi.spyOn(client, "clearAuth").mockImplementation(() => {});
});

afterEach(async () => {
  cleanup();
  await client.close();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function App() {
  return <StrictMode><AuthProvider client={client}><div>Protected app</div></AuthProvider></StrictMode>;
}

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

it("waits for Clerk and only shows sign-in for a confirmed signed-out session", async () => {
  clerk.isLoaded = false;
  clerk.isSignedIn = false;
  const view = render(<App />);
  expect(screen.getByRole("status").textContent).toBe("Loading…");
  expect(screen.queryByText("Sign in")).toBeNull();
  clerk.isLoaded = true;
  view.rerender(<App />);
  await flush();
  expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  expect(client.setAuth).not.toHaveBeenCalled();
});

it("recovers dropped backend auth with a fresh token and preserves the URL", async () => {
  window.history.replaceState(null, "", "/courses/42?view=week#assignment");
  render(<App />);
  await flush();
  expect(screen.getByText("Protected app")).toBeTruthy();
  act(() => reportAuth?.(false));
  expect(screen.getByText("Reconnecting…")).toBeTruthy();
  expect(screen.queryByText("Sign in")).toBeNull();
  expect(screen.queryByText("Protected app")).toBeNull();
  await advance(1_000);
  expect(clerk.getToken).toHaveBeenLastCalledWith({ skipCache: true });
  expect(screen.getByText("Protected app")).toBeTruthy();
  expect(window.location.pathname + window.location.search + window.location.hash)
    .toBe("/courses/42?view=week#assignment");
  const calls = clerk.getToken.mock.calls.length;
  await advance(60_000);
  expect(clerk.getToken).toHaveBeenCalledTimes(calls);
});

it("bounds failed refresh retries and lets the user retry after exhaustion", async () => {
  clerk.getToken.mockRejectedValue(new Error("clerk_offline"));
  render(<App />);
  await flush();
  const initialCalls = clerk.getToken.mock.calls.length;
  for (const delay of [1_000, 2_000, 5_000, 10_000]) await advance(delay);
  expect(clerk.getToken).toHaveBeenCalledTimes(initialCalls + 3);
  expect(screen.getByText("We couldn't reconnect. Please try again.")).toBeTruthy();
  expect(screen.queryByText("Sign in")).toBeNull();
  await advance(120_000);
  expect(clerk.getToken).toHaveBeenCalledTimes(initialCalls + 3);
  clerk.getToken.mockResolvedValue("fresh-token");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await flush();
  expect(screen.getByText("Protected app")).toBeTruthy();
});

it("also stops when the backend repeatedly rejects successfully fetched tokens", async () => {
  acceptToken = false;
  render(<App />);
  await flush();
  const initialCalls = clerk.getToken.mock.calls.length;
  for (const delay of [1_000, 2_000, 5_000, 10_000]) await advance(delay);
  expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  await advance(60_000);
  expect(clerk.getToken).toHaveBeenCalledTimes(initialCalls + 3);
  acceptToken = true;
  fireEvent(window, new Event("focus"));
  await flush();
  expect(screen.getByText("Protected app")).toBeTruthy();
  // A later interruption gets a new retry budget.
  act(() => reportAuth?.(false));
  await advance(1_000);
  expect(screen.getByText("Protected app")).toBeTruthy();
});

it("does not retry offline and resumes automatically when connectivity returns", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  clerk.getToken.mockRejectedValue(new Error("offline"));
  render(<App />);
  await flush();
  const initialCalls = clerk.getToken.mock.calls.length;
  expect(screen.getByText(/You're offline/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Retry" }).hasAttribute("disabled")).toBe(true);
  await advance(120_000);
  expect(clerk.getToken).toHaveBeenCalledTimes(initialCalls);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  clerk.getToken.mockResolvedValue("fresh-token");
  fireEvent(window, new Event("online"));
  await flush();
  expect(screen.getByText("Protected app")).toBeTruthy();
});

it("retries on tab return and coalesces focus and visibility events", async () => {
  acceptToken = false;
  render(<App />);
  await flush();
  const initialCalls = clerk.getToken.mock.calls.length;
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  fireEvent(document, new Event("visibilitychange"));
  expect(clerk.getToken).toHaveBeenCalledTimes(initialCalls);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  fireEvent(document, new Event("visibilitychange"));
  fireEvent(window, new Event("focus"));
  await flush();
  expect(clerk.getToken).toHaveBeenCalledTimes(initialCalls + 1);
});

it("shows loading, not reconnecting, during the initial handshake", async () => {
  clerk.getToken.mockReturnValue(new Promise<string>(() => {}));
  render(<App />);
  await flush();
  expect(screen.getByRole("status").textContent).toBe("Loading…");
  await advance(10_000);
  expect(screen.getByRole("status").textContent).toBe("Reconnecting…");
});

it("does not restart an in-flight handshake on focus or visibility", async () => {
  clerk.getToken.mockReturnValue(new Promise<string>(() => {}));
  render(<App />);
  await flush();
  const initialCalls = clerk.getToken.mock.calls.length;
  await advance(2_000);
  fireEvent(window, new Event("focus"));
  fireEvent(document, new Event("visibilitychange"));
  fireEvent(window, new Event("online"));
  await flush();
  expect(clerk.getToken).toHaveBeenCalledTimes(initialCalls);
});

it("bounds a hung token request and ignores its stale result after recovery", async () => {
  let resolveOldToken: ((token: string) => void) | undefined;
  const pending = new Promise<string>((resolve) => { resolveOldToken = resolve; });
  clerk.getToken.mockReturnValue(pending);
  render(<App />);
  for (let attempt = 0; attempt < 4; attempt++) await advance(10_000);
  expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  clerk.getToken.mockResolvedValue("fresh-token");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await flush();
  expect(screen.getByText("Protected app")).toBeTruthy();
  acceptToken = false;
  await act(async () => resolveOldToken?.("stale-token"));
  expect(screen.getByText("Protected app")).toBeTruthy();
});

it("cancels recovery on sign-out and ignores an old authenticated callback", async () => {
  acceptToken = false;
  const view = render(<App />);
  await flush();
  const oldReport = reportAuth;
  const initialCalls = clerk.getToken.mock.calls.length;
  clerk.isSignedIn = false;
  clerk.sessionId = null;
  view.rerender(<App />);
  act(() => oldReport?.(true));
  fireEvent(window, new Event("focus"));
  fireEvent(document, new Event("visibilitychange"));
  fireEvent(window, new Event("online"));
  await advance(60_000);
  expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  expect(screen.queryByText("Protected app")).toBeNull();
  expect(clerk.getToken).toHaveBeenCalledTimes(initialCalls);
});

it("supports the legacy Convex JWT template and restarts for organization/session changes", async () => {
  clerk.sessionClaims = { aud: "other" };
  const view = render(<App />);
  await flush();
  expect(clerk.getToken).toHaveBeenLastCalledWith({ template: "convex", skipCache: false });
  const calls = clerk.getToken.mock.calls.length;
  clerk.orgId = "org-2";
  view.rerender(<App />);
  await flush();
  clerk.sessionId = "session-2";
  view.rerender(<App />);
  await flush();
  expect(clerk.getToken).toHaveBeenCalledTimes(calls + 2);
  clerk.sessionClaims = { aud: "convex" };
  view.rerender(<App />);
  await flush();
  expect(clerk.getToken).toHaveBeenLastCalledWith({ skipCache: false });
});
