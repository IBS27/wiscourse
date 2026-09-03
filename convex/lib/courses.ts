import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function activeCourseIds(
  ctx: QueryCtx | MutationCtx,
  userId: string,
): Promise<Set<number>> {
  const courses = await ctx.db
    .query("courses")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return new Set(
    courses
      .filter((course) => (course.enrollmentState ?? "active") === "active")
      .map((course) => course.canvasId),
  );
}
