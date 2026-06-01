import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

// ── Admin management (internal — run via `bunx convex run` or the dashboard,
//    NOT callable from the client) ──────────────────────────────────────────

export const add = internalMutation({
  args: { pubkey: v.string(), note: v.optional(v.string()) },
  handler: async (ctx, { pubkey, note }) => {
    const existing = await ctx.db
      .query("whitelist")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    if (existing) {
      if (note !== undefined) await ctx.db.patch(existing._id, { note });
      return { ok: true, already: true };
    }
    await ctx.db.insert("whitelist", { pubkey, note, addedAt: Date.now() });
    return { ok: true, already: false };
  },
});

export const remove = internalMutation({
  args: { pubkey: v.string() },
  handler: async (ctx, { pubkey }) => {
    const row = await ctx.db
      .query("whitelist")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    if (row) await ctx.db.delete(row._id);
    return { ok: true, removed: row !== null };
  },
});

export const list = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("whitelist").collect();
    return rows.map((r) => ({ pubkey: r.pubkey, note: r.note, addedAt: r.addedAt }));
  },
});
