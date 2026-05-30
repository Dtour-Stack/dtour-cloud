import { v } from "convex/values";
import { type MutationCtx, type QueryCtx, mutation, query } from "./_generated/server";

async function sessionPubkey(ctx: QueryCtx | MutationCtx, token: string): Promise<string | null> {
  const s = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!s || s.expiresAt < Date.now()) return null;
  return s.pubkey;
}

/** The MCP ids the user has connected. */
export const connected = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) return [];
    const rows = await ctx.db
      .query("mcpConnections")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .collect();
    return rows.map((r) => r.mcp);
  },
});

export const connect = mutation({
  args: { token: v.string(), mcp: v.string() },
  handler: async (ctx, { token, mcp }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) throw new Error("Not signed in");
    const existing = await ctx.db
      .query("mcpConnections")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .collect();
    if (!existing.some((r) => r.mcp === mcp)) {
      await ctx.db.insert("mcpConnections", { pubkey, mcp, at: Date.now() });
    }
    return { ok: true };
  },
});

export const disconnect = mutation({
  args: { token: v.string(), mcp: v.string() },
  handler: async (ctx, { token, mcp }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) throw new Error("Not signed in");
    const rows = await ctx.db
      .query("mcpConnections")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .collect();
    for (const r of rows.filter((x) => x.mcp === mcp)) await ctx.db.delete(r._id);
    return { ok: true };
  },
});
