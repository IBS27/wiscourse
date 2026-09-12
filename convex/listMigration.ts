import { v } from "convex/values";
import { omit } from "convex-helpers";
import { internalMutation } from "./_generated/server";
import { sameValue } from "./lib/equality";
import { summaryTables, summarizeSource, syncListSummary } from "./lib/listSummaries";
import type { Doc } from "./_generated/dataModel";
import type { ListSource } from "./lib/listSummaries";

const sourceTable = v.union(v.literal("courses"), v.literal("assignments"), v.literal("quizzes"), v.literal("discussions"));
const stage = v.union(v.literal("backfill"), v.literal("verify"), v.literal("verifyOrphans"), v.literal("ready"));

/** One bounded, resumable transaction per call. Read current source records
 * inside the mutation so concurrent syncs cannot be overwritten by stale data.
 * Re-run until ready; no watcher, scheduler, or external snapshot is needed. */
export const advance = internalMutation({
  args: { table: sourceTable },
  returns: v.object({ stage, processed: v.number() }),
  handler: async (ctx, { table }) => {
    const state = await ctx.db.query("listMigrations").withIndex("by_table", (q) => q.eq("table", table)).unique();
    const current = state?.stage ?? "backfill";
    if (current === "ready") return { stage: current, processed: state!.processed };
    const target = summaryTables[table];
    const options = { cursor: state?.cursor ?? null, numItems: current === "verifyOrphans" ? 8 : 25, maximumBytesRead: 512 * 1024 };
    const batch = await ctx.db.query(current === "verifyOrphans" ? target : table).paginate(options);
    for (const item of batch.page) {
      if (current === "verifyOrphans") {
        const summary = item as Doc<(typeof summaryTables)[ListSource]>;
        const source = await ctx.db.get(summary.sourceId);
        if (!source || !sameValue(omit(summary, ["_id", "_creationTime"]), summarizeSource(table, source)))
          throw new Error(`Orphan or divergent ${target} record ${summary._id}`);
      } else {
        const source = item as Doc<ListSource>;
        if (current === "backfill") await syncListSummary(ctx, table, source);
        else {
          const summary = await ctx.db.query(target).withIndex("by_user_canvasId", (q) =>
            q.eq("userId", source.userId).eq("canvasId", source.canvasId)).unique();
          if (!summary || !sameValue(omit(summary, ["_id", "_creationTime"]), summarizeSource(table, source)))
            throw new Error(`Missing or divergent ${target} record for ${source._id}`);
        }
      }
    }
    const next = {
      table, processed: (state?.processed ?? 0) + batch.page.length,
      cursor: batch.isDone ? null : batch.continueCursor,
      stage: batch.isDone ? ({ backfill: "verify", verify: "verifyOrphans", verifyOrphans: "ready" } as const)[current] : current,
    };
    if (state) await ctx.db.replace(state._id, next);
    else await ctx.db.insert("listMigrations", next);
    return { stage: next.stage, processed: next.processed };
  },
});

export const setReaderMode = internalMutation({
  args: { compact: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { compact }) => {
    if (compact) {
      for (const table of Object.keys(summaryTables) as ListSource[]) {
        const migration = await ctx.db.query("listMigrations").withIndex("by_table", (q) => q.eq("table", table)).unique();
        if (migration?.stage !== "ready") throw new Error(`Verify ${table} before enabling compact lists`);
      }
    }
    const existing = await ctx.db.query("listRollout").withIndex("by_key", (q) => q.eq("key", "compact-v1")).unique();
    if (!existing) await ctx.db.insert("listRollout", { key: "compact-v1", enabled: compact });
    else if (existing.enabled !== compact) await ctx.db.patch(existing._id, { enabled: compact });
    return null;
  },
});
