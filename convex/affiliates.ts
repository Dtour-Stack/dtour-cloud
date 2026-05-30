import { v } from "convex/values";
import { type MutationCtx, type QueryCtx, mutation, query } from "./_generated/server";
import { logEvent } from "./events";

// Affiliate earns DEFAULT_SHARE_BPS of the MARKUP portion of fees their referrals
// pay — funded by the platform fee (costs the referred user nothing extra).
const DEFAULT_SHARE_BPS = 2000; // 20%
const MARKUP_FRACTION = 1.0; // 2× pricing → markup is half the price (see coding.ts)
const USD = 1_000_000;

async function sessionPubkey(ctx: QueryCtx | MutationCtx, token: string): Promise<string | null> {
  const s = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!s || s.expiresAt < Date.now()) return null;
  return s.pubkey;
}

function link(code: string) {
  return `https://detour.ninja/?ref=${code}`;
}

/** Pending (unpaid) earnings in micro-USD for an affiliate — markup share only. */
async function pendingMicroFor(
  ctx: QueryCtx | MutationCtx,
  pubkey: string,
  shareBps: number,
): Promise<{ earnedMicro: number; pendingMicro: number; refs: number }> {
  const refs = await ctx.db
    .query("referrals")
    .withIndex("by_referrer", (q) => q.eq("referrerPubkey", pubkey))
    .take(500);
  let earnedMicro = 0;
  for (const r of refs) {
    const usage = await ctx.db
      .query("codingUsage")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", r.referredPubkey))
      .collect();
    const spend = usage.reduce((s, u) => s + (u.priceMicroUsd ?? 0), 0);
    earnedMicro += spend * (MARKUP_FRACTION / (1 + MARKUP_FRACTION)) * (shareBps / 10000);
  }
  earnedMicro = Math.round(earnedMicro);
  const paid = (
    await ctx.db
      .query("affiliatePayouts")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .collect()
  ).reduce((s, p) => s + (p.status !== "rejected" ? p.amountMicroUsd : 0), 0);
  return { earnedMicro, pendingMicro: Math.max(0, earnedMicro - paid), refs: refs.length };
}

/** Mint (idempotently) the caller's affiliate code. */
export const getOrCreateCode = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) throw new Error("Not signed in");
    const existing = await ctx.db
      .query("affiliates")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    if (existing) return { code: existing.code, link: link(existing.code), shareBps: existing.shareBps };
    const code = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    await ctx.db.insert("affiliates", { pubkey, code, shareBps: DEFAULT_SHARE_BPS, createdAt: Date.now() });
    await logEvent(ctx, "affiliate.create", { pubkey, data: { code } });
    return { code, link: link(code), shareBps: DEFAULT_SHARE_BPS };
  },
});

/** Earnings + referral stats for the caller (earnings come from the MARKUP only). */
export const myStats = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) return null;
    const aff = await ctx.db
      .query("affiliates")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    const shareBps = aff?.shareBps ?? DEFAULT_SHARE_BPS;
    const { earnedMicro, pendingMicro, refs } = await pendingMicroFor(ctx, pubkey, shareBps);
    return {
      code: aff?.code ?? null,
      link: aff ? link(aff.code) : null,
      shareBps,
      referrals: refs,
      earnedUsd: earnedMicro / USD,
      pendingUsd: pendingMicro / USD,
    };
  },
});

/** Attribute the caller as a referral of `code` — once per user, no self-referral. */
export const attribute = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) throw new Error("Not signed in");
    const already = await ctx.db
      .query("referrals")
      .withIndex("by_referred", (q) => q.eq("referredPubkey", pubkey))
      .unique();
    if (already) return { ok: true, already: true };
    const aff = await ctx.db
      .query("affiliates")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (!aff || aff.pubkey === pubkey) return { ok: false }; // unknown code or self-referral
    await ctx.db.insert("referrals", {
      referredPubkey: pubkey,
      code,
      referrerPubkey: aff.pubkey,
      at: Date.now(),
    });
    await logEvent(ctx, "affiliate.referral", { pubkey, data: { code, referrer: aff.pubkey } });
    return { ok: true };
  },
});

/** Request a payout of the current pending balance. */
export const requestPayout = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) throw new Error("Not signed in");
    const aff = await ctx.db
      .query("affiliates")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    const { pendingMicro } = await pendingMicroFor(ctx, pubkey, aff?.shareBps ?? DEFAULT_SHARE_BPS);
    if (pendingMicro <= 0) throw new Error("Nothing to pay out");
    await ctx.db.insert("affiliatePayouts", {
      pubkey,
      amountMicroUsd: pendingMicro,
      status: "requested",
      at: Date.now(),
    });
    await logEvent(ctx, "affiliate.payout", { pubkey, data: { amountMicroUsd: pendingMicro } });
    return { ok: true, requestedUsd: pendingMicro / USD };
  },
});
