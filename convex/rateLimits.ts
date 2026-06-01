import { RateLimiter, DAY, MINUTE } from "@convex-dev/rate-limiter";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";

/** Per-user free OpenRouter calls per UTC day (prod freetour model). */
export const FREETOUR_DAILY_CAP = 50;

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  freetourDaily: {
    kind: "fixed window",
    rate: FREETOUR_DAILY_CAP,
    period: DAY,
  },
  /** Soft guard on paid chat completions (abuse / runaway loops). */
  inferenceChat: {
    kind: "token bucket",
    rate: 60,
    period: MINUTE,
    capacity: 12,
  },
});

export const consumeFreetour = internalMutation({
  args: { pubkey: v.string() },
  handler: async (ctx, { pubkey }) => {
    await rateLimiter.limit(ctx, "freetourDaily", { key: pubkey, count: 1, throws: true });
  },
});

export const consumePaidInference = internalMutation({
  args: { pubkey: v.string() },
  handler: async (ctx, { pubkey }) => {
    await rateLimiter.limit(ctx, "inferenceChat", { key: pubkey, count: 1, throws: true });
  },
});

export const freetourUsedToday = internalQuery({
  args: { pubkey: v.string() },
  handler: async (ctx, { pubkey }) => {
    return await rateLimiter.getValue(ctx, "freetourDaily", { key: pubkey });
  },
});
