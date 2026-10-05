// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { PdfPreview } from "../src/components/course/pdf-preview";

const state = vi.hoisted(() => ({
  cached: undefined as
    | { url: string; size: number; updatedAt?: number }
    | null
    | undefined,
  prepare: vi.fn(),
  open: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useQuery: () => state.cached,
  useAction: () => state.prepare,
}));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: ({ url }: { url: string }) => {
    state.open(url);
    return {
      // The page count tells which document is on screen.
      promise: Promise.resolve({
        numPages: url.includes("new") ? 2 : 1,
        getPage: () => new Promise(() => {}),
      }),
      destroy: async () => {},
    };
  },
}));

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  state.cached = undefined;
  state.prepare.mockReset();
  state.open.mockReset();
});

const old = { size: 20, updatedAt: 1000 };

it("renders the synced cache at once, then the version Canvas confirms", async () => {
  state.cached = { url: "https://cache/old-1.pdf", ...old };
  state.prepare.mockResolvedValue({ status: "ready", url: "https://cache/new-1.pdf" });
  const view = render(<PdfPreview fileCanvasId={10} title="Notes" deferFetch />);
  expect(await screen.findByLabelText("Notes, 1 pages")).toBeDefined();
  expect(state.prepare).not.toHaveBeenCalled();

  view.rerender(
    <PdfPreview fileCanvasId={10} title="Notes" version={{ size: 30, updatedAt: 2000 }} deferFetch={false} />,
  );
  expect(screen.queryByLabelText("Notes, 1 pages")).toBeNull();
  expect(await screen.findByLabelText("Notes, 2 pages")).toBeDefined();
  expect(state.prepare).toHaveBeenCalledWith({ fileCanvasId: 10 });
  expect(state.open).toHaveBeenLastCalledWith("https://cache/new-1.pdf");
});

it("keeps the synced cache when Canvas confirms its version", async () => {
  state.cached = { url: "https://cache/old-2.pdf", ...old };
  render(<PdfPreview fileCanvasId={10} title="Notes" version={old} deferFetch={false} />);
  expect(await screen.findByLabelText("Notes, 1 pages")).toBeDefined();
  expect(state.prepare).not.toHaveBeenCalled();
});

it("asks again while a sync holds Canvas", async () => {
  vi.useFakeTimers();
  state.cached = null;
  state.prepare
    .mockResolvedValueOnce({ status: "busy" })
    .mockResolvedValueOnce({ status: "ready", url: "https://cache/new-3.pdf" });
  render(<PdfPreview fileCanvasId={10} title="Notes" version={old} deferFetch={false} />);
  await act(async () => {});
  expect(state.prepare).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("status").textContent).toContain("Loading PDF");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(state.prepare).toHaveBeenCalledTimes(2);
  expect(screen.getByLabelText("Notes, 2 pages")).toBeDefined();
});
