import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { logEvent } from "./events";
import { requireRole } from "./rbac";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Join the waitlist. Public (no auth) — anyone without $DTOUR can sign up.
 *  Idempotent by email; backfills the wallet if one is connected this time. */
export const join = mutation({
  args: { email: v.string(), pubkey: v.optional(v.string()) },
  handler: async (ctx, { email, pubkey }) => {
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) throw new Error("Enter a valid email address");

    const existing = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", clean))
      .unique();
    if (existing) {
      if (pubkey && !existing.pubkey) {
        await ctx.db.patch(existing._id, { pubkey });
      }
      return { ok: true, already: true };
    }

    await ctx.db.insert("waitlist", { email: clean, pubkey, at: Date.now() });
    await logEvent(ctx, "waitlist.join", { pubkey, data: { email: clean } });
    return { ok: true, already: false };
  },
});

/** Admin: list waitlist entries, newest first. */
export const list = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireRole(ctx, token, "admin");
    const rows = await ctx.db.query("waitlist").collect();
    return rows
      .sort((a, b) => b.at - a.at)
      .map((r) => ({ email: r.email, pubkey: r.pubkey ?? null, at: r.at }));
  },
});
