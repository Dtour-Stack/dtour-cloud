import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { logEvent } from "./events";

const NONCE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** Issue a single-use, short-lived nonce for the SIWS message. */
export const getNonce = mutation({
  args: {},
  handler: async (ctx) => {
    const nonce = crypto.randomUUID();
    await ctx.db.insert("nonces", {
      nonce,
      expiresAt: Date.now() + NONCE_TTL_MS,
      used: false,
    });
    return nonce;
  },
});

/** Consume a nonce: valid only if it exists, is unused, and is unexpired. */
export const consumeNonce = internalMutation({
  args: { nonce: v.string() },
  handler: async (ctx, { nonce }) => {
    const row = await ctx.db
      .query("nonces")
      .withIndex("by_nonce", (q) => q.eq("nonce", nonce))
      .unique();
    if (!row || row.used || row.expiresAt < Date.now()) return false;
    await ctx.db.patch(row._id, { used: true });
    return true;
  },
});

/** Record a successful gate: upsert the user, mint a session, report profile state. */
export const recordLogin = internalMutation({
  args: { pubkey: v.string(), balance: v.number() },
  handler: async (ctx, { pubkey, balance }) => {
    const now = Date.now();
    const whitelist = await ctx.db
      .query("whitelist")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    const creatorRewardsEligible = whitelist?.role === "dev_tester";
    const existing = await ctx.db
      .query("users")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { balance, lastLoginAt: now, creatorRewardsEligible });
    } else {
      await ctx.db.insert("users", { pubkey, balance, lastLoginAt: now, creatorRewardsEligible });
    }

    const token = crypto.randomUUID();
    await ctx.db.insert("sessions", {
      token,
      pubkey,
      expiresAt: now + SESSION_TTL_MS,
    });

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();

    await logEvent(ctx, "login", { pubkey, data: { balance } });
    return { token, hasProfile: profile !== null };
  },
});
