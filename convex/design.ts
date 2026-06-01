import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { designScope, designTimeline } from "./designTimeline";
import { resolveRole } from "./rbac";

const DEFAULT_NAME = "Untitled";

/** Load the user's saved doc for a surface ("canvas" | "workflow"). */
export const getDoc = query({
  args: { token: v.string(), kind: v.string() },
  handler: async (ctx, { token, kind }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) return null;
    const row = await ctx.db
      .query("designDocs")
      .withIndex("by_owner_kind", (q) =>
        q.eq("owner", caller.pubkey).eq("kind", kind).eq("name", DEFAULT_NAME),
      )
      .unique();
    return row ? { data: row.data, updatedAt: row.updatedAt } : null;
  },
});

/** Upsert the user's doc for a surface. data is JSON-serialized state. */
export const saveDoc = mutation({
  args: { token: v.string(), kind: v.string(), data: v.string() },
  handler: async (ctx, { token, kind, data }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) throw new Error("Not authenticated");
    const existing = await ctx.db
      .query("designDocs")
      .withIndex("by_owner_kind", (q) =>
        q.eq("owner", caller.pubkey).eq("kind", kind).eq("name", DEFAULT_NAME),
      )
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { data, updatedAt: now });
    } else {
      await ctx.db.insert("designDocs", {
        owner: caller.pubkey,
        kind,
        name: DEFAULT_NAME,
        data,
        updatedAt: now,
      });
    }
    await designTimeline.push(ctx, designScope(caller.pubkey, kind), { data });
    return { ok: true, updatedAt: now };
  },
});
