import { v } from "convex/values";
import { api } from "./_generated/api";
import { type MutationCtx, type QueryCtx, action, mutation, query } from "./_generated/server";
import { affiliateEarningsMicroForUsage } from "./affiliateEarnings";
import { logEvent } from "./events";

// White-label affiliate rail: referrers earn a share of realized margin on
// referred coding sandbox usage, requested as $ELIZA to an EVM or Solana wallet.
const DEFAULT_SHARE_BPS = 2000; // 20%
const USD = 1_000_000;

// $ELIZA token — addresses from the vendored ElizaCloud config (eliza-token-price).
const ELIZA_TOKEN = {
  ethereum: "0xea17df5cf6d172224892b5477a16acb111182478",
  base: "0xea17df5cf6d172224892b5477a16acb111182478",
  solana: "DuMbhu7mvQvqQHGcnikDgb4XegXJRyhUBfdU22uELiZA",
} as const;
export const ELIZA_NETWORKS = ["ethereum", "base", "solana"] as const;

async function sessionPubkey(ctx: QueryCtx | MutationCtx, token: string): Promise<string | null> {
  const s = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!s || s.expiresAt < Date.now()) return null;
  return s.pubkey;
}

// ElizaCloud standardizes share links on /login?ref=CODE (login honors ref).
function link(code: string) {
  return `https://detour.ninja/login?ref=${code}`;
}

/** Live $ELIZA/USD (Solana mint via DexScreener — most liquid). 0 if unavailable. */
async function elizaPriceUsd(): Promise<number> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${ELIZA_TOKEN.solana}`,
    );
    if (!res.ok) return 0;
    const j = (await res.json()) as {
      pairs?: Array<{ priceUsd?: string; liquidity?: { usd?: number } }>;
    };
    const best = (j.pairs ?? [])
      .slice()
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    const p = Number(best?.priceUsd);
    return Number.isFinite(p) && p > 0 ? p : 0;
  } catch {
    return 0;
  }
}

/** Pending (unpaid) earnings in micro-USD for an affiliate — coding margin share only. */
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
    earnedMicro += usage.reduce(
      (sum, u) =>
        sum +
        affiliateEarningsMicroForUsage({
          costMicroUsd: u.costMicroUsd,
          priceMicroUsd: u.priceMicroUsd,
          shareBps,
        }),
      0,
    );
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

/** Mint (idempotently) the caller's affiliate code. Auto-called on first session. */
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

/** Stats for the caller, with earnings denominated in BOTH USD and $ELIZA. */
export const myStats = action({
  args: { token: v.string() },
  handler: async (
    ctx,
    { token },
  ): Promise<{
    code: string | null;
    link: string | null;
    shareBps: number;
    referrals: number;
    earnedUsd: number;
    pendingUsd: number;
    earnedEliza: number;
    pendingEliza: number;
    elizaPriceUsd: number;
    payoutNetwork: string | null;
    payoutAddress: string | null;
  } | null> => {
    const data = (await ctx.runQuery(api.affiliates._stats, { token })) as {
      code: string | null;
      link: string | null;
      shareBps: number;
      referrals: number;
      earnedUsd: number;
      pendingUsd: number;
      payoutNetwork: string | null;
      payoutAddress: string | null;
    } | null;
    if (!data) return null;
    const price = await elizaPriceUsd();
    return {
      ...data,
      earnedEliza: price > 0 ? data.earnedUsd / price : 0,
      pendingEliza: price > 0 ? data.pendingUsd / price : 0,
      elizaPriceUsd: price,
    };
  },
});

/** DB-only stats (no price fetch) — backs myStats and the reactive UI fallback. */
export const _stats = query({
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
      payoutNetwork: aff?.payoutNetwork ?? null,
      payoutAddress: aff?.payoutAddress ?? null,
    };
  },
});

/** Save the $ELIZA payout wallet (EVM 0x… or Solana base58). */
export const setPayoutWallet = mutation({
  args: { token: v.string(), network: v.string(), address: v.string() },
  handler: async (ctx, { token, network, address }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) throw new Error("Not signed in");
    if (!(ELIZA_NETWORKS as readonly string[]).includes(network)) {
      throw new Error("Unsupported network");
    }
    const addr = address.trim();
    const isEvm = network !== "solana";
    if (isEvm && !/^0x[0-9a-fA-F]{40}$/.test(addr)) throw new Error("Invalid EVM address");
    if (!isEvm && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) throw new Error("Invalid Solana address");
    const aff = await ctx.db
      .query("affiliates")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    if (!aff) throw new Error("No affiliate code yet");
    await ctx.db.patch(aff._id, { payoutNetwork: network, payoutAddress: addr });
    return { ok: true };
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

/** Request a $ELIZA payout of the pending balance to the saved wallet. */
export const requestPayout = action({
  args: { token: v.string() },
  handler: async (
    ctx,
    { token },
  ): Promise<{ ok: boolean; requestedUsd?: number; requestedEliza?: number; reason?: string }> => {
    const price = await elizaPriceUsd();
    if (!(price > 0)) return { ok: false, reason: "$ELIZA price unavailable — try again shortly" };
    return await ctx.runMutation(api.affiliates._recordPayout, { token, elizaPriceUsd: price });
  },
});

export const _recordPayout = mutation({
  args: { token: v.string(), elizaPriceUsd: v.number() },
  handler: async (ctx, { token, elizaPriceUsd: price }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) throw new Error("Not signed in");
    const aff = await ctx.db
      .query("affiliates")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    if (!aff?.payoutAddress || !aff.payoutNetwork) {
      throw new Error("Set a $ELIZA payout wallet first");
    }
    const { pendingMicro } = await pendingMicroFor(ctx, pubkey, aff.shareBps ?? DEFAULT_SHARE_BPS);
    if (pendingMicro <= 0) throw new Error("Nothing to pay out");
    const amountEliza = price > 0 ? pendingMicro / USD / price : 0;
    await ctx.db.insert("affiliatePayouts", {
      pubkey,
      amountMicroUsd: pendingMicro,
      status: "requested",
      at: Date.now(),
      network: aff.payoutNetwork,
      address: aff.payoutAddress,
      amountEliza,
      elizaPriceUsd: price,
    });
    await logEvent(ctx, "affiliate.payout", {
      pubkey,
      data: { amountMicroUsd: pendingMicro, amountEliza, network: aff.payoutNetwork },
    });
    return { ok: true, requestedUsd: pendingMicro / USD, requestedEliza: amountEliza };
  },
});
