// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { tokenFor } from "./helpers/auth-server";
import { useDraft } from "../src/lib/drafts";
import { AuthProvider } from "../src/components/app/auth-provider";

const clerk = vi.hoisted(() => ({
  status: "ready",
  userId: "user-1",
  sessionStatus: "active",
  signOut: vi.fn<() => Promise<void>>(),
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
  useClerk: () => clerk,
  useSession: () => ({ session: clerk.sessionId ? { status: clerk.sessionStatus } : null }),
  RedirectToTasks: () => <div>Complete sign-in tasks</div>,
  SignInButton: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

let client: ConvexReactClient;
let reportAuth: ((authenticated: boolean) => void) | undefined;
let acceptToken: boolean;
const clients: ConvexReactClient[] = [];

function createClient() {
  client = new ConvexReactClient("https://example.convex.cloud", { logger: false });
  clients.push(client);
  vi.spyOn(client, "setAuth").mockImplementation((fetchToken, onChange) => {
    reportAuth = onChange;
    void fetchToken({ forceRefreshToken: false }).then((token) => onChange?.(Boolean(token) && acceptToken));
  });
  vi.spyOn(client, "clearAuth").mockImplementation(() => {});
  vi.spyOn(client, "close");
  return client;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  Object.assign(clerk, {
    status: "ready", userId: "user-1", sessionStatus: "active",
    isLoaded: true, isSignedIn: true, sessionId: "session-1",
    sessionClaims: { aud: "convex" }, orgId: null, orgRole: null,
  });
  clerk.signOut.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "info").mockImplementation(() => {});
  clients.length = 0;
  clerk.getToken.mockReset().mockImplementation(async () => tokenFor(clerk.userId));
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  acceptToken = true;
  reportAuth = undefined;
});

afterEach(async () => {
  cleanup();
  await Promise.all(clients.map(client => client.close()));
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function App() {
  return <StrictMode><AuthProvider url="https://example.convex.cloud" createClient={createClient}><div>Protected app</div></AuthProvider></StrictMode>;
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
  expect(clients).toHaveLength(0);
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
  clerk.getToken.mockResolvedValue(tokenFor(clerk.userId));
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
  clerk.getToken.mockResolvedValue(tokenFor(clerk.userId));
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
  clerk.getToken.mockResolvedValue(tokenFor(clerk.userId));
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await flush();
  expect(screen.getByText("Protected app")).toBeTruthy();
  acceptToken = false;
  await act(async () => resolveOldToken?.(tokenFor("previous-user")));
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


it("preserves drafts through recovery and clears them on account change", async () => {
  function Draft() {
    const [value, setValue] = useDraft("text", "");
    return <input aria-label="Draft" value={value} onChange={event => setValue(event.target.value)} />;
  }
  const app = <AuthProvider url="https://example.convex.cloud" createClient={createClient}><Draft /></AuthProvider>;
  const view = render(app);
  await flush();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Unsaved question" } });
  const firstClient = client;
  act(() => reportAuth?.(false));
  await advance(1_000);
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Unsaved question");
  expect(client).toBe(firstClient);
  clerk.userId = "user-2";
  clerk.sessionId = "session-2";
  view.rerender(<AuthProvider url="https://example.convex.cloud" createClient={createClient}><Draft /></AuthProvider>);
  await flush();
  expect(firstClient.close).toHaveBeenCalledOnce();
  expect(client).not.toBe(firstClient);
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
});

it("disposes the client on confirmed logout, including outstanding token work", async () => {
  clerk.getToken.mockReturnValue(new Promise<string>(() => {}));
  const view = render(<App />);
  await flush();
  const firstClient = client;
  clerk.isSignedIn = false;
  clerk.sessionId = null;
  view.rerender(<App />);
  await flush();
  expect(firstClient.close).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
});

it("offers reload after stalled or failed Clerk initialization", async () => {
  clerk.isLoaded = false;
  clerk.isSignedIn = false;
  const view = render(<App />);
  await advance(10_000);
  expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  expect(screen.queryByText("Sign in")).toBeNull();
  clerk.status = "error";
  view.rerender(<App />);
  expect(screen.getByText(/couldn't load your sign-in session/)).toBeTruthy();
});

it("does not label degraded or pending Clerk sessions as signed out", async () => {
  clerk.isSignedIn = false;
  clerk.status = "degraded";
  const view = render(<App />);
  expect(screen.queryByText("Sign in")).toBeNull();
  clerk.status = "ready";
  clerk.sessionStatus = "pending";
  view.rerender(<App />);
  expect(screen.getByText("Complete sign-in tasks")).toBeTruthy();
});

it("reports sign-out errors and prevents duplicate sign-out attempts", async () => {
  acceptToken = false;
  let reject: (reason: Error) => void = () => {};
  clerk.signOut.mockReturnValue(new Promise<void>((_, fail) => { reject = fail; }));
  render(<App />);
  await flush();
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  fireEvent.click(screen.getByRole("button", { name: "Signing out…" }));
  expect(clerk.signOut).toHaveBeenCalledOnce();
  await act(async () => reject(new Error("private provider details")));
  expect(screen.getByRole("alert").textContent).toContain("Couldn't sign out");
  expect(screen.queryByText(/private provider details/)).toBeNull();
  clerk.signOut.mockResolvedValue(undefined);
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await flush();
  expect(clerk.signOut).toHaveBeenCalledTimes(2);
});

it("does not keep bypassing the token cache after a recovery or session change", async () => {
  const view = render(<App />);
  await flush();
  act(() => reportAuth?.(false));
  await advance(1_000);
  const fetch = vi.mocked(client.setAuth).mock.calls.at(-1)![0];
  await act(async () => { await fetch({ forceRefreshToken: false }); });
  expect(clerk.getToken).toHaveBeenLastCalledWith({ skipCache: false });
  clerk.sessionId = "session-2";
  view.rerender(<App />);
  await flush();
  expect(clerk.getToken).toHaveBeenLastCalledWith({ skipCache: false });
});

it("stops automatic retries for configuration failures and keeps escape actions available", async () => {
  clerk.getToken.mockRejectedValue({ status: 404, message: "sensitive SDK details" });
  render(<App />);
  await flush();
  const calls = clerk.getToken.mock.calls.length;
  await advance(120_000);
  expect(clerk.getToken).toHaveBeenCalledTimes(calls);
  expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("sensitive SDK details");
});

it("bounds a stalled sign-out request so the user can retry", async () => {
  acceptToken = false;
  clerk.signOut.mockReturnValue(new Promise<void>(() => {}));
  render(<App />);
  await flush();
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await advance(10_000);
  expect(screen.getByRole("alert").textContent).toContain("Couldn't sign out");
  expect(screen.getByRole("button", { name: "Sign out" }).hasAttribute("disabled")).toBe(false);
});

it("retains the same user's client during a temporary Clerk loading state", async () => {
  const view = render(<App />);
  await flush();
  const owner = client;
  clerk.isLoaded = false;
  view.rerender(<App />);
  await flush();
  expect(owner.close).not.toHaveBeenCalled();
  expect(screen.queryByText("Protected app")).toBeNull();
  clerk.isLoaded = true;
  view.rerender(<App />);
  await flush();
  expect(client).toBe(owner);
  expect(screen.getByText("Protected app")).toBeTruthy();
});

it("keeps the same user's client and drafts through a Clerk error", async () => {
  function Draft() {
    const [value, setValue] = useDraft("text", "");
    return <input aria-label="Draft" value={value} onChange={event => setValue(event.target.value)} />;
  }
  const app = () => <AuthProvider url="https://example.convex.cloud" createClient={createClient}><Draft /></AuthProvider>;
  const view = render(app());
  await flush();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Unsaved question" } });
  const owner = client;
  clerk.status = "error";
  view.rerender(app());
  await flush();
  expect(screen.queryByRole("textbox")).toBeNull();
  clerk.status = "ready";
  view.rerender(app());
  await flush();
  expect(client).toBe(owner);
  expect(owner.close).not.toHaveBeenCalled();
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Unsaved question");
});
