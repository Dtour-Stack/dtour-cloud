import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolveRole } from "./rbac";

/** List the user's saved workflow templates. */
export const listTemplates = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) return [];
    const rows = await ctx.db
      .query("workflowTemplates")
      .withIndex("by_owner", (q) => q.eq("owner", caller.pubkey))
      .order("desc")
      .collect();
    return rows.map((r) => ({ id: r._id, name: r.name, graph: r.graph, createdAt: r.createdAt }));
  },
});

export const saveTemplate = mutation({
  args: { token: v.string(), name: v.string(), graph: v.string() },
  handler: async (ctx, { token, name, graph }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) throw new Error("Not authenticated");
    if (!name.trim()) throw new Error("Template name is required");
    await ctx.db.insert("workflowTemplates", {
      owner: caller.pubkey,
      name: name.trim(),
      graph,
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

export const removeTemplate = mutation({
  args: { token: v.string(), id: v.id("workflowTemplates") },
  handler: async (ctx, { token, id }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) throw new Error("Not authenticated");
    const row = await ctx.db.get(id);
    if (!row || row.owner !== caller.pubkey) throw new Error("Not found");
    await ctx.db.delete(id);
    return { ok: true };
  },
});
