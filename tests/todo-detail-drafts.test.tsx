// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { TodoItem } from "../convex/todos";
import type { Id } from "../convex/_generated/dataModel";
import { TodoDetail } from "../src/components/todo/todo-detail";
import { DraftContext, DraftStore } from "../src/lib/drafts";

const mutate = vi.hoisted(() => vi.fn<(args: object) => Promise<null>>(() => Promise.resolve(null)));
vi.mock("convex/react", () => ({ useMutation: () => mutate, useQuery: () => undefined }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/hooks", () => ({
  useCourses: () => ({ label: () => "Course", color: () => "gray", byId: new Map() }),
  useToday: () => "2026-09-30", useNow: () => Date.UTC(2026, 8, 30), courseStyle: () => ({}),
}));
afterEach(() => { cleanup(); mutate.mockClear(); });

const item: TodoItem = {
  key: "local:synthetic", kind: "local", todoId: "synthetic" as Id<"todos">,
  title: "A", notes: "A", submission: "none", subtasks: [], doneBySubmission: false,
};

for (const field of ["title", "notes"] as const) {
  const input = () => (field === "title"
    ? screen.getByRole("textbox", { name: "Title" })
    : screen.getByPlaceholderText("Add notes…")) as HTMLInputElement;

  it(`shows a remote restore of the ${field} after this tab's saved edit, and never re-saves the edit`, () => {
    const store = new DraftStore();
    const app = (value: string) => <DraftContext value={store}><TodoDetail item={{ ...item, [field]: value }} /></DraftContext>;
    const view = render(app("A"));
    fireEvent.change(input(), { target: { value: "AB" } });
    fireEvent.blur(input());
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ [field]: "AB" }));
    view.rerender(app("AB")); // the save is confirmed
    mutate.mockClear();
    view.rerender(app("A")); // another tab restores A
    expect(input().value).toBe("A");
    fireEvent.blur(input());
    expect(mutate).not.toHaveBeenCalled();
    // An auth remount keeps showing the server's value too.
    view.rerender(<DraftContext value={store}>{null}</DraftContext>);
    view.rerender(app("A"));
    expect(input().value).toBe("A");
  });

  // The save is acknowledged while an auth remount hides the view, so the view
  // never renders the server's intermediate values.
  function deferredSave() {
    let settle: { resolve: (value: null) => void; reject: (error: Error) => void } | undefined;
    mutate.mockReturnValueOnce(new Promise<null>((resolve, reject) => { settle = { resolve, reject }; }));
    return () => settle!;
  }
  function hideable(store: DraftStore) {
    return (value: string, visible = true) =>
      <DraftContext value={store}>{visible && <TodoDetail item={{ ...item, [field]: value }} />}</DraftContext>;
  }

  it(`does not revive a ${field} saved while hidden after the server moves back`, async () => {
    const app = hideable(new DraftStore());
    const settle = deferredSave();
    const view = render(app("A"));
    fireEvent.change(input(), { target: { value: "AB" } });
    fireEvent.blur(input());
    view.rerender(app("A", false));
    await act(async () => settle().resolve(null));
    view.rerender(app("AB", false));
    view.rerender(app("A", false)); // another tab restores A before the view returns
    mutate.mockClear();
    view.rerender(app("A"));
    expect(input().value).toBe("A");
    fireEvent.blur(input());
    expect(mutate).not.toHaveBeenCalled();
  });

  it(`keeps a ${field} edit whose save failed while hidden`, async () => {
    const app = hideable(new DraftStore());
    const settle = deferredSave();
    const view = render(app("A"));
    fireEvent.change(input(), { target: { value: "AB" } });
    fireEvent.blur(input());
    view.rerender(app("A", false));
    await act(async () => settle().reject(new Error("connection lost")));
    mutate.mockClear();
    view.rerender(app("A"));
    expect(input().value).toBe("AB");
    fireEvent.blur(input());
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ [field]: "AB" }));
  });

  it(`keeps a newer ${field} edit typed during the save, mounted or hidden`, async () => {
    for (const hidden of [false, true]) {
      const app = hideable(new DraftStore());
      const settle = deferredSave();
      const view = render(app("A"));
      fireEvent.change(input(), { target: { value: "AB" } });
      fireEvent.blur(input());
      fireEvent.change(input(), { target: { value: "ABC" } });
      if (hidden) view.rerender(app("A", false));
      view.rerender(app("AB", !hidden)); // the save lands on the server
      await act(async () => settle().resolve(null));
      view.rerender(app("AB"));
      expect(input().value).toBe("ABC");
      cleanup();
    }
  });

  it(`keeps an unsaved ${field} edit through a remount while the server value is unchanged`, () => {
    const store = new DraftStore();
    const app = (visible: boolean) => <DraftContext value={store}>{visible && <TodoDetail item={item} />}</DraftContext>;
    const view = render(app(true));
    fireEvent.change(input(), { target: { value: "Unsaved" } });
    view.rerender(app(false));
    view.rerender(app(true));
    expect(input().value).toBe("Unsaved");
    expect(mutate).not.toHaveBeenCalled();
  });
}
