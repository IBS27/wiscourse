// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useState, type ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { tokenFor } from "./helpers/auth-server";
import { useDraft, useKeptDraft } from "../src/lib/drafts";
import { AuthProvider } from "../src/components/app/auth-provider";
import { createTokenFetcher, type AuthFailure } from "../src/lib/auth-recovery";

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
let reportRefresh: ((refreshing: boolean) => void) | undefined;
let fetchToken: ((args: { forceRefreshToken: boolean }) => Promise<unknown>) | undefined;
let acceptToken: boolean;
const clients: ConvexReactClient[] = [];

function createClient() {
  client = new ConvexReactClient("https://example.convex.cloud", { logger: false });
  clients.push(client);
  vi.spyOn(client, "setAuth").mockImplementation((fetch, onChange, onRefreshChange) => {
    reportAuth = onChange;
    reportRefresh = onRefreshChange;
    fetchToken = fetch;
    void fetch({ forceRefreshToken: false }).then((token) => onChange?.(Boolean(token) && acceptToken));
  });
  vi.spyOn(client, "clearAuth").mockImplementation(() => {});
  // The banner reads connection state; keep this transport-free client from opening a socket for it.
  vi.spyOn(client, "connectionState").mockReturnValue({ hasEverConnected: true, isWebSocketConnected: true } as ReturnType<ConvexReactClient["connectionState"]>);
  vi.spyOn(client, "subscribeToConnectionState").mockReturnValue(() => {});
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
  reportRefresh = undefined;
  fetchToken = undefined;
  sessionStorage.clear();
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

it("supports the legacy Convex JWT template and restarts for organization/session changes, not an audience change", async () => {
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
  // A new audience is no new session: restarting would clear auth under the open app.
  vi.mocked(client.setAuth).mockClear();
  vi.mocked(client.clearAuth).mockClear();
  clerk.sessionClaims = { aud: "convex" };
  view.rerender(<App />);
  await flush();
  expect(client.setAuth).not.toHaveBeenCalled();
  expect(client.clearAuth).not.toHaveBeenCalled();
  expect(clerk.getToken).toHaveBeenCalledTimes(calls + 2);
  await act(async () => { await fetchToken?.({ forceRefreshToken: false }); });
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
  // StrictMode's discarded setup is behind us: any later start or clear is a restart.
  vi.mocked(owner.setAuth).mockClear();
  vi.mocked(owner.clearAuth).mockClear();
  clerk.isLoaded = false;
  view.rerender(<App />);
  await flush();
  expect(owner.close).not.toHaveBeenCalled();
  // An established session stays open through the gap, and says so only if it lasts.
  expect(screen.getByText("Protected app")).toBeTruthy();
  expect(screen.queryByRole("status")).toBeNull();
  await advance(4_000);
  expect(screen.getByRole("status").textContent).toContain("couldn't confirm your sign-in");
  expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  clerk.isLoaded = true;
  view.rerender(<App />);
  await flush();
  expect(client).toBe(owner);
  expect(screen.getByText("Protected app")).toBeTruthy();
  expect(screen.queryByRole("status")).toBeNull();
  expect(owner.setAuth).not.toHaveBeenCalled();
  expect(owner.clearAuth).not.toHaveBeenCalled();
});

it("hides a session that Clerk stops reporting before it was ever established", async () => {
  clerk.getToken.mockReturnValue(new Promise<string>(() => {}));
  const view = render(<App />);
  await flush();
  clerk.isLoaded = false;
  view.rerender(<App />);
  act(() => reportAuth?.(true));
  expect(screen.queryByText("Protected app")).toBeNull();
  expect(screen.getByRole("status").textContent).toBe("Loading…");
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
  const field = screen.getByRole("textbox");
  clerk.status = "error";
  view.rerender(app());
  await flush();
  expect(screen.getByRole("textbox")).toBe(field);
  clerk.status = "ready";
  view.rerender(app());
  await flush();
  expect(client).toBe(owner);
  expect(owner.close).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox")).toBe(field);
  expect((field as HTMLInputElement).value).toBe("Unsaved question");
});

// Kept in component state only: lost if the app is ever unmounted.
function Stateful() {
  const [value, setValue] = useState("");
  return <input aria-label="Local" value={value} onChange={event => setValue(event.target.value)} />;
}
function StatefulApp() {
  return <StrictMode><AuthProvider url="https://example.convex.cloud" createClient={createClient}><Stateful /></AuthProvider></StrictMode>;
}
async function typeLocal(text: string) {
  render(<StatefulApp />);
  await flush();
  const field = screen.getByRole("textbox") as HTMLInputElement;
  fireEvent.change(field, { target: { value: text } });
  vi.mocked(client.setAuth).mockClear();
  vi.mocked(client.clearAuth).mockClear();
  return field;
}
/** Convex's own background token request, as its scheduled refresh makes it. */
async function backgroundRefresh() {
  await act(async () => { void fetchToken?.({ forceRefreshToken: true }); await Promise.resolve(); });
}

it("keeps the app and its local state open while the backend asks for a fresh token", async () => {
  const field = await typeLocal("Only in this component");
  act(() => reportRefresh?.(true));
  expect(screen.getByRole("textbox")).toBe(field);
  // A short refresh, as on returning to the tab, shows nothing at all.
  await advance(3_000);
  expect(screen.queryByRole("status")).toBeNull();
  await advance(1_000);
  expect(screen.getByRole("status").textContent).toContain("Reconnecting");
  act(() => reportRefresh?.(false));
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("textbox")).toBe(field);
  expect(field.value).toBe("Only in this component");
});

it("never restarts auth under an open app, however long recovery takes", async () => {
  const field = await typeLocal("Still here");
  // No token request is pending, so there is nothing to retry in place.
  act(() => reportRefresh?.(true));
  for (let n = 0; n < 5; n++) await advance(10_000);
  expect(screen.getByRole("status").textContent).toContain("couldn't reconnect");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  fireEvent(window, new Event("focus"));
  await advance(60_000);
  expect(client.setAuth).not.toHaveBeenCalled();
  expect(client.clearAuth).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox")).toBe(field);
  expect(field.value).toBe("Still here");
});

it("retries a failed background refresh in place and reports it in the banner", async () => {
  const field = await typeLocal("Mid-sentence");
  const calls = clerk.getToken.mock.calls.length;
  clerk.getToken.mockRejectedValue(new TypeError("network"));
  await backgroundRefresh();
  for (const delay of [1_000, 2_000, 5_000, 10_000]) await advance(delay);
  expect(clerk.getToken).toHaveBeenCalledTimes(calls + 4);
  expect(screen.getByRole("status").textContent).toContain("couldn't reconnect");
  expect(screen.getByRole("textbox")).toBe(field);
  clerk.getToken.mockImplementation(async () => tokenFor(clerk.userId));
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await flush();
  expect(screen.queryByRole("status")).toBeNull();
  expect(client.setAuth).not.toHaveBeenCalled();
  expect(client.clearAuth).not.toHaveBeenCalled();
  expect(field.value).toBe("Mid-sentence");
  // The next interruption starts with a full retry budget.
  const recovered = clerk.getToken.mock.calls.length;
  clerk.getToken.mockRejectedValue(new TypeError("network"));
  await backgroundRefresh();
  await advance(1_000);
  expect(clerk.getToken).toHaveBeenCalledTimes(recovered + 2);
});

it("recovers a failed background refresh on tab return before the banner appears", async () => {
  await typeLocal("Mid-sentence");
  clerk.getToken.mockRejectedValue(new TypeError("network"));
  await backgroundRefresh();
  clerk.getToken.mockImplementation(async () => tokenFor(clerk.userId));
  fireEvent(window, new Event("focus"));
  await advance(10_000);
  expect(screen.queryByRole("status")).toBeNull();
});

it("offers sign-in again, not endless retries, when Clerk refuses an open session", async () => {
  const field = await typeLocal("Unsent");
  clerk.getToken.mockRejectedValue({ status: 401 });
  await backgroundRefresh();
  const calls = clerk.getToken.mock.calls.length;
  fireEvent(window, new Event("focus"));
  await advance(120_000);
  expect(clerk.getToken).toHaveBeenCalledTimes(calls);
  expect(screen.getByRole("status").textContent).toContain("Your session ended");
  expect(screen.getByRole("textbox")).toBe(field);
  fireEvent.click(screen.getByRole("button", { name: "Sign in again" }));
  await flush();
  expect(clerk.signOut).toHaveBeenCalledOnce();
});

it("asks for sign-in again when Clerk refuses the session before the app opens", async () => {
  clerk.getToken.mockRejectedValue({ status: 401 });
  render(<App />);
  await flush();
  const calls = clerk.getToken.mock.calls.length;
  await advance(120_000);
  expect(clerk.getToken).toHaveBeenCalledTimes(calls);
  expect(screen.getByRole("status").textContent).toContain("Your session ended");
  expect(screen.queryByText("Protected app")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Sign in again" }));
  await flush();
  expect(clerk.signOut).toHaveBeenCalledOnce();
});

it("keeps a typed draft across a reload, and forgets it on sign-out or another account", async () => {
  function Kept() {
    const [value, setValue] = useKeptDraft("text");
    return <input aria-label="Kept" value={value} onChange={event => setValue(event.target.value)} />;
  }
  const app = () => <AuthProvider url="https://example.convex.cloud" createClient={createClient}><Kept /></AuthProvider>;
  const text = () => (screen.getByRole("textbox") as HTMLInputElement).value;
  let view = render(app());
  await flush();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Typed before the tab was discarded" } });
  // The browser discards the tab: nothing unmounts. Clerk is still loading when it comes back.
  view.unmount();
  Object.assign(clerk, { isLoaded: false, isSignedIn: false });
  view = render(app());
  await flush();
  Object.assign(clerk, { isLoaded: true, isSignedIn: true });
  view.rerender(app());
  await flush();
  expect(text()).toBe("Typed before the tab was discarded");
  Object.assign(clerk, { userId: "user-2", sessionId: "session-2" });
  view.rerender(app());
  await flush();
  expect(text()).toBe("");
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Second user's text" } });
  Object.assign(clerk, { isSignedIn: false, sessionId: null });
  view.rerender(app());
  await flush();
  expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  expect(sessionStorage.length).toBe(0);
});

it("holds a forced refresh that repeats the token Convex kept, whatever a superseded request delivered since", async () => {
  const [kept, discarded] = [tokenFor("user-1"), tokenFor("user-1")];
  let release: (token: string) => void = () => {};
  const getToken = vi.fn<() => Promise<string | null>>()
    .mockReturnValueOnce(new Promise(resolve => { release = resolve; }))
    .mockResolvedValue(kept);
  const failures: (AuthFailure | null)[] = [];
  const fetcher = createTokenFetcher({ getToken, userId: "user-1", forceFresh: false, onFailure: failure => failures.push(failure) });
  // A scheduled refresh is still out when a rejection starts a newer request. Convex keeps the newer one's token.
  const scheduled = fetcher.fetchAccessToken({ forceRefreshToken: true });
  await expect(fetcher.fetchAccessToken({ forceRefreshToken: true })).resolves.toBe(kept);
  release(discarded);
  await expect(scheduled).resolves.toBe(discarded);
  let repeat: string | null | undefined;
  void fetcher.fetchAccessToken({ forceRefreshToken: true }).then((token) => { repeat = token; });
  await vi.advanceTimersByTimeAsync(0);
  expect(repeat).toBeUndefined();
  expect(failures.at(-1)).toBe("unavailable");
  const fresh = tokenFor("user-1");
  getToken.mockResolvedValue(fresh);
  expect(fetcher.retryPending()).toBe(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(repeat).toBe(fresh);
  expect(failures.at(-1)).toBeNull();
});
