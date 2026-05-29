import { v } from "convex/values";
import { api } from "./_generated/api";
import { action, mutation, query } from "./_generated/server";
import { requireRole } from "./rbac";

const DTOUR_MINT = "DijmsEDeTXsWCkCLkhYJNTutKaHf541xZshVrCUbcozy";
const DEFAULT_RPC = "https://api.mainnet-beta.solana.com";
const DECIMALS = 6; // $DTOUR (verify via getMint before trusting for execution)

// Sensible defaults — pre-filled with the generated pool wallets; edit in the UI.
const DEFAULT_CONFIG = {
  splitBps: { builder: 3000, holders: 4000, buyback: 2000, treasury: 1000 },
  wallets: {
    creator: "GYUh7uTguaAJPDvuYTrauViaGEatnrEpNtEZE2DHPnZR",
    builder: "D5Nxr3DWMPHJ8W3jfvFgRCjBxM4KbgDMRxDcNEcYgGdG",
    treasury: "AtFGjEjRPVogS4P6VHg159Gz1axDKFfauqnZWapKQbzK",
    buyback: "CCy62KcE3Q2eXEx1Yjtginyx1bp9dtoa1dezyePVx6rp",
  },
  minBalanceTokens: 1000,
  minPayoutSol: 0.001,
  creatorReserveSol: 0.02,
};

/** Current tokenomics config (admin+). Returns defaults if unset. */
export const getConfig = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireRole(ctx, token, "admin");
    const row = await ctx.db.query("tokenomicsConfig").first();
    if (!row) return { ...DEFAULT_CONFIG, updatedAt: null };
    const { _id, _creationTime, ...cfg } = row;
    return cfg;
  },
});

/** Save tokenomics config (admin+). Validates split bps sum to 10000. */
export const setConfig = mutation({
  args: {
    token: v.string(),
    splitBps: v.object({
      builder: v.number(),
      holders: v.number(),
      buyback: v.number(),
      treasury: v.number(),
    }),
    wallets: v.object({
      creator: v.string(),
      builder: v.string(),
      treasury: v.string(),
      buyback: v.string(),
    }),
    minBalanceTokens: v.number(),
    minPayoutSol: v.number(),
    creatorReserveSol: v.number(),
  },
  handler: async (ctx, { token, ...cfg }) => {
    const caller = await requireRole(ctx, token, "admin");
    const sum =
      cfg.splitBps.builder +
      cfg.splitBps.holders +
      cfg.splitBps.buyback +
      cfg.splitBps.treasury;
    if (sum !== 10000) {
      throw new Error(`Split must sum to 100% (10000 bps); got ${sum}`);
    }
    for (const [k, val] of Object.entries(cfg.splitBps)) {
      if (!Number.isInteger(val) || val < 0) {
        throw new Error(`splitBps.${k} must be a non-negative integer`);
      }
    }
    const existing = await ctx.db.query("tokenomicsConfig").first();
    const doc = { ...cfg, updatedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, doc);
    else await ctx.db.insert("tokenomicsConfig", doc);
    const { logEvent } = await import("./events");
    await logEvent(ctx, "tokenomics.config", { pubkey: caller.pubkey });
    return { ok: true };
  },
});

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

/** Live snapshot for the admin preview: $DTOUR holders (Helius DAS, complete +
 *  Token-2022-aware), creator SOL balance, and circulating supply. Read-only. */
export const snapshot = action({
  args: { token: v.string() },
  handler: async (
    ctx,
    { token },
  ): Promise<{
    holders: Array<{ owner: string; amount: number }>;
    holderCount: number;
    creatorBalanceSol: number;
    supply: number;
    decimals: number;
  }> => {
    const role = await ctx.runQuery(api.admin.myRole, { token });
    if (role !== "admin" && role !== "super_admin") throw new Error("Forbidden");

    const cfg = await ctx.runQuery(api.tokenomics.getConfig, { token });

    // Holders via Helius DAS getTokenAccounts (cursor-paginated; aggregates by
    // owner). Capped at 50 pages × 1000 to bound a runaway.
    const byOwner = new Map<string, number>();
    let cursor: string | null = null;
    for (let page = 0; page < 50; page++) {
      const params: Record<string, unknown> = { mint: DTOUR_MINT, limit: 1000 };
      if (cursor) params.cursor = cursor;
      const r = await rpc("getTokenAccounts", params);
      const accts: Array<{ owner?: string; amount?: number }> =
        r?.token_accounts ?? [];
      for (const a of accts) {
        if (!a.owner || typeof a.amount !== "number") continue;
        byOwner.set(a.owner, (byOwner.get(a.owner) ?? 0) + a.amount);
      }
      cursor = r?.cursor ?? null;
      if (!cursor || accts.length === 0) break;
    }

    const min = cfg.minBalanceTokens * 10 ** DECIMALS;
    const holders = [...byOwner.entries()]
      .filter(([, raw]) => raw >= min)
      .map(([owner, raw]) => ({ owner, amount: raw / 10 ** DECIMALS }))
      .sort((a, b) => b.amount - a.amount);

    const lamports = (await rpc("getBalance", [cfg.wallets.creator]))?.value ?? 0;
    const sup = await rpc("getTokenSupply", [DTOUR_MINT]);
    const supply = sup?.value?.uiAmount ?? 0;

    return {
      holders,
      holderCount: holders.length,
      creatorBalanceSol: lamports / 1e9,
      supply,
      decimals: DECIMALS,
    };
  },
});
