// @vitest-environment jsdom
// The real Convex client, provider, useQuery and useMutation around the
// actual TodoDetail, with a controlled peer that applies writes the way the
// server does (todos.updateLocal and todos.setNotes trim). Messages arrive in
// a plain task outside act, as a WebSocket message would.
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { TodoItem } from "../convex/todos";
import type { Id } from "../convex/_generated/dataModel";
import { TodoDetail } from "../src/components/todo/todo-detail";
import { DraftContext, DraftStore } from "../src/lib/drafts";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/hooks", () => ({
  useCourses: () => ({ label: () => "Course", color: () => "gray", byId: new Map() }),
  useToday: () => "2026-09-30", useNow: () => Date.UTC(2026, 8, 30), courseStyle: () => ({}),
}));

const item: TodoItem = {
  key: "local:synthetic", kind: "local", todoId: "synthetic" as Id<"todos">,
  title: "A", notes: "A", submission: "none", subtasks: [], doneBySubmission: false,
};
type Field = "title" | "notes";
const timestamp = (n: number) => {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setUint32(0, n, true);
  return btoa(String.fromCharCode(...bytes));
};

function createPeer(field: Field) {
  const sockets: Peer[] = [];
  let version = { querySet: 0, identity: 0, ts: timestamp(0) };
  let commit = 0;
  let queryId: number | undefined;
  let stored = "A";
  const writes: { requestId: number; value: string }[] = [];
  class Peer {
    onopen: (() => void) | null = null;
    onclose: ((event: { code: number; reason: string }) => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    closed = false;
    constructor() { sockets.push(this); queueMicrotask(() => this.onopen?.()); }
    emit(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) }); }
    transition(querySet = version.querySet) {
      const start = version;
      version = { ...version, querySet, ts: timestamp(++commit) };
      this.emit({
        type: "Transition", startVersion: start, endVersion: version,
        modifications: queryId === undefined ? [] : [{ type: "QueryUpdated", queryId, value: { ...item, [field]: stored }, logLines: [] }],
      });
    }
    send(raw: string) {
      const message = JSON.parse(raw) as {
        type: string; newVersion?: number; requestId?: number;
        modifications?: { type: string; queryId: number }[]; args?: { title?: string; notes?: string }[];
      };
      if (message.type === "ModifyQuerySet") {
        const added = message.modifications?.find((m) => m.type === "Add");
        if (added) queryId = added.queryId;
        queueMicrotask(() => this.transition(message.newVersion));
      }
      if (message.type === "Mutation") writes.push({ requestId: message.requestId!, value: message.args![0][field]! });
    }
    close() {
      if (this.closed) return;
      this.closed = true;
      queueMicrotask(() => this.onclose?.({ code: 1000, reason: "closed" }));
    }
  }
  return {
    WebSocket: Peer as unknown as typeof WebSocket,
    writes,
    /** Commits the oldest write as the server stores it, then acknowledges it. */
    commitNext: () => new Promise<void>((resolve) => setTimeout(() => {
      const write = writes.shift()!;
      const socket = sockets.at(-1)!;
      stored = write.value.trim();
      socket.emit({ type: "MutationResponse", requestId: write.requestId, success: true, result: null, ts: timestamp(commit + 1), logLines: [] });
      socket.transition();
      setTimeout(resolve, 20);
    }, 0)),
  };
}

let client: ConvexReactClient | undefined;
afterEach(async () => { cleanup(); await client?.close(); });

function mount(field: Field) {
  const peer = createPeer(field);
  client = new ConvexReactClient("https://test.convex.cloud", { webSocketConstructor: peer.WebSocket, logger: false, unsavedChangesWarning: false });
  function TodoPage() {
    const value = useQuery(api.todos.get, { ref: { kind: "local", todoId: item.todoId! } });
    return value ? <TodoDetail item={value} /> : null;
  }
  render(<ConvexProvider client={client}><DraftContext value={new DraftStore()}><TodoPage /></DraftContext></ConvexProvider>);
  const input = () => (field === "title"
    ? screen.getByRole("textbox", { name: "Title" })
    : screen.getByPlaceholderText("Add notes…")) as HTMLInputElement;
  return { peer, input };
}

for (const field of ["title", "notes"] as const) {
  // Convex resolves a successful mutation only once a query transition at its
  // commit has been applied, and React 19 renders that query update and the
  // draft store's update in one pass. The view never sees the ACK with the
  // pre-save value.
  it(`keeps a ${field} edit typed during the save when the save lands`, async () => {
    const { peer, input } = mount(field);
    await act(async () => { await Promise.resolve(); });
    fireEvent.change(input(), { target: { value: "AB" } });
    fireEvent.blur(input());
    fireEvent.change(input(), { target: { value: "ABC" } });
    await peer.commitNext();
    expect(input().value).toBe("ABC");
    fireEvent.blur(input());
    expect(peer.writes.map((write) => write.value)).toEqual(["ABC"]);
  });

  // The server stores the value trimmed; the save must send what the server
  // will echo, or the echo reads as someone else's change.
  it(`keeps a ${field} edit typed during the save when the sent text had outer spaces`, async () => {
    const { peer, input } = mount(field);
    await act(async () => { await Promise.resolve(); });
    fireEvent.change(input(), { target: { value: " AB \n" } });
    fireEvent.blur(input());
    fireEvent.change(input(), { target: { value: "AB more" } });
    await peer.commitNext();
    expect(input().value).toBe("AB more");
  });
}
