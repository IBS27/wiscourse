// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import type { ReactNode } from "react";
import { SubmissionPanel } from "../src/components/todo/submission-panel";
import { DraftContext, DraftStore } from "../src/lib/drafts";
import type { TodoItem } from "../convex/todos";
import type { OutboxView } from "../convex/submissions";

const mocks = vi.hoisted(() => ({ panel: undefined as unknown, mutations: new Map<string, ReturnType<typeof vi.fn>>() }));
vi.mock("convex/react", () => ({
  useQuery: () => mocks.panel,
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(ref);
    if (!mocks.mutations.has(name)) mocks.mutations.set(name, vi.fn());
    return mocks.mutations.get(name);
  },
}));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a> }));
vi.mock("@/lib/hooks", () => ({ useNow: () => Date.UTC(2026, 8, 30, 15) }));
afterEach(() => { cleanup(); mocks.mutations.clear(); });

const item = { key: "assignment:1", kind: "assignment", canvasId: 1, title: "Essay", dueAt: Date.UTC(2026, 9, 2), submission: "unsubmitted", subtasks: [] } as TodoItem;
const panel = (outbox: Partial<OutboxView> | null = null, credential = "active") => ({
  credential, kinds: ["text", "url"], canvasOnly: false, outbox: outbox && { id: "row", kind: "text", text: "Draft", ...outbox },
});
const submit = () => mocks.mutations.get("submissions:submit")!;
const show = () => render(<DraftContext value={new DraftStore()}><SubmissionPanel item={item} /></DraftContext>);

it("sends nothing until the student confirms, and reuses the key when confirming again", async () => {
  mocks.panel = panel();
  show();
  fireEvent.click(screen.getByRole("button", { name: "Submit…" }));
  fireEvent.change(screen.getByLabelText("Submission text"), { target: { value: "My answer" } });
  fireEvent.click(screen.getByRole("button", { name: "Review submission" }));
  expect(screen.getByRole("dialog").textContent).toContain("My answer");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(submit()).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Review submission" }));
  submit().mockRejectedValueOnce(new ConvexError("A submission for this assignment is already in progress."));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Submit to Canvas" })));
  expect(screen.getByRole("alert").textContent).toContain("already in progress");
  submit().mockResolvedValueOnce("row");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Submit to Canvas" })));

  expect(submit()).toHaveBeenCalledTimes(2);
  const [first, second] = submit().mock.calls.map((call) => call[0] as { clientKey: string });
  expect(second).toEqual({ clientKey: first.clientKey, assignmentCanvasId: 1, content: { kind: "text", text: "My answer" }, confirmed: true });
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("offers a check, and a resend only through a warned confirmation, while Canvas may have it", async () => {
  mocks.panel = panel({ status: "unconfirmed", errorKind: "exhausted", error: "Canvas has not shown this submission yet." });
  show();
  expect(screen.getByRole("button", { name: "Check Canvas again" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Submit…|Try again/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Send again…" }));
  expect(screen.getByRole("dialog").textContent).toContain("could make a second");
  const sendAgain = mocks.mutations.get("submissions:sendAgain")!;
  expect(sendAgain).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(sendAgain).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Send again…" }));
  sendAgain.mockResolvedValueOnce(null);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Submit to Canvas" })));
  expect(sendAgain).toHaveBeenCalledExactlyOnceWith({ id: "row", confirmed: true });
});

it("sends a student to reconnect instead of offering a retry", () => {
  mocks.panel = panel({ status: "failed", errorKind: "reconnect", error: "Canvas needs to be reconnected." }, "invalid");
  show();
  expect(screen.getAllByRole("link", { name: /Reconnect in Settings/ }).length).toBeGreaterThan(0);
  expect(screen.queryByRole("button", { name: /Try again|Submit…/ })).toBeNull();
});
