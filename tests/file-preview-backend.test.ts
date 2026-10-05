import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import type { ActionCtx } from "../convex/_generated/server";
const mock = vi.hoisted(() => ({ get: vi.fn(), sessions: vi.fn() }));
vi.mock("../convex/credentials", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../convex/credentials")>()),
  getCanvasClient: async (ctx: ActionCtx, userId: string) => {
    mock.sessions(userId);
    const credential = await ctx.runQuery(internal.credentials.getForUser, {
      userId,
    });
    return {
      client: { get: mock.get },
      identity: credential && {
        credentialId: credential._id,
        revision: credential.revision ?? 0,
      },
    };
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

const prepare = (t: Convex, subject: string) =>
  t.withIdentity({ subject }).action(api.filePreview.pdf, { fileCanvasId: 10 });

async function view(t: Convex, subject: string) {
  const result = await prepare(t, subject);
  if (result.status !== "ready") throw new Error(result.status);
  return result.url;
}

const entries = (t: Convex) =>
  t.run((ctx) => ctx.db.query("pdfPreviews").collect());

const blobs = (t: Convex) =>
  t.run((ctx) => ctx.db.system.query("_storage").collect());

async function credential(t: Convex, userId: string) {
  const row = await t.query(internal.credentials.getForUser, { userId });
  return row!;
}

/** Serves the PDF only after `during` runs, as if mid-download. */
function stubPdfDuring(during: () => Promise<void>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      await during();
      return new Response("%PDF-1.7\nold host");
    }),
  );
}

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
  expect(await pdfUrl("student")).toEqual({ url, size: 20, updatedAt: 1000 });
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

it("does not cache bytes read before a reconnect to another instance", async () => {
  const t = await setup();
  stubPdfDuring(async () => {
    const row = await credential(t, "student");
    await t.run((ctx) =>
      ctx.db.patch(row._id, { instance: "evil.example", revision: 1 }),
    );
  });
  await expect(view(t, "student")).rejects.toThrow("connection changed");
  expect(await entries(t)).toHaveLength(0);
  expect(await blobs(t)).toHaveLength(0);
});

it("does not cache bytes read before a disconnect and reconnect", async () => {
  const t = await setup();
  stubPdfDuring(async () => {
    const row = await credential(t, "student");
    await t.run(async (ctx) => {
      await ctx.db.delete(row._id);
      await ctx.db.insert("canvasCredentials", {
        userId: row.userId,
        instance: row.instance,
        kind: row.kind,
        accessTokenEncrypted: row.accessTokenEncrypted,
        status: "active",
      });
    });
  });
  await expect(view(t, "student")).rejects.toThrow("connection changed");
  expect(await entries(t)).toHaveLength(0);
  expect(await blobs(t)).toHaveLength(0);
});

it("serves a cached version only to the token that confirmed it", async () => {
  const t = await setup();
  stubPdf();
  const url = await view(t, "student");
  const row = await credential(t, "student");
  const lookup = (revision: number) =>
    t.query(internal.pdfCache.lookup, {
      userId: "student",
      credential: { credentialId: row._id, revision },
      fileCanvasId: 10,
      size: 20,
      updatedAt: 1000,
    });
  expect(await lookup(0)).toBe(url);
  await t.run((ctx) => ctx.db.patch(row._id, { revision: 1 }));
  expect(await lookup(0)).toBeNull();
  expect(await lookup(1)).toBe(url);
  await t.run((ctx) => ctx.db.patch(row._id, { status: "invalid" }));
  expect(await lookup(1)).toBeNull();
});

it("keeps one blob when a concurrent miss stored the same version", async () => {
  const t = await setup();
  stubPdf();
  const first = await view(t, "student");
  const row = await credential(t, "student");
  const storageId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["%PDF-1.7\n"])),
  );
  const url = await t.mutation(internal.pdfCache.record, {
    userId: "student",
    credential: { credentialId: row._id, revision: 0 },
    fileCanvasId: 10,
    size: 20,
    updatedAt: 1000,
    storageId,
  });
  expect(url).toBe(first);
  expect(await entries(t)).toHaveLength(1);
  expect(await blobs(t)).toHaveLength(1);
});

it("waits for a running sync instead of caching synced metadata", async () => {
  const t = await setup();
  const fetch = stubPdf();
  await t.mutation(internal.syncStore.claimSync, {
    userId: "student",
    full: true,
  });
  expect(await prepare(t, "student")).toEqual({ status: "busy" });
  expect(mock.get).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(await entries(t)).toHaveLength(0);
  // The download link still falls back to the synced listing.
  const file = await t
    .withIdentity({ subject: "student" })
    .action(api.files.freshUrl, { fileCanvasId: 10 });
  expect(file).toMatchObject({ size: 20, updatedAt: 1000 });
});
