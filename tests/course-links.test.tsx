// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { Route as FilesRoute } from "../src/routes/courses.$courseId.files";
import { Route as AnnouncementsRoute } from "../src/routes/courses.$courseId.announcements";
import { buildTree } from "../src/components/course/file-tree";
import { previewKind } from "../src/components/course/file-kinds";
import type { Doc } from "../convex/_generated/dataModel";

const state = vi.hoisted(() => ({ query: vi.fn(), mark: vi.fn() }));
vi.mock("convex/react", () => ({
  useQuery: (ref: FunctionReference<"query">, args: unknown) =>
    state.query(getFunctionName(ref), args),
}));
vi.mock("@/lib/hooks", () => ({
  useCourses: () => ({ color: () => "blue", byId: new Map() }),
  courseStyle: () => ({}),
  courseColorVar: () => "blue",
  useNow: () => 0,
  useIsMobile: () => false,
}));
vi.mock("@/lib/seen", () => ({
  useSeen: () => ({ has: () => false }),
  FRESH_MS: 1000,
  useMarkSeenOnMount: (kind: string, id?: number) => state.mark(kind, id),
}));
vi.mock("@/components/course/file-preview", () => ({
  FilePreview: ({ file }: { file: Doc<"files"> }) => (
    <div>Preview {file.displayName}</div>
  ),
  PreviewEmpty: () => <div>No selection</div>,
}));
vi.mock("@/components/course/announcement-row", () => ({
  AnnouncementRow: ({
    announcement,
    open,
  }: {
    announcement: { title: string };
    open: boolean;
  }) => <div>{open ? `Opened ${announcement.title}` : announcement.title}</div>,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  state.query.mockReset();
  state.mark.mockReset();
});

it("previews a linked hidden file even when the visible listing is empty", () => {
  const file: Doc<"files"> = {
    _id: "f" as Doc<"files">["_id"],
    _creationTime: 0,
    userId: "student",
    courseCanvasId: 1,
    canvasId: 123,
    syncedAt: 0,
    hidden: true,
    lockedForUser: false,
    filename: "reading.pdf",
    displayName: "Reading.pdf",
    url: "https://canvas.wisc.edu/f",
    contentType: "application/pdf",
    size: 20,
  };
  const tree = buildTree([], [file]);
  expect(tree.files).toEqual([]);
  expect(tree.filesById.get(123)).toBe(file);
  vi.spyOn(FilesRoute, "useParams").mockReturnValue({ courseId: "1" });
  vi.spyOn(FilesRoute, "useSearch").mockReturnValue({ file: 123 });
  vi.spyOn(FilesRoute, "useNavigate").mockReturnValue(vi.fn());
  state.query.mockReturnValue({ folders: [], files: [file] });
  const Page = FilesRoute.options.component as ComponentType;
  render(<Page />);
  expect(screen.getByText("Preview Reading.pdf")).toBeDefined();
});

it("opens an announcement outside the latest 30 and marks it only after it loads", () => {
  vi.spyOn(AnnouncementsRoute, "useParams").mockReturnValue({ courseId: "1" });
  vi.spyOn(AnnouncementsRoute, "useSearch").mockReturnValue({
    item: "announcement:31",
  });
  vi.spyOn(AnnouncementsRoute, "useNavigate").mockReturnValue(vi.fn());
  const recent = Array.from({ length: 30 }, (_, i) => ({
    canvasId: i + 1,
    title: `Recent ${i + 1}`,
  }));
  state.query.mockImplementation((name: string) =>
    name === "discussions:announcements" ? recent : undefined,
  );
  const Page = AnnouncementsRoute.options.component as ComponentType;
  const { rerender } = render(<Page />);
  expect(state.mark).not.toHaveBeenCalledWith("discussion", 31);
  state.query.mockImplementation((name: string) =>
    name === "discussions:announcements"
      ? recent
      : {
          canvasId: 31,
          courseCanvasId: 1,
          isAnnouncement: true,
          title: "Old announcement",
        },
  );
  rerender(<Page />);
  expect(screen.getByText("Opened Old announcement")).toBeDefined();
  expect(state.mark).toHaveBeenLastCalledWith("discussion", 31);
});

it.each(["png", "jpeg", "gif", "webp", "avif"])(
  "previews %s when Canvas sends a generic content type",
  (ext) => {
    expect(previewKind("application/octet-stream", `image.${ext}`)).toBe(
      "image",
    );
  },
);
