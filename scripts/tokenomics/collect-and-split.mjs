/**
 * scripts/tokenomics/collect-and-split.mjs
 *
 * STEP 1 + 2 of the $DTOUR tokenomics pipeline, in one run:
 *   (1) COLLECT — claim pump.fun creator fees (real SOL) to the creator wallet
 *       via PumpPortal's local/self-sign endpoint (action: collectCreatorFee).
 *   (2) SPLIT  — divide the swept SOL (creator balance − reserve, or --amount)
 *       by the config bps into builder / holders / buyback / treasury slices,
 *       and move the builder + treasury slices to their pool wallets.
 *
 * The holders + buyback slices are NOT moved here — they stay in the creator
 * wallet and are recorded to a run-manifest for distribute-to-holders.mjs (and
 * an optional buyback) to consume. (Builder + treasury are simple SystemProgram
 * transfers; holder distribution is many-recipient and lives in its own script.)
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ SAFETY: DRY-RUN BY DEFAULT. This prints the intended fee claim and the     ║
 * ║ full split transfer plan, then EXITS WITHOUT SENDING. Real transactions    ║
 * ║ require --execute. The signing key is read from env CREATOR_WALLET_SECRET  ║
 * ║ (base58) ONLY, is never logged, and is only touched under --execute.       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * USAGE (run via bun):
 *   bun scripts/tokenomics/collect-and-split.mjs
 *       → DRY-RUN: print the claim + split plan computed off the CURRENT creator
 *         balance (labeled an estimate; real claim happens under --execute), exit.
 *
 *   bun scripts/tokenomics/collect-and-split.mjs --amount-sol 1.5
 *       → DRY-RUN: split exactly 1.5 SOL (skip balance math), print, exit.
 *
 *   bun scripts/tokenomics/collect-and-split.mjs --execute
 *       → claim creator fees, confirm, RE-READ the creator balance, split
 *         (balance − reserve), send builder + treasury transfers, write manifest.
 *
 *   bun scripts/tokenomics/collect-and-split.mjs --execute --amount-sol 1.5
 *       → claim, confirm, then split exactly 1.5 SOL.
 *
 *   --config <path>   use a config other than scripts/tokenomics/config.json
 *
 * ENV (keys ONLY from env, never committed/logged):
 *   CREATOR_WALLET_SECRET   base58 secret of the creator wallet  (required for --execute)
 *   RPC_URL                 real RPC endpoint (falls back to SOLANA_RPC_URL)
 */

import { resolve, dirname } from "node:path";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
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
  simulateOrThrow,
  postPumpPortalLocal,
  signAndSend,
  readManifest,
  writeManifest,
  PublicKey,
  fatal,
} from "./lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * sumPriorEarmarked(dir) → { count, holders, buyback } (BigInt lamports).
 * Reads every prior split-*.manifest.json in dir and sums the holder + buyback
 * slices they earmarked. Used to warn that those retained slices may still be
 * sitting in the creator wallet and would be RE-SPLIT on the (balance − reserve)
 * fallback path. Best-effort: malformed manifests are skipped.
 */
function sumPriorEarmarked(dir) {
  let holders = 0n;
  let buyback = 0n;
  let count = 0;
  let files = [];
  try {
    files = readdirSync(dir).filter(
      (f) => f.startsWith("split-") && f.endsWith(".manifest.json"),
    );
  } catch {
    return { count: 0, holders: 0n, buyback: 0n };
  }
  for (const f of files) {
    const rec = readManifest(resolve(dir, f));
    const slices = rec?.slices;
    if (!slices) continue;
    try {
      holders += BigInt(slices.holderPoolLamports ?? 0);
      buyback += BigInt(slices.buybackLamports ?? 0);
      count++;
    } catch {
      // skip a manifest with non-numeric slice values
    }
  }
  return { count, holders, buyback };
}

async function main() {
  const args = parseArgs();
  const cfg = loadConfig(args.configPath);
  validateConfig(cfg);

  const conn = getConnection();
  const creatorPk = new PublicKey(cfg.wallets.creator);

  const reserveLamports = solToLamports(cfg.collect?.creatorReserveSol ?? 0);
  const priorityFee = cfg.collect?.priorityFeeSol ?? 0.000001;

  console.log("\n══ collect-and-split — $DTOUR creator fees ══");
  console.log(`  creator wallet : ${cfg.wallets.creator}`);
  console.log(`  reserve kept   : ${lamportsToSol(reserveLamports)} SOL`);
  console.log(`  mode           : ${args.execute ? "EXECUTE" : "DRY-RUN"}\n`);

  // ── STEP 1: collect creator fees ────────────────────────────────────────────
  console.log("── Step 1: collect pump.fun creator fees ──");
  console.log(`  action       : collectCreatorFee (PumpPortal local/self-sign)`);
  console.log(`  publicKey    : ${cfg.wallets.creator}`);
  console.log(`  priorityFee  : ${priorityFee} SOL`);

  let claimSig = null;
  if (args.execute) {
    if (!confirmExecute(true, "collect")) return; // never reached, but explicit
    const creatorKp = loadCreatorKeypair();
    if (creatorKp.publicKey.toBase58() !== cfg.wallets.creator) {
      fatal(
        "CREATOR_WALLET_SECRET does not match wallets.creator in config.\n" +
          "  Refusing to sign with a key for a different wallet.",
      );
    }
    const txBytes = await postPumpPortalLocal({
      publicKey: cfg.wallets.creator,
      action: "collectCreatorFee",
      priorityFee,
    });
    // Inspect before signing: refuse any tx that isn't fee-paid by the creator
    // or that moves SOL OUT of the creator wallet (drain protection).
    claimSig = await signAndSend(conn, txBytes, [creatorKp], {
      assertCollectOnly: creatorPk,
    });
    console.log(`  ✓ claim sent : ${claimSig}\n`);
  } else {
    // DRY-RUN: estimate the claimable creator-vault SOL for context only.
    // PumpPortal exposes no read-only "pending fees" call from the local flow,
    // so we surface the current creator-wallet balance as the split basis.
    console.log(
      "  (dry-run: no claim sent. Under --execute this POSTs collectCreatorFee\n" +
        "   to PumpPortal, self-signs with CREATOR_WALLET_SECRET, and confirms.)\n",
    );
  }

  // ── STEP 2: split ─────────────────────────────────────────────────────────
  console.log("── Step 2: split swept SOL by config bps ──");

  // Determine the splittable amount.
  //
  // PREFER an explicit --amount-sol: the SOL ACTUALLY COLLECTED this epoch. The
  // (balance − reserve) fallback re-counts WHATEVER is in the creator wallet,
  // including the holders + buyback slices RETAINED by a prior split — so back-
  // to-back collects on the fallback path RE-SPLIT already-earmarked SOL.
  let splitLamports;
  let basisNote;
  if (args.amountSol !== undefined) {
    splitLamports = solToLamports(args.amountSol);
    basisNote = `--amount-sol ${args.amountSol} (amount collected this epoch)`;
  } else {
    // Re-read the creator balance. Under --execute this is POST-claim (the
    // collected fees have landed); in dry-run it's the current balance, an
    // estimate of what would be split.
    const balLamports = BigInt(await conn.getBalance(creatorPk, "confirmed"));
    const avail = balLamports - reserveLamports;
    splitLamports = avail > 0n ? avail : 0n;
    basisNote = args.execute
      ? `post-claim balance ${lamportsToSol(balLamports)} − reserve ${lamportsToSol(reserveLamports)}`
      : `ESTIMATE: current balance ${lamportsToSol(balLamports)} − reserve ${lamportsToSol(reserveLamports)}`;

    // LOUD warning: the fallback re-splits ANY retained, already-earmarked SOL.
    console.warn(
      "\n⚠  WARN: no --amount-sol given. Splitting (balance − reserve), which\n" +
        "   RE-COUNTS the whole creator-wallet balance. The holders + buyback\n" +
        "   slices from a PRIOR split are RETAINED in this wallet, so they will be\n" +
        "   RE-SPLIT here (double-counted). Distribute/move earmarked slices BEFORE\n" +
        "   the next collect, or pass --amount-sol <amount-collected-this-epoch>.\n",
    );

    // Surface earmarked totals from any prior, un-consumed split manifest(s).
    const priorEarmarked = sumPriorEarmarked(__dirname);
    if (priorEarmarked.count > 0) {
      console.warn(
        `   Prior split manifest(s) found (${priorEarmarked.count}) with earmarked SOL\n` +
          `   that may still be sitting in this wallet and will be re-split:\n` +
          `     holders earmarked : ${lamportsToSol(priorEarmarked.holders)} SOL\n` +
          `     buyback earmarked : ${lamportsToSol(priorEarmarked.buyback)} SOL\n` +
          `   (sum across ${priorEarmarked.count} manifest(s); distribute/move these first.)\n`,
      );
    }
  }

  console.log(`  basis        : ${basisNote}`);
  console.log(`  splittable   : ${lamportsToSol(splitLamports)} SOL\n`);

  if (splitLamports <= 0n) {
    console.log(
      "  Nothing to split (balance at/below reserve, or amount is 0). Exiting.\n",
    );
    return;
  }

  // Compute the four slices. Floor each by bps; route rounding dust to treasury
  // so the four slices always sum back to splitLamports exactly.
  const bps = cfg.splitBps;
  const slice = (b) => (splitLamports * BigInt(b)) / 10000n;
  const builderL = slice(bps.builder);
  const holdersL = slice(bps.holders);
  const buybackL = slice(bps.buyback);
  let treasuryL = slice(bps.treasury);
  const dust = splitLamports - (builderL + holdersL + buybackL + treasuryL);
  treasuryL += dust; // absorb floor remainder into treasury

  // Print the full plan: the two on-chain transfers (builder + treasury) plus
  // the two retained slices (holders + buyback stay in the creator wallet).
  printTransferPlan([
    {
      from: cfg.wallets.creator,
      to: cfg.wallets.builder,
      amountSol: lamportsToSol(builderL),
      reason: `builder pool (${bps.builder} bps)`,
    },
    {
      from: cfg.wallets.creator,
      to: cfg.wallets.treasury,
      amountSol: lamportsToSol(treasuryL),
      reason: `treasury (${bps.treasury} bps${dust > 0n ? " + rounding dust" : ""})`,
    },
  ]);
  console.log(
    `  RETAINED in creator wallet for downstream scripts:\n` +
      `    holders : ${lamportsToSol(holdersL)} SOL  (${bps.holders} bps) → distribute-to-holders.mjs\n` +
      `    buyback : ${lamportsToSol(buybackL)} SOL  (${bps.buyback} bps) → optional buyback\n`,
  );

  if (!confirmExecute(args.execute, "split")) return;

  // ── per-run SOL cap: abort BEFORE any send if the total SOL DISBURSED this
  // run (builder + treasury — holders + buyback are RETAINED, not sent) exceeds
  // the configured cap. A circuit-breaker against a fat-fingered --amount-sol or
  // a bps misconfig that would move more than intended in a single run.
  const perRunCapSol = cfg.perRunCapSol ?? 5;
  const disbursedLamports = builderL + treasuryL;
  const capLamports = solToLamports(perRunCapSol);
  if (disbursedLamports > capLamports) {
    fatal(
      "per-run SOL cap exceeded — refusing to send.\n" +
        `    disbursed this run : ${lamportsToSol(disbursedLamports)} SOL (builder + treasury)\n` +
        `    perRunCapSol       : ${perRunCapSol} SOL\n` +
        "  Lower --amount-sol, fix splitBps, or raise perRunCapSol in config.json.",
    );
  }

  // ── EXECUTE: send builder + treasury transfers ──────────────────────────────
  const creatorKp = loadCreatorKeypair();
  const sigs = {};
  for (const [name, to, lamports, bp] of [
    ["builder", cfg.wallets.builder, builderL, bps.builder],
    ["treasury", cfg.wallets.treasury, treasuryL, bps.treasury],
  ]) {
    if (lamports <= 0n) {
      console.log(`  • ${name}: 0 SOL — skipped.`);
      continue;
    }
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: creatorPk,
        toPubkey: new PublicKey(to),
        lamports: Number(lamports),
      }),
    );
    const { blockhash } = await conn.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = creatorPk;
    tx.sign(creatorKp);
    // Gate the real send on a successful simulation.
    await simulateOrThrow(conn, tx, `split:${name}`);
    const sig = await conn.sendRawTransaction(tx.serialize());
    await conn.confirmTransaction(sig, "confirmed");
    sigs[name] = sig;
    console.log(`  ✓ ${name} ${lamportsToSol(lamports)} SOL → ${to}  (${sig})`);
  }

  // ── record the run-manifest the downstream scripts consume ──────────────────
  const epoch = new Date().toISOString();
  const manifestPath = resolve(__dirname, `split-${Date.now()}.manifest.json`);
  writeManifest(manifestPath, {
    kind: "collect-and-split",
    mint: cfg.mint,
    epoch,
    claimSignature: claimSig,
    splitLamports: splitLamports.toString(),
    slices: {
      builderLamports: builderL.toString(),
      holderPoolLamports: holdersL.toString(),
      buybackLamports: buybackL.toString(),
      treasuryLamports: treasuryL.toString(),
    },
    holderPoolSol: lamportsToSol(holdersL),
    buybackSol: lamportsToSol(buybackL),
    transferSignatures: sigs,
  });
  console.log(`\n  ✓ manifest written: ${manifestPath}`);
  console.log(
    `  Next: bun scripts/tokenomics/distribute-to-holders.mjs --amount ${lamportsToSol(holdersL)}\n`,
  );
}

main().catch((e) => fatal(e?.message ?? String(e)));
