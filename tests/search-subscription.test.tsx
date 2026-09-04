// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { CommandPalette } from "../src/components/search/command-palette";

const state = vi.hoisted(() => ({
  paginated: vi.fn(),
  recents: vi.fn(),
  loadMore: vi.fn(),
}));
vi.mock("convex/react", () => ({
  usePaginatedQuery: (...args: unknown[]) => {
    state.paginated(...args);
    return { results: [], status: "Exhausted", loadMore: state.loadMore };
  },
  useQuery: (...args: unknown[]) => state.recents(...args),
}));
vi.mock("@tanstack/react-router", () => ({ useParams: () => ({}) }));
vi.mock("@/lib/hooks", () => ({ useIsMobile: () => false }));
vi.mock("@/components/search/palette", () => ({
  Palette: ({ onClose }: { onClose: () => void }) => (
    <button onClick={onClose}>Close palette</button>
  ),
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogDescription: () => null,
  DialogTitle: () => null,
}));
afterEach(cleanup);

it("unsubscribes from search and recents after closing the palette", () => {
  render(<CommandPalette />);
  expect(state.paginated.mock.lastCall?.[1]).toBe("skip");
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  expect(state.paginated.mock.lastCall?.[1]).toEqual({});
  expect(state.recents.mock.lastCall?.[1]).toEqual({ limit: 24 });
  fireEvent.click(screen.getByText("Close palette"));
  expect(state.paginated.mock.lastCall?.[1]).toBe("skip");
  expect(state.recents.mock.lastCall?.[1]).toBe("skip");
});
