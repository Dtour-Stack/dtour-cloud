import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { getTierThresholds } from "./config_read";
import { logEvent } from "./events";
import { requireRole, resolveRole } from "./rbac";
import { baseSwerveTag, tierFromBalance } from "./roles";

/** Caller's own role — lets the frontend show/hide admin UI. */
export const myRole = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const caller = await resolveRole(ctx, token);
    return caller?.role ?? null;
  },
});

/** All users (everyone who has signed in) + metrics. Admin+ only. */
export const users = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireRole(ctx, token, "admin");
    const [allUsers, profiles, whitelist] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("profiles").collect(),
      ctx.db.query("whitelist").collect(),
    ]);
    const profileBy = new Map(profiles.map((p) => [p.pubkey, p]));
    const wlBy = new Map(whitelist.map((w) => [w.pubkey, w]));
    const thresholds = await getTierThresholds(ctx);
    return allUsers
      .map((u) => {
        const p = profileBy.get(u.pubkey);
        const role = wlBy.get(u.pubkey)?.role ?? tierFromBalance(u.balance, thresholds);
        return {
          pubkey: u.pubkey,
          balance: u.balance,
          lastLoginAt: u.lastLoginAt,
          username: p?.username ?? null,
          email: p?.email ?? null,
          avatarUrl: p?.avatarUrl ?? null,
          role,
          swerveTags: Array.from(
            new Set([baseSwerveTag(role), ...(p?.swerveTags ?? [])]),
          ),
          customTags: p?.swerveTags ?? [],
        };
      })
      .sort((a, b) => (b.lastLoginAt ?? 0) - (a.lastLoginAt ?? 0));
  },
});

/** Admin edits any user's profile (incl. custom swerve tags). Admin+ only. */
export const editProfile = mutation({
  args: {
    token: v.string(),
    pubkey: v.string(),
    username: v.optional(v.string()),
    email: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    swerveTags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { token, pubkey, username, email, avatarUrl, swerveTags }) => {
    const caller = await requireRole(ctx, token, "admin");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    if (!profile) throw new Error("That wallet has no profile yet");
    const patch: Record<string, unknown> = {};
    if (username !== undefined) patch.username = username.trim();
    if (email !== undefined) patch.email = email.trim();
    if (avatarUrl !== undefined) patch.avatarUrl = avatarUrl.trim() || undefined;
    if (swerveTags !== undefined) patch.swerveTags = swerveTags;
    await ctx.db.patch(profile._id, patch);
    await logEvent(ctx, "admin.editProfile", { pubkey: caller.pubkey, data: { pubkey } });
    return { ok: true };
  },
});

/** Whitelist entries (admins + team). Admin+ only. */
export const members = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireRole(ctx, token, "admin");
    const [rows, users] = await Promise.all([
      ctx.db.query("whitelist").collect(),
      ctx.db.query("users").collect(),
    ]);
    const planBy = new Map(users.map((u) => [u.pubkey, u.plan ?? null]));
    return rows
      .map((r) => ({
        pubkey: r.pubkey,
        role: r.role ?? null,
        note: r.note ?? null,
        addedAt: r.addedAt,
        plan: planBy.get(r.pubkey) ?? null,
      }))
      .sort((a, b) => b.addedAt - a.addedAt);
  },
});

/** Bootstrap the owner as super_admin. CLI/admin-key only (internal). */
export const bootstrapSuperAdmin = internalMutation({
  args: { pubkey: v.string(), note: v.optional(v.string()) },
  handler: async (ctx, { pubkey, note }) => {
    const existing = await ctx.db
      .query("whitelist")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        role: "super_admin",
        note: note ?? existing.note ?? "owner",
      });
    } else {
      await ctx.db.insert("whitelist", {
        pubkey,
        role: "super_admin",
        note: note ?? "owner",
        addedAt: Date.now(),
      });
    }
    return { ok: true };
  },
});

/** Whitelist a wallet (admin+). Granting a role requires super_admin. */
export const whitelistAdd = mutation({
  args: {
    token: v.string(),
    pubkey: v.string(),
    note: v.optional(v.string()),
    role: v.optional(v.union(v.literal("admin"), v.literal("super_admin"))),
  },
  handler: async (ctx, { token, pubkey, note, role }) => {
    const caller = await requireRole(ctx, token, "admin");
    if (role && caller.role !== "super_admin") {
      throw new Error("Only a super admin can assign roles");
    }
    const existing = await ctx.db
      .query("whitelist")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        note: note ?? existing.note,
        ...(role ? { role } : {}),
      });
    } else {
      await ctx.db.insert("whitelist", { pubkey, note, role, addedAt: Date.now() });
    }
    await logEvent(ctx, "whitelist.add", { pubkey: caller.pubkey, data: { pubkey, role } });
    return { ok: true, already: existing !== null };
  },
});

/** Remove a wallet from the whitelist (admin+). */
export const whitelistRemove = mutation({
  args: { token: v.string(), pubkey: v.string() },
  handler: async (ctx, { token, pubkey }) => {
    const caller = await requireRole(ctx, token, "admin");
    if (pubkey === caller.pubkey) throw new Error("You can't remove yourself");
    const row = await ctx.db
      .query("whitelist")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    if (!row) return { ok: true, removed: false };
    if (row.role === "super_admin" && caller.role !== "super_admin") {
      throw new Error("Only a super admin can remove a super admin");
    }
    await ctx.db.delete(row._id);
    await logEvent(ctx, "whitelist.remove", { pubkey: caller.pubkey, data: { pubkey } });
    return { ok: true, removed: true };
  },
});

/** Set/clear an admin role on a wallet. super_admin only. */
export const setRole = mutation({
  args: {
    token: v.string(),
    pubkey: v.string(),
    role: v.union(
      v.literal("admin"),
      v.literal("super_admin"),
      v.literal("none"),
    ),
  },
  handler: async (ctx, { token, pubkey, role }) => {
    const caller = await requireRole(ctx, token, "super_admin");
    if (pubkey === caller.pubkey && role !== "super_admin") {
      throw new Error("You can't demote yourself");
    }
    const row = await ctx.db
      .query("whitelist")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    if (role === "none") {
      if (row) await ctx.db.patch(row._id, { role: undefined });
    } else if (row) {
      await ctx.db.patch(row._id, { role });
    } else {
      await ctx.db.insert("whitelist", { pubkey, role, addedAt: Date.now() });
    }
    await logEvent(ctx, "role.set", { pubkey: caller.pubkey, data: { pubkey, role } });
    return { ok: true };
  },
});

/** Set a wallet's swerve tags (admin+). Stored on their profile. */
export const setSwerveTags = mutation({
  args: { token: v.string(), pubkey: v.string(), tags: v.array(v.string()) },
  handler: async (ctx, { token, pubkey, tags }) => {
    const caller = await requireRole(ctx, token, "admin");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    if (!profile) throw new Error("That wallet has no profile yet");
    await ctx.db.patch(profile._id, { swerveTags: tags });
    await logEvent(ctx, "swerve.set", { pubkey: caller.pubkey, data: { pubkey, tags } });
    return { ok: true };
  },
});

/** Set swerve tags by wallet without a session — CLI/admin-key only (seeding). */
export const seedSwerveTags = internalMutation({
  args: { pubkey: v.string(), tags: v.array(v.string()) },
  handler: async (ctx, { pubkey, tags }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    if (!profile) return { ok: false, reason: "no-profile" };
    await ctx.db.patch(profile._id, { swerveTags: tags });
    return { ok: true };
  },
});

/** Grant or clear a wallet's billing plan — CLI/admin-key only.
 *  "lifetime" = unlimited usage, never billed; "none" clears it. */
export const setPlan = internalMutation({
  args: {
    pubkey: v.string(),
    plan: v.union(v.literal("lifetime"), v.literal("none")),
  },
  handler: async (ctx, { pubkey, plan }) => {
    const value = plan === "none" ? undefined : plan;
    const row = await ctx.db
      .query("users")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    if (row) {
      await ctx.db.patch(row._id, { plan: value });
    } else {
      // Grant before first login — recordLogin fills balance/lastLoginAt later.
      await ctx.db.insert("users", { pubkey, balance: 0, lastLoginAt: 0, plan: value });
    }
    return { ok: true, plan: value ?? null };
  },
});

/** Grant or clear a wallet's billing plan from the admin dashboard (admin+).
 *  "lifetime" = unlimited usage, never billed; "none" clears it. */
export const setUserPlan = mutation({
  args: {
    token: v.string(),
    pubkey: v.string(),
    plan: v.union(v.literal("lifetime"), v.literal("none")),
  },
  handler: async (ctx, { token, pubkey, plan }) => {
    const caller = await requireRole(ctx, token, "admin");
    const value = plan === "none" ? undefined : plan;
    const row = await ctx.db
      .query("users")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    if (row) {
      await ctx.db.patch(row._id, { plan: value });
    } else {
      await ctx.db.insert("users", { pubkey, balance: 0, lastLoginAt: 0, plan: value });
    }
    await logEvent(ctx, "plan.set", { pubkey: caller.pubkey, data: { pubkey, plan } });
    return { ok: true, plan: value ?? null };
  },
});
