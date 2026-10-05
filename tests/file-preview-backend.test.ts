import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
const mock = vi.hoisted(() => ({ get: vi.fn(), sessions: vi.fn() }));
vi.mock("../convex/credentials", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../convex/credentials")>()),
  getCanvasClient: async (_ctx: unknown, userId: string) => {
    mock.sessions(userId);
    return { client: { get: mock.get } };
  },
}));
const modules = import.meta.glob("../convex/**/*.{ts,js}");
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  mock.get.mockReset();
  mock.sessions.mockReset();
});

type Convex = ReturnType<typeof convexTest>;

async function addUser(
  t: Convex,
  userId: string,
  file: Partial<Doc<"files">> | null = {},
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("canvasCredentials", {
      userId,
      instance: "canvas.wisc.edu",
      kind: "manual",
      accessTokenEncrypted: "unused",
      status: "active",
    });
    if (file === null) return;
    await ctx.db.insert("files", {
      userId,
      courseCanvasId: 1,
      canvasId: 10,
      displayName: "Lecture",
      filename: "lecture.pdf",
      contentType: "application/pdf",
      size: 20,
      url: "https://example.com/file",
      updatedAt: 1000,
      syncedAt: 0,
      ...file,
    });
  });
}

function canvasFile(size = 20, updatedAt = "1970-01-01T00:00:01Z") {
  mock.get.mockResolvedValue({
    id: 10,
    url: "https://example.com/file",
    "content-type": "application/pdf",
    size,
    filename: "lecture.pdf",
    display_name: "Lecture",
    updated_at: updatedAt,
  });
}

async function setup() {
  const t = convexTest(schema, modules);
  await addUser(t, "student");
  canvasFile();
  return t;
}

function stubPdf(body = "%PDF-1.7\ncontent") {
  const fetch = vi.fn(
    async () =>
      new Response(body, { headers: { "Content-Disposition": "attachment" } }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const view = (t: Convex, subject: string) =>
  t.withIdentity({ subject }).action(api.filePreview.pdf, { fileCanvasId: 10 });

const entries = (t: Convex) =>
  t.run((ctx) => ctx.db.query("pdfPreviews").collect());

it("stores the PDF and returns its URL despite a forced-download header", async () => {
  const t = await setup();
  stubPdf();
  const url = await view(t, "student");
  const [entry] = await entries(t);
  expect(entry).toMatchObject({
    instance: "canvas.wisc.edu",
    fileCanvasId: 10,
    size: 20,
    updatedAt: 1000,
  });
  expect(url).toBe(await t.run((ctx) => ctx.storage.getUrl(entry.storageId)));
  const text = await t.run(
    async (ctx) => (await ctx.storage.get(entry.storageId))?.text() ?? null,
  );
  expect(text).toContain("%PDF-1.7");
});

it("serves another user on the same instance from the cache", async () => {
  const t = await setup();
  await addUser(t, "classmate");
  const fetch = stubPdf();
  const first = await view(t, "student");
  const second = await view(t, "classmate");
  expect(second).toBe(first);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(mock.sessions).toHaveBeenCalledWith("classmate");
});

it("pdfUrl returns the cached URL only to users who can see the file", async () => {
  const t = await setup();
  await addUser(t, "stranger", null);
  await addUser(t, "locked", { lockedForUser: true });
  const pdfUrl = (subject: string) =>
    t.withIdentity({ subject }).query(api.pdfCache.pdfUrl, { fileCanvasId: 10 });
  expect(await pdfUrl("student")).toBeNull();
  stubPdf();
  const url = await view(t, "student");
  expect(await pdfUrl("student")).toBe(url);
  expect(await t.query(api.pdfCache.pdfUrl, { fileCanvasId: 10 })).toBeNull();
  expect(await pdfUrl("stranger")).toBeNull();
  expect(await pdfUrl("locked")).toBeNull();
});

it("replaces an older version and deletes its blob", async () => {
  const t = await setup();
  stubPdf();
  await view(t, "student");
  const [old] = await entries(t);
  canvasFile(30, "1970-01-01T00:00:02Z");
  stubPdf("%PDF-1.7\nnew content");
  await view(t, "student");
  const current = await entries(t);
  expect(current).toHaveLength(1);
  expect(current[0]).toMatchObject({ size: 30, updatedAt: 2000 });
  expect(await t.run((ctx) => ctx.db.system.get(old.storageId))).toBeNull();
});

it("evicts previews stored more than 45 days ago", async () => {
  vi.useFakeTimers();
  const t = await setup();
  stubPdf();
  await view(t, "student");
  const [entry] = await entries(t);
  vi.advanceTimersByTime(44 * 24 * 60 * 60 * 1000);
  await t.mutation(internal.pdfCache.evict, {});
  expect(await entries(t)).toHaveLength(1);
  vi.advanceTimersByTime(2 * 24 * 60 * 60 * 1000);
  await t.mutation(internal.pdfCache.evict, {});
  expect(await entries(t)).toHaveLength(0);
  expect(await t.run((ctx) => ctx.db.system.get(entry.storageId))).toBeNull();
});

it("uses the requesting user’s Canvas credentials for unlisted files", async () => {
  const t = await setup();
  mock.get.mockRejectedValue(new Error("File not available"));
  await expect(view(t, "other")).rejects.toThrow("File not available");
  expect(mock.sessions).toHaveBeenCalledWith("other");
});

it("rejects login HTML masquerading as a PDF", async () => {
  const t = await setup();
  stubPdf("<html>Login</html>");
  await expect(view(t, "student")).rejects.toThrow("not a PDF");
  expect(await entries(t)).toHaveLength(0);
});
