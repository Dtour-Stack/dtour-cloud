import { v } from "convex/values";
import { api } from "./_generated/api";
import { action, mutation, query } from "./_generated/server";
import { logEvent } from "./events";
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
  // Owners removed from pro-rata beyond the 4 pool wallets. MUST include the LP
  // pool OWNER (Token-2022, holds ~256M / ~26% of supply) — without it the LP
  // tops the payout and drains the holder slice.
  excludeWallets: ["5ZZLXY1YGvkexPgFQjH5pnhviaDsRut56PgEiYeAyTRE"],
  // Hard SOL cap per Execute run — distribute aborts if the total exceeds it.
  perRunCapSol: 5,
};

/** Current tokenomics config (admin+). Returns defaults if unset. */
export const getConfig = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireRole(ctx, token, "admin");
    const row = await ctx.db.query("tokenomicsConfig").first();
    if (!row) return { ...DEFAULT_CONFIG, updatedAt: null };
    const { _id, _creationTime, ...cfg } = row;
    // Default the fields added after this row may have been saved.
    return {
      ...cfg,
      excludeWallets: cfg.excludeWallets ?? DEFAULT_CONFIG.excludeWallets,
      perRunCapSol: cfg.perRunCapSol ?? DEFAULT_CONFIG.perRunCapSol,
    };
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
    excludeWallets: v.array(v.string()),
    perRunCapSol: v.number(),
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
    if (!(cfg.perRunCapSol > 0) || !Number.isFinite(cfg.perRunCapSol)) {
      throw new Error("perRunCapSol must be a positive number");
    }
    // Dedupe + drop blanks; pool wallets are always excluded in code anyway.
    cfg.excludeWallets = [
      ...new Set(cfg.excludeWallets.map((w) => w.trim()).filter(Boolean)),
    ];
    const existing = await ctx.db.query("tokenomicsConfig").first();
    const doc = { ...cfg, updatedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, doc);
    else await ctx.db.insert("tokenomicsConfig", doc);
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

// ════════════════════════════════════════════════════════════════════════════
// EXECUTE FLOW — admin-gated, PURE V8 (fetch only, NEVER "use node").
//
// The client (browser wallet) builds + signs every @solana/web3.js tx and
// base64-serializes it; these actions are opaque string pass-throughs to Helius
// (RPC URL is SERVER-ONLY, read inside rpc()). The client never sees the key and
// never broadcasts directly — relayTx is the ONLY send path. Idempotency lives
// in the payoutLedger table (planned -> attempted -> paid/failed).
// ════════════════════════════════════════════════════════════════════════════

/** Admin-gate for ACTIONS (no ctx.db) — mirrors the snapshot action. */
async function requireAdminAction(ctx: any, token: string): Promise<void> {
  const role = await ctx.runQuery(api.admin.myRole, { token });
  if (role !== "admin" && role !== "super_admin") throw new Error("Forbidden");
}

/**
 * Fresh blockhash + creator balance + a priority-fee hint for the client to
 * stamp onto the split/distribute txs it builds. (The PumpPortal collect tx
 * ships its OWN blockhash — the client must NOT override it.)
 */
export const rpcPrep = action({
  args: { token: v.string() },
  handler: async (
    ctx,
    { token },
  ): Promise<{
    blockhash: string;
    lastValidBlockHeight: number;
    creatorBalanceLamports: number;
    priorityFeeMicroLamports: number;
  }> => {
    await requireAdminAction(ctx, token);
    const cfg = await ctx.runQuery(api.tokenomics.getConfig, { token });

    const bh = await rpc("getLatestBlockhash", [{ commitment: "confirmed" }]);
    const bal = await rpc("getBalance", [cfg.wallets.creator]);

    // Priority fee via Helius getPriorityFeeEstimate (SOLANA_RPC_URL is Helius),
    // best-effort with a fixed fallback. Priority fee is non-critical to safety
    // (cap + simulate + ledger are the real guards), so a bad/missing estimate
    // must NEVER block a run.
    let priorityFeeMicroLamports = 1000;
    try {
      const est = await rpc("getPriorityFeeEstimate", [
        { accountKeys: [cfg.wallets.creator], options: { recommended: true } },
      ]);
      const fee = est?.priorityFeeEstimate;
      if (typeof fee === "number" && Number.isFinite(fee) && fee > 0) {
        priorityFeeMicroLamports = Math.ceil(fee);
      }
    } catch {
      // keep the fallback
    }

    return {
      blockhash: bh?.value?.blockhash,
      lastValidBlockHeight: bh?.value?.lastValidBlockHeight ?? 0,
      creatorBalanceLamports: bal?.value ?? 0,
      priorityFeeMicroLamports,
    };
  },
});

/**
 * Simulate a base64 tx via Helius BEFORE asking the wallet to sign. sigVerify is
 * false because the tx is unsigned at simulate time. Client aborts the step on
 * ok===false.
 */
export const simulateTx = action({
  args: { token: v.string(), txBase64: v.string() },
  handler: async (
    ctx,
    { token, txBase64 },
  ): Promise<{
    ok: boolean;
    err: unknown;
    logs: string[] | null;
    unitsConsumed: number | null;
  }> => {
    await requireAdminAction(ctx, token);
    const r = await rpc("simulateTransaction", [
      txBase64,
      {
        encoding: "base64",
        sigVerify: false,
        replaceRecentBlockhash: false,
        commitment: "confirmed",
      },
    ]);
    const value = r?.value ?? {};
    return {
      ok: value.err == null,
      err: value.err ?? null,
      logs: value.logs ?? null,
      unitsConsumed: value.unitsConsumed ?? null,
    };
  },
});

/**
 * The ONLY broadcast path. Relays a SIGNED base64 tx to Helius sendTransaction.
 * The client never touches an RPC sendTransaction (which would bypass the cap +
 * ledger + server relay).
 */
export const relayTx = action({
  args: { token: v.string(), txBase64: v.string() },
  handler: async (ctx, { token, txBase64 }): Promise<{ signature: string }> => {
    await requireAdminAction(ctx, token);
    const signature = await rpc("sendTransaction", [
      txBase64,
      {
        encoding: "base64",
        skipPreflight: false,
        preflightCommitment: "confirmed",
        maxRetries: 3,
      },
    ]);
    return { signature };
  },
});

/**
 * Tri-state on-chain status per signature — the EXACT mapping from lib.mjs
 * txLanded(): status+err -> "absent" (failed, safe to resend); confirmed/finalized
 * -> "landed"; processed-only or no-status -> "unknown" (NEVER resend while the
 * blockhash may still be valid). The client combines "unknown" + blockhash
 * expiry (via blockHeight) to decide definitive non-landing.
 */
export const txStatuses = action({
  args: { token: v.string(), signatures: v.array(v.string()) },
  handler: async (
    ctx,
    { token, signatures },
  ): Promise<
    Array<{ signature: string; status: "landed" | "absent" | "unknown"; err: unknown }>
  > => {
    await requireAdminAction(ctx, token);
    if (signatures.length === 0) return [];
    const r = await rpc("getSignatureStatuses", [
      signatures,
      { searchTransactionHistory: true },
    ]);
    const value: Array<{
      err?: unknown;
      confirmationStatus?: string;
    } | null> = r?.value ?? [];
    const out = signatures.map((signature, i) => {
      const st = value[i];
      if (st) {
        if (st.err) return { signature, status: "absent" as const, err: st.err };
        const c = st.confirmationStatus;
        if (c === "confirmed" || c === "finalized") {
          return { signature, status: "landed" as const, err: null };
        }
        return { signature, status: "unknown" as const, err: null };
      }
      return { signature, status: "unknown" as const, err: null };
    });

    // getSignatureStatuses' cache drops landed txs after a window — even with
    // searchTransactionHistory it can return null for a tx that DID land. That
    // null would read as "unknown", and once the blockhash expires reconcileEpoch
    // promotes unknown→failed→RE-PAY. getTransaction queries long-term storage
    // and is authoritative, so we resolve every remaining "unknown" against it.
    // FAIL-SAFE: an RPC throw/error here stays "unknown" (never "absent"), so a
    // transient hiccup can never flip a landed tx to a retry.
    for (let i = 0; i < out.length; i++) {
      if (out[i].status !== "unknown") continue;
      try {
        const tx = await rpc("getTransaction", [
          out[i].signature,
          { commitment: "confirmed", maxSupportedTransactionVersion: 0 },
        ]);
        if (tx === null || tx === undefined) continue; // genuinely not found → stay unknown
        const metaErr = tx?.meta?.err ?? null;
        out[i] =
          metaErr == null
            ? { signature: out[i].signature, status: "landed" as const, err: null }
            : { signature: out[i].signature, status: "absent" as const, err: metaErr };
      } catch {
        // RPC unavailable / errored → leave "unknown" (fail-safe; no re-pay).
      }
    }
    return out;
  },
});

/** Current confirmed block height — lets the client decide blockhash expiry. */
export const blockHeight = action({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<{ height: number }> => {
    await requireAdminAction(ctx, token);
    const h = await rpc("getBlockHeight", [{ commitment: "confirmed" }]);
    return { height: typeof h === "number" ? h : 0 };
  },
});

// ── ledger mutations / query ──────────────────────────────────────────────────

/**
 * Freeze the distribution plan: insert a "planned" row per owner IF none exists
 * for (epoch, owner). Idempotent — re-confirm of the same epoch never
 * duplicates. Called once at confirm BEFORE any relay; resume reads these rows
 * and recomputes nothing for known owners (amounts never drift).
 */
export const ledgerWritePlan = mutation({
  args: {
    token: v.string(),
    epoch: v.string(),
    rows: v.array(v.object({ owner: v.string(), lamports: v.string() })),
  },
  handler: async (ctx, { token, epoch, rows }): Promise<{ written: number }> => {
    const caller = await requireRole(ctx, token, "admin");
    let written = 0;
    for (const row of rows) {
      const existing = await ctx.db
        .query("payoutLedger")
        .withIndex("by_epoch_owner", (q) =>
          q.eq("epoch", epoch).eq("owner", row.owner),
        )
        .unique();
      if (existing) continue;
      await ctx.db.insert("payoutLedger", {
        epoch,
        owner: row.owner,
        lamports: row.lamports,
        status: "planned",
      });
      written++;
    }
    const { logEvent } = await import("./events");
    await logEvent(ctx, "tokenomics.execute", {
      pubkey: caller.pubkey,
      data: { phase: "plan", epoch, rows: rows.length, written },
    });
    return { written };
  },
});

/**
 * Mark all owners in a batch tx as "attempted" with the SHARED signature +
 * blockhash, BEFORE the client relays. MUST be awaited (persisted) before
 * relayTx — mirrors the script writing the attempted record before send.
 */
export const ledgerMarkAttempt = mutation({
  args: {
    token: v.string(),
    epoch: v.string(),
    owners: v.array(v.string()),
    signature: v.string(),
    recentBlockhash: v.string(),
    lastValidBlockHeight: v.number(),
  },
  handler: async (
    ctx,
    { token, epoch, owners, signature, recentBlockhash, lastValidBlockHeight },
  ): Promise<{ ok: true }> => {
    await requireRole(ctx, token, "admin");
    for (const owner of owners) {
      const row = await ctx.db
        .query("payoutLedger")
        .withIndex("by_epoch_owner", (q) =>
          q.eq("epoch", epoch).eq("owner", owner),
        )
        .unique();
      if (!row) continue;
      // Server-side double-pay backstop: never demote a paid owner back to
      // "attempted" (which would make their batch eligible to re-relay). The
      // client shouldn't pass paid owners, but the ledger guard ensures a client
      // bug can't cause a double-pay. (Mirrors the never-demote guard in
      // ledgerMarkResult.)
      if (row.status === "paid") continue;
      await ctx.db.patch(row._id, {
        status: "attempted",
        signature,
        recentBlockhash,
        lastValidBlockHeight,
        attemptedAt: Date.now(),
      });
    }
    return { ok: true };
  },
});

/**
 * Patch a batch's owners to "paid" (sets confirmedAt) or "failed" (retry next
 * run). Called after the client confirms via txStatuses, or by reconcileEpoch.
 */
export const ledgerMarkResult = mutation({
  args: {
    token: v.string(),
    epoch: v.string(),
    owners: v.array(v.string()),
    status: v.union(v.literal("paid"), v.literal("failed")),
    reconciled: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { token, epoch, owners, status, reconciled },
  ): Promise<{ ok: true }> => {
    const caller = await requireRole(ctx, token, "admin");
    for (const owner of owners) {
      const row = await ctx.db
        .query("payoutLedger")
        .withIndex("by_epoch_owner", (q) =>
          q.eq("epoch", epoch).eq("owner", owner),
        )
        .unique();
      if (!row) continue;
      // Never demote a paid row.
      if (row.status === "paid" && status !== "paid") continue;
      await ctx.db.patch(row._id, {
        status,
        ...(status === "paid" ? { confirmedAt: Date.now() } : {}),
        ...(reconciled !== undefined ? { reconciled } : {}),
      });
    }
    const { logEvent } = await import("./events");
    await logEvent(ctx, "tokenomics.execute", {
      pubkey: caller.pubkey,
      data: { phase: "result", epoch, owners: owners.length, status },
    });
    return { ok: true };
  },
});

/**
 * Cancel every still-"planned" row in epochs OTHER than `exceptEpoch` — called at
 * the start of a FRESH distribution. "planned" means the row was frozen but NEVER
 * relayed (no money moved), so cancelling is always safe. Without this, an
 * abandoned all-planned epoch (e.g. the wallet signature was rejected, then the
 * operator re-Collected instead of Resuming) lingers in incompleteEpochs and a
 * later Resume would pay those owners again. NEVER touches attempted/paid/failed
 * — a genuinely in-flight epoch is unaffected and stays resumable.
 */
export const cancelStalePlanned = mutation({
  args: { token: v.string(), exceptEpoch: v.string() },
  handler: async (ctx, { token, exceptEpoch }): Promise<{ cancelled: number }> => {
    const caller = await requireRole(ctx, token, "admin");
    const all = await ctx.db.query("payoutLedger").collect();
    const planned = all.filter(
      (r) => r.status === "planned" && r.epoch !== exceptEpoch,
    );
    for (const row of planned) {
      await ctx.db.patch(row._id, { status: "cancelled" as const });
    }
    if (planned.length > 0) {
      await logEvent(ctx, "tokenomics.execute", {
        pubkey: caller.pubkey,
        data: { phase: "cancel-stale-planned", exceptEpoch, cancelled: planned.length },
      });
    }
    return { cancelled: planned.length };
  },
});

/** All ledger rows for an epoch — powers resume + the reactive progress UI. */
export const ledgerForEpoch = query({
  args: { token: v.string(), epoch: v.string() },
  handler: async (
    ctx,
    { token, epoch },
  ): Promise<
    Array<{
      owner: string;
      lamports: string;
      status: string;
      signature?: string;
      lastValidBlockHeight?: number;
    }>
  > => {
    await requireRole(ctx, token, "admin");
    const rows = await ctx.db
      .query("payoutLedger")
      .withIndex("by_epoch", (q) => q.eq("epoch", epoch))
      .collect();
    return rows.map((r) => ({
      owner: r.owner,
      lamports: r.lamports,
      status: r.status,
      signature: r.signature,
      lastValidBlockHeight: r.lastValidBlockHeight,
    }));
  },
});

/** Distinct epochs with at least one unfinished row — drives the resume picker. */
export const incompleteEpochs = query({
  args: { token: v.string() },
  handler: async (
    ctx,
    { token },
  ): Promise<Array<{ epoch: string; total: number; paid: number; pending: number }>> => {
    await requireRole(ctx, token, "admin");
    const rows = await ctx.db.query("payoutLedger").collect();
    const byEpoch = new Map<
      string,
      { total: number; paid: number; pending: number }
    >();
    for (const r of rows) {
      if (r.status === "cancelled") continue; // terminal, never relayed → ignore
      const e = byEpoch.get(r.epoch) ?? { total: 0, paid: 0, pending: 0 };
      e.total++;
      if (r.status === "paid") e.paid++;
      else e.pending++;
      byEpoch.set(r.epoch, e);
    }
    return [...byEpoch.entries()]
      .filter(([, val]) => val.pending > 0)
      .map(([epoch, val]) => ({ epoch, ...val }))
      .sort((a, b) => (a.epoch < b.epoch ? 1 : -1));
  },
});

/**
 * Resolve "attempted" rows on-chain SERVER-SIDE before any new relay (ports the
 * script's reconcile loop). landed -> paid+reconciled; absent OR blockhash
 * expired -> failed (retry); unknown + blockhash may still be valid -> leave
 * "attempted" (NEVER resend). Run at the START of any distribute resume.
 */
export const reconcileEpoch = action({
  args: { token: v.string(), epoch: v.string() },
  handler: async (
    ctx,
    { token, epoch },
  ): Promise<{ reconciled: number; stillUnknown: number; reconciledOwners: string[] }> => {
    await requireAdminAction(ctx, token);

    const rows: Array<{
      owner: string;
      lamports: string;
      status: string;
      signature?: string;
      lastValidBlockHeight?: number;
    }> = await ctx.runQuery(api.tokenomics.ledgerForEpoch, { token, epoch });
    const attempted = rows.filter((r) => r.status === "attempted");
    if (attempted.length === 0) {
      return { reconciled: 0, stillUnknown: 0, reconciledOwners: [] };
    }

    const sigs = [
      ...new Set(attempted.map((r) => r.signature).filter(Boolean) as string[]),
    ];
    const statuses: Array<{
      signature: string;
      status: "landed" | "absent" | "unknown";
      err: unknown;
    }> = await ctx.runAction(api.tokenomics.txStatuses, {
      token,
      signatures: sigs,
    });
    const bySig = new Map(statuses.map((s) => [s.signature, s.status]));

    let currentHeight: number | null = null;
    const reconciledOwners: string[] = [];
    let stillUnknown = 0;

    const landed: string[] = [];
    const failed: string[] = [];
    for (const row of attempted) {
      const st = row.signature ? bySig.get(row.signature) : "unknown";
      if (st === "landed") {
        landed.push(row.owner);
        continue;
      }
      if (st === "absent") {
        failed.push(row.owner);
        continue;
      }
      // unknown — only treat as failed if the blockhash has EXPIRED.
      if (currentHeight === null) {
        const h = await ctx.runAction(api.tokenomics.blockHeight, { token });
        currentHeight = Number(h.height);
      }
      const height: number = currentHeight;
      const expired =
        row.lastValidBlockHeight !== undefined &&
        height > row.lastValidBlockHeight;
      if (expired) failed.push(row.owner);
      else stillUnknown++;
    }

    if (landed.length > 0) {
      await ctx.runMutation(api.tokenomics.ledgerMarkResult, {
        token,
        epoch,
        owners: landed,
        status: "paid",
        reconciled: true,
      });
      reconciledOwners.push(...landed);
    }
    if (failed.length > 0) {
      await ctx.runMutation(api.tokenomics.ledgerMarkResult, {
        token,
        epoch,
        owners: failed,
        status: "failed",
      });
    }

    return {
      reconciled: landed.length + failed.length,
      stillUnknown,
      reconciledOwners,
    };
  },
});
