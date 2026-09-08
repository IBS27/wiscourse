import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
const mock = vi.hoisted(() => ({ get: vi.fn(), sessions: vi.fn() }));
vi.mock("../convex/credentials", () => ({
  getCanvasClient: async (_ctx: unknown, userId: string) => {
    mock.sessions(userId);
    return { client: { get: mock.get } };
  },
}));
const modules = import.meta.glob("../convex/**/*.{ts,js}");
afterEach(() => {
  vi.unstubAllGlobals();
  mock.get.mockReset();
  mock.sessions.mockReset();
});
async function setup() {
  const t = convexTest(schema, modules);
  await t.run((ctx) =>
    ctx.db.insert("files", {
      userId: "student",
      courseCanvasId: 1,
      canvasId: 10,
      displayName: "Lecture",
      filename: "lecture.pdf",
      contentType: "application/pdf",
      size: 20,
      url: "https://example.com/file",
      syncedAt: 0,
    }),
  );
  mock.get.mockResolvedValue({
    id: 10,
    url: "https://example.com/file",
    "content-type": "application/pdf",
    size: 20,
    filename: "lecture.pdf",
    display_name: "Lecture",
  });
  return t;
}
it("returns PDF bytes despite a forced-download header", async () => {
  const t = await setup();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response("%PDF-1.7\ncontent", {
        headers: { "Content-Disposition": "attachment" },
      }),
    ),
  );
  const bytes = await t
    .withIdentity({ subject: "student" })
    .action(api.filePreview.pdf, { fileCanvasId: 10 });
  expect(new TextDecoder().decode(bytes)).toContain("%PDF-1.7");
});
it("uses the requesting user’s Canvas credentials for unlisted files", async () => {
  const t = await setup();
  mock.get.mockRejectedValue(new Error("File not available"));
  await expect(
    t
      .withIdentity({ subject: "other" })
      .action(api.filePreview.pdf, { fileCanvasId: 10 }),
  ).rejects.toThrow("File not available");
  expect(mock.sessions).toHaveBeenCalledWith("other");
});
it("rejects login HTML masquerading as a PDF", async () => {
  const t = await setup();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("<html>Login</html>")),
  );
  await expect(
    t
      .withIdentity({ subject: "student" })
      .action(api.filePreview.pdf, { fileCanvasId: 10 }),
  ).rejects.toThrow("not a PDF");
});
