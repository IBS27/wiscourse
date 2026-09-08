import type { MutationCtx } from "../_generated/server";

export async function touchInterpretation(
  ctx: MutationCtx,
  userId: string,
  courseCanvasId: number,
): Promise<void> {
  const state = await ctx.db
    .query("courseInterpretations")
    .withIndex("by_user_course", (q) =>
      q.eq("userId", userId).eq("courseCanvasId", courseCanvasId),
    )
    .unique();
  if (state)
    await ctx.db.patch(state._id, { sourceRevision: state.sourceRevision + 1 });
}
