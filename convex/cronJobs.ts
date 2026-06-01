import { Crons } from "@convex-dev/crons";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const crons = new Crons(components.crons);

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Purge expired nonces and sessions (auth hygiene). */
export const cleanupAuth = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    for (const row of await ctx.db.query("nonces").collect()) {
      if (row.expiresAt < now || row.used) await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db.query("sessions").collect()) {
      if (row.expiresAt < now) await ctx.db.delete(row._id);
    }
  },
});

/** Drop freetourUsage rows older than 14 days (counter of record is rate-limiter). */
export const cleanupFreetourUsage = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = new Date(Date.now() - 14 * DAY_MS).toISOString().slice(0, 10);
    for (const row of await ctx.db.query("freetourUsage").collect()) {
      if (row.day < cutoff) await ctx.db.delete(row._id);
    }
  },
});

/** Idempotently register component crons (run from `convex dev --run init` or deploy hook). */
export const ensureRegistered = internalMutation({
  args: {},
  handler: async (ctx) => {
    if ((await crons.get(ctx, { name: "cleanup-auth" })) === null) {
      await crons.register(
        ctx,
        { kind: "interval", ms: HOUR_MS },
        internal.cronJobs.cleanupAuth,
        {},
        "cleanup-auth",
      );
    }
    if ((await crons.get(ctx, { name: "cleanup-freetour-usage" })) === null) {
      await crons.register(
        ctx,
        { kind: "interval", ms: DAY_MS },
        internal.cronJobs.cleanupFreetourUsage,
        {},
        "cleanup-freetour-usage",
      );
    }
    if ((await crons.get(ctx, { name: "api-tokens-cleanup" })) === null) {
      await crons.register(
        ctx,
        { kind: "interval", ms: DAY_MS },
        internal.componentApiTokens.cleanupExpired,
        {},
        "api-tokens-cleanup",
      );
    }
  },
});
