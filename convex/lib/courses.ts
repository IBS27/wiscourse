import { compactListsEnabled, sourceOrder } from "./listSummaries";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function activeCourseIds(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  compact?: boolean,
): Promise<Set<number>> {
  const courses = await ctx.db
    .query((compact ?? await compactListsEnabled(ctx)) ? "courseSummaries" : "courses")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return new Set(
    courses
      .sort((a, b) => sourceOrder(a) - sourceOrder(b))
      .filter((course) => (course.enrollmentState ?? "active") === "active")
      .map((course) => course.canvasId),
  );
}
