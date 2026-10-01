// @vitest-environment jsdom
// The real owner-bound upload hook and owner lifetime, driven through the real
// submission panel. Clerk, fetch and Convex are mocks; nothing leaves the test.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import type { ReactNode } from "react";
import { SubmissionPanel } from "../src/components/todo/submission-panel";
import { DraftContext, DraftStore } from "../src/lib/drafts";
import { OwnerSession } from "../src/lib/owner-session";
import type { TodoItem } from "../convex/todos";

const mocks = vi.hoisted(() => ({
  clerk: { user: { id: "A" } as { id: string } | null },
  getToken: undefined as unknown as ReturnType<typeof vi.fn>,
  submit: undefined as unknown as ReturnType<typeof vi.fn>,
}));
vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ getToken: mocks.getToken, sessionClaims: { aud: "convex" } }),
  useClerk: () => mocks.clerk,
}));
vi.mock("convex/react", () => ({
  useQuery: () => ({ credential: "active", kinds: ["file", "text"], canvasOnly: false, outbox: null }),
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(ref) === "submissions:submit" ? mocks.submit : vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a> }));
vi.mock("@/lib/hooks", () => ({ useNow: () => Date.UTC(2026, 8, 30, 15) }));

const SITE = "https://mock-deployment.convex.site";
const item = { key: "assignment:1", kind: "assignment", canvasId: 1, title: "Report", dueAt: Date.UTC(2026, 9, 2), submission: "unsubmitted", subtasks: [] } as TodoItem;
const jwt = (sub: string) => `x.${btoa(JSON.stringify({ sub })).replace(/=+$/, "")}.sig`;

type Held<T> = { resolve: (value: T) => void; reject: (error: unknown) => void };
let tokens: Array<Held<string | null>>;
let uploads: Array<{ url: string; auth: string | null; file: string; signal: AbortSignal | undefined } & Held<Response>>;

beforeEach(() => {
  mocks.clerk.user = { id: "A" };
  tokens = [];
  uploads = [];
  mocks.getToken = vi.fn(() => new Promise<string | null>((resolve, reject) => tokens.push({ resolve, reject })));
  mocks.submit = vi.fn(async () => "row");
  vi.stubEnv("VITE_CONVEX_SITE_URL", SITE);
  vi.stubGlobal("fetch", vi.fn((url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
    const signal = init.signal ?? undefined;
    signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    uploads.push({ url, auth: new Headers(init.headers).get("Authorization"), file: (init.body as File).name, signal, resolve, reject });
  })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// `session` keys the owner's lifetime, as the auth provider keys UserSession.
function App({ session, owner }: { session: string; owner: string }) {
  return (
    <OwnerSession key={session} owner={owner}>
      <DraftContext value={new DraftStore()}>{owner === "A" && <SubmissionPanel item={item} />}</DraftContext>
    </OwnerSession>
  );
}

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });

async function confirmFiles(names: string[]) {
  const view = render(<App session="A#1" owner="A" />);
  fireEvent.click(screen.getByRole("button", { name: "Submit…" }));
  const files = names.map((name) => new File([`%PDF ${name}`], name, { type: "application/pdf" }));
  fireEvent.change(screen.getByLabelText("Files to submit"), { target: { files } });
  fireEvent.click(screen.getByRole("button", { name: "Review submission" }));
  fireEvent.click(screen.getByRole("button", { name: "Submit to Canvas" }));
  await flush();
  return view;
}

it("uploads each file with the owner's own token, then submits once", async () => {
  const view = await confirmFiles(["a.pdf", "b.pdf"]);
  for (let i = 0; i < 2; i++) {
    tokens[i].resolve(jwt("A"));
    await flush();
    // Same-owner re-renders (auth recovery keeps the owner's session) change nothing.
    view.rerender(<App session="A#1" owner="A" />);
    uploads[i].resolve(new Response(JSON.stringify({ storageId: `s${i}` }), { status: 200 }));
    await flush();
  }
  expect(uploads.map((u) => [u.url, u.auth, u.file])).toEqual([
    [`${SITE}/submissions/upload`, `Bearer ${jwt("A")}`, "a.pdf"],
    [`${SITE}/submissions/upload`, `Bearer ${jwt("A")}`, "b.pdf"],
  ]);
  expect(mocks.submit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    content: { kind: "file", files: [{ storageId: "s0", name: "a.pdf" }, { storageId: "s1", name: "b.pdf" }] },
    confirmed: true,
  }));
});

it("drops a token that arrives after the owner is disposed, even if the owner returns", async () => {
  const view = await confirmFiles(["private.pdf"]);
  expect(tokens).toHaveLength(1);

  mocks.clerk.user = { id: "B" };
  view.rerender(<App session="B#1" owner="B" />); // A's session is disposed
  tokens[0].resolve(jwt("B"));
  await flush();
  mocks.clerk.user = { id: "A" };
  view.rerender(<App session="A#2" owner="A" />); // A signs back in: a new lifetime
  await flush();

  expect(uploads).toHaveLength(0);
  expect(mocks.submit).not.toHaveBeenCalled();
});

it("keeps a disposed owner's work dead when the same account comes back", async () => {
  const view = await confirmFiles(["private.pdf"]);
  mocks.clerk.user = { id: "B" };
  view.rerender(<App session="B#1" owner="B" />);
  mocks.clerk.user = { id: "A" };
  view.rerender(<App session="A#2" owner="A" />);
  // Only disposal stops this: the account and the token subject both match A again.
  tokens[0].resolve(jwt("A"));
  await flush();
  expect(uploads).toHaveLength(0);
  expect(mocks.submit).not.toHaveBeenCalled();
});

it("refuses another account's token while Clerk reports it before React disposes the owner", async () => {
  await confirmFiles(["private.pdf"]);
  mocks.clerk.user = { id: "B" }; // not yet committed: A's panel is still mounted
  tokens[0].resolve(jwt("B"));
  await flush();
  expect(uploads).toHaveLength(0);
  expect(mocks.submit).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toContain("account changed");

  // A token for A while Clerk reports B is refused too.
  fireEvent.click(screen.getByRole("button", { name: "Submit to Canvas" }));
  await flush();
  expect(tokens).toHaveLength(1);
  expect(uploads).toHaveLength(0);
});

it("aborts the upload in flight and sends no further file or submission on disposal", async () => {
  const view = await confirmFiles(["one.pdf", "two.pdf", "three.pdf"]);
  tokens[0].resolve(jwt("A"));
  await flush();
  expect(uploads).toHaveLength(1);

  mocks.clerk.user = { id: "B" };
  view.rerender(<App session="B#1" owner="B" />);
  await flush();
  expect(uploads[0].signal?.aborted).toBe(true);
  // A reply that still arrives is ignored.
  uploads[0].resolve(new Response(JSON.stringify({ storageId: "late" }), { status: 200 }));
  await flush();
  expect(uploads).toHaveLength(1);
  expect(tokens).toHaveLength(1);
  expect(mocks.submit).not.toHaveBeenCalled();
});

it("checks the owner before a text submission's final mutation", async () => {
  render(<App session="A#1" owner="A" />);
  fireEvent.click(screen.getByRole("button", { name: "Submit…" }));
  fireEvent.click(screen.getByRole("tab", { name: /Text/ }));
  fireEvent.change(screen.getByLabelText("Submission text"), { target: { value: "My answer" } });
  fireEvent.click(screen.getByRole("button", { name: "Review submission" }));
  mocks.clerk.user = { id: "B" };
  fireEvent.click(screen.getByRole("button", { name: "Submit to Canvas" }));
  await flush();
  expect(mocks.submit).not.toHaveBeenCalled();

  mocks.clerk.user = { id: "A" };
  fireEvent.click(screen.getByRole("button", { name: "Submit to Canvas" }));
  await flush();
  expect(mocks.submit).toHaveBeenCalledOnce();
});
