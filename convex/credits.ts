import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action, internalMutation } from "./_generated/server";
import { logEvent } from "./events";

const DTOUR_MINT = "DijmsEDeTXsWCkCLkhYJNTutKaHf541xZshVrCUbcozy";
// Mainnet USDC mint (Circle) — standard SPL token, 6 decimals. Credited 1:1.
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";
// Where top-up payments land — a Detour-controlled wallet (treasury pool). Same
// owner for both assets; each asset lands in that owner's per-mint token account.
const CREDITS_TREASURY = "AtFGjEjRPVogS4P6VHg159Gz1axDKFfauqnZWapKQbzK";
const USD = 1_000_000;

async function rpc(method: string, params: unknown): Promise<any> {
  const url = process.env.SOLANA_RPC_URL || DEFAULT_RPC;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${method} → ${res.status}`);
  const json = (await res.json()) as { error?: { message?: string }; result?: any };
  if (json.error) throw new Error(json.error.message || `RPC ${method} error`);
  return json.result;
}

/** Live $DTOUR/USD from DexScreener (most-liquid pair). 0 if unavailable. */
async function dtourPriceUsd(): Promise<number> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${DTOUR_MINT}`,
    );
    if (!res.ok) return 0;
    const j = (await res.json()) as {
      pairs?: Array<{ priceUsd?: string; liquidity?: { usd?: number } }>;
    };
    const pairs = (j.pairs ?? [])
      .slice()
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    const p = Number(pairs[0]?.priceUsd);
    return Number.isFinite(p) && p > 0 ? p : 0;
  } catch {
    return 0;
  }
}

/** Treasury address + the two top-up mints + live $DTOUR price so the UI can
 *  quote a top-up. USDC needs no price (it's $1). `mint` stays = DTOUR_MINT for
 *  back-compat with existing callers. */
export const topUpInfo = action({
  args: {},
  handler: async (): Promise<{
    treasury: string;
    mint: string;
    dtourMint: string;
    usdcMint: string;
    priceUsd: number;
  }> => {
    return {
      treasury: CREDITS_TREASURY,
      mint: DTOUR_MINT,
      dtourMint: DTOUR_MINT,
      usdcMint: USDC_MINT,
      priceUsd: await dtourPriceUsd(),
    };
  },
});

/** Verify an on-chain $DTOUR transfer to the credits treasury and grant credits.
 *  Pure V8: getTransaction + DexScreener via fetch. Idempotent by signature. */
export const topUpVerify = action({
  args: { token: v.string(), signature: v.string() },
  handler: async (
    ctx,
    { token, signature },
  ): Promise<{ ok: boolean; reason?: string; creditedUsd?: number; balanceUsd?: number }> => {
    const me = (await ctx.runQuery(api.users.me, { token })) as { pubkey: string } | null;
    if (!me) return { ok: false, reason: "no session" };
    const pubkey = me.pubkey;

    const tx = await rpc("getTransaction", [
      signature,
      { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
    ]);
    if (!tx) return { ok: false, reason: "tx not found or not confirmed yet" };
    if (tx.meta?.err) return { ok: false, reason: "tx failed on-chain" };

    // You can only credit your OWN payment: the session wallet must be a signer.
    const keys: Array<{ pubkey?: string; signer?: boolean } | string> =
      tx.transaction?.message?.accountKeys ?? [];
    const userSigned = keys.some(
      (k) => typeof k === "object" && k.pubkey === pubkey && k.signer === true,
    );
    if (!userSigned) return { ok: false, reason: "this tx was not signed by your wallet" };

    // Treasury's $DTOUR delta from pre/post token balances (no ATA math needed).
    type TB = { owner?: string; mint?: string; uiTokenAmount?: { uiAmount?: number | null } };
    const treasuryAmt = (arr: TB[]) => {
      const e = (arr ?? []).find((b) => b.owner === CREDITS_TREASURY && b.mint === DTOUR_MINT);
      return e ? Number(e.uiTokenAmount?.uiAmount ?? 0) : 0;
    };
    const received =
      treasuryAmt(tx.meta?.postTokenBalances ?? []) - treasuryAmt(tx.meta?.preTokenBalances ?? []);
    if (!(received > 0)) {
      return { ok: false, reason: "no $DTOUR was received by the treasury in this tx" };
    }

    const priceUsd = await dtourPriceUsd();
    if (!(priceUsd > 0)) return { ok: false, reason: "price feed unavailable — try again shortly" };

    return await ctx.runMutation(internal.credits.applyTopUp, {
      signature,
      pubkey,
      dtourAmount: received,
      priceUsd,
    });
  },
});

/** Verify an on-chain USDC transfer to the credits treasury and grant credits
 *  1:1 (USDC is $1 — NO price oracle). Pure V8: getTransaction via fetch.
 *  Idempotent by signature (shared ledger with $DTOUR top-ups). */
export const usdcTopUpVerify = action({
  args: { token: v.string(), signature: v.string() },
  handler: async (
    ctx,
    { token, signature },
  ): Promise<{ ok: boolean; reason?: string; creditedUsd?: number; balanceUsd?: number }> => {
    const me = (await ctx.runQuery(api.users.me, { token })) as { pubkey: string } | null;
    if (!me) return { ok: false, reason: "no session" };
    const pubkey = me.pubkey;

    const tx = await rpc("getTransaction", [
      signature,
      { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
    ]);
    if (!tx) return { ok: false, reason: "tx not found or not confirmed yet" };
    if (tx.meta?.err) return { ok: false, reason: "tx failed on-chain" };

    // You can only credit your OWN payment: the session wallet must be a signer.
    const keys: Array<{ pubkey?: string; signer?: boolean } | string> =
      tx.transaction?.message?.accountKeys ?? [];
    const userSigned = keys.some(
      (k) => typeof k === "object" && k.pubkey === pubkey && k.signer === true,
    );
    if (!userSigned) return { ok: false, reason: "this tx was not signed by your wallet" };

    // Treasury's USDC delta from pre/post token balances, in RAW base units.
    // USDC has 6 decimals and micro-USD is 1e6, so 1 base unit == 1 micro-USD
    // exactly — no float, no oracle. A missing pre-entry (ATA created in-tx) = 0.
    type TB = { owner?: string; mint?: string; uiTokenAmount?: { amount?: string } };
    const treasuryRaw = (arr: TB[]): bigint => {
      const e = (arr ?? []).find((b) => b.owner === CREDITS_TREASURY && b.mint === USDC_MINT);
      return e ? BigInt(e.uiTokenAmount?.amount ?? "0") : 0n;
    };
    const receivedMicro =
      treasuryRaw(tx.meta?.postTokenBalances ?? []) - treasuryRaw(tx.meta?.preTokenBalances ?? []);
    if (!(receivedMicro > 0n)) {
      return { ok: false, reason: "no USDC was received by the treasury in this tx" };
    }

    return await ctx.runMutation(internal.credits.applyUsdcTopUp, {
      signature,
      pubkey,
      usdMicro: Number(receivedMicro), // exact for integers ≪ 2^53
    });
  },
});

/** Idempotent credit: record the top-up + add USD to the wallet. Internal — only
 *  topUpVerify (after on-chain verification) calls this. */
export const applyTopUp = internalMutation({
  args: {
    signature: v.string(),
    pubkey: v.string(),
    dtourAmount: v.number(),
    priceUsd: v.number(),
  },
  handler: async (ctx, { signature, pubkey, dtourAmount, priceUsd }) => {
    const existing = await ctx.db
      .query("creditTopUps")
      .withIndex("by_signature", (q) => q.eq("signature", signature))
      .unique();
    const balOf = async () =>
      (
        await ctx.db
          .query("creditBalances")
          .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
          .unique()
      )?.balanceMicroUsd ?? 0;

    if (existing) {
      return { ok: true, creditedUsd: existing.usdMicro / USD, balanceUsd: (await balOf()) / USD };
    }

    const usdMicro = Math.round(dtourAmount * priceUsd * USD);
    await ctx.db.insert("creditTopUps", {
      signature,
      pubkey,
      asset: "DTOUR",
      dtourAmount,
      priceUsd,
      usdMicro,
      at: Date.now(),
    });
    const row = await ctx.db
      .query("creditBalances")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    const after = (row?.balanceMicroUsd ?? 0) + usdMicro;
    if (row) await ctx.db.patch(row._id, { balanceMicroUsd: after, updatedAt: Date.now() });
    else await ctx.db.insert("creditBalances", { pubkey, balanceMicroUsd: after, updatedAt: Date.now() });
    await logEvent(ctx, "credits.topup", {
      pubkey,
      data: { asset: "DTOUR", signature, dtourAmount, priceUsd, usdMicro },
    });
    return { ok: true, creditedUsd: usdMicro / USD, balanceUsd: after / USD };
  },
});

/** Idempotent credit for a verified USDC top-up: record it + add USD 1:1 to the
 *  wallet. Internal — only usdcTopUpVerify (after on-chain verification) calls
 *  this. Shares the creditTopUps ledger; dedup is by globally-unique signature. */
export const applyUsdcTopUp = internalMutation({
  args: {
    signature: v.string(),
    pubkey: v.string(),
    usdMicro: v.number(), // USDC base units = micro-USD (1:1), already exact
  },
  handler: async (ctx, { signature, pubkey, usdMicro }) => {
    const existing = await ctx.db
      .query("creditTopUps")
      .withIndex("by_signature", (q) => q.eq("signature", signature))
      .unique();
    const balOf = async () =>
      (
        await ctx.db
          .query("creditBalances")
          .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
          .unique()
      )?.balanceMicroUsd ?? 0;

    if (existing) {
      return { ok: true, creditedUsd: existing.usdMicro / USD, balanceUsd: (await balOf()) / USD };
    }

    await ctx.db.insert("creditTopUps", {
      signature,
      pubkey,
      asset: "USDC",
      usdcAmount: usdMicro / USD, // uiAmount, for display/audit (usdMicro is the truth)
      usdMicro,
      at: Date.now(),
    });
    const row = await ctx.db
      .query("creditBalances")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    const after = (row?.balanceMicroUsd ?? 0) + usdMicro;
    if (row) await ctx.db.patch(row._id, { balanceMicroUsd: after, updatedAt: Date.now() });
    else await ctx.db.insert("creditBalances", { pubkey, balanceMicroUsd: after, updatedAt: Date.now() });
    await logEvent(ctx, "credits.topup", {
      pubkey,
      data: { asset: "USDC", signature, usdMicro },
    });
    return { ok: true, creditedUsd: usdMicro / USD, balanceUsd: after / USD };
  },
});
