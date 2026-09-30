// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DraftContext, DraftRoute, DraftScope, DraftStore, useDraft, useSourcedDraft } from "../src/lib/drafts";
import { Composer } from "../src/components/ask/composer";
import { QuickAddProvider } from "../src/components/app/quick-add";
import { EventDialog } from "../src/components/calendar/event-dialog";
import { useQuickAdd } from "../src/lib/quick-add-context";

const mutation = vi.hoisted(() => vi.fn<() => Promise<void>>());
vi.mock("convex/react", () => ({ useMutation: () => mutation }));
vi.mock("@/lib/hooks", () => ({
  useCourses: () => ({ courses: [], filterable: [], byId: new Map<number, never>(), color: () => "gray" }),
  useToday: () => "2026-09-24", courseLabel: () => "Test course", courseStyle: () => ({}), courseColorVar: () => "gray",
}));
afterEach(() => { cleanup(); mutation.mockReset(); });

it("restores the open quick-add form and tracks its pending save through a remount", async () => {
  const store = new DraftStore();
  function OpenTask() {
    const quickAdd = useQuickAdd();
    return <button onClick={() => quickAdd.open()}>Add task</button>;
  }
  function App({ visible }: { visible: boolean }) {
    return <DraftContext value={store}>{visible && <QuickAddProvider><OpenTask /></QuickAddProvider>}</DraftContext>;
  }
  let finish: () => void = () => {};
  mutation.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
  const view = render(<App visible />);
  fireEvent.click(screen.getByRole("button", { name: "Add task" }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Read chapter 4" } });
  view.rerender(<App visible={false} />);
  view.rerender(<App visible />);
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Read chapter 4");
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  view.rerender(<App visible={false} />);
  view.rerender(<App visible />);
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  expect(mutation).toHaveBeenCalledOnce();
  await act(async () => finish());
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("keeps a chat draft and sending state when recovery interrupts submission", async () => {
  const store = new DraftStore();
  let reject: (error: Error) => void = () => {};
  const send = vi.fn(() => new Promise<void>((_, fail) => { reject = fail; }));
  function App({ visible }: { visible: boolean }) {
    return <DraftContext value={store}>{visible && <Composer onSend={send} courseCanvasId={undefined} onCourseChange={() => {}} />}</DraftContext>;
  }
  const view = render(<App visible />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "What is due next week?" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  view.rerender(<App visible={false} />);
  view.rerender(<App visible />);
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("What is due next week?");
  expect(screen.getByRole("button", { name: "Send" }).hasAttribute("disabled")).toBe(true);
  await act(async () => reject(new Error("connection lost")));
  expect(screen.getByRole("button", { name: "Send" }).hasAttribute("disabled")).toBe(false);
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("What is due next week?");
});

it("isolates drafts by route and evaluates queued functional edits once", () => {
  const store = new DraftStore();
  const update = vi.fn((value: string) => value + "a");
  function Draft() {
    const [text, setText] = useDraft("notes", "");
    return <button onClick={() => { setText(update); setText(update); }}>{text || "Empty"}</button>;
  }
  function App({ route }: { route: string }) {
    return <DraftContext value={store}><DraftScope value={route}><Draft /></DraftScope></DraftContext>;
  }
  const view = render(<App route="course-1" />);
  fireEvent.click(screen.getByRole("button"));
  expect(screen.getByRole("button").textContent).toBe("aa");
  expect(update).toHaveBeenCalledTimes(2);
  view.rerender(<App route="course-2" />);
  expect(screen.getByRole("button").textContent).toBe("Empty");
  view.rerender(<App route="course-1" />);
  expect(screen.getByRole("button").textContent).toBe("aa");
});


it("restores an event draft after recovery but discards it on intentional cancel", () => {
  const store = new DraftStore();
  function Form() {
    const [open, setOpen] = useDraft("event-open", true);
    return <><button onClick={() => setOpen(true)}>Open event</button><EventDialog open={open} onOpenChange={setOpen} /></>;
  }
  function App({ visible }: { visible: boolean }) {
    return <DraftContext value={store}>{visible && <Form />}</DraftContext>;
  }
  const view = render(<App visible />);
  fireEvent.change(screen.getByRole("textbox", { name: "Event title" }), { target: { value: "Study group" } });
  view.rerender(<App visible={false} />);
  view.rerender(<App visible />);
  expect((screen.getByRole("textbox", { name: "Event title" }) as HTMLInputElement).value).toBe("Study group");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Open event" }));
  expect((screen.getByRole("textbox", { name: "Event title" }) as HTMLInputElement).value).toBe("");
});

it("keeps an unsaved edit through a remount but never resurfaces it over a later server value", () => {
  const store = new DraftStore();
  function Notes({ source }: { source: string }) {
    const [value, setValue] = useSourcedDraft("notes", source);
    return <textarea aria-label="Notes" value={value} onChange={(e) => setValue(e.target.value)} />;
  }
  function App({ source, visible = true }: { source: string; visible?: boolean }) {
    return <DraftContext value={store}>{visible && <Notes source={source} />}</DraftContext>;
  }
  const notes = () => (screen.getByRole("textbox", { name: "Notes" }) as HTMLTextAreaElement).value;
  const view = render(<App source="A" />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "AB" } });
  view.rerender(<App source="A" visible={false} />);
  view.rerender(<App source="A" />);
  expect(notes()).toBe("AB");
  view.rerender(<App source="AB" />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "A" } });
  view.rerender(<App source="A" />);
  expect(notes()).toBe("A");
});

it("drops a route's drafts on navigation but not on an auth remount", () => {
  const store = new DraftStore();
  function Draft() {
    const [text, setText] = useDraft("text", "");
    return <input aria-label="Draft" value={text} onChange={(e) => setText(e.target.value)} />;
  }
  function App({ path, visible = true }: { path: string; visible?: boolean }) {
    return <DraftContext value={store}>{visible && <DraftRoute path={path}><Draft /></DraftRoute>}</DraftContext>;
  }
  const text = () => (screen.getByRole("textbox", { name: "Draft" }) as HTMLInputElement).value;
  const view = render(<App path="/calendar" />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Study group" } });
  view.rerender(<App path="/calendar" visible={false} />);
  view.rerender(<App path="/calendar" />);
  expect(text()).toBe("Study group");
  view.rerender(<App path="/tasks" />);
  view.rerender(<App path="/calendar" />);
  expect(text()).toBe("");
});
