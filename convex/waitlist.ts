import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { logEvent } from "./events";
import { requireRole } from "./rbac";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export const applyTester = mutation({
  args: {
    email: v.string(),
    pubkey: v.string(),
    name: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { email, pubkey, name, reason }) => {
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) throw new Error("Enter a valid email address");
    const cleanName = name?.trim();
    const cleanReason = reason?.trim();
    const existing = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", clean))
      .unique();
    const patch = {
      pubkey,
      kind: "dev_tester" as const,
      name: cleanName || undefined,
      reason: cleanReason || undefined,
      at: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      await logEvent(ctx, "waitlist.applyTester", { pubkey, data: { email: clean } });
      return { ok: true, already: true };
    }
    await ctx.db.insert("waitlist", { email: clean, ...patch });
    await logEvent(ctx, "waitlist.applyTester", { pubkey, data: { email: clean } });
    return { ok: true, already: false };
  },
});

export const list = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireRole(ctx, token, "admin");
    const rows = await ctx.db.query("waitlist").collect();
    return rows
      .sort((a, b) => b.at - a.at)
      .map((r) => ({
        email: r.email,
        pubkey: r.pubkey ?? null,
        kind: r.kind ?? "early_access",
        name: r.name ?? null,
        reason: r.reason ?? null,
        at: r.at,
      }));
  },
});

export const approveTester = mutation({
  args: { token: v.string(), email: v.string() },
  handler: async (ctx, { token, email }) => {
    const caller = await requireRole(ctx, token, "admin");
    const clean = email.trim().toLowerCase();
    const row = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", clean))
      .unique();
    if (!row) throw new Error("Application not found");
    if (!row.pubkey) throw new Error("Application is missing a wallet");
    const rowPubkey = row.pubkey;
    const existing = await ctx.db
      .query("whitelist")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", rowPubkey))
      .unique();
    if (existing?.role === "admin" || existing?.role === "super_admin") {
      throw new Error("Wallet already has an admin role");
    }
    const note = row.name
      ? `dev/tester applicant: ${row.name}`
      : "dev/tester applicant";
    if (existing) {
      await ctx.db.patch(existing._id, { role: "dev_tester", note });
    } else {
      await ctx.db.insert("whitelist", {
        pubkey: rowPubkey,
        role: "dev_tester",
        note,
        addedAt: Date.now(),
      });
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", rowPubkey))
      .unique();
    if (user) await ctx.db.patch(user._id, { creatorRewardsEligible: true });
    await ctx.db.delete(row._id);
    await logEvent(ctx, "waitlist.approveTester", {
      pubkey: caller.pubkey,
      data: { email: clean, pubkey: rowPubkey },
    });
    return { ok: true, pubkey: rowPubkey };
  },
});

export const denyTester = mutation({
  args: { token: v.string(), email: v.string(), reason: v.optional(v.string()) },
  handler: async (ctx, { token, email, reason }) => {
    const caller = await requireRole(ctx, token, "admin");
    const clean = email.trim().toLowerCase();
    const row = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", clean))
      .unique();
    if (row) await ctx.db.delete(row._id);
    await logEvent(ctx, "waitlist.denyTester", {
      pubkey: caller.pubkey,
      data: { email: clean, reason: reason?.trim() || undefined },
    });
    return { ok: true, removed: row !== null };
  },
});

export const remove = mutation({
  args: { token: v.string(), email: v.string() },
  handler: async (ctx, { token, email }) => {
    const caller = await requireRole(ctx, token, "admin");
    const row = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", email.trim().toLowerCase()))
      .unique();
    if (row) await ctx.db.delete(row._id);
    await logEvent(ctx, "waitlist.remove", { pubkey: caller.pubkey, data: { email } });
    return { ok: true, removed: row !== null };
  },
});
