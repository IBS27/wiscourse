import { query } from "./_generated/server";
import { activeCourseIds } from "./lib/courses";

const DEFAULT_INSTANCE = "canvas.wisc.edu";

/** The whole ⌘K corpus for one student: titles only, no bodies. */
export const index = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      return {
        courses: [],
        assignments: [],
        pages: [],
        files: [],
        announcements: [],
        modules: [],
      };
    }
    const userId = identity.subject;
    const activeIds = await activeCourseIds(ctx, userId);

    const credential = await ctx.db
      .query("canvasCredentials")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const host = (credential?.instance ?? DEFAULT_INSTANCE)
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "");
    const canvas = (path: string) => `https://${host}/${path}`;

    const courseDocs = await ctx.db
      .query("courses")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const activeCourses = courseDocs.filter((course) =>
      activeIds.has(course.canvasId),
    );

    const perCourse = await Promise.all(
      activeCourses.map(async (course) => {
        const courseCanvasId = course.canvasId;
        const mine = <T>(q: {
          eq: (f: "userId", v: string) => { eq: (f: "courseCanvasId", v: number) => T };
        }) => q.eq("userId", userId).eq("courseCanvasId", courseCanvasId);

        const [assignments, pages, folders, files, discussions, modules] = await Promise.all([
          ctx.db.query("assignments").withIndex("by_user_course", mine).collect(),
          ctx.db.query("pages").withIndex("by_user_course", mine).collect(),
          ctx.db.query("folders").withIndex("by_user_course", mine).collect(),
          ctx.db.query("files").withIndex("by_user_course", mine).collect(),
          ctx.db.query("discussions").withIndex("by_user_course", mine).collect(),
          ctx.db.query("modules").withIndex("by_user_course", mine).collect(),
        ]);
        const folderPaths = new Map(folders.map((folder) => [folder.canvasId, folder.fullName]));

        return {
          assignments: assignments.map((assignment) => ({
            canvasId: assignment.canvasId,
            courseCanvasId,
            name: assignment.name,
            dueAt: assignment.dueAt,
            score:
              assignment.submission?.postedAt === undefined
                ? undefined
                : assignment.submission.score,
            pointsPossible: assignment.pointsPossible,
            htmlUrl: assignment.htmlUrl,
          })),
          pages: pages.map((page) => ({
            canvasId: page.canvasId,
            courseCanvasId,
            title: page.title,
            url: page.url,
            updatedAt: page.updatedAt,
            htmlUrl: page.htmlUrl,
          })),
          files: files.map((file) => ({
            canvasId: file.canvasId,
            courseCanvasId,
            displayName: file.displayName,
            folderCanvasId: file.folderCanvasId,
            folderPath:
              file.folderCanvasId === undefined
                ? undefined
                : folderPaths.get(file.folderCanvasId),
            size: file.size,
            updatedAt: file.updatedAt,
            htmlUrl: canvas(`courses/${courseCanvasId}/files/${file.canvasId}`),
          })),
          announcements: discussions
            .filter((discussion) => discussion.isAnnouncement)
            .map((announcement) => ({
              canvasId: announcement.canvasId,
              courseCanvasId,
              title: announcement.title,
              postedAt: announcement.postedAt,
              htmlUrl: announcement.htmlUrl,
            })),
          modules: modules.map((module) => ({
            canvasId: module.canvasId,
            courseCanvasId,
            name: module.name,
            itemCount: module.itemCount,
            htmlUrl: canvas(`courses/${courseCanvasId}/modules/${module.canvasId}`),
          })),
        };
      }),
    );

    return {
      courses: activeCourses.map((course) => ({
        canvasId: course.canvasId,
        name: course.name,
        courseCode: course.courseCode,
        htmlUrl: canvas(`courses/${course.canvasId}`),
      })),
      assignments: perCourse.flatMap((c) => c.assignments),
      pages: perCourse.flatMap((c) => c.pages),
      files: perCourse.flatMap((c) => c.files),
      announcements: perCourse.flatMap((c) => c.announcements),
      modules: perCourse.flatMap((c) => c.modules),
    };
  },
});
