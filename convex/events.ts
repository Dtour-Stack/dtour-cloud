import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { requireRole } from "./rbac";

/** Fire-and-forget analytics/debug event. Called from mutations. */
export async function logEvent(
  ctx: MutationCtx,
  type: string,
  opts?: { pubkey?: string; data?: unknown },
): Promise<void> {
  await ctx.db.insert("events", {
    type,
    pubkey: opts?.pubkey,
    data: opts?.data !== undefined ? JSON.stringify(opts.data) : undefined,
    at: Date.now(),
  });
}

/** Recent events for the admin debug log (admin+). */
export const recent = query({
  args: { token: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { token, limit }) => {
    await requireRole(ctx, token, "admin");
    const rows = await ctx.db
      .query("events")
      .withIndex("by_at")
      .order("desc")
      .take(limit ?? 50);
    return rows.map((r) => ({
      type: r.type,
      pubkey: r.pubkey ?? null,
      data: r.data ?? null,
      at: r.at,
    }));
  },
});

/** Aggregate counts for the admin analytics overview (admin+). */
export const summary = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireRole(ctx, token, "admin");
    const [users, profiles, whitelist, events] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("profiles").collect(),
      ctx.db.query("whitelist").collect(),
      ctx.db.query("events").withIndex("by_at").order("desc").take(500),
    ]);
    const byType: Record<string, number> = {};
    for (const e of events) byType[e.type] = (byType[e.type] ?? 0) + 1;
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return {
      totalUsers: users.length,
      totalProfiles: profiles.length,
      whitelisted: whitelist.length,
      admins: whitelist.filter((w) => w.role).length,
      eventsByType: byType,
      eventsLast24h: events.filter((e) => e.at >= dayAgo).length,
    };
  },
});
