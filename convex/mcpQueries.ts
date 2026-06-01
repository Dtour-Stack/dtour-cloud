import { mcpCallerValidator } from "convex-mcp-gateway";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { FREETOUR_DAILY_CAP, rateLimiter } from "./rateLimits";

/** MCP: free-tier budget for the authenticated caller (Bearer / OAuth identity). */
export const freetourForCaller = query({
  args: { caller: mcpCallerValidator },
  handler: async (ctx, { caller }) => {
    const { value: used } = await rateLimiter.getValue(ctx, "freetourDaily", {
      key: caller.subject,
    });
    return { used, cap: FREETOUR_DAILY_CAP, remaining: Math.max(0, FREETOUR_DAILY_CAP - used) };
  },
});

/** MCP: wallet profile + credit balance for the authenticated caller. */
export const meForCaller = query({
  args: { caller: mcpCallerValidator },
  handler: async (ctx, { caller }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", caller.subject))
      .unique();
    if (!user) return null;
    const credit = await ctx.db
      .query("creditBalances")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", caller.subject))
      .unique();
    return {
      pubkey: caller.subject,
      balance: user.balance,
      plan: user.plan ?? null,
      balanceMicroUsd: credit?.balanceMicroUsd ?? 0,
    };
  },
});
