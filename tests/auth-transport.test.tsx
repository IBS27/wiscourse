// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { api } from "../convex/_generated/api";
import { AuthProvider } from "../src/components/app/auth-provider";
import { useDraft } from "../src/lib/drafts";
import { createAuthServer, tokenFor } from "./helpers/auth-server";

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
  client = new ConvexReactClient(url, { webSocketConstructor: server.WebSocket, logger: false, unsavedChangesWarning: false });
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

it("bounds a hung server-rejected refresh and restores the draft with the real SDK", async () => {
  render(<App />);
  await flush();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Keep this question" } });
  clerk.getToken.mockReturnValue(new Promise<string>(() => {}));
  act(() => server.latest().rejectSession());
  await flush();
  expect(screen.queryByRole("textbox")).toBeNull();
  await advance(10_000);
  clerk.getToken.mockImplementation(async () => tokenFor(clerk.userId));
  await advance(10_000);
  await flush();
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Keep this question");
});

it("bounds a hung routine token refresh even before the server reports an auth error", async () => {
  render(<App />);
  await flush();
  clerk.getToken.mockReturnValue(new Promise<string>(() => {}));
  await advance(70_000);
  expect(screen.queryByRole("textbox")).toBeNull();
  clerk.getToken.mockImplementation(async () => tokenFor(clerk.userId));
  await advance(20_000);
  expect(screen.getByRole("textbox")).toBeTruthy();
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
  expect(screen.queryByRole("textbox")).toBeNull();
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
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "Unsent question" } });
      const clear = vi.spyOn(clients[0], "clearAuth");
      act(() => peers[0].latest().close());
      await flush();
      queueWrite();
      Object.assign(clerk, gap);
      clerk.getToken.mockResolvedValue(null);
      view.rerender(<Owned />);
      await flush();
      await advance(5_000);
      expect(screen.queryByRole("textbox")).toBeNull();
      Object.assign(clerk, signedInA);
      clerk.getToken.mockImplementation(async () => tokenFor(clerk.userId));
      view.rerender(<Owned />);
      await flush();
      await advance(5_000);
      expect(clients).toHaveLength(1);
      expect(clear).not.toHaveBeenCalled();
      expect(owners()).toEqual(["user-A"]);
      expect(result()).not.toContain("Not signed in");
      expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Unsent question");
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
