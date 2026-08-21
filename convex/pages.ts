import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/** A page row minus its HTML body — what a list of pages needs. */
type PageSummary = Omit<Doc<"pages">, "body">;

function summarize(page: Doc<"pages">): PageSummary {
  return {
    _id: page._id,
    _creationTime: page._creationTime,
    userId: page.userId,
    courseCanvasId: page.courseCanvasId,
    canvasId: page.canvasId,
    syncedAt: page.syncedAt,
    url: page.url,
    title: page.title,
    isFrontPage: page.isFrontPage,
    published: page.published,
    updatedAt: page.updatedAt,
    htmlUrl: page.htmlUrl,
    lockedForUser: page.lockedForUser,
  };
}

/**
 * Page index for a course. Bodies are stripped: a course can hold dozens
 * of pages of HTML and the list only needs titles. Use `get` for one page.
 */
export const listByCourse = query({
  args: { courseCanvasId: v.number() },
  handler: async (ctx, args): Promise<PageSummary[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return [];
    const pages = await ctx.db
      .query("pages")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", identity.subject).eq("courseCanvasId", args.courseCanvasId),
      )
      .collect();
    return pages
      .sort((a, b) => {
        if (a.isFrontPage !== b.isFrontPage) return a.isFrontPage ? -1 : 1;
        return a.title.localeCompare(b.title);
      })
      .map(summarize);
  },
});

/** One page by its Canvas slug — the stable key Canvas uses in links. */
export const get = query({
  args: { courseCanvasId: v.number(), url: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    return await ctx.db
      .query("pages")
      .withIndex("by_user_course_url", (q) =>
        q
          .eq("userId", identity.subject)
          .eq("courseCanvasId", args.courseCanvasId)
          .eq("url", args.url),
      )
      .unique();
  },
});
