/**
 * scripts/tokenomics/lib.mjs — shared safety + Solana helpers for the $DTOUR
 * tokenomics scripts.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SAFETY — READ BEFORE TOUCHING ANYTHING                                    ║
 * ║                                                                            ║
 * ║  • DRY-RUN IS THE DEFAULT. Every script simulates, prints the full         ║
 * ║    transfer plan (from / to / amount-SOL / reason), then EXITS WITHOUT     ║
 * ║    SENDING. Real transactions are sent ONLY when you pass --execute.       ║
 * ║                                                                            ║
 * ║  • PRIVATE KEYS COME FROM THE ENVIRONMENT ONLY. CREATOR_WALLET_SECRET      ║
 * ║    (base58). Never hardcoded, never logged, never committed. The secret    ║
 * ║    is read once, turned into a Keypair, and never printed — not even in    ║
 * ║    error messages (errors are redacted to "CREATOR_WALLET_SECRET not set").║
 * ║                                                                            ║
 * ║  • THE REAL CONFIG IS GITIGNORED. Copy config.example.json to              ║
 * ║    config.json and fill in your real wallets / bps. config.json is in      ║
 * ║    .gitignore; only the .example template is committed.                    ║
 * ║                                                                            ║
 * ║  • $DTOUR HAS NO MINT AUTHORITY. Supply is a fixed 1,000,000,000 — these   ║
 * ║    scripts never mint. Rewards are a share of fees we ACTUALLY collected   ║
 * ║    (pump.fun creator fees, real SOL), variable, paid in arrears. There is  ║
 * ║    no promised APY and no emissions.                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * This is the single home for ALL safety invariants so the scripts stay thin
 * and the rules can't drift. Run via bun (ESM .mjs).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import bs58 from "bs58";
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";

// $DTOUR — fixed mint, fixed supply, NO mint authority. Used as a config guard.
export const DTOUR_MINT = "DijmsEDeTXsWCkCLkhYJNTutKaHf541xZshVrCUbcozy";
export const DTOUR_TOTAL_SUPPLY = 1_000_000_000;

// SPL Memo program — attaches a UTF-8 note (branding/link) to a tx; shown on
// explorers + some wallets. One memo per tx.
export const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);
export function buildMemoIx(memo) {
  return new TransactionInstruction({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memo, "utf8"),
  });
}

// System Program / PublicKey.default — both are the all-ones base58 address
// "11111111111111111111111111111111". A destination wallet equal to this is a
// burn/null address (or a leftover default), so it must never be a payout target.
const SYSTEM_PROGRAM_ID = SystemProgram.programId.toBase58();

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CONFIG_PATH = resolve(__dirname, "config.json");

// ── arg parsing ───────────────────────────────────────────────────────────────

/**
 * parseArgs(argv) → { execute, amountSol?, poolSol?, method?, venue?, configPath, raw }
 *
 * DRY-RUN is the default EVERYWHERE. Only the literal flag --execute flips
 * execute to true. Numeric flags accept `--flag <n>` or `--flag=<n>`.
 */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    execute: false,
    configPath: DEFAULT_CONFIG_PATH,
    raw: argv,
  };
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    const eq = tok.indexOf("=");
    const flag = eq >= 0 ? tok.slice(0, eq) : tok;
    const inlineVal = eq >= 0 ? tok.slice(eq + 1) : undefined;
    const nextVal = () => (inlineVal !== undefined ? inlineVal : argv[++i]);

    switch (flag) {
      case "--execute":
        out.execute = true;
        break;
      case "--amount-sol":
      case "--amount": // WRITE spec uses --amount for distribute
        out.amountSol = Number(nextVal());
        break;
      case "--pool-sol":
        out.poolSol = Number(nextVal());
        break;
      case "--method":
        out.method = nextVal();
        break;
      case "--venue":
        out.venue = nextVal();
        break;
      case "--config":
        out.configPath = resolve(process.cwd(), nextVal());
        break;
      default:
        // ignore unknown flags rather than silently mis-parse them
        break;
    }
  }
  if (out.amountSol !== undefined && !Number.isFinite(out.amountSol)) {
    fatal("--amount/--amount-sol must be a number");
  }
  if (out.poolSol !== undefined && !Number.isFinite(out.poolSol)) {
    fatal("--pool-sol must be a number");
  }
  return out;
}

// ── small utilities ─────────────────────────────────────────────────────────

export function fatal(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function isValidPubkey(s) {
  try {
    // eslint-disable-next-line no-new
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
}

// ── config loading + validation ───────────────────────────────────────────────

/**
 * loadConfig(path) → Config. Reads + JSON.parses the operator's real config.
 * Exits(1) with a copy-this hint if the file is missing.
 */
export function loadConfig(path = DEFAULT_CONFIG_PATH) {
  if (!existsSync(path)) {
    fatal(
      `Config not found at ${path}\n` +
        `  Create it from the committed template:\n` +
        `    cp scripts/tokenomics/config.example.json scripts/tokenomics/config.json\n` +
        `  then edit every EDIT_ field. config.json is gitignored (never committed).`,
    );
  }
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    fatal(`Config at ${path} is not valid JSON: ${e.message}`);
  }
  cfg.__path = path;
  return cfg;
}

/**
 * validateConfig(cfg) — asserts the load-bearing safety invariants:
 *   (1) splitBps sums to EXACTLY 10000, else exit(1).
 *   (2) every wallets.* is a valid base58 PublicKey.
 *   (3) mint guard — must equal the real $DTOUR mint (wrong-token protection).
 *   (4) excludeWallets must cover creator+builder+treasury+buyback (warns on a
 *       missing pool/AMM wallet — paying the LP would drain the holder pool).
 */
export function validateConfig(cfg) {
  // (3) mint guard first — fail fast if pointed at the wrong token.
  if (cfg.mint !== DTOUR_MINT) {
    fatal(
      `Config mint ${cfg.mint ?? "(unset)"} does not match $DTOUR ${DTOUR_MINT}.\n` +
        `  Refusing to operate on the wrong token.`,
    );
  }

  // (1) bps must each be a non-negative integer AND sum to exactly 10000.
  const bps = cfg.splitBps ?? {};
  for (const key of ["builder", "holders", "buyback", "treasury"]) {
    const v = bps[key] ?? 0;
    if (!Number.isInteger(v) || v < 0) {
      fatal(
        `splitBps.${key} must be a non-negative integer (got ${bps[key]}).`,
      );
    }
  }
  const sum =
    (bps.builder ?? 0) +
    (bps.holders ?? 0) +
    (bps.buyback ?? 0) +
    (bps.treasury ?? 0);
  if (sum !== 10000) {
    fatal(
      `splitBps must sum to EXACTLY 10000 (got ${sum}).\n` +
        `  builder=${bps.builder} holders=${bps.holders} buyback=${bps.buyback} treasury=${bps.treasury}`,
    );
  }

  // (2) all configured wallets must be valid pubkeys — and never the all-ones
  // default / System Program id ("1111…1111"), which is a burn/null address and
  // must never be a payout destination.
  const wallets = cfg.wallets ?? {};
  for (const [name, val] of Object.entries(wallets)) {
    if (typeof val !== "string" || !isValidPubkey(val)) {
      fatal(
        `wallets.${name} ("${val}") is not a valid Solana pubkey.\n` +
          `  Did you forget to replace an EDIT_ placeholder in config.json?`,
      );
    }
    if (val === SYSTEM_PROGRAM_ID) {
      fatal(
        `wallets.${name} is the all-ones default / System Program id ("${SYSTEM_PROGRAM_ID}").\n` +
          `  That is a burn/null address, not a real destination wallet. Refusing.`,
      );
    }
  }
  for (const need of ["creator", "builder", "treasury", "buyback"]) {
    if (!wallets[need]) fatal(`wallets.${need} is required in config.json.`);
  }

  // tokenDecimals sanity (pump.fun is usually 6, but confirm via getMint).
  if (!Number.isInteger(cfg.tokenDecimals) || cfg.tokenDecimals < 0) {
    fatal(`tokenDecimals must be a non-negative integer (got ${cfg.tokenDecimals}).`);
  }

  // (4) exclude-list — every entry must be a valid pubkey, so a leftover
  // EDIT_ placeholder (e.g. the AMM-pool slot) hard-fails instead of silently
  // failing to exclude the LP (which would then receive the largest payout).
  const excludeList = cfg.distribution?.excludeWallets ?? [];
  for (const entry of excludeList) {
    if (typeof entry !== "string" || !isValidPubkey(entry)) {
      fatal(
        `distribution.excludeWallets entry ("${entry}") is not a valid Solana pubkey.\n` +
          `  Replace EDIT_ placeholders — especially the bonding-curve / AMM pool\n` +
          `  address. An invalid entry excludes nothing, so the LP pool would be paid.`,
      );
    }
  }
  // (4b) completeness — REQUIRED entries hard-fail, missing pool warns.
  const exclude = new Set(excludeList);
  for (const name of ["creator", "builder", "treasury", "buyback"]) {
    if (!exclude.has(wallets[name])) {
      fatal(
        `distribution.excludeWallets must include wallets.${name} (${wallets[name]}).\n` +
          `  Excluding pool/treasury/creator wallets from pro-rata is mandatory ` +
          `(no self-payment, no pool sloshing).`,
      );
    }
  }
  // The bonding-curve / AMM pool holds the LP $DTOUR. If it's not excluded, the
  // pool itself gets paid the lion's share. Warn loudly but don't hard-fail —
  // operator may have a private/no-LP setup.
  const knownWallets = new Set(Object.values(wallets));
  const poolEntries = [...exclude].filter((w) => !knownWallets.has(w));
  if (poolEntries.length === 0) {
    console.warn(
      "\n⚠  WARN: excludeWallets has no extra (pool/AMM) entry beyond your own\n" +
        "   wallets. If $DTOUR has a pump.fun bonding-curve or migrated AMM pool,\n" +
        "   add that pool's pubkey or the LP will receive holder rewards.\n",
    );
  }
}

// ── env-only secret + connection ───────────────────────────────────────────────

/**
 * loadCreatorKeypair() → Keypair, from process.env.CREATOR_WALLET_SECRET (base58).
 * NEVER returns or logs the secret. Throws a redacted error if absent/invalid.
 * Only call this under --execute.
 */
export function loadCreatorKeypair() {
  const secret = process.env.CREATOR_WALLET_SECRET;
  if (!secret) {
    fatal(
      "CREATOR_WALLET_SECRET not set.\n" +
        "  Export the creator wallet's base58 secret key in your shell / gitignored .env:\n" +
        "    export CREATOR_WALLET_SECRET=<base58-secret>\n" +
        "  (Never commit it, never paste it into config.json.)",
    );
  }
  let kp;
  try {
    kp = Keypair.fromSecretKey(bs58.decode(secret));
  } catch {
    // Redacted on purpose — do not echo any part of the secret.
    fatal("CREATOR_WALLET_SECRET is not a valid base58 Solana secret key.");
  }
  return kp;
}

/**
 * loadSignerKeypair(envName) → Keypair from an arbitrary env var (base58).
 * Same redaction guarantees as loadCreatorKeypair. Used by optional buyback
 * flows that may sign with a dedicated wallet.
 */
export function loadSignerKeypair(envName) {
  const secret = process.env[envName];
  if (!secret) fatal(`${envName} not set.`);
  try {
    return Keypair.fromSecretKey(bs58.decode(secret));
  } catch {
    fatal(`${envName} is not a valid base58 Solana secret key.`);
  }
}

/**
 * getConnection() → Connection at 'confirmed'. RPC endpoint comes from env:
 *   RPC_URL (primary) ?? SOLANA_RPC_URL (fallback — already used by the gate).
 * Public api.mainnet-beta.solana.com rate-limits getProgramAccounts; use a real
 * provider endpoint.
 */
export function getConnection() {
  const rpc = process.env.RPC_URL || process.env.SOLANA_RPC_URL;
  if (!rpc) {
    fatal(
      "No RPC endpoint set. Export RPC_URL (or SOLANA_RPC_URL):\n" +
        "    export RPC_URL=https://your-rpc-provider\n" +
        "  Public mainnet-beta rate-limits getProgramAccounts — use a real provider.",
    );
  }
  return new Connection(rpc, "confirmed");
}

// ── lamports <-> SOL (BigInt-safe) ─────────────────────────────────────────────

const LAMPORTS = BigInt(LAMPORTS_PER_SOL); // 1_000_000_000n

/** SOL (number) → lamports (BigInt). Rounds to nearest lamport. */
export function solToLamports(sol) {
  return BigInt(Math.round(Number(sol) * LAMPORTS_PER_SOL));
}

/** lamports (BigInt|number) → SOL (number, for display). */
export function lamportsToSol(lamports) {
  return Number(BigInt(lamports)) / LAMPORTS_PER_SOL;
}

export { LAMPORTS as LAMPORTS_PER_SOL_BIGINT };

// ── the one dry-run output format ───────────────────────────────────────────────

/**
 * printTransferPlan(rows) — THE canonical dry-run table. Every script builds a
 * plan of { from, to, amountSol, reason } rows and calls this before sending.
 */
export function printTransferPlan(rows) {
  const fmtSol = (n) => Number(n).toFixed(9);
  const wFrom = Math.max(4, ...rows.map((r) => String(r.from).length));
  const wTo = Math.max(2, ...rows.map((r) => String(r.to).length));
  const wAmt = Math.max(10, ...rows.map((r) => fmtSol(r.amountSol).length));

  const line =
    "─".repeat(wFrom + 3) +
    "┼" +
    "─".repeat(wTo + 2) +
    "┼" +
    "─".repeat(wAmt + 2) +
    "┼" +
    "─".repeat(24);

  console.log(
    "\n  TRANSFER PLAN" +
      "  (amounts in SOL — nothing is sent in dry-run)\n",
  );
  console.log(
    `  ${"FROM".padEnd(wFrom)} │ ${"TO".padEnd(wTo)} │ ${"AMOUNT (SOL)".padStart(wAmt)} │ REASON`,
  );
  console.log(`  ${line}`);
  let total = 0;
  for (const r of rows) {
    total += Number(r.amountSol);
    console.log(
      `  ${String(r.from).padEnd(wFrom)} │ ${String(r.to).padEnd(wTo)} │ ${fmtSol(r.amountSol).padStart(wAmt)} │ ${r.reason}`,
    );
  }
  console.log(`  ${line}`);
  console.log(
    `  ${"TOTAL".padEnd(wFrom)} │ ${"".padEnd(wTo)} │ ${fmtSol(total).padStart(wAmt)} │ ${rows.length} transfer(s)\n`,
  );
}

/**
 * simulateOrThrow(connection, tx, label) — MANDATORY pre-send gate. Simulates a
 * SIGNED transaction (legacy Transaction or VersionedTransaction) and THROWS,
 * printing the simulation logs, if the run would fail on-chain (value.err is
 * non-null). Every real sendRawTransaction MUST be preceded by this so a tx that
 * would revert is never broadcast (no wasted base fee, no half-applied state).
 *
 * Call form is intentionally ONE argument: passing a 2nd positional arg means
 * "signers" for a legacy Transaction (which re-signs + refetches a blockhash)
 * but "config" for a VersionedTransaction — so the single-arg form is the only
 * shape that's correct for both. We simulate AFTER signing (blockhash set,
 * sigVerify defaults false), so no signers/replaceRecentBlockhash are needed.
 */
export async function simulateOrThrow(connection, tx, label = "tx") {
  const { value } = await connection.simulateTransaction(tx);
  if (value.err) {
    const logs = (value.logs ?? []).map((l) => `      ${l}`).join("\n");
    throw new Error(
      `simulation FAILED for [${label}] — refusing to send.\n` +
        `    err: ${JSON.stringify(value.err)}\n` +
        (logs ? `    logs:\n${logs}\n` : "    (no logs returned)\n"),
    );
  }
  return value;
}

/**
 * confirmExecute(execute, label) — the central send gate. In dry-run it prints
 * the no-send banner and returns false (the caller then returns without
 * sending). With --execute it prints a short "executing" banner and returns
 * true. Scripts must honor the return value.
 */
export function confirmExecute(execute, label) {
  if (!execute) {
    console.log(
      `  ─── DRY-RUN [${label}] — no transactions sent. ` +
        `Re-run with --execute to send. ───\n`,
    );
    return false;
  }
  console.log(`  ─── EXECUTE [${label}] — sending real transactions… ───\n`);
  return true;
}

// ── holder snapshot ─────────────────────────────────────────────────────────

/**
 * snapshotHolders(conn, mint, { method, decimals }) →
 *   Array<{ tokenAccount, owner, balanceTokens }>
 *
 * 'getProgramAccounts'  — COMPLETE. Detects the mint's OWNING token program at
 *                         runtime (getAccountInfo(mint).owner), then queries
 *                         getProgramAccounts on THAT program filtered by
 *                         memcmp(mint @ offset 0). $DTOUR is a Token-2022 mint
 *                         (program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb),
 *                         whose token accounts are NOT 165 bytes — so we DO NOT
 *                         filter on dataSize. The base SPL token-account layout
 *                         (mint@0, owner@32, amount u64 LE@64) is identical in
 *                         Token-2022 for these base fields, so the offset parsing
 *                         below works for both programs.
 *                         NOTE: getProgramAccounts on Token-2022 is EXCLUDED from
 *                         public-RPC secondary indexes (returns RPC error
 *                         -32010), so a PROVIDER RPC (env RPC_URL /
 *                         SOLANA_RPC_URL) is REQUIRED for this method.
 * 'getTokenLargestAccounts' — FAST and works on public RPC, but capped at the
 *                         top 20 accounts. Logs a loud WARN; only safe for tiny
 *                         holder sets.
 *
 * Raw amounts are normalized by 10^decimals into human token units.
 */
export async function snapshotHolders(conn, mint, { method, decimals }) {
  const mintPk = new PublicKey(mint);
  const scale = 10 ** decimals;

  if (method === "getTokenLargestAccounts") {
    console.warn(
      "\n⚠  WARN: snapshotMethod=getTokenLargestAccounts is CAPPED at the top 20\n" +
        "   token accounts. If $DTOUR has more than 20 holders this UNDER-distributes\n" +
        "   (smaller holders get nothing). Use getProgramAccounts for a complete set.\n",
    );
    const res = await conn.getTokenLargestAccounts(mintPk);
    // getTokenLargestAccounts returns accounts but not owners — fetch owners.
    const out = [];
    for (const a of res.value) {
      const info = await conn.getParsedAccountInfo(a.address);
      const parsed = info.value?.data?.parsed?.info;
      const raw = Number(parsed?.tokenAmount?.amount ?? 0);
      out.push({
        tokenAccount: a.address.toBase58(),
        owner: parsed?.owner ?? null,
        balanceTokens: raw / scale,
      });
    }
    return out.filter((r) => r.owner);
  }

  // Default + recommended: getProgramAccounts — complete.
  // Detect the owning token program at runtime so this keeps working if the
  // mint ever migrates (e.g. legacy SPL → Token-2022 or vice versa).
  const mintInfo = await conn.getAccountInfo(mintPk);
  if (!mintInfo) {
    fatal(
      `Mint ${mint} has no account on this RPC — cannot determine its token program.\n` +
        `  Check the mint and that RPC_URL/SOLANA_RPC_URL points at the right cluster.`,
    );
  }
  const tokenProgramId = mintInfo.owner; // PublicKey of the owning token program

  console.log(
    `  Holder snapshot via getProgramAccounts on token program ${tokenProgramId.toBase58()}.\n` +
      `  NOTE: getProgramAccounts on Token-2022 is excluded from public-RPC secondary\n` +
      `  indexes (RPC error -32010) — a PROVIDER RPC is REQUIRED for this method.\n` +
      `  (getTokenLargestAccounts works on public RPC but is capped at 20 accounts.)`,
  );

  let accounts;
  try {
    accounts = await conn.getProgramAccounts(tokenProgramId, {
      // memcmp(mint @ offset 0) ONLY — Token-2022 accounts are NOT 165 bytes,
      // so a dataSize:165 filter would return ZERO accounts (pay nobody).
      filters: [{ memcmp: { offset: 0, bytes: mintPk.toBase58() } }],
    });
  } catch (e) {
    fatal(
      `getProgramAccounts failed: ${e?.message ?? e}\n` +
        `  Token-2022 getProgramAccounts is excluded from public-RPC secondary\n` +
        `  indexes (RPC error -32010). Use a PROVIDER RPC (set RPC_URL/SOLANA_RPC_URL),\n` +
        `  or switch to the getTokenLargestAccounts snapshot method (capped at top 20).`,
    );
  }

  const out = [];
  for (const { pubkey, account } of accounts) {
    const data = account.data; // Buffer — base token-account layout in first 72 bytes
    // SPL / Token-2022 base layout: mint[0..32], owner[32..64], amount u64 LE[64..72]
    const owner = new PublicKey(data.subarray(32, 64)).toBase58();
    const raw = data.readBigUInt64LE(64);
    if (raw === 0n) continue; // skip empty accounts
    out.push({
      tokenAccount: pubkey.toBase58(),
      owner,
      balanceTokens: Number(raw) / scale,
    });
  }
  return out;
}

/**
 * aggregateByOwner(accounts) → Map<owner, balanceTokens>.
 * One owner can hold many ATAs; pro-rata pays OWNERS, not token accounts.
 */
export function aggregateByOwner(accounts) {
  const map = new Map();
  for (const a of accounts) {
    if (!a.owner) continue;
    map.set(a.owner, (map.get(a.owner) ?? 0) + a.balanceTokens);
  }
  return map;
}

/**
 * filterHolders(ownerMap, { minBalanceTokens, excludeWallets }) →
 *   Array<{ owner, balanceTokens }>. Drops below-min owners and the exclude
 *   list (creator/pool/treasury/builder/buyback/AMM pool).
 */
export function filterHolders(ownerMap, { minBalanceTokens, excludeWallets }) {
  const exclude = new Set(excludeWallets ?? []);
  const out = [];
  for (const [owner, balanceTokens] of ownerMap) {
    if (exclude.has(owner)) continue;
    if (balanceTokens < minBalanceTokens) continue;
    out.push({ owner, balanceTokens });
  }
  // Largest first — readable plans + deterministic ordering.
  out.sort((a, b) => b.balanceTokens - a.balanceTokens);
  return out;
}

/**
 * flagProgramOwnedRecipients(conn, owners) → Array<{ owner, programOwner }>.
 *
 * The exclude-list matches on token-account OWNER, but an operator may have
 * pasted a pool/market/ATA address instead of the LP token account's actual
 * OWNER (a PDA). Such an owner is PROGRAM-owned, not a normal system wallet, and
 * would silently receive the largest pro-rata payout. This flags any recipient
 * whose account is owned by a program OTHER than the System Program so the
 * operator can review and exclude it by OWNER. INFORMATIONAL — never auto-excludes.
 *
 * Accounts with 0 SOL return null from getAccountInfo (no on-chain account yet) —
 * those are treated as normal/unfunded wallets and NOT flagged.
 */
export async function flagProgramOwnedRecipients(conn, owners) {
  const pubkeys = owners.map((o) => new PublicKey(o));
  // Batch the lookups (getMultipleAccountsInfo caps at 100 per call).
  const infos = [];
  for (let i = 0; i < pubkeys.length; i += 100) {
    const chunk = pubkeys.slice(i, i + 100);
    const res = await conn.getMultipleAccountsInfo(chunk);
    infos.push(...res);
  }
  const flagged = [];
  infos.forEach((info, i) => {
    if (!info) return; // null = no account / 0 SOL → normal unfunded wallet
    const programOwner = info.owner.toBase58();
    if (programOwner !== SYSTEM_PROGRAM_ID) {
      flagged.push({ owner: owners[i], programOwner });
    }
  });
  return flagged;
}

/**
 * computeProRata(holders, poolLamports) →
 *   { payouts: Array<{ owner, lamports, shareFraction, balanceTokens }>,
 *     remainderLamports }
 *
 * Denominator = SUM of INCLUDED holders' balances (NOT 1e9 / total supply) so
 * the holder-reward pool fully pays out. Lamports are floored per owner; the
 * floor remainder is returned so the caller can route the dust (to treasury).
 */
export function computeProRata(holders, poolLamports) {
  const pool = BigInt(poolLamports);
  const sumIncluded = holders.reduce((s, h) => s + h.balanceTokens, 0);
  if (sumIncluded <= 0) {
    return { payouts: [], remainderLamports: pool };
  }
  let assigned = 0n;
  const payouts = holders.map((h) => {
    const shareFraction = h.balanceTokens / sumIncluded;
    // floor(pool * share) with BigInt: scale the fraction through lamports.
    const lamports =
      (pool * BigInt(Math.round(h.balanceTokens * 1e12))) /
      BigInt(Math.round(sumIncluded * 1e12));
    assigned += lamports;
    return {
      owner: h.owner,
      lamports,
      shareFraction,
      balanceTokens: h.balanceTokens,
    };
  });
  const remainderLamports = pool - assigned;
  return { payouts, remainderLamports };
}

/**
 * applyDustFloor(payouts, minPayoutLamports) → { kept, skipped }.
 * Payouts below the floor aren't worth the rent/fee; they're skipped (and the
 * caller can sum skipped lamports back into treasury / next epoch).
 */
export function applyDustFloor(payouts, minPayoutLamports) {
  const floor = BigInt(minPayoutLamports);
  const kept = [];
  const skipped = [];
  for (const p of payouts) {
    if (BigInt(p.lamports) < floor) skipped.push(p);
    else kept.push(p);
  }
  return { kept, skipped };
}

// ── manifest (optional idempotency ledger) ─────────────────────────────────────

/** readManifest(path) → record | null (JSON payout ledger). */
export function readManifest(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** writeManifest(path, record) — persist a run record (pretty JSON). */
export function writeManifest(path, record) {
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

/**
 * signatureOf(tx) → base58 signature string of a SIGNED Transaction. The txid is
 * the first signature; computing it BEFORE sendRawTransaction lets us record an
 * "attempted" ledger entry so a tx that lands but whose confirmation times out
 * can be reconciled (not double-paid) on a later run.
 */
export function signatureOf(tx) {
  if (!tx.signature) {
    throw new Error("signatureOf: transaction is not signed yet.");
  }
  return bs58.encode(tx.signature);
}

/**
 * txLanded(conn, signature) → "landed" | "absent" | "unknown".
 * Uses getSignatureStatuses (searching tx history) to decide whether a
 * previously-attempted signature actually made it on-chain:
 *   "landed"  — confirmed/finalized with no error (treat as PAID).
 *   "absent"  — the RPC has a status but it is NOT confirmed/finalized, OR a
 *               getTransaction lookup confirms it is not present. Only the
 *               CALLER, combined with blockhash expiry, decides a definitive
 *               "did not land" (safe to resend).
 *   "unknown" — no status at all yet; could still be landing. NEVER resend on
 *               "unknown" while the blockhash may still be valid.
 */
export async function txLanded(conn, signature) {
  const { value } = await conn.getSignatureStatuses([signature], {
    searchTransactionHistory: true,
  });
  const status = value?.[0];
  if (status) {
    if (status.err) return "absent"; // it failed on-chain → safe to resend
    const conf = status.confirmationStatus;
    if (conf === "confirmed" || conf === "finalized") return "landed";
    return "unknown"; // processed-only — still settling
  }
  // No status from getSignatureStatuses; fall back to a full history lookup.
  const tx = await conn
    .getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    })
    .catch(() => null);
  if (tx) return tx.meta?.err ? "absent" : "landed";
  return "unknown";
}

// ── PumpPortal local (self-sign) flow ──────────────────────────────────────────

const PUMPPORTAL_LOCAL = "https://pumpportal.fun/api/trade-local";

/**
 * postPumpPortalLocal(body) → Uint8Array (serialized VersionedTransaction).
 * POSTs to PumpPortal's local (self-sign) endpoint. The returned bytes are an
 * unsigned tx you sign locally with your own key — PumpPortal never sees the
 * secret. Throws on non-2xx.
 */
export async function postPumpPortalLocal(body) {
  const res = await fetch(PUMPPORTAL_LOCAL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PumpPortal ${res.status}: ${text.slice(0, 300)}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * assertCollectOnlyTx(tx, creatorPubkey) — pre-sign sanity check for the
 * PumpPortal collectCreatorFee transaction. A malicious / MITM'd response could
 * return a tx that drains the creator wallet; we refuse to blind-sign.
 *
 * Asserts:
 *   • fee payer == creator pubkey (creator must be the first signer / payer);
 *   • NO SystemProgram.transfer / transferWithSeed instruction moves SOL OUT of
 *     the creator wallet. collectCreatorFee only moves SOL *into* the creator,
 *     so any transfer FROM the creator with lamports > 0 is unexpected → fatal().
 *
 * Handles both MessageV0 (staticAccountKeys + compiledInstructions) and legacy
 * Message (accountKeys + instructions). fatal()s on anything unexpected.
 */
export function assertCollectOnlyTx(tx, creatorPubkey) {
  const msg = tx.message;
  const creator = creatorPubkey.toBase58();

  // Normalize the account-key list + instruction shape across v0 / legacy.
  const keys = (msg.staticAccountKeys ?? msg.accountKeys ?? []).map((k) =>
    k.toBase58(),
  );
  if (keys.length === 0) {
    fatal("PumpPortal tx has no account keys — refusing to sign.");
  }

  // (1) Fee payer is account index 0 in both message versions.
  if (keys[0] !== creator) {
    fatal(
      "PumpPortal tx fee payer is NOT the creator wallet — refusing to sign.\n" +
        `  expected ${creator}, got ${keys[0]}.`,
    );
  }

  const ixns = msg.compiledInstructions ?? msg.instructions ?? [];
  const systemProgram = SystemProgram.programId.toBase58();

  for (const ix of ixns) {
    const programId = keys[ix.programIdIndex];
    if (programId !== systemProgram) continue; // only SystemProgram can move SOL

    // Account indexes: v0 → accountKeyIndexes; legacy → accounts.
    const acctIdx = ix.accountKeyIndexes ?? ix.accounts ?? [];
    // Instruction data: v0 → Uint8Array; legacy → base58 string.
    const data =
      ix.data instanceof Uint8Array
        ? Buffer.from(ix.data)
        : Buffer.from(bs58.decode(ix.data));
    if (data.length < 4) continue;
    const instrType = data.readUInt32LE(0);

    // SystemProgram instruction layout (system_instruction enum):
    //   2 = Transfer        { lamports u64 @ 4 }, accounts [from, to]
    //  11 = TransferWithSeed { ... lamports ... }, accounts [from, base, to]
    if (instrType === 2) {
      const fromIdx = acctIdx[0];
      const fromKey = keys[fromIdx];
      const lamports = data.length >= 12 ? data.readBigUInt64LE(4) : 0n;
      if (fromKey === creator && lamports > 0n) {
        fatal(
          "PumpPortal tx contains a SystemProgram.transfer that moves SOL OUT of\n" +
            `  the creator wallet (${lamportsToSol(lamports)} SOL → ${keys[acctIdx[1]]}).\n` +
            "  collectCreatorFee should only move SOL INTO the creator. Refusing to sign.",
        );
      }
    } else if (instrType === 11) {
      // TransferWithSeed: account[0] is the funding (from) account.
      const fromKey = keys[acctIdx[0]];
      if (fromKey === creator) {
        fatal(
          "PumpPortal tx contains a SystemProgram.transferWithSeed FROM the creator\n" +
            "  wallet — unexpected for collectCreatorFee. Refusing to sign.",
        );
      }
    }
  }
}

/**
 * signAndSend(conn, txBytes, signers, { assertCollectOnly, label } = {}) → signature.
 * Deserializes the versioned tx, OPTIONALLY inspects it (collectCreatorFee:
 * pass { assertCollectOnly: <creatorPubkey> } to refuse a tx that drains the
 * creator), signs with the provided Keypair(s), SIMULATES (throws if it would
 * fail), sends raw, and confirms. ONLY called under --execute. The simulation
 * gate is mandatory: a tx that would revert on-chain is never broadcast.
 */
export async function signAndSend(conn, txBytes, signers, opts = {}) {
  const tx = VersionedTransaction.deserialize(txBytes);
  if (opts.assertCollectOnly) {
    assertCollectOnlyTx(tx, opts.assertCollectOnly);
  }
  tx.sign(signers);
  // Gate the real send on a successful simulation — never broadcast a tx that
  // would fail on-chain.
  await simulateOrThrow(conn, tx, opts.label ?? "collectCreatorFee");
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig, "confirmed");
  return sig;
}

export { PublicKey, Keypair, VersionedTransaction };
