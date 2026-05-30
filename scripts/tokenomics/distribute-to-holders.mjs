/**
 * scripts/tokenomics/distribute-to-holders.mjs
 *
 * STEP 3 of the $DTOUR tokenomics pipeline: pro-rata distribute the holder
 * reward slice (real SOL from collected pump.fun creator fees) to $DTOUR
 * holders, proportional to how much $DTOUR each OWNER holds.
 *
 * Pipeline:
 *   snapshot holders (getProgramAccounts = complete; getTokenLargestAccounts =
 *   top-20 only) → normalize by token decimals → aggregate token accounts to
 *   owner wallets → drop owners below min-balance → drop the exclude-list
 *   (creator / builder / treasury / buyback / AMM-pool) → pro-rata weight =
 *   ownerBalance / SUM(included owner balances) (NOT / total supply) → apply
 *   the dust floor (skip tiny payouts) → pay.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ SAFETY: DRY-RUN BY DEFAULT. Prints the FULL payout table + a totals        ║
 * ║ reconciliation, then EXITS WITHOUT SENDING. Real SOL transfers require     ║
 * ║ --execute. The signing key comes from env CREATOR_WALLET_SECRET (base58)   ║
 * ║ ONLY — never logged, only touched under --execute. Pro-rata EXCLUDES the   ║
 * ║ creator/pool/treasury/buyback wallets (no self-payment, no pool sloshing). ║
 * ║                                                                            ║
 * ║ Under --execute the script PRE-FLIGHTS the paying wallet's balance: it     ║
 * ║ requires balance >= sum(payouts) + N×~5000-lamport base fees + the         ║
 * ║ configured creatorReserveSol, and fatal()s before sending if short.        ║
 * ║                                                                            ║
 * ║ Confirm-timeout safe: an "attempted" ledger record (signature + blockhash  ║
 * ║ height) is persisted BEFORE each send, so a tx that lands but times out on ║
 * ║ confirmation is reconciled on the next run (never blindly re-sent).        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * USAGE (run via bun):
 *   bun scripts/tokenomics/distribute-to-holders.mjs --amount 2.5
 *       → DRY-RUN: snapshot, filter, pro-rata 2.5 SOL across eligible owners,
 *         apply dust floor, print the full payout table + reconciliation, exit.
 *
 *   bun scripts/tokenomics/distribute-to-holders.mjs --amount 2.5 --method getProgramAccounts
 *       → choose the snapshot method (default comes from config.distribution).
 *
 *   bun scripts/tokenomics/distribute-to-holders.mjs --execute --amount 2.5
 *       → send the SOL transfers; append a paid-out manifest so re-runs of the
 *         same epoch never double-pay the same owner.
 *
 *   --config <path>   use a config other than scripts/tokenomics/config.json
 *
 * The --amount (SOL) is the holder slice to distribute — typically the
 * holderPoolSol value printed by collect-and-split.mjs.
 *
 * ENV (keys ONLY from env, never committed/logged):
 *   CREATOR_WALLET_SECRET   base58 secret of the paying (creator) wallet  (required for --execute)
 *   RPC_URL                 real RPC endpoint (falls back to SOLANA_RPC_URL)
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SystemProgram, Transaction } from "@solana/web3.js";
import {
  parseArgs,
  loadConfig,
  validateConfig,
  loadCreatorKeypair,
  getConnection,
  solToLamports,
  lamportsToSol,
  printTransferPlan,
  confirmExecute,
  buildMemoIx,
  simulateOrThrow,
  snapshotHolders,
  aggregateByOwner,
  filterHolders,
  flagProgramOwnedRecipients,
  computeProRata,
  applyDustFloor,
  readManifest,
  writeManifest,
  signatureOf,
  txLanded,
  PublicKey,
  fatal,
} from "./lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const args = parseArgs();
  const cfg = loadConfig(args.configPath);
  validateConfig(cfg);

  // The holder slice to distribute. --amount (SOL) is required here (or --pool-sol).
  const amountSol = args.amountSol ?? args.poolSol;
  if (amountSol === undefined) {
    fatal(
      "No amount given. Pass the holder-reward slice in SOL:\n" +
        "    bun scripts/tokenomics/distribute-to-holders.mjs --amount <SOL>\n" +
        "  (use the holderPoolSol printed by collect-and-split.mjs).",
    );
  }
  const poolLamports = solToLamports(amountSol);
  if (poolLamports <= 0n) fatal("--amount must be greater than 0.");

  const conn = getConnection();
  const method =
    args.method ?? cfg.distribution?.snapshotMethod ?? "getProgramAccounts";
  const decimals = cfg.tokenDecimals;
  const minBalanceTokens = cfg.distribution?.minBalanceTokens ?? 0;
  // Default the dust floor to 0.001 SOL (not 0) so a config missing the field
  // never sends sub-dust spam; set it to 0 explicitly to disable.
  const minPayoutSol = cfg.distribution?.minPayoutSol ?? 0.001;
  const minPayoutLamports = solToLamports(minPayoutSol);
  const memo = (cfg.distribution?.memo ?? "").trim();

  console.log("\n══ distribute-to-holders — $DTOUR holder rewards ══");
  console.log(`  mint            : ${cfg.mint}`);
  console.log(`  pool to pay     : ${amountSol} SOL`);
  console.log(`  paying wallet   : ${cfg.wallets.creator}`);
  console.log(`  snapshot method : ${method}`);
  console.log(`  token decimals  : ${decimals}`);
  console.log(`  min balance     : ${minBalanceTokens} $DTOUR`);
  console.log(`  dust floor      : ${minPayoutSol} SOL`);
  console.log(`  memo            : ${memo || "(none)"}`);
  console.log(`  mode            : ${args.execute ? "EXECUTE" : "DRY-RUN"}\n`);

  // ── snapshot → aggregate → filter ───────────────────────────────────────────
  console.log("  Reading holders…");
  const accounts = await snapshotHolders(conn, cfg.mint, { method, decimals });
  const ownerMap = aggregateByOwner(accounts);
  console.log(
    `  ${accounts.length} token account(s) → ${ownerMap.size} owner(s).`,
  );

  const excludeWallets = cfg.distribution?.excludeWallets ?? [];
  const holders = filterHolders(ownerMap, { minBalanceTokens, excludeWallets });
  console.log(
    `  ${holders.length} owner(s) eligible after min-balance + exclude-list.\n`,
  );
  if (holders.length === 0) {
    console.log("  No eligible holders. Nothing to distribute. Exiting.\n");
    return;
  }

  // ── flag program-owned recipients (likely LP/pool PDA pasted by mistake) ─────
  // The exclude-list matches on token-account OWNER. If an operator pasted the
  // pool/market/ATA address instead of the LP token account's actual OWNER (a
  // PDA), the LP slips through and silently takes the largest payout. Flag any
  // included recipient whose account is program-owned so it can be reviewed.
  const flagged = await flagProgramOwnedRecipients(
    conn,
    holders.map((h) => h.owner),
  );
  if (flagged.length > 0) {
    console.warn(
      "\n⚠  WARN: the following eligible recipients are PROGRAM-OWNED accounts, not\n" +
        "   normal system wallets. This usually means an LP/pool/market or ATA\n" +
        "   address leaked through — review and exclude it by its OWNER (a PDA),\n" +
        "   NOT by the pool/market/mint/ATA address:\n",
    );
    for (const f of flagged) {
      console.warn(`     ⚠ ${f.owner}  (owned by program ${f.programOwner})`);
    }
    console.warn(
      "\n   Add the correct OWNER to distribution.excludeWallets before --execute.\n",
    );
  }

  // ── idempotency: skip owners already paid for this epoch/pool ───────────────
  // Manifest is keyed by { mint, pool-amount } so a re-run of the SAME
  // distribution (crash/resume) never double-pays. CAVEAT: the key is the
  // amount, so reusing the SAME round --amount for a DIFFERENT later epoch would
  // be treated as the same distribution and skip everyone ("Nothing left to
  // pay"). Use distinct amounts per epoch (the precise holderPoolSol from
  // collect-and-split rarely repeats), or delete/rotate the manifest between
  // genuinely new distributions.
  const epochKey = `${cfg.mint}:${amountSol}`;
  const manifestPath = resolve(
    __dirname,
    `payouts-${cfg.mint.slice(0, 6)}.manifest.json`,
  );
  const ledger = readManifest(manifestPath) ?? { mint: cfg.mint, epochs: {} };
  const epochLedger = ledger.epochs?.[epochKey];

  // ── reconcile attempted-but-unconfirmed txs (confirm-timeout safety) ────────
  // An "attempted" record is written + persisted IMMEDIATELY BEFORE each send.
  // If a tx lands but its confirmation times out, it sits in `attempted` (not
  // `paid`). On any run, before paying, we resolve each such entry on-chain so a
  // tx that actually landed is NEVER resent (which would double-pay real SOL).
  const attempted = epochLedger?.attempted ?? {};
  const attemptedOwners = Object.keys(attempted).filter(
    (o) => !(epochLedger?.paid && epochLedger.paid[o]),
  );
  if (attemptedOwners.length > 0) {
    console.log(
      `  ↻ reconciling ${attemptedOwners.length} attempted-but-unconfirmed payout(s)…`,
    );
    let currentHeight = null;
    for (const owner of attemptedOwners) {
      const rec = attempted[owner];
      const landed = await txLanded(conn, rec.signature);
      if (landed === "landed") {
        // It made it on-chain — promote to paid so it's never resent.
        epochLedger.paid = epochLedger.paid ?? {};
        epochLedger.paid[owner] = {
          lamports: rec.lamports,
          sol: rec.lamports ? lamportsToSol(BigInt(rec.lamports)) : undefined,
          signature: rec.signature,
          at: rec.ts,
          reconciled: true,
        };
        delete attempted[owner];
        writeManifest(manifestPath, ledger);
        console.log(`    ✓ ${owner}: prior tx landed (${rec.signature}) — counted as PAID.`);
        continue;
      }
      // Not landed (yet). Only treat as definitively-not-landed (safe to resend)
      // if the tx's blockhash has EXPIRED — otherwise it could still be landing.
      if (currentHeight === null) {
        currentHeight = await conn.getBlockHeight("confirmed");
      }
      const expired =
        rec.lastValidBlockHeight !== undefined &&
        currentHeight > rec.lastValidBlockHeight;
      if (landed === "absent" || expired) {
        // Definitely did not land (failed, or blockhash expired with no status).
        delete attempted[owner];
        writeManifest(manifestPath, ledger);
        console.log(
          `    • ${owner}: prior tx did NOT land (blockhash expired/absent) — will retry.`,
        );
      } else {
        // status "unknown" and blockhash may still be valid → could still land.
        // NEVER resend blindly. Skip this owner this run.
        console.warn(
          `    ⚠ ${owner}: prior tx (${rec.signature}) is unresolved and its\n` +
            `      blockhash may still be valid — NOT resending this run to avoid a\n` +
            `      double-pay. Re-run later once it confirms or expires.`,
        );
      }
    }
    console.log("");
  }

  const alreadyPaid = new Set(
    Object.keys(epochLedger?.paid ?? ledger.epochs?.[epochKey]?.paid ?? {}),
  );
  // Owners whose attempted tx is still unresolved (kept above) must NOT be paid
  // again this run.
  const unresolvedAttempts = new Set(Object.keys(attempted));
  if (alreadyPaid.size > 0) {
    console.log(
      `  ↻ ledger: ${alreadyPaid.size} owner(s) already paid for this pool; they will be skipped.\n`,
    );
  }

  // ── pro-rata + dust floor ───────────────────────────────────────────────────
  const { payouts, remainderLamports } = computeProRata(holders, poolLamports);
  const { kept, skipped } = applyDustFloor(payouts, minPayoutLamports);

  // Filter out already-paid owners (idempotent re-run) AND owners whose prior
  // attempted tx is still unresolved (could still land — never resend blindly).
  const toPay = kept.filter(
    (p) => !alreadyPaid.has(p.owner) && !unresolvedAttempts.has(p.owner),
  );

  // ── print the full payout table + reconciliation ────────────────────────────
  printTransferPlan(
    toPay.map((p) => ({
      from: cfg.wallets.creator,
      to: p.owner,
      amountSol: lamportsToSol(p.lamports),
      reason: `${(p.shareFraction * 100).toFixed(4)}% · ${p.balanceTokens.toLocaleString()} $DTOUR`,
    })),
  );

  const paidLamports = toPay.reduce((s, p) => s + BigInt(p.lamports), 0n);
  const skippedLamports = skipped.reduce((s, p) => s + BigInt(p.lamports), 0n);
  // Per-run SOL cap (config; default 5). Informational in dry-run; ENFORCED
  // (abort before any send) under --execute below.
  const perRunCapSol = cfg.perRunCapSol ?? 5;
  const capLamports = solToLamports(perRunCapSol);
  console.log("  RECONCILIATION:");
  console.log(`    pool                : ${lamportsToSol(poolLamports)} SOL`);
  console.log(
    `    paid (${toPay.length} owners) : ${lamportsToSol(paidLamports)} SOL`,
  );
  console.log(
    `    per-run cap         : ${perRunCapSol} SOL${paidLamports > capLamports ? "  ⚠ OUTGOING TOTAL EXCEEDS CAP — --execute will ABORT" : ""}`,
  );
  console.log(
    `    dust-skipped (${skipped.length})    : ${lamportsToSol(skippedLamports)} SOL (below ${minPayoutSol} SOL floor)`,
  );
  console.log(
    `    rounding remainder  : ${lamportsToSol(remainderLamports)} SOL (stays in paying wallet → treasury / next epoch)`,
  );
  if (alreadyPaid.size > 0) {
    console.log(`    already-paid skipped: ${alreadyPaid.size} owner(s)`);
  }
  console.log("");

  if (toPay.length === 0) {
    console.log("  Nothing left to pay (all dust or already paid). Exiting.\n");
    return;
  }

  if (!confirmExecute(args.execute, "distribute")) return;

  // ── per-run SOL cap: abort BEFORE any send if the TOTAL outgoing SOL to
  // holders this run exceeds the configured cap (config.perRunCapSol, default
  // 5). A circuit-breaker against a fat-fingered --amount that would distribute
  // far more than intended. Mirrors collect-and-split's disburse-vs-cap guard.
  if (paidLamports > capLamports) {
    fatal(
      "per-run SOL cap exceeded — refusing to send.\n" +
        `    outgoing to holders : ${lamportsToSol(paidLamports)} SOL (${toPay.length} owners)\n` +
        `    perRunCapSol        : ${perRunCapSol} SOL\n` +
        "  Distribute a smaller --amount, or raise perRunCapSol in config.json.",
    );
  }

  // ── EXECUTE: send each payout, appending to the ledger as we go ─────────────
  const creatorKp = loadCreatorKeypair();
  const creatorPk = new PublicKey(cfg.wallets.creator);
  if (creatorKp.publicKey.toBase58() !== cfg.wallets.creator) {
    fatal(
      "CREATOR_WALLET_SECRET does not match wallets.creator in config.\n" +
        "  Refusing to sign with a key for a different wallet.",
    );
  }

  // ── pre-flight: ensure the payer can cover all payouts + per-tx fees + reserve.
  // Each transfer costs ~5000 lamports base fee (no priority fee on these simple
  // SystemProgram transfers). We require balance >= sum(payouts) + N×5000 +
  // creatorReserveSol, BEYOND which nothing should be drained.
  const BASE_FEE_LAMPORTS = 5000n;
  const reserveLamports = solToLamports(cfg.collect?.creatorReserveSol ?? 0);
  const estFeesLamports = BigInt(toPay.length) * BASE_FEE_LAMPORTS;
  const requiredLamports = paidLamports + estFeesLamports + reserveLamports;
  const balanceLamports = BigInt(await conn.getBalance(creatorPk, "confirmed"));
  if (balanceLamports < requiredLamports) {
    fatal(
      "Insufficient balance in the paying (creator) wallet for this distribution.\n" +
        `    balance      : ${lamportsToSol(balanceLamports)} SOL\n` +
        `    payouts       : ${lamportsToSol(paidLamports)} SOL (${toPay.length} owners)\n` +
        `    est. fees     : ${lamportsToSol(estFeesLamports)} SOL (${toPay.length} × ~0.000005)\n` +
        `    reserve kept  : ${lamportsToSol(reserveLamports)} SOL\n` +
        `    REQUIRED      : ${lamportsToSol(requiredLamports)} SOL\n` +
        `  Top up the creator wallet or distribute a smaller --amount.`,
    );
  }

  ledger.epochs[epochKey] = ledger.epochs[epochKey] ?? {
    poolSol: amountSol,
    startedAt: new Date().toISOString(),
    paid: {},
  };
  const epoch = ledger.epochs[epochKey];
  epoch.paid = epoch.paid ?? {};
  // `attempted` records a tx (signature + blockhash height) BEFORE it is sent so
  // a confirm-timeout can be reconciled instead of double-paid on resume.
  epoch.attempted = epoch.attempted ?? {};

  let sent = 0;
  for (const p of toPay) {
    // (#9) never send a zero/negative payout (mirror collect-and-split).
    if (BigInt(p.lamports) <= 0n) {
      console.log(`  • ${p.owner}: 0 SOL — skipped.`);
      continue;
    }
    try {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: creatorPk,
          toPubkey: new PublicKey(p.owner),
          lamports: Number(p.lamports),
        }),
      );
      if (memo) tx.add(buildMemoIx(memo));
      const { blockhash, lastValidBlockHeight } =
        await conn.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = creatorPk;
      tx.sign(creatorKp);

      // Gate the real send on a successful simulation. Placed BEFORE the
      // "attempted" ledger write so a sim failure leaves no orphan record; the
      // throw is caught below and breaks the loop (abort before any send).
      await simulateOrThrow(conn, tx, `distribute:${p.owner}`);

      // Record an "attempted" entry + persist BEFORE sending, so a tx that lands
      // but times out on confirmation is reconciled (not resent) on a later run.
      const sig = signatureOf(tx);
      epoch.attempted[p.owner] = {
        lamports: p.lamports.toString(),
        signature: sig,
        recentBlockhash: blockhash,
        lastValidBlockHeight,
        ts: new Date().toISOString(),
      };
      writeManifest(manifestPath, ledger);

      await conn.sendRawTransaction(tx.serialize());
      await conn.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed",
      );

      epoch.paid[p.owner] = {
        lamports: p.lamports.toString(),
        sol: lamportsToSol(p.lamports),
        signature: sig,
        at: new Date().toISOString(),
      };
      delete epoch.attempted[p.owner]; // confirmed → drop the attempted record
      // Persist after EACH payout so a crash mid-run never double-pays on resume.
      writeManifest(manifestPath, ledger);
      sent++;
      console.log(
        `  ✓ ${lamportsToSol(p.lamports)} SOL → ${p.owner}  (${sig})`,
      );
    } catch (e) {
      console.error(`  ✗ FAILED → ${p.owner}: ${e?.message ?? e}`);
      console.error(
        "    Stopping to avoid partial/inconsistent state. Re-run --execute ",
      );
      console.error(
        "    with the same --amount to resume; paid owners are skipped via the\n" +
          "    manifest. If this was a CONFIRM TIMEOUT, the attempted tx is recorded\n" +
          "    and will be reconciled on the next run (landed → counted as paid; not\n" +
          "    landed → retried) — it is never blindly re-sent.",
      );
      break;
    }
  }

  console.log(
    `\n  ✓ paid ${sent}/${toPay.length} owner(s). Ledger: ${manifestPath}\n`,
  );
}

main().catch((e) => fatal(e?.message ?? String(e)));
