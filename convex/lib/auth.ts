import type { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";

export async function requireUserId(
  ctx: QueryCtx | MutationCtx | ActionCtx,
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new Error("Not signed in");
  }
  return identity.subject;
}
