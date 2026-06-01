import { v } from "convex/values";
import { query } from "./_generated/server";
import { inferenceSpendMicro } from "./aggregates";
import { requireRole } from "./rbac";

const USD = 1_000_000;
const PLATFORM_KEY = "__platform__";

function exactKeyBounds(key: string) {
  return {
    lower: { key, inclusive: true as const },
    upper: { key, inclusive: true as const },
  };
}

/** Admin dashboard: O(log n) inference rollups from the aggregate component. */
export const inferenceRollup = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireRole(ctx, token, "admin");

    const [platformMicro, platformCalls] = await Promise.all([
      inferenceSpendMicro.sum(ctx, { bounds: exactKeyBounds(PLATFORM_KEY) }),
      inferenceSpendMicro.count(ctx, { bounds: exactKeyBounds(PLATFORM_KEY) }),
    ]);

    const users = await ctx.db.query("users").collect();
    const samples = users.slice(0, 200);
    const rows = await Promise.all(
      samples.map(async (u) => {
        const bounds = exactKeyBounds(u.pubkey);
        const [spendMicro, calls] = await Promise.all([
          inferenceSpendMicro.sum(ctx, { bounds }),
          inferenceSpendMicro.count(ctx, { bounds }),
        ]);
        return { pubkey: u.pubkey, spendUsd: spendMicro / USD, calls };
      }),
    );
    const topSpenders = rows
      .filter((r) => r.calls > 0)
      .sort((a, b) => b.spendUsd - a.spendUsd)
      .slice(0, 12);

    return {
      platform: {
        spendUsd: platformMicro / USD,
        paidCalls: platformCalls,
      },
      topSpenders,
      note:
        users.length > samples.length
          ? `Top spenders from first ${samples.length} of ${users.length} users. Run aggregates:rebuildFromLedger to backfill historical paid usage.`
          : undefined,
    };
  },
});
