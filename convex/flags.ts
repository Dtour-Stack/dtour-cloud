import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { logEvent } from "./events";
import { requireRole } from "./rbac";

/** Public flag map { key: enabled } — read app-wide to gate features. */
export const all = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("featureFlags").collect();
    return Object.fromEntries(rows.map((r) => [r.key, r.enabled]));
  },
});

/** Full flag rows for the admin panel (admin+). */
export const list = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireRole(ctx, token, "admin");
    const rows = await ctx.db.query("featureFlags").collect();
    return rows
      .map((r) => ({
        key: r.key,
        enabled: r.enabled,
        description: r.description ?? null,
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
  },
});

/** Toggle/create a flag (admin+). */
export const set = mutation({
  args: {
    token: v.string(),
    key: v.string(),
    enabled: v.boolean(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { token, key, enabled, description }) => {
    const caller = await requireRole(ctx, token, "admin");
    const existing = await ctx.db
      .query("featureFlags")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled,
        description: description ?? existing.description,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("featureFlags", {
        key,
        enabled,
        description,
        updatedAt: Date.now(),
      });
    }
    await logEvent(ctx, "flag.set", {
      pubkey: caller.pubkey,
      data: { key, enabled },
    });
    return { ok: true };
  },
});

/** Seed baseline flags (idempotent). CLI/admin-key only. */
export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const defaults = [
      { key: "profile_avatar_upload", enabled: false, description: "Upload avatars (vs URL)" },
      { key: "agent_linking", enabled: false, description: "Link agents (builders phase)" },
      { key: "github_linking", enabled: false, description: "Link GitHub (builders phase)" },
      { key: "admin_debug_panel", enabled: true, description: "Show debug log in admin" },
      // Operational kill-switches for the inference rails (toggle without redeploy).
      { key: "paid_inference_enabled", enabled: true, description: "Metered paid inference (chat/image) — kill-switch" },
      { key: "freetour_enabled", enabled: true, description: "Free-tier inference (rate-limited) — kill-switch" },
      { key: "tts_enabled", enabled: false, description: "Text-to-speech — off until the ElizaCloud endpoint is live" },
    ];
    for (const f of defaults) {
      const existing = await ctx.db
        .query("featureFlags")
        .withIndex("by_key", (q) => q.eq("key", f.key))
        .unique();
      if (!existing) {
        await ctx.db.insert("featureFlags", { ...f, updatedAt: Date.now() });
      }
    }
    return { ok: true };
  },
});
