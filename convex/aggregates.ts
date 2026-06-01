import { DirectAggregate } from "@convex-dev/aggregate";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";
import { requireRole } from "./rbac";

const PLATFORM_KEY = "__platform__";

/** O(log n) rollups for admin / usage dashboards (keyed by pubkey). */
export const inferenceSpendMicro = new DirectAggregate<{
  Key: string;
  Id: string;
}>(components.aggregate);

export const recordInferenceSpend = internalMutation({
  args: {
    pubkey: v.string(),
    refId: v.string(),
    priceMicroUsd: v.number(),
  },
  handler: async (ctx, { pubkey, refId, priceMicroUsd }) => {
    if (priceMicroUsd <= 0) return;
    await inferenceSpendMicro.insertIfDoesNotExist(ctx, {
      key: pubkey,
      id: `${refId}:user`,
      sumValue: priceMicroUsd,
    });
    await inferenceSpendMicro.insertIfDoesNotExist(ctx, {
      key: PLATFORM_KEY,
      id: `${refId}:platform`,
      sumValue: priceMicroUsd,
    });
  },
});

/** Backfill aggregates from `inferenceUsage` (admin, idempotent). */
export const rebuildFromLedger = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireRole(ctx, token, "admin");
    const rows = await ctx.db.query("inferenceUsage").collect();
    let inserted = 0;
    for (const r of rows) {
      if (r.priceMicroUsd <= 0 || r.free) continue;
      await inferenceSpendMicro.insertIfDoesNotExist(ctx, {
        key: r.pubkey,
        id: `${r.refId}:user`,
        sumValue: r.priceMicroUsd,
      });
      await inferenceSpendMicro.insertIfDoesNotExist(ctx, {
        key: PLATFORM_KEY,
        id: `${r.refId}:platform`,
        sumValue: r.priceMicroUsd,
      });
      inserted += 1;
    }
    return { scanned: rows.length, inserted };
  },
});
