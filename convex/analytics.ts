import { v } from "convex/values";
import { type QueryCtx, query } from "./_generated/server";

const USD = 1_000_000;

async function sessionPubkey(ctx: QueryCtx, token: string): Promise<string | null> {
  const s = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!s || s.expiresAt < Date.now()) return null;
  return s.pubkey;
}

/** Per-user usage overview from the coding-usage ledger + agents. Bounded. */
export const overview = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) return null;

    const usage = await ctx.db
      .query("codingUsage")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .collect();
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_owner", (q) => q.eq("owner", pubkey))
      .collect();

    const totalSpendMicro = usage.reduce((s, u) => s + (u.priceMicroUsd ?? 0), 0);
    const recent = usage
      .slice()
      .sort((a, b) => b.at - a.at)
      .slice(0, 12)
      .map((u) => ({
        type: "coding session",
        at: u.at,
        detail: `${Math.round(u.durationSec)}s · $${(u.priceMicroUsd / USD).toFixed(3)}`,
      }));

    return {
      sessions: usage.length,
      totalSpendUsd: totalSpendMicro / USD,
      agents: agents.length,
      recentActivity: recent,
    };
  },
});
