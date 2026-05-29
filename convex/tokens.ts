import { v } from "convex/values";
import { action } from "./_generated/server";

const DTOUR_MINT = "DijmsEDeTXsWCkCLkhYJNTutKaHf541xZshVrCUbcozy";
const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";

/** Hold >= 0.5% of total supply → 20% off usage. Declared locally because
 *  convex/ cannot import from src/ (different build tree). Mirrors the canonical
 *  values in src/lib/dtour-branding.ts (DTOUR_DISCOUNT_THRESHOLD / _HOLDER_DISCOUNT). */
const DTOUR_DISCOUNT_THRESHOLD = 0.005; // fraction of total supply (0.5%)
const DTOUR_HOLDER_DISCOUNT_BPS = 2000; // 20% off, in basis points

/** Read a wallet's $DTOUR balance server-side (UX display). Keeps the browser
 *  off public Solana RPC (which 403s/rate-limits browser-origin requests).
 *  Pure V8 (fetch JSON-RPC) — no "use node", so it runs in the standard Convex
 *  runtime and avoids the fragile self-hosted node executor. */
export const balanceOf = action({
  args: { pubkey: v.string() },
  handler: async (_ctx, { pubkey }) => {
    const rpc = process.env.SOLANA_RPC_URL || DEFAULT_RPC;
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [
          pubkey,
          { mint: DTOUR_MINT },
          { encoding: "jsonParsed", commitment: "confirmed" },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Solana RPC error ${res.status}`);
    const json = (await res.json()) as {
      error?: { message?: string };
      result?: { value?: Array<{ account?: { data?: { parsed?: { info?: { tokenAmount?: { uiAmount?: number } } } } } }> };
    };
    if (json.error) throw new Error(json.error.message || "Solana RPC error");

    let balance = 0;
    for (const acc of json.result?.value ?? []) {
      const amount = acc.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
      if (typeof amount === "number") balance += amount;
    }
    return balance;
  },
});

/** Holder-discount eligibility for a wallet. Fetches the wallet's $DTOUR balance
 *  (same getTokenAccountsByOwner read as balanceOf) and the mint's total
 *  supply (getTokenSupply returns TOTAL minted supply, not a circulating figure),
 *  then computes the holder's share of supply and
 *  whether it clears the 0.5% threshold for the 20% usage discount.
 *
 *  Pure V8 (fetch JSON-RPC) — no "use node" — so it runs in the standard Convex
 *  runtime, like balanceOf. Both RPC reads return decimal-normalized uiAmount,
 *  so pctOfSupply = balance / supply is a clean ratio (no extra 10^decimals). */
export const holderDiscount = action({
  args: { pubkey: v.string() },
  handler: async (
    _ctx,
    { pubkey },
  ): Promise<{
    balance: number; // uiAmount $DTOUR held by the wallet
    supply: number; // uiAmount TOTAL minted supply of the mint
    pctOfSupply: number; // balance / total supply (0..1)
    qualifies: boolean; // pctOfSupply >= threshold
    discountBps: number; // 2000 (20%) if qualifies, else 0
  }> => {
    const rpc = process.env.SOLANA_RPC_URL || DEFAULT_RPC;

    // 1) Wallet balance — aggregate uiAmount across the wallet's $DTOUR accounts.
    const balRes = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [
          pubkey,
          { mint: DTOUR_MINT },
          { encoding: "jsonParsed", commitment: "confirmed" },
        ],
      }),
    });
    if (!balRes.ok) throw new Error(`Solana RPC error ${balRes.status}`);
    const balJson = (await balRes.json()) as {
      error?: { message?: string };
      result?: { value?: Array<{ account?: { data?: { parsed?: { info?: { tokenAmount?: { uiAmount?: number } } } } } }> };
    };
    if (balJson.error) throw new Error(balJson.error.message || "Solana RPC error");

    let balance = 0;
    for (const acc of balJson.result?.value ?? []) {
      const amount = acc.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
      if (typeof amount === "number") balance += amount;
    }

    // 2) Total supply — getTokenSupply returns the TOTAL minted supply as a
    //    decimal-normalized uiAmount (not a circulating figure).
    const supRes = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenSupply",
        params: [DTOUR_MINT, { commitment: "confirmed" }],
      }),
    });
    if (!supRes.ok) throw new Error(`Solana RPC error ${supRes.status}`);
    const supJson = (await supRes.json()) as {
      error?: { message?: string };
      result?: { value?: { uiAmount?: number | null } };
    };
    if (supJson.error) throw new Error(supJson.error.message || "Solana RPC error");

    const supplyRaw = supJson.result?.value?.uiAmount;
    const supply = typeof supplyRaw === "number" ? supplyRaw : 0;

    // 3) Share of supply + eligibility. Guard divide-by-zero (supply 0 → 0%).
    const pctOfSupply = supply > 0 ? balance / supply : 0;
    const qualifies = pctOfSupply >= DTOUR_DISCOUNT_THRESHOLD;
    const discountBps = qualifies ? DTOUR_HOLDER_DISCOUNT_BPS : 0;

    return { balance, supply, pctOfSupply, qualifies, discountBps };
  },
});
