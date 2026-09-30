// @vitest-environment jsdom
// #11's acknowledged-save drafts and #12's submission panel in one real
// TodoDetail for an assignment, across a hidden auth remount.
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import type { ReactNode } from "react";
import type { TodoItem } from "../convex/todos";
import { TodoDetail } from "../src/components/todo/todo-detail";
import { DraftContext, DraftStore } from "../src/lib/drafts";

const mocks = vi.hoisted(() => ({ mutations: new Map<string, ReturnType<typeof vi.fn>>() }));
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(ref) === "submissions:panel" ? { credential: "active", kinds: ["text"], canvasOnly: false, outbox: null } : undefined,
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(ref);
    if (!mocks.mutations.has(name)) mocks.mutations.set(name, vi.fn(() => Promise.resolve(null)));
    return mocks.mutations.get(name);
  },
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn(), Link: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/lib/hooks", () => ({
  useCourses: () => ({ label: () => "Course", color: () => "gray", byId: new Map() }),
  useToday: () => "2026-09-30", useNow: () => Date.UTC(2026, 8, 30), courseStyle: () => ({}),
}));
vi.mock("@/lib/submission-upload", () => ({
  UploadError: class extends Error {},
  useOwnerBoundUploads: () => () => ({ upload: vi.fn(), ensureCurrent: () => {} }),
}));
afterEach(() => { cleanup(); mocks.mutations.clear(); });

const item: TodoItem = {
  key: "assignment:1", kind: "assignment", canvasId: 1, title: "Essay", dueAt: Date.UTC(2026, 9, 2),
  notes: "A", submission: "unsubmitted", subtasks: [],
};

it("retires an acknowledged notes save and keeps an unsent submission across a hidden auth remount", async () => {
  const store = new DraftStore();
  const app = (notes: string, visible = true) =>
    <DraftContext value={store}>{visible && <TodoDetail item={{ ...item, notes }} />}</DraftContext>;
  const view = render(app("A"));
  const notes = () => screen.getByPlaceholderText("Add notes…") as HTMLTextAreaElement;

  fireEvent.click(screen.getByRole("button", { name: "Submit…" }));
  fireEvent.change(screen.getByLabelText("Submission text"), { target: { value: "Unsent answer" } });
  let acknowledge!: (value: null) => void;
  const setNotes = mocks.mutations.get("todos:setNotes")!;
  setNotes.mockReturnValueOnce(new Promise<null>((resolve) => { acknowledge = resolve; }));
  fireEvent.change(notes(), { target: { value: "AB" } });
  fireEvent.blur(notes());
  expect(setNotes).toHaveBeenCalledWith(expect.objectContaining({ notes: "AB" }));

  // Hidden: the save is acknowledged and the server moves on to AB, then back to A.
  view.rerender(app("A", false));
  await act(async () => acknowledge(null));
  view.rerender(app("AB", false));
  view.rerender(app("A", false));
  view.rerender(app("A"));

  expect(notes().value).toBe("A");
  expect((screen.getByLabelText("Submission text") as HTMLTextAreaElement).value).toBe("Unsent answer");
  // Never confirmed, so never submitted (the dialog, and its mutation, never mounted).
  expect(mocks.mutations.get("submissions:submit")?.mock.calls ?? []).toHaveLength(0);
  fireEvent.blur(notes());
  expect(setNotes).toHaveBeenCalledTimes(1);

  // Another owner gets a new draft store: nothing of the first owner's shows.
  view.rerender(<DraftContext value={new DraftStore()}><TodoDetail item={{ ...item, notes: "A" }} /></DraftContext>);
  expect(screen.queryByLabelText("Submission text")).toBeNull();
});
