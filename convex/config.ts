import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { logEvent } from "./events";
import { requireRole } from "./rbac";

/** Public config the app reads without auth (parsed). */
export const publicConfig = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("config").collect();
    const out: Record<string, unknown> = {};
    for (const r of rows) {
      if (!r.public) continue;
      try {
        out[r.key] = JSON.parse(r.value);
      } catch {
        /* skip */
      }
    }
    return out;
  },
});

/** Full config for the admin editor. Admin+ only. */
export const list = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireRole(ctx, token, "admin");
    const rows = await ctx.db.query("config").collect();
    return rows
      .map((r) => ({
        key: r.key,
        value: r.value,
        type: r.type,
        category: r.category,
        description: r.description ?? null,
        public: r.public,
      }))
      .sort(
        (a, b) =>
          a.category.localeCompare(b.category) || a.key.localeCompare(b.key),
      );
  },
});

/** Set a config value (admin+). Encodes the raw input by the key's type. */
export const set = mutation({
  args: { token: v.string(), key: v.string(), value: v.string() },
  handler: async (ctx, { token, key, value }) => {
    const caller = await requireRole(ctx, token, "admin");
    const row = await ctx.db
      .query("config")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!row) throw new Error("Unknown config key");

    let encoded: string;
    switch (row.type) {
      case "number": {
        const n = Number(value);
        if (Number.isNaN(n)) throw new Error("Value must be a number");
        encoded = JSON.stringify(n);
        break;
      }
      case "boolean":
        encoded = JSON.stringify(value === "true");
        break;
      case "list":
        encoded = JSON.stringify(
          value.split(",").map((s) => s.trim()).filter(Boolean),
        );
        break;
      default:
        encoded = JSON.stringify(value);
    }
    await ctx.db.patch(row._id, { value: encoded, updatedAt: Date.now() });
    await logEvent(ctx, "config.set", { pubkey: caller.pubkey, data: { key } });
    return { ok: true };
  },
});

const DEFAULTS: Array<{
  key: string;
  value: string;
  type: string;
  category: string;
  description: string;
  public: boolean;
}> = [
  { key: "app_name", value: '"Detour Cloud"', type: "string", category: "Branding", description: "Product name", public: true },
  { key: "support_email", value: '"support@detour.ninja"', type: "string", category: "Branding", description: "Support contact", public: true },
  { key: "announcement", value: '""', type: "string", category: "System", description: "Dashboard banner (empty = hidden)", public: true },
  { key: "maintenance_mode", value: "false", type: "boolean", category: "System", description: "Show maintenance banner", public: true },
  { key: "signups_open", value: "true", type: "boolean", category: "Access", description: "Allow new sign-ins", public: true },
  { key: "markup_pct", value: "20", type: "number", category: "Billing", description: "Premium markup % on ElizaCloud usage", public: false },
  { key: "tier_pro_min", value: "1000000", type: "number", category: "Access", description: "$DTOUR for Pro tier", public: false },
  { key: "tier_super_min", value: "10000000", type: "number", category: "Access", description: "$DTOUR for Super tier", public: false },
  { key: "default_chat_model", value: '""', type: "string", category: "Inference", description: "Routed model when an agent is set to Auto (empty = ElizaCloud default)", public: false },
  { key: "elizacloud_base_url", value: '"https://www.elizacloud.ai/api/v1"', type: "string", category: "Inference", description: "ElizaCloud OpenAI-compatible base URL", public: false },
  { key: "rp_id", value: '"localhost"', type: "string", category: "Auth", description: "WebAuthn relying party ID", public: true },
  { key: "rp_origin", value: '"http://localhost:5174"', type: "string", category: "Auth", description: "WebAuthn relying party origin", public: true },
];

// Keys removed from DEFAULTS that should be cleaned out of existing deployments.
const OBSOLETE_KEYS = ["default_models"];

/** Seed default config (idempotent). CLI/admin-key only. */
export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const d of DEFAULTS) {
      const existing = await ctx.db
        .query("config")
        .withIndex("by_key", (q) => q.eq("key", d.key))
        .unique();
      if (!existing) {
        await ctx.db.insert("config", { ...d, updatedAt: Date.now() });
      }
    }
    for (const key of OBSOLETE_KEYS) {
      const row = await ctx.db
        .query("config")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (row) await ctx.db.delete(row._id);
    }
    return { ok: true };
  },
});
