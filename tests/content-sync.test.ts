import { afterEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { CanvasClient } from "../convex/canvas/client";
import {
  courseContentLinks,
  syncCourseContent,
} from "../convex/canvas/syncContent";
import type { ActionCtx } from "../convex/_generated/server";

const base = "https://canvas.wisc.edu/courses/1/pages/home";
afterEach(() => vi.unstubAllGlobals());

it("follows only same-origin, same-course links and handles encoded slugs", () => {
  const links = courseContentLinks(
    `<a href="/courses/1/pages/a%20b">Page</a>
    <a href="/courses/2/pages/other">Other course</a><a href="https://example.com/courses/1/pages/no">External</a>
    <img src="/courses/1/files/4/preview"><a data-api-endpoint="/api/v1/courses/1/files/5">File</a>`,
    base,
    1,
  );
  expect([...links.pages]).toEqual(["a b"]);
  expect([...links.files]).toEqual([4, 5]);
});

function page(slug: string, id: number, body?: string) {
  return {
    page_id: id,
    url: slug,
    title: slug,
    body,
    published: true,
    front_page: slug === "home",
    updated_at: null,
    html_url: `https://canvas.wisc.edu/courses/1/pages/${slug}`,
  };
}

async function run(responses: Record<string, unknown>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const path = new URL(input).pathname.replace("/api/v1", "");
      calls.push(path);
      const data = responses[path];
      return data === undefined
        ? new Response('{"status":"unauthorized"}', { status: 403 })
        : new Response(JSON.stringify(data), { status: 200 });
    }),
  );
  const writes: { name: string; args: Record<string, unknown> }[] = [];
  const runMutation = vi.fn(async (ref, args: Record<string, unknown>) => {
    writes.push({ name: getFunctionName(ref), args });
    return null;
  }) as ActionCtx["runMutation"];
  await syncCourseContent(
    { runMutation } as ActionCtx,
    "student",
    new CanvasClient({
      instance: "canvas.wisc.edu",
      accessToken: "test-token",
    }),
    1,
    { full: true },
  );
  return { calls, writes };
}

describe("content recovery", () => {
  it("recovers a front page, module-linked pages, and syllabus files with disabled listings", async () => {
    const { calls, writes } = await run({
      "/courses/1/modules": [
        {
          id: 1,
          name: "Orientation",
          position: 1,
          items_count: 2,
          items: [
            {
              id: 1,
              module_id: 1,
              position: 1,
              type: "Page",
              title: "Schedule",
              page_url: "schedule",
            },
            {
              id: 2,
              module_id: 1,
              position: 2,
              type: "File",
              title: "Syllabus",
              content_id: 9,
            },
          ],
        },
      ],
      "/courses/1/front_page": page(
        "home",
        1,
        '<a href="/courses/1/pages/schedule">Schedule</a>',
      ),
      "/courses/1/pages/schedule": page(
        "schedule",
        2,
        '<a href="/courses/1/pages/home">Home</a>',
      ),
      "/courses/1/files/9": {
        id: 9,
        display_name: "Syllabus.pdf",
        filename: "syllabus.pdf",
        "content-type": "application/pdf",
        size: 100,
        url: "https://canvas.wisc.edu/files/9/download",
      },
    });
    expect(
      calls.filter((path) => path.endsWith("/pages/schedule")),
    ).toHaveLength(1);
    expect(
      writes.find((w) => w.name === "storeContent:upsertPages")?.args.rows,
    ).toMatchObject([
      { url: "home", isFrontPage: true },
      { url: "schedule", body: expect.stringContaining("Home") },
    ]);
    expect(writes.some((w) => w.name === "storeContent:prunePages")).toBe(
      false,
    );
    expect(
      writes.find((w) => w.name === "storeContent:upsertFiles")?.args,
    ).toMatchObject({ prune: false, rows: [{ canvasId: 9 }] });
  });
  it("fetches omitted bodies and marks denied pages unavailable instead of presenting stale content", async () => {
    const { calls, writes } = await run({
      "/courses/1/modules": [],
      "/courses/1/pages": [page("reading", 1), page("denied", 2)],
      "/courses/1/pages/reading": page("reading", 1, "Reading content"),
    });
    expect(calls).toContain("/courses/1/pages/reading");
    expect(writes).toContainEqual({
      name: "storeContent:markPageUnavailable",
      args: { userId: "student", courseCanvasId: 1, url: "denied" },
    });
    expect(
      writes.find((w) => w.name === "storeContent:prunePages")?.args
        .keepCanvasIds,
    ).toEqual([1, 2]);
  });
  it("propagates throttling instead of treating it as an empty listing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Rate Limit Exceeded", { status: 403 })),
    );
    const mutation = vi.fn();
    await expect(
      syncCourseContent(
        { runMutation: mutation } as unknown as ActionCtx,
        "student",
        new CanvasClient({
          instance: "canvas.wisc.edu",
          accessToken: "test-token",
        }),
        1,
        { full: true },
      ),
    ).rejects.toThrow("rate limit");
    expect(mutation).not.toHaveBeenCalled();
  });
});

it("fetches complete module items when Canvas only inlines part of a module", async () => {
  const { calls, writes } = await run({
    "/courses/1/modules": [
      { id: 1, name: "Module", position: 1, items_count: 2, items: [] },
    ],
    "/courses/1/modules/1/items": [
      { id: 1, position: 1, type: "SubHeader", title: "First" },
      { id: 2, position: 2, type: "SubHeader", title: "Second" },
    ],
  });
  expect(calls).toContain("/courses/1/modules/1/items");
  expect(
    writes.find((w) => w.name === "storeContent:upsertModuleItems")?.args.rows,
  ).toHaveLength(2);
});
