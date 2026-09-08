// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FilePreview } from "../src/components/course/file-preview";

vi.mock("../src/components/course/pdf-preview", () => ({
  PdfPreview: ({ title }: { title: string }) => (
    <div title={title}>PDF renderer</div>
  ),
}));

const state = vi.hoisted(() => ({ freshUrl: vi.fn(), seen: vi.fn() }));
vi.mock("convex/react", () => ({ useAction: () => state.freshUrl }));
vi.mock("@/lib/seen", () => ({
  useMarkSeenOnMount: (kind: string, id?: number) => state.seen(kind, id),
}));
vi.mock("@/lib/sync-info", () => ({
  useSyncInfo: () => ({ instance: "canvas.wisc.edu" }),
}));
afterEach(() => {
  cleanup();
  state.freshUrl.mockReset();
  state.seen.mockReset();
});

it("resolves and previews a linked file absent from the synced listing", async () => {
  state.freshUrl.mockResolvedValue({
    url: "https://canvas.wisc.edu/reading.pdf",
    size: 20,
    contentType: "application/pdf",
    filename: "reading.pdf",
    displayName: "Linked reading",
  });
  render(<FilePreview file={{ canvasId: 123 }} courseId="1" />);
  expect(await screen.findByTitle("Linked reading")).toBeDefined();
  expect(state.freshUrl).toHaveBeenCalledWith({ fileCanvasId: 123 });
  expect(state.seen).toHaveBeenLastCalledWith("file", 123);
});

it("provides a Canvas fallback without marking failed previews read", async () => {
  state.freshUrl.mockRejectedValue(new Error("File not available"));
  render(<FilePreview file={{ canvasId: 123 }} courseId="1" />);
  expect(await screen.findByText("Preview unavailable")).toBeDefined();
  expect(
    screen.getByRole("link", { name: "Open in Canvas" }).getAttribute("href"),
  ).toBe("https://canvas.wisc.edu/courses/1/files/123");
  expect(state.seen).not.toHaveBeenCalledWith("file", 123);
});
