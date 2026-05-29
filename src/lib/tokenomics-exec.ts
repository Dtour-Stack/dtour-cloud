/**
 * src/lib/tokenomics-exec.ts — CLIENT-SIDE tokenomics Execute orchestration.
 *
 * All @solana/web3.js tx-building happens HERE, in the browser. The ONLY signer
 * is the connected wallet (wallet-adapter signTransaction / signAllTransactions);
 * there is NO private key anywhere. Every signed tx is base64-serialized and
 * relayed through admin-gated Convex actions — the client never calls an RPC
 * sendTransaction and never sees the Helius key. The math (pro-rata, dust floor)
 * and the collect drain-protection are ported from scripts/tokenomics/lib.mjs.
 */

import {
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

export const LAMPORTS_PER_SOL = 1_000_000_000;
const PUMPPORTAL_LOCAL = "https://pumpportal.fun/api/trade-local";
const SYSTEM_PROGRAM_ID = SystemProgram.programId.toBase58();

// ── base64 (browser; uses the Buffer shim imported in main.tsx) ───────────────

export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** Serialize a legacy Transaction that is NOT yet signed (for simulate). */
export function serializeUnsignedBase64(tx: Transaction): string {
  return bytesToBase64(
    tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
  );
}

// ── SOL / lamports (BigInt-safe, mirrors lib.mjs) ─────────────────────────────

export function lamportsToSol(lamports: bigint | number): number {
  return Number(BigInt(lamports)) / LAMPORTS_PER_SOL;
}

export function solToLamports(sol: number): bigint {
  return BigInt(Math.round(sol * LAMPORTS_PER_SOL));
}

// ── eligibility + pro-rata (ported from lib.mjs computeProRata/applyDustFloor) ─

export type Holder = { owner: string; amount: number };
export type Cfg = {
  splitBps: { builder: number; holders: number; buyback: number; treasury: number };
  wallets: { creator: string; builder: string; treasury: string; buyback: string };
  minBalanceTokens: number;
  minPayoutSol: number;
  creatorReserveSol: number;
  excludeWallets: string[];
  perRunCapSol: number;
};

/**
 * Owners that are NEVER eligible for pro-rata, hard-coded so they can't be paid
 * even if dropped from the editable config list. The $DTOUR LP pool owner
 * (Token-2022, ~256M / ~26% of supply) tops every payout and would drain the
 * holder slice — it MUST always be excluded.
 */
export const ALWAYS_EXCLUDE_OWNERS = [
  "5ZZLXY1YGvkexPgFQjH5pnhviaDsRut56PgEiYeAyTRE", // $DTOUR LP pool owner
] as const;

/**
 * The exclusion set used in BOTH the preview and the distribute plan: the 4 pool
 * wallets + the hard-coded ALWAYS_EXCLUDE_OWNERS are ALWAYS unioned in CODE (so
 * dropping one from the config list can't accidentally pay it), PLUS
 * cfg.excludeWallets (any additional operator-supplied owners).
 */
export function buildExcludeSet(cfg: Cfg): Set<string> {
  return new Set<string>([
    ...Object.values(cfg.wallets),
    ...ALWAYS_EXCLUDE_OWNERS,
    ...(cfg.excludeWallets ?? []),
  ]);
}

/** Holders eligible for pro-rata: not excluded, at/above minBalanceTokens. */
export function eligibleHolders(holders: Holder[], cfg: Cfg): Holder[] {
  const exclude = buildExcludeSet(cfg);
  return holders
    .filter((h) => !exclude.has(h.owner) && h.amount >= cfg.minBalanceTokens)
    .sort((a, b) => b.amount - a.amount);
}

export type Payout = { owner: string; lamports: bigint; amount: number; shareFraction: number };

/**
 * Pro-rata over a holder pool (lamports). Denominator = SUM of INCLUDED balances
 * (NOT total supply). Lamports floored per owner; the remainder stays in the
 * creator wallet (→ treasury / next epoch).
 */
export function computeProRata(
  holders: Holder[],
  poolLamports: bigint,
): { payouts: Payout[]; remainderLamports: bigint } {
  const sumIncluded = holders.reduce((s, h) => s + h.amount, 0);
  if (sumIncluded <= 0) return { payouts: [], remainderLamports: poolLamports };
  let assigned = 0n;
  const denom = BigInt(Math.round(sumIncluded * 1e12));
  const payouts = holders.map((h) => {
    const lamports = (poolLamports * BigInt(Math.round(h.amount * 1e12))) / denom;
    assigned += lamports;
    return {
      owner: h.owner,
      lamports,
      amount: h.amount,
      shareFraction: h.amount / sumIncluded,
    };
  });
  return { payouts, remainderLamports: poolLamports - assigned };
}

/** Drop payouts below the dust floor (mirrors lib.mjs applyDustFloor). */
export function applyDustFloor(
  payouts: Payout[],
  minPayoutLamports: bigint,
): { kept: Payout[]; skipped: Payout[] } {
  const kept: Payout[] = [];
  const skipped: Payout[] = [];
  for (const p of payouts) {
    if (p.lamports < minPayoutLamports) skipped.push(p);
    else kept.push(p);
  }
  return { kept, skipped };
}

/**
 * Full distribute plan from a snapshot + config + holder-pool lamports:
 * eligible → pro-rata → dust floor. Returns the kept payouts (the rows that get
 * frozen into the ledger) plus reconciliation totals.
 */
export function buildDistributePlan(
  holders: Holder[],
  cfg: Cfg,
  holdersPoolLamports: bigint,
): {
  kept: Payout[];
  skipped: Payout[];
  remainderLamports: bigint;
  totalLamports: bigint;
} {
  const eligible = eligibleHolders(holders, cfg);
  const { payouts, remainderLamports } = computeProRata(eligible, holdersPoolLamports);
  const { kept, skipped } = applyDustFloor(payouts, solToLamports(cfg.minPayoutSol));
  const totalLamports = kept.reduce((s, p) => s + p.lamports, 0n);
  return { kept, skipped, remainderLamports, totalLamports };
}

// ── batching (~15 SystemProgram.transfer per tx ≈ safe under the 1232b limit) ──

export const TRANSFERS_PER_BATCH = 15;

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Build ONE legacy Transaction with N SystemProgram.transfer ix from creator to
 * each payout, stamped with the given blockhash + feePayer=creator. Unsigned.
 */
export function buildTransferTx(
  creator: PublicKey,
  transfers: Array<{ to: string; lamports: bigint }>,
  blockhash: string,
): Transaction {
  const tx = new Transaction();
  for (const t of transfers) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: creator,
        toPubkey: new PublicKey(t.to),
        lamports: Number(t.lamports),
      }),
    );
  }
  tx.recentBlockhash = blockhash;
  tx.feePayer = creator;
  return tx;
}

// ── STEP 1 collect: PumpPortal fetch + drain protection ───────────────────────

/** POST collectCreatorFee to PumpPortal → unsigned VersionedTransaction. */
export async function fetchCollectTx(
  creator: string,
  priorityFeeSol: number,
): Promise<VersionedTransaction> {
  const res = await fetch(PUMPPORTAL_LOCAL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKey: creator,
      action: "collectCreatorFee",
      priorityFee: priorityFeeSol,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PumpPortal ${res.status}: ${text.slice(0, 300)}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  return VersionedTransaction.deserialize(bytes);
}

/**
 * Pre-sign drain protection (ported from lib.mjs assertCollectOnlyTx). Throws if
 * the fee payer is not the creator, or if any SystemProgram.transfer /
 * transferWithSeed moves SOL OUT of the creator. collectCreatorFee only moves
 * SOL INTO the creator, so anything else is a MITM'd/malicious tx — refuse.
 */
export function assertCollectOnlyTx(
  tx: VersionedTransaction,
  creator: string,
): void {
  const msg = tx.message as unknown as {
    staticAccountKeys?: PublicKey[];
    accountKeys?: PublicKey[];
    compiledInstructions?: Array<{
      programIdIndex: number;
      accountKeyIndexes?: number[];
      accounts?: number[];
      data: Uint8Array | string;
    }>;
    instructions?: Array<{
      programIdIndex: number;
      accountKeyIndexes?: number[];
      accounts?: number[];
      data: Uint8Array | string;
    }>;
  };
  const keys = (msg.staticAccountKeys ?? msg.accountKeys ?? []).map((k) =>
    k.toBase58(),
  );
  if (keys.length === 0) {
    throw new Error("PumpPortal tx has no account keys — refusing to sign.");
  }
  if (keys[0] !== creator) {
    throw new Error(
      `PumpPortal tx fee payer is NOT the creator wallet — refusing to sign. ` +
        `expected ${creator}, got ${keys[0]}.`,
    );
  }
  const ixns = msg.compiledInstructions ?? msg.instructions ?? [];
  for (const ix of ixns) {
    const programId = keys[ix.programIdIndex];
    if (programId !== SYSTEM_PROGRAM_ID) continue; // only SystemProgram moves SOL
    const acctIdx = ix.accountKeyIndexes ?? ix.accounts ?? [];
    // PumpPortal returns a v0 (MessageV0) tx whose instruction data is a
    // Uint8Array. A legacy message would carry bs58-encoded string data — we
    // fail CLOSED rather than guess an encoding (a misparse here would be a
    // false negative on the drain check). collectCreatorFee is always v0.
    if (!(ix.data instanceof Uint8Array)) {
      throw new Error(
        "PumpPortal tx has an unexpected legacy-message instruction shape — refusing to sign.",
      );
    }
    const data = ix.data;
    if (data.length < 4) continue;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const instrType = view.getUint32(0, true);
    // SystemProgram: 2 = Transfer {lamports u64@4}, 11 = TransferWithSeed.
    if (instrType === 2) {
      const fromKey = keys[acctIdx[0]];
      const lamports = data.length >= 12 ? view.getBigUint64(4, true) : 0n;
      if (fromKey === creator && lamports > 0n) {
        throw new Error(
          `PumpPortal tx moves SOL OUT of the creator wallet ` +
            `(${lamportsToSol(lamports)} SOL → ${keys[acctIdx[1]]}). ` +
            `collectCreatorFee should only move SOL INTO the creator. Refusing to sign.`,
        );
      }
    } else if (instrType === 11) {
      const fromKey = keys[acctIdx[0]];
      if (fromKey === creator) {
        throw new Error(
          "PumpPortal tx contains a transferWithSeed FROM the creator wallet — " +
            "unexpected for collectCreatorFee. Refusing to sign.",
        );
      }
    }
  }
}

// ── STEP 2 split: 3 transfers, treasury absorbs the floor-rounding dust ───────

/**
 * Compute the split slices from the SOL collected THIS run. The holders slice is
 * NOT moved (it stays in the creator wallet for step 3). builder/buyback are
 * floored by bps; treasury absorbs the dust so the moved slices + retained
 * holders slice sum back to splitLamports exactly.
 */
export function computeSplit(
  splitLamports: bigint,
  cfg: Cfg,
): { builderL: bigint; treasuryL: bigint; buybackL: bigint; holdersL: bigint } {
  const slice = (bps: number) => (splitLamports * BigInt(bps)) / 10000n;
  const builderL = slice(cfg.splitBps.builder);
  const holdersL = slice(cfg.splitBps.holders);
  const buybackL = slice(cfg.splitBps.buyback);
  let treasuryL = slice(cfg.splitBps.treasury);
  const dust = splitLamports - (builderL + holdersL + buybackL + treasuryL);
  treasuryL += dust; // treasury absorbs the floor remainder
  return { builderL, treasuryL, buybackL, holdersL };
}

/**
 * Build the split tx: creator → builder, creator → treasury(+dust), creator →
 * buyback. holdersL is NOT moved (stays in creator for distribute). Zero-amount
 * slices are dropped.
 */
export function buildSplitTx(
  cfg: Cfg,
  slices: { builderL: bigint; treasuryL: bigint; buybackL: bigint },
  blockhash: string,
): Transaction {
  const transfers: Array<{ to: string; lamports: bigint }> = [];
  if (slices.builderL > 0n) transfers.push({ to: cfg.wallets.builder, lamports: slices.builderL });
  if (slices.treasuryL > 0n) transfers.push({ to: cfg.wallets.treasury, lamports: slices.treasuryL });
  if (slices.buybackL > 0n) transfers.push({ to: cfg.wallets.buyback, lamports: slices.buybackL });
  return buildTransferTx(new PublicKey(cfg.wallets.creator), transfers, blockhash);
}

// ── misc ──────────────────────────────────────────────────────────────────────

export const solscanTx = (sig: string) => `https://solscan.io/tx/${sig}`;

/** Deterministic epoch id minted ONCE at confirm (never inline in render). */
export function mintEpoch(mint: string): string {
  return `${mint}:${Date.now()}`;
}
