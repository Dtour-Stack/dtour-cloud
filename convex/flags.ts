import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { logEvent } from "./events";
import {
  FLAG_CATEGORIES,
  FLAG_REGISTRY,
  type FlagCategory,
  getFlagDef,
  resolveFlag,
} from "./flagRegistry";
import { requireRole } from "./rbac";

function rowsToMap(rows: { key: string; enabled: boolean }[]): Record<string, boolean> {
  return Object.fromEntries(rows.map((r) => [r.key, r.enabled]));
}

const BETA_PRODUCTION_SURFACES = [
  "surface_api_keys",
  "surface_mcps",
  "surface_apps",
  "surface_instances",
  "surface_documents",
  "surface_earnings",
] as const;

const BETA_PRODUCTION_DISABLED_SURFACES = ["surface_api_explorer"] as const;

/** Effective flag map { key: enabled } — uses registry defaults + kill-switch semantics. */
export const all = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("featureFlags").collect();
    const stored = rowsToMap(rows);
    const out: Record<string, boolean> = {};
    for (const def of FLAG_REGISTRY) {
      out[def.key] = resolveFlag(stored[def.key], def);
    }
    return out;
  },
});

export type AdminFlagRow = {
  key: string;
  enabled: boolean;
  label: string;
  description: string;
  category: FlagCategory;
  kind: string;
  status: string | null;
  routes: string[] | null;
  defaultEnabled: boolean;
  seeded: boolean;
};

/** Full registry merged with DB state for the admin panel (admin+). */
export const list = query({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<AdminFlagRow[]> => {
    await requireRole(ctx, token, "admin");
    const rows = await ctx.db.query("featureFlags").collect();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return FLAG_REGISTRY.map((def) => {
      const row = byKey.get(def.key);
      const enabled = row ? row.enabled : def.defaultEnabled;
      return {
        key: def.key,
        enabled,
        label: def.label,
        description: def.description,
        category: def.category,
        kind: def.kind,
        status: def.status ?? null,
        routes: def.routes ? [...def.routes] : null,
        defaultEnabled: def.defaultEnabled,
        seeded: !!row,
      };
    });
  },
});

/** Category metadata for grouped admin UI. */
export const categories = query({
  args: {},
  handler: async () => FLAG_CATEGORIES,
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
    const def = getFlagDef(key);
    if (!def) throw new Error(`Unknown flag: ${key}`);
    const existing = await ctx.db
      .query("featureFlags")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled,
        description: description ?? existing.description ?? def.description,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("featureFlags", {
        key,
        enabled,
        description: description ?? def.description,
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

/** Seed all registry flags (idempotent — never overwrites existing rows). */
export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    let inserted = 0;
    for (const f of FLAG_REGISTRY) {
      const existing = await ctx.db
        .query("featureFlags")
        .withIndex("by_key", (q) => q.eq("key", f.key))
        .unique();
      if (!existing) {
        await ctx.db.insert("featureFlags", {
          key: f.key,
          enabled: f.defaultEnabled,
          description: f.description,
          updatedAt: Date.now(),
        });
        inserted++;
      }
    }
    return { ok: true, inserted, total: FLAG_REGISTRY.length };
  },
});

export const enableBetaProductionSurfaces = internalMutation({
  args: {},
  handler: async (ctx) => {
    const enabled: string[] = [];
    const disabled: string[] = [];
    for (const key of BETA_PRODUCTION_SURFACES) {
      const def = getFlagDef(key);
      if (!def) throw new Error(`Unknown flag: ${key}`);
      const existing = await ctx.db
        .query("featureFlags")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (existing) {
        if (!existing.enabled || existing.description !== def.description) {
          await ctx.db.patch(existing._id, {
            enabled: true,
            description: def.description,
            updatedAt: Date.now(),
          });
        }
      } else {
        await ctx.db.insert("featureFlags", {
          key,
          enabled: true,
          description: def.description,
          updatedAt: Date.now(),
        });
      }
      enabled.push(key);
    }
    for (const key of BETA_PRODUCTION_DISABLED_SURFACES) {
      const def = getFlagDef(key);
      if (!def) throw new Error(`Unknown flag: ${key}`);
      const existing = await ctx.db
        .query("featureFlags")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (existing) {
        if (existing.enabled || existing.description !== def.description) {
          await ctx.db.patch(existing._id, {
            enabled: false,
            description: def.description,
            updatedAt: Date.now(),
          });
        }
      } else {
        await ctx.db.insert("featureFlags", {
          key,
          enabled: false,
          description: def.description,
          updatedAt: Date.now(),
        });
      }
      disabled.push(key);
    }
    return { ok: true, enabled, disabled };
  },
});
