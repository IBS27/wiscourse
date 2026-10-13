// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { ConvexReactClient, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { AuthProvider } from "../src/components/app/auth-provider";
import { OwnerConvexClient } from "../src/lib/convex-client";
import { useDraft } from "../src/lib/drafts";
import { anonymousFrames, createAuthServer, tokenFor } from "./helpers/auth-server";

const clerk = vi.hoisted(() => ({
  status: "ready", isLoaded: true, isSignedIn: true, userId: "user-A", sessionId: "session-A",
  sessionClaims: { aud: "convex" }, orgId: null, orgRole: null,
  getToken: vi.fn<() => Promise<string | null>>(), signOut: vi.fn(),
}));
vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => clerk, useClerk: () => clerk, useSession: () => ({ session: { status: "active" } }),
  SignInButton: ({ children }: { children: ReactNode }) => children, RedirectToTasks: () => null,
}));

let server: ReturnType<typeof createAuthServer>;
let client: ConvexReactClient;
const clients: ConvexReactClient[] = [];
function createClient(url: string) {
  // The app's own client class, on a controlled socket.
  client = new OwnerConvexClient(url, { webSocketConstructor: server.WebSocket, logger: false, unsavedChangesWarning: false });
  clients.push(client);
  return client;
}
function Draft() {
  const [value, setValue] = useDraft("message", "");
  return <input aria-label="Draft" value={value} onChange={event => setValue(event.target.value)} />;
}
function App() {
  return <AuthProvider url="https://test.convex.cloud" createClient={createClient}><Draft /></AuthProvider>;
}
async function flush() { await act(async () => { await Promise.resolve(); }); }
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
/** Advances a second at a time, so each state change renders when it happens, as in a browser. */
async function elapse(seconds: number) { for (let n = 0; n < seconds; n++) await advance(1_000); }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  Object.assign(clerk, { status: "ready", isLoaded: true, isSignedIn: true, userId: "user-A", sessionId: "session-A" });
  clerk.getToken.mockReset().mockImplementation(async () => tokenFor(clerk.userId));
  server = createAuthServer();
  clients.length = 0;
});
afterEach(async () => {
  cleanup();
  await Promise.all(clients.map(client => client.close()));
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("keeps the app open through a hung server-rejected refresh with the real SDK", async () => {
  render(<App />);
  await flush();
  const field = screen.getByRole("textbox");
  fireEvent.change(field, { target: { value: "Keep this question" } });
  const clear = vi.spyOn(client, "clearAuth");
  clerk.getToken.mockReturnValue(new Promise<string>(() => {}));
  act(() => server.latest().rejectSession());
  await flush();
  expect(screen.getByRole("textbox")).toBe(field);
  await advance(10_000);
  expect(screen.getByRole("status").textContent).toContain("Reconnecting");
  clerk.getToken.mockImplementation(async () => tokenFor(clerk.userId));
  await advance(10_000);
  await flush();
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("textbox")).toBe(field);
  expect((field as HTMLInputElement).value).toBe("Keep this question");
  // The owner was authenticated on every connection, and never anonymous.
  expect(clear).not.toHaveBeenCalled();
  expect(server.messages.some(message => message.type === "Authenticate" && message.tokenType === "None")).toBe(false);
  expect(clients).toHaveLength(1);
});

it("keeps the app open through a hung routine token refresh, and recovers on tab return", async () => {
  render(<App />);
  await flush();
  const field = screen.getByRole("textbox");
  const clear = vi.spyOn(client, "clearAuth");
  clerk.getToken.mockReturnValue(new Promise<string>(() => {}));
  await elapse(70);
  expect(screen.getByRole("textbox")).toBe(field);
  expect(screen.getByRole("status").textContent).toContain("Reconnecting");
  // Past the retry budget the banner asks, and a tab return still retries.
  await elapse(20);
  expect(screen.getByRole("status").textContent).toContain("couldn't reconnect");
  clerk.getToken.mockImplementation(async () => tokenFor(clerk.userId));
  fireEvent(window, new Event("focus"));
  await advance(5_000);
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("textbox")).toBe(field);
  expect(clear).not.toHaveBeenCalled();
  expect(server.messages.some(message => message.type === "Authenticate" && message.tokenType === "None")).toBe(false);
});

// A protected subscription, as every screen of the app holds.
function Listed() {
  useQuery(api.todos.list, {});
  return <Draft />;
}
function ListedApp() {
  return <AuthProvider url="https://test.convex.cloud" createClient={createClient}><Listed /></AuthProvider>;
}

it("holds a refresh that returns the token it should replace, instead of dropping to anonymous", async () => {
  render(<ListedApp />);
  await flush();
  const field = screen.getByRole("textbox");
  const clear = vi.spyOn(client, "clearAuth");
  // Clerk can issue the same token twice within one second.
  const repeated = tokenFor("user-A");
  clerk.getToken.mockResolvedValue(repeated);
  act(() => server.latest().rejectSession());
  await advance(100);
  act(() => server.latest().rejectSession());
  await advance(100);
  // The SDK would take the repeat for no token: clear auth and reconnect without it.
  expect(screen.getByRole("textbox")).toBe(field);
  expect(clear).not.toHaveBeenCalled();
  expect(anonymousFrames(server.sockets)).toEqual([]);
  clerk.getToken.mockImplementation(async () => tokenFor(clerk.userId));
  await advance(5_000);
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("textbox")).toBe(field);
  expect(anonymousFrames(server.sockets)).toEqual([]);
  expect(server.messages.some(message => message.type === "Authenticate" && message.tokenType === "None")).toBe(false);
  expect(server.latest().sent.some(message => message.type === "ModifyQuerySet" && message.modifications.some(change => change.type === "Add"))).toBe(true);
});

it("unmounts the app's queries the moment the SDK gives up on auth, before it can reconnect", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(<ListedApp />);
  await flush();
  // The server refuses every fresh token: a deployment that no longer trusts this issuer.
  server.setConfirmAuth(false);
  act(() => server.latest().rejectSession());
  await advance(100);
  for (let n = 0; n < 2; n++) {
    act(() => server.latest().rejectSession(true));
    await advance(100);
  }
  expect(screen.getByRole("textbox")).toBeTruthy();
  // Not in act: whatever is true when this returns is true before the SDK does anything else.
  server.latest().rejectSession(true);
  expect(screen.queryByRole("textbox")).toBeNull();
  act(() => server.latest().close());
  await advance(500);
  expect(anonymousFrames(server.sockets)).toEqual([]);
  server.setConfirmAuth(true);
  await elapse(5);
  expect(screen.getByRole("textbox")).toBeTruthy();
  expect(anonymousFrames(server.sockets)).toEqual([]);
});

// A write the server has not answered stays queued, and the SDK sends the
// whole queue again on every new connection.
function queueWrite() {
  let result = "pending";
  void client.mutation(api.todos.createLocal, { title: "Queued by the owner" })
    .then(() => { result = "success"; }, (error: unknown) => { result = String(error); });
  return () => result;
}
/** Refuses fresh tokens until the SDK gives up on this client's auth. */
async function refuseUntilGivenUp() {
  server.setConfirmAuth(false);
  act(() => server.latest().rejectSession());
  await advance(100);
  for (let n = 0; n < 3; n++) {
    act(() => server.latest().rejectSession(true));
    await advance(100);
  }
}
const mutationsOn = (socket: { sent: { type: string }[] }) => socket.sent.filter(message => message.type === "Mutation").length;

it("opens no connection while auth is lost, then sends the queued write as the owner", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(<ListedApp />);
  await flush();
  const result = queueWrite();
  await flush();
  expect(server.mutationOwners).toEqual(["user-A"]);
  await refuseUntilGivenUp();
  expect(screen.queryByRole("textbox")).toBeNull();
  // Recovery cannot get a token for a long while.
  clerk.getToken.mockReturnValue(new Promise<string>(() => {}));
  const opened = server.sockets.length;
  expect(server.sockets.every(socket => socket.closed)).toBe(true);
  // Past the SDK's reconnect backoff and its idle-connection timeout, several times over.
  await elapse(200);
  expect(server.sockets).toHaveLength(opened);
  expect(anonymousFrames(server.sockets)).toEqual([]);
  server.setConfirmAuth(true);
  clerk.getToken.mockImplementation(async () => tokenFor(clerk.userId));
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await elapse(5);
  expect(screen.getByRole("textbox")).toBeTruthy();
  // One connection, opened with the owner's token ahead of the queue.
  expect(server.sockets).toHaveLength(opened + 1);
  expect(server.latest().sent.slice(0, 2).map(message => message.type)).toEqual(["Connect", "Authenticate"]);
  expect(mutationsOn(server.latest())).toBe(1);
  expect(anonymousFrames(server.sockets)).toEqual([]);
  expect(new Set(server.mutationOwners)).toEqual(new Set(["user-A"]));
  expect(result()).not.toContain("Not signed in");
});

it("holds a reconnect while auth restarts for a new session", async () => {
  const view = render(<ListedApp />);
  await flush();
  const result = queueWrite();
  await flush();
  clerk.getToken.mockReturnValue(new Promise<string>(() => {}));
  clerk.sessionId = "session-A2";
  view.rerender(<ListedApp />);
  await flush();
  // The SDK paused this connection for the new auth. Its replacement starts unpaused.
  const opened = server.sockets.length;
  act(() => server.latest().close());
  await elapse(30);
  expect(server.sockets).toHaveLength(opened);
  expect(anonymousFrames(server.sockets)).toEqual([]);
  clerk.getToken.mockImplementation(async () => tokenFor(clerk.userId));
  fireEvent(window, new Event("focus"));
  await elapse(5);
  expect(screen.getByRole("textbox")).toBeTruthy();
  expect(server.sockets).toHaveLength(opened + 1);
  expect(mutationsOn(server.latest())).toBe(1);
  expect(anonymousFrames(server.sockets)).toEqual([]);
  expect(new Set(server.mutationOwners)).toEqual(new Set(["user-A"]));
  expect(result()).not.toContain("Not signed in");
});

it("recovers when the session changes while the SDK has stopped the connection for a refresh", async () => {
  const view = render(<ListedApp />);
  await flush();
  const result = queueWrite();
  await flush();
  // The server asks for a fresh token and Clerk does not answer: the SDK stops the socket and waits.
  clerk.getToken.mockReturnValue(new Promise<string>(() => {}));
  act(() => server.latest().rejectSession());
  await advance(100);
  expect(server.sockets.every(socket => socket.closed)).toBe(true);
  // A new session replaces that auth. Only a token refresh restarts a stopped socket.
  clerk.sessionId = "session-A2";
  clerk.getToken.mockImplementation(async () => tokenFor(clerk.userId));
  view.rerender(<ListedApp />);
  await elapse(5);
  expect(screen.getByRole("textbox")).toBeTruthy();
  expect(screen.queryByRole("status")).toBeNull();
  expect(server.latest().closed).toBe(false);
  expect(mutationsOn(server.latest())).toBe(1);
  expect(anonymousFrames(server.sockets)).toEqual([]);
  expect(new Set(server.mutationOwners)).toEqual(new Set(["user-A"]));
  expect(result()).not.toContain("Not signed in");
});

it("holds a reconnect when auth is replaced without being cleared first", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  client = createClient("https://test.convex.cloud");
  const confirmed = vi.fn();
  client.setAuth(async () => tokenFor("user-A"), confirmed);
  await advance(100);
  expect(confirmed).toHaveBeenLastCalledWith(true);
  const result = queueWrite();
  await advance(0);
  // The replacement has no token yet. Meanwhile the SDK counts the old one as unusable.
  let release: (token: string) => void = () => {};
  client.setAuth(() => new Promise<string>(resolve => { release = resolve; }), confirmed);
  server.latest().rejectSession();
  const opened = server.sockets.length;
  server.latest().close();
  await elapse(30);
  expect(server.sockets).toHaveLength(opened);
  expect(anonymousFrames(server.sockets)).toEqual([]);
  release(tokenFor("user-A"));
  await elapse(5);
  expect(server.sockets).toHaveLength(opened + 1);
  expect(mutationsOn(server.latest())).toBe(1);
  expect(anonymousFrames(server.sockets)).toEqual([]);
  expect(new Set(server.mutationOwners)).toEqual(new Set(["user-A"]));
  expect(result()).not.toContain("Not signed in");
  expect(confirmed).toHaveBeenLastCalledWith(true);
});

it("closes a client that is holding its connection, and never opens one afterwards", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let release: (token: string) => void = () => {};
  const view = render(<ListedApp />);
  await flush();
  await refuseUntilGivenUp();
  clerk.getToken.mockReturnValue(new Promise<string>(resolve => { release = resolve; }));
  // The SDK has reconnected into a held socket, and recovery is waiting on Clerk.
  await elapse(3);
  const opened = server.sockets.length;
  const close = vi.spyOn(client, "close");
  let closed = false;
  // The owner's session ends: the provider disposes of its client.
  view.unmount();
  await flush();
  void (close.mock.results[0].value as Promise<void>).then(() => { closed = true; });
  await flush();
  expect(closed).toBe(true);
  await act(async () => release(tokenFor("user-A")));
  await elapse(30);
  expect(server.sockets).toHaveLength(opened);
});

it("never transmits a previous user's queued mutation after switching accounts", async () => {
  const view = render(<App />);
  await flush();
  act(() => server.latest().close());
  await flush();
  void client.mutation(api.todos.createLocal, { title: "Private draft from user A" });
  clerk.userId = "user-B";
  clerk.sessionId = "session-B";
  view.rerender(<App />);
  await flush();
  await advance(5_000);
  expect(screen.getByRole("textbox")).toBeTruthy();
  expect(server.messages.filter(message => message.type === "Mutation")).toEqual([]);
  const lastAuth = server.messages.filter(message => message.type === "Authenticate" && message.value).at(-1);
  expect(lastAuth?.type).toBe("Authenticate");
  if (lastAuth?.type === "Authenticate" && lastAuth.value) {
    expect(JSON.parse(atob(lastAuth.value.split(".")[1]))).toMatchObject({ sub: "user-B" });
  }
  expect(clients).toHaveLength(2);
  expect(server.sockets[0].closed).toBe(true);
});

it("lets focus restart exhausted server-confirmation attempts", async () => {
  server.setConfirmAuth(false);
  render(<App />);
  await flush();
  for (let n = 0; n < 4; n++) await advance(10_000);
  expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  server.setConfirmAuth(true);
  fireEvent(window, new Event("focus"));
  await flush();
  expect(screen.getByRole("textbox")).toBeTruthy();
});

it("ignores a late token after logout and does not recreate a socket", async () => {
  let resolveToken: (token: string) => void = () => {};
  clerk.getToken.mockReturnValue(new Promise<string>(resolve => { resolveToken = resolve; }));
  const view = render(<App />);
  await flush();
  clerk.isSignedIn = false;
  view.rerender(<App />);
  await flush();
  const count = server.messages.length;
  await act(async () => resolveToken(tokenFor("user-A")));
  await advance(60_000);
  expect(server.messages).toHaveLength(count);
  expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
});

it("cleans up subscriptions before closing a replaced client", async () => {
  const view = render(<App />);
  await flush();
  view.rerender(<AuthProvider url="https://test.convex.cloud" createClient={url => createClient(url)}><Draft /></AuthProvider>);
  await flush();
  expect(screen.getByRole("textbox")).toBeTruthy();
  expect(server.sockets[0].closed).toBe(true);
});


it("never gives an old user's client a token from Clerk's newly switched account", async () => {
  render(<App />);
  await flush();
  // The SDK sees the next account before its React context has caught up.
  const newToken = tokenFor("user-B");
  clerk.getToken.mockResolvedValue(newToken);
  act(() => server.latest().rejectSession());
  await flush();
  await advance(5_000);
  expect(server.messages.some(message => message.type === "Authenticate" && message.value === newToken)).toBe(false);
  // The owner's app stays open on its saved data until React disposes of it.
  expect(screen.getByRole("textbox")).toBeTruthy();
  expect(server.messages.some(message => message.type === "Authenticate" && message.tokenType === "None")).toBe(false);
});

it("never lets an unresolved Clerk state carry another user's token onto a retained client", async () => {
  // One controlled peer per client, so every frame is attributed to the client that sent it.
  const peers: ReturnType<typeof createAuthServer>[] = [];
  const createOwnedClient = (url: string) => {
    const peer = createAuthServer();
    peers.push(peer);
    const owned = new ConvexReactClient(url, { webSocketConstructor: peer.WebSocket, logger: false, unsavedChangesWarning: false });
    clients.push(owned);
    return owned;
  };
  const subjects = (peer: ReturnType<typeof createAuthServer>) => peer.messages.flatMap(message =>
    message.type === "Authenticate" && message.value ? [(JSON.parse(atob(message.value.split(".")[1])) as { sub: string }).sub] : []);
  const Owned = () => <AuthProvider url="https://test.convex.cloud" createClient={createOwnedClient}><Draft /></AuthProvider>;
  const view = render(<Owned />);
  await flush();
  expect(new Set(subjects(peers[0]))).toEqual(new Set(["user-A"]));
  act(() => peers[0].latest().close());
  await flush();
  void clients[0].mutation(api.todos.createLocal, { title: "Private queued A mutation" }).catch(() => {});
  // Loaded and signed in, but Clerk's status is an error while it reports account B.
  Object.assign(clerk, { status: "error", userId: "user-B", sessionId: "session-B" });
  view.rerender(<Owned />);
  await flush();
  await advance(2_000);
  expect(subjects(peers[0]).every(subject => subject === "user-A")).toBe(true);
  expect(peers[0].messages.some(message => message.type === "Mutation")).toBe(false);
  // B gets its own client and socket; A's is closed with its queue unsent.
  expect(peers).toHaveLength(2);
  expect(peers[1].messages.some(message => message.type === "Mutation")).toBe(false);
  expect(new Set(subjects(peers[1]))).toEqual(new Set(["user-B"]));
  expect(peers[0].sockets.every(socket => socket.closed)).toBe(true);
  expect(screen.queryByRole("textbox")).toBeNull();
});

// A retained owner's client must keep its auth through a Clerk gap: a
// temporary state that reports no user (loading, error, degraded). Convex
// clears a client's auth whenever its provider's inputs change, and a client
// without auth replays queued writes anonymously, where they fail for good.
describe("a retained owner's queued write", () => {
  const signedInA = { status: "ready", isLoaded: true, isSignedIn: true, userId: "user-A", sessionId: "session-A", sessionClaims: { aud: "convex" } };
  const noUser = { isSignedIn: false, userId: null, sessionClaims: null };
  const gaps = {
    "error, session missing": { ...noUser, status: "error", isLoaded: true, sessionId: null },
    "degraded, session missing": { ...noUser, status: "degraded", isLoaded: true, sessionId: null },
    "loading, session missing": { status: "loading", isLoaded: false, isSignedIn: undefined, userId: undefined, sessionId: undefined, sessionClaims: undefined },
    "error, session unchanged": { ...noUser, status: "error", isLoaded: true, sessionId: "session-A" },
    "loading, session unchanged": { ...noUser, status: "loading", isLoaded: false, sessionId: "session-A" },
  };

  function ownedApp() {
    const peers: ReturnType<typeof createAuthServer>[] = [];
    const createOwnedClient = (url: string) => {
      const peer = createAuthServer();
      peers.push(peer);
      const owned = new ConvexReactClient(url, { webSocketConstructor: peer.WebSocket, logger: false, unsavedChangesWarning: false });
      clients.push(owned);
      return owned;
    };
    const Owned = () => <AuthProvider url="https://test.convex.cloud" createClient={createOwnedClient}><Draft /></AuthProvider>;
    const owners = () => peers.flatMap(peer => peer.mutationOwners);
    let result = "pending";
    const queueWrite = () => {
      void clients[0].mutation(api.todos.createLocal, { title: "Queued A mutation" })
        .then(() => { result = "success"; }, (error: unknown) => { result = String(error); });
    };
    return { peers, Owned, owners, queueWrite, result: () => result };
  }

  for (const [name, gap] of Object.entries(gaps)) {
    it(`is sent once, as the owner, through a Clerk gap (${name})`, async () => {
      const { peers, Owned, owners, queueWrite, result } = ownedApp();
      const view = render(<Owned />);
      await flush();
      const field = screen.getByRole("textbox");
      fireEvent.change(field, { target: { value: "Unsent question" } });
      const clear = vi.spyOn(clients[0], "clearAuth");
      act(() => peers[0].latest().close());
      await flush();
      queueWrite();
      Object.assign(clerk, gap);
      clerk.getToken.mockResolvedValue(null);
      view.rerender(<Owned />);
      await flush();
      await advance(5_000);
      // The app stays open through the gap; nothing is sent until the owner's token returns.
      expect(screen.getByRole("textbox")).toBe(field);
      expect(owners().every(owner => owner === "user-A")).toBe(true);
      Object.assign(clerk, signedInA);
      clerk.getToken.mockImplementation(async () => tokenFor(clerk.userId));
      view.rerender(<Owned />);
      await flush();
      await advance(5_000);
      expect(clients).toHaveLength(1);
      expect(clear).not.toHaveBeenCalled();
      expect(owners()).toEqual(["user-A"]);
      expect(result()).not.toContain("Not signed in");
      expect(screen.getByRole("textbox")).toBe(field);
      expect((field as HTMLInputElement).value).toBe("Unsent question");
    });
  }

  it("waits for the owner's token when it lapses during a long gap", async () => {
    const { peers, Owned, owners, queueWrite, result } = ownedApp();
    const view = render(<Owned />);
    await flush();
    Object.assign(clerk, gaps["degraded, session missing"]);
    clerk.getToken.mockRejectedValue(new TypeError("Clerk is unreachable"));
    view.rerender(<Owned />);
    await flush();
    // Past the token's 60-second life: Convex asks for a fresh one mid-gap.
    await advance(70_000);
    act(() => peers[0].latest().close());
    await flush();
    queueWrite();
    await advance(5_000);
    expect(owners().every(owner => owner === "user-A")).toBe(true);
    clerk.getToken.mockImplementation(async () => tokenFor(clerk.userId));
    Object.assign(clerk, signedInA);
    view.rerender(<Owned />);
    await flush();
    await advance(5_000);
    expect(clients).toHaveLength(1);
    expect(owners()).toEqual(["user-A"]);
    expect(result()).not.toContain("Not signed in");
  });

  it("waits for the owner's token when refresh fails while Clerk is ready", async () => {
    const { peers, Owned, owners, queueWrite, result } = ownedApp();
    render(<Owned />);
    await flush();
    clerk.getToken.mockRejectedValue(new TypeError("network"));
    // The scheduled refresh fails; recovery retries until it gives up.
    await advance(60_000);
    for (const delay of [1_000, 2_000, 5_000, 10_000]) await advance(delay);
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    act(() => peers[0].latest().close());
    await flush();
    queueWrite();
    await advance(5_000);
    expect(owners().every(owner => owner === "user-A")).toBe(true);
    expect(peers[0].messages.some(message => message.type === "Authenticate" && message.tokenType === "None")).toBe(false);
    clerk.getToken.mockImplementation(async () => tokenFor(clerk.userId));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await advance(5_000);
    expect(owners()).toEqual(["user-A"]);
    expect(result()).not.toContain("Not signed in");
    expect(screen.getByRole("textbox")).toBeTruthy();
  });
});
