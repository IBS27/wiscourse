// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
