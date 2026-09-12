import type { TestConvex } from "convex-test";
import type schema from "../convex/schema";
import { internal } from "../convex/_generated/api";
import { summaryTables, type ListSource } from "../convex/lib/listSummaries";

export async function enableCompactLists(t: TestConvex<typeof schema>) {
  const totals = { bytesRead: 0, bytesWritten: 0, documentsWritten: 0, executions: 0 };
  for (const table of Object.keys(summaryTables) as ListSource[]) {
    for (let batch = 0; ; batch++) {
      if (batch > 500) throw new Error("Migration failed to finish");
      const result = await t.mutation(async (ctx) => {
        const progress = await ctx.runMutation(internal.listMigration.advance, { table });
        const metrics = await ctx.meta.getTransactionMetrics();
        totals.bytesRead += metrics.bytesRead.used;
        totals.bytesWritten += metrics.bytesWritten.used;
        totals.documentsWritten += metrics.documentsWritten.used;
        totals.executions++;
        return progress;
      });
      if (result.stage === "ready") break;
    }
  }
  await t.mutation(internal.listMigration.setReaderMode, { compact: true });
  return totals;
}
