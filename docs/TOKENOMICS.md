# $DTOUR Tokenomics

This document is the source of truth for the **$DTOUR** token economics and for
the operator tooling that distributes rewards. It covers the settled model, how
the reward funding works, the configurable split, how to run each payout script
**safely**, the admin dashboard Tokenomics surface (config, dry-run, and the
in-dashboard **Execute** flow, §7.6), the Convex holder-discount function, and a
securities/legal disclaimer.

> **Status — read this first.** The model below is settled, and the tooling is
> **built / shipped**: `scripts/tokenomics/lib.mjs` (shared safety + Solana
> helpers), `scripts/tokenomics/collect-and-split.mjs` (claim creator fees +
> split), `scripts/tokenomics/distribute-to-holders.mjs` (pro-rata holder
> rewards), the committed `config.example.json` template, and the Convex
> `holderDiscount` action in `convex/tokens.ts` all exist in the repo. The
> `.gitignore` / `.env.example` edits are applied. The **admin Tokenomics
> surface is built in two phases, both shipped**: **Phase 1** — config editor +
> live Helius dry-run preview (`convex/tokenomics.ts`,
> `src/dashboard/admin/AdminTokenomics.tsx`); **Phase 2** — the in-dashboard
> **Execute** flow (semi-auto wallet signing, server-side Helius relay, per-run
> cap, simulate-before-send, and an idempotent payout ledger; LP
> `5ZZLXY1YGvkexPgFQjH5pnhviaDsRut56PgEiYeAyTRE` excluded). See §7.6. **Buyback
> is documented-but-not-implemented** — no buyback script ships; the `buyback`
> config block and §6 below document intent only. And the 20% holder discount is
> **not enforced in live billing** — billing is not wired up, so today the
> discount is informational (eligibility-check) only.

---

## 1. The token

| Property        | Value |
|-----------------|-------|
| Symbol          | `$DTOUR` |
| Chain           | Solana — **Token-2022** (`TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`) |
| Mint            | `DijmsEDeTXsWCkCLkhYJNTutKaHf541xZshVrCUbcozy` |
| Total supply    | **~989M** (began at 1B; only ever decreases via burns) |
| Mint authority  | **None — revoked** |
| Launch venue    | pump.fun |

There is **no mint authority**, so **emissions are impossible** — no new $DTOUR
can ever be created; supply only decreases via burns. The 0.5% discount threshold
is measured against the **live total supply** read at request time
(`getTokenSupply`, see §7.5), so it tracks burns automatically instead of a
hardcoded number. ($DTOUR is a **Token-2022** mint — this matters for the holder
snapshot; see §5.1.)

> Token decimals are assumed to be `6` (typical for pump.fun tokens) but **must
> be confirmed on-chain via `getMint` before any distribution** — payout math
> normalizes raw amounts by `10^decimals`, so a wrong value mis-scales every
> payout. Treat `tokenDecimals` in the config as **verify-then-trust**.

---

## 2. The settled model

There are exactly two token utilities. Both are settled; nothing else is promised.

1. **Holding $DTOUR = access to Detour Cloud.** The login gate connects a Solana
   wallet, verifies a SIWS signature, and (when the on-chain check is enabled)
   issues a session only to wallets holding $DTOUR. See `CLAUDE.md` → "Auth".

2. **Holders of ≥ 0.5% of supply get 20% off usage.** 0.5% of the fixed 1e9
   supply is **5,000,000 $DTOUR**. A wallet holding **≥ 5,000,000 $DTOUR**
   qualifies for a **20% discount** on Detour Cloud usage. (Detour resells
   ElizaOS Cloud at a flat 20% markup, so this discount roughly hands the markup
   back to large holders.) The threshold is **inclusive** — exactly 5,000,000
   qualifies.

### What the model is NOT

- **No staking.** There is no lock-up, no staking contract, no staking emissions.
- **No promised APY or rate.** Rewards are **not** a yield, an interest rate, or
  a guaranteed return.
- **No emissions of any kind** — the mint authority is revoked (see §1).

Rewards, where they exist (§3–§4), are **a share of fees Detour actually
collected** — variable, discretionary in size, and **paid in arrears** (you can
only ever distribute money that already came in). Read §8 (disclaimer) before
treating any of this as a financial promise.

---

## 3. Reward funding — pump.fun creator fees

The **only** funding source for holder rewards is **pump.fun creator fees**: real
SOL that accrues to the token's **creator-vault PDA** as the token trades.

### How creator fees work

- pump.fun routes a portion of trading activity to a **creator-vault PDA** owned
  by the token's creator wallet. This accrues **in SOL**.
- The creator claims it with the **`collectCreatorFee`** action — either via the
  **PumpPortal** API (action `"collectCreatorFee"`) or the equivalent on-chain
  `collectCreatorFee` instruction. The claim **pays SOL to the creator wallet**.
- Creator fees only accrue while trading happens on **pump.fun's own venues** —
  the **bonding curve** and the **canonical PumpSwap pool**. Once a token
  **migrates to a Raydium pool**, trades there do **not** generate pump.fun
  creator fees. (Whether $DTOUR is currently on the bonding curve, on PumpSwap,
  or migrated to Raydium is an **operator-verify** fact — confirm before relying
  on fee accrual.)

There is no fixed fee rate, cadence, or guaranteed amount asserted here. You
collect what has accrued, when you collect it. That variability is exactly why
the model promises "a share of fees we actually collected" and nothing more.

---

## 4. The configurable split

Collected SOL is split into **four pools** by **basis points (bps)** defined in
the operator config. The bps **must sum to exactly 10000** (= 100%) — every
script validates this on load and **exits with code 1** if it does not. This is a
hard invariant, not a warning.

| Pool       | Config key         | Purpose |
|------------|--------------------|---------|
| Builder    | `splitBps.builder` | Builder / dev pool — funds ongoing work. |
| **Holders**| `splitBps.holders` | The **pro-rata holder reward pool** (§5). |
| Buyback    | `splitBps.buyback` | SOL earmarked to buy back $DTOUR (§6). |
| Treasury   | `splitBps.treasury`| Ops treasury. |

The example config uses `30 / 40 / 20 / 10`. These are **examples to edit** — the
operator chooses the actual split. The only rule the tooling enforces is the
exact-10000 sum.

---

## 5. Holder rewards — pro-rata, paid in SOL

The **holders** slice (§4) is distributed **pro-rata** to $DTOUR holders, in SOL,
by the `distribute-to-holders.mjs` script (§7.3). Mechanics:

1. **Snapshot** every holder of the mint. Two methods:
   - `getProgramAccounts` — **complete** (all holders). Requires a real RPC; the
     public `api.mainnet-beta.solana.com` endpoint rate-limits / 403s this.
   - `getTokenLargestAccounts` — **fast but capped at 20 accounts**. Safe only
     for tiny holder sets; otherwise it **under-distributes** (silently ignores
     holders past the top 20). The script logs a loud warning when this method is
     chosen.
2. **Aggregate token accounts to owner wallets.** One owner can hold many ATAs;
   pro-rata pays **owners**, so balances are summed per owner.
3. **Filter:** drop owners below `minBalanceTokens`, then drop every address in
   the **exclude list** (§5.1).
4. **Pro-rata weight:** `shareFraction = ownerBalance / SUM(included owner
   balances)`. The denominator is the **sum of included holders' balances** — NOT
   the 1e9 total supply (see §5.2). This makes the holder pool **fully pay out**.
5. **Dust floor:** payouts below `minPayoutSol` are skipped (not worth the
   transaction fee / rent).
6. **Idempotency:** each run writes a payout manifest keyed by `{ mint, epoch }`;
   re-runs **skip already-paid owners** so a retry never double-pays.

### 5.1 Exclude list — do not pay yourself or the pool

The following addresses MUST be in `distribution.excludeWallets` or they will
receive pro-rata SOL (self-payment / pool sloshing):

- creator wallet
- builder pool wallet
- treasury wallet
- buyback wallet
- **the OWNER of the LP $DTOUR token account** held by the pump.fun
  bonding-curve / migrated AMM pool

> The pool/LP wallet is the easy one to forget. If you omit it, **the liquidity
> pool itself becomes the largest "holder" and the LP collects the reward pool.**
>
> **CRITICAL — exclude by OWNER, not by pool/market/ATA address.** Pro-rata
> matches on the token-account **OWNER**. For a bonding-curve / AMM pool the LP
> token account's owner is a **program-derived address (PDA)**, NOT the
> pool/market/mint/ATA address an operator typically has on hand. Pasting the
> pool/market/ATA address into `excludeWallets` excludes *nothing*, and the LP
> silently receives the largest payout. `distribute-to-holders.mjs` **flags any
> included recipient that is program-owned** in its dry-run plan — use the
> flagged owner PDA as the exclude entry.

The config validator warns if creator/builder/treasury/buyback are missing from
the list, and it is the operator's responsibility to add the LP token account's
owner PDA.

### 5.2 The two denominators — do not conflate

There are **two different "percent of holdings" calculations** in this system,
with **different denominators**. Keeping them separate is load-bearing:

| Use | Denominator | Why |
|-----|-------------|-----|
| **Discount eligibility** (Convex, §7.5) | **live total supply** (`getTokenSupply`) | "Do you hold ≥ 0.5% of *all* $DTOUR?" — measured against total supply, tracked live so burns count. |
| **Reward pro-rata** (`distribute-to-holders.mjs`, §5) | **SUM of included holder balances** | "What share of the *reward pool* is yours, among everyone being paid?" — must sum to 100% of the pool so it fully distributes. |

Using total supply as the pro-rata denominator would under-pay the pool (the
LP/excluded balances would absorb a share that never gets sent). Using the
included-sum as the eligibility denominator would mis-state the discount. Never
swap them.

---

## 6. Buyback (optional)

The **buyback** slice (§4) would spend SOL to buy $DTOUR. This step is
**documented-but-not-implemented** — **no buyback script ships**. An operator can
set its bps to 0 to opt out entirely; if set above 0, that slice is simply
**retained** in the creator wallet (recorded in the split manifest) until a
future buyback step is built. The mechanics below describe intent.

- **Venue is configurable:** `jupiter` (quote + swap API, self-signed) or
  `pumpportal` (`trade-local` `buy`). Both are self-sign flows.
- Bought $DTOUR lands at the configured `wallets.buybackTokenDest`.
- **There is no real burn.** With **no mint authority**, $DTOUR has **no burn
  authority** either — a true on-chain burn is **not possible**. "Burn" here can
  only mean **sending to an unspendable address**, and only if the operator
  explicitly opts in. Otherwise bought-back $DTOUR is simply **held** (treasury /
  buyback wallet).

---

## 7. Operator tooling (built / shipped)

All payout tooling lives under `scripts/tokenomics/`. The shipped scripts are
**two** (not four): `collect-and-split.mjs` (claim + split, combined) and
`distribute-to-holders.mjs` (pro-rata holder rewards), both backed by the shared
`lib.mjs`. **There is no separate `collect-fees.mjs`, `split.mjs`, or
`buyback.mjs`** — buyback is documented-but-not-implemented (§6).

### 7.0 Hard safety rules (every script obeys these)

1. **DRY-RUN by default.** Run with no flags and the script **simulates**: it
   prints every intended transfer as a `from / to / amount-SOL / reason` table,
   then **exits without sending anything.** This is the default everywhere.
2. **Real sends only behind `--execute`.** The literal `--execute` flag is the
   only thing that flips off dry-run. Centralized in `lib.confirmExecute`.
3. **Private keys only from env, never hardcoded, never logged, never
   committed.** Signing keys come from `CREATOR_WALLET_SECRET` (base58) — read
   only under `--execute`, decoded to a `Keypair`, and **never printed** (errors
   are redacted, e.g. `"CREATOR_WALLET_SECRET not set"`).
4. **The real config is gitignored.** Operators copy
   `config.example.json` (committed, example values) to `config.json`
   (gitignored) and fill in real wallets/bps. The example carries **no
   secrets** — keys are env-only.
5. **bps must sum to exactly 10000** or the script exits 1 (§4).
6. **Exclude the creator/pool/treasury/builder/buyback wallets** from pro-rata
   (§5.1).

The scripts are **ESM `.mjs`, run with `bun`**. They use `@solana/web3.js`
(`1.98.4`) and `bs58` (`^6`), both already in `package.json`. PumpPortal is
called via `fetch`, preferring the local/self-sign `/api/trade-local` flow.

### File layout

| File | Status | Role |
|------|--------|------|
| `scripts/tokenomics/lib.mjs` | shipped | Shared home for **all** safety invariants — arg parser, config loader + validator, env keypair loader, Connection factory, the canonical dry-run printer, lamports↔SOL helpers, holder snapshot reader, owner aggregation, exclude-list filter, program-owned-recipient flag, dust floor, PumpPortal tx inspection, and manifest read/write. The scripts are thin wrappers so the rules can't drift. |
| `scripts/tokenomics/collect-and-split.mjs` | shipped | Steps 1 + 2 — claim creator fees **and** split collected SOL into the four pools, in one run. |
| `scripts/tokenomics/distribute-to-holders.mjs` | shipped | Step 3 — pro-rata holder rewards. |
| (buyback) | **not implemented** | Step 4 — SOL → $DTOUR. Documented intent only (§6); no script ships. |
| `scripts/tokenomics/config.example.json` | shipped, **committed** | Template with EXAMPLE values (every `EDIT_…` must be changed). |
| `scripts/tokenomics/config.json` | **gitignored** | Operator's real config. Never committed. |
| `convex/tokens.ts` → `holderDiscount` | shipped | Convex holder-discount action (§7.5). |
| `.gitignore` | applied | Ignores `scripts/tokenomics/config.json` and `scripts/tokenomics/*.manifest.json` (run manifests: `split-*.manifest.json`, `payouts-*.manifest.json`). |
| `.env.example` | applied | Documents `CREATOR_WALLET_SECRET` and `RPC_URL` (falls back to `SOLANA_RPC_URL`). |

### Order of operations

```
collect-and-split  →  distribute-to-holders   (buyback: not implemented)
   (claim fees +          (holder slice            (buyback slice is retained
   split into 4 pools)     → holders pro-rata)       in the creator wallet)
```

Always do a full **dry-run pass first** for every step, read the printed plan,
and only then re-run with `--execute`.

### 7.1 `collect-and-split.mjs` — claim creator fees + split (Steps 1 + 2)

```bash
# DRY-RUN: print the intended collectCreatorFee claim, then compute + print the
# four-way split off (creator balance − creatorReserveSol) or --amount-sol, then
# exit without sending.
bun scripts/tokenomics/collect-and-split.mjs [--amount-sol <n>]

# EXECUTE: claim creator fees via PumpPortal trade-local (self-signed; the tx is
# INSPECTED before signing and refused if it would move SOL out of the creator),
# confirm, re-read the creator balance, split, send the builder + treasury
# transfers, and write a run-manifest.
bun scripts/tokenomics/collect-and-split.mjs --execute [--amount-sol <n>]
```

Claim flow: `POST https://pumpportal.fun/api/trade-local` with
`{ publicKey, action: "collectCreatorFee", priorityFee }` → `arrayBuffer` →
`VersionedTransaction.deserialize` → (dry-run prints + exits) / (`--execute`
inspects the tx, signs with the creator keypair, `sendRawTransaction`, confirm).

Split basis: **prefer `--amount-sol`** (the SOL actually collected this epoch).
Without it, the script falls back to `creatorBalance − creatorReserveSol` and
prints a **loud warning** that any retained, already-earmarked SOL (the holders +
buyback slices from a prior split) still in the wallet will be RE-SPLIT — and
surfaces earmarked totals from any prior split manifest. Only the **builder +
treasury** slices are sent on-chain here; the **holders + buyback** slices are
RETAINED in the creator wallet and recorded to a `split-<ts>.manifest.json` for
`distribute-to-holders.mjs` (holders) and a future buyback (buyback) to consume.
**Env:** `RPC_URL`/`SOLANA_RPC_URL`, plus `CREATOR_WALLET_SECRET` (only `--execute`).

### 7.2 `distribute-to-holders.mjs` — pro-rata holder rewards (Step 3)

```bash
# DRY-RUN: snapshot holders, aggregate to owners, filter (min-balance +
# exclude-list), FLAG any program-owned recipient (likely LP/pool PDA), compute
# pro-rata, apply dust floor, print the FULL payout table + reconciliation, exit.
bun scripts/tokenomics/distribute-to-holders.mjs --amount <SOL> \
  [--method getProgramAccounts|getTokenLargestAccounts]

# EXECUTE: pre-flight the payer balance (>= payouts + per-tx fees + reserve),
# then send SOL to each eligible owner; an "attempted" record is persisted BEFORE
# each send and a paid manifest (mint + amount keyed) after, so re-runs reconcile
# confirm-timeouts and never double-pay.
bun scripts/tokenomics/distribute-to-holders.mjs --execute --amount <SOL>
```

Implements §5 end-to-end. `--amount` (SOL) is the holder slice to distribute —
typically the `holderPoolSol` printed by `collect-and-split.mjs`. Prefer
`getProgramAccounts` (complete; **requires a provider RPC** — Token-2022
`getProgramAccounts` is excluded from public-RPC secondary indexes) over
`getTokenLargestAccounts` (works on public RPC but capped at 20).
**Env:** `RPC_URL`/`SOLANA_RPC_URL` + `CREATOR_WALLET_SECRET` (`--execute`).

### Global script behavior

- Missing config → exit 1 with: `cp scripts/tokenomics/config.example.json scripts/tokenomics/config.json`.
- bps ≠ 10000 (or any bps a negative/non-integer) → exit 1.
- A destination wallet equal to the all-ones default / System Program id → exit 1.
- `--execute` without `CREATOR_WALLET_SECRET` → exit 1 (redacted message).
- Secrets are **never printed**.

### 7.5 `convex/tokens.ts` — `holderDiscount`

A **pure-V8 Convex action** (no `"use node"`) that mirrors
`convex/tokens.ts:balanceOf` — it fetches a wallet's $DTOUR balance via the
`getTokenAccountsByOwner` JSON-RPC and returns its discount eligibility.

```ts
export const holderDiscount = action({
  args: { pubkey: v.string() },
  handler: async (_ctx, { pubkey }): Promise<{
    balance: number;     // uiAmount $DTOUR across the wallet's token accounts
    supply: number;      // uiAmount TOTAL minted supply (getTokenSupply)
    pctOfSupply: number; // balance / supply (0..1)
    qualifies: boolean;  // pctOfSupply >= threshold
    discountBps: number; // 2000 (20%) if qualifies, else 0
  }> => { /* ... */ }
});
```

Constants are **re-declared locally** (like `tokens.ts` already does for the
mint) to avoid importing `src/` into `convex/`:

```ts
const DTOUR_MINT = "DijmsEDeTXsWCkCLkhYJNTutKaHf541xZshVrCUbcozy";
const DTOUR_DISCOUNT_THRESHOLD = 0.005;     // 0.5% of supply
const DTOUR_HOLDER_DISCOUNT_BPS = 2000;     // 20% off, in basis points
```

Math (load-bearing) — the shipped function divides by the mint's **total minted
supply** read live via `getTokenSupply` (NOT a hardcoded constant):

```
balance     = Σ uiAmount over the wallet's $DTOUR token accounts
supply      = getTokenSupply(mint).uiAmount      // TOTAL minted supply (RPC read)
pctOfSupply = balance / supply                   // guards supply 0 → 0%
qualifies   = pctOfSupply >= DTOUR_DISCOUNT_THRESHOLD  // inclusive: exactly 0.5% qualifies
discountBps = qualifies ? 2000 : 0
```

These values match the frontend constants in `src/lib/dtour-branding.ts`
(`DTOUR_DISCOUNT_THRESHOLD`, `DTOUR_HOLDER_DISCOUNT`), and the eligibility
denominator is the live total supply (§5.2).

> **The discount is not yet enforced in live billing.** Billing is not wired up
> in Detour Cloud, so `convex/tokens.ts:holderDiscount` only *reports*
> eligibility — nothing currently applies a 20% reduction to a charge. Wiring the
> discount into billing is future work.

### 7.6 Admin Tokenomics surface — config, dry-run, Execute (built)

The dashboard exposes tokenomics to admins at the **Tokenomics** admin page
(`src/dashboard/admin/AdminTokenomics.tsx`, backed by `convex/tokenomics.ts`).
It is **admin-gated** (`requireRole`/`myRole` — `admin` or `super_admin`) and
shipped in **two phases, both built**. Unlike the CLI (§7.1–7.3), the config it
edits lives in the **`tokenomicsConfig` Convex table** (single-doc; pubkeys +
bps only — **never** secret keys), and the holder snapshot comes from **Helius
DAS `getTokenAccounts`** (cursor-paginated, Token-2022-aware, aggregated by
owner) rather than `getProgramAccounts`.

**Phase 1 — config + dry-run preview (built).**

- **Config editor:** the four-way `splitBps` (validated to sum to **exactly
  10000** in `setConfig`, mirroring §4), the four pool wallets
  (creator / builder / treasury / buyback), `minBalanceTokens`, `minPayoutSol`,
  and `creatorReserveSol`. Saving writes the single `tokenomicsConfig` doc and
  logs a `tokenomics.config` event.
- **`snapshot` action (read-only):** pulls the live holder set (Helius DAS),
  the creator wallet's SOL balance, and total supply (`getTokenSupply`). The UI
  then computes the four-way split off `creatorBalance − creatorReserveSol` and
  the per-holder pro-rata payouts **client-side** — a true dry-run that **moves
  nothing on-chain**.

**Phase 2 — Execute (built).** The admin can now run the holder distribution
from the dashboard. It is **semi-automatic**: the server prepares and the
operator signs, so no signing key ever reaches the server. The guarantees mirror
the CLI's "hard safety rules" (§7.0) and add ledger-backed idempotency:

1. **Semi-auto wallet signing.** The server builds the unsigned payout
   transaction(s); the admin signs **in their own browser wallet** (the creator
   wallet). **No private key is ever sent to or stored on the server** — only
   pubkeys live in `tokenomicsConfig` (see the UI note: "Pubkeys only — secret
   keys never touch the server"). This is the dashboard analog of the CLI's
   env-only `CREATOR_WALLET_SECRET` (§7.0 rule 3).
2. **Helius relay, server-side.** Building, simulating, and broadcasting go
   through a **server-side Helius RPC relay** (the Convex action holds the
   Helius endpoint via `SOLANA_RPC_URL`), so the browser never talks to a public
   Solana RPC directly. The wallet only **signs**; the server **relays**.
3. **Per-run cap.** Each Execute run enforces a **maximum total SOL** it may
   disburse. A run whose computed payouts exceed the cap is **refused** before
   any signing — a blast-radius limit on a fat-fingered split or a stale
   snapshot.
4. **Simulate-before-send.** Every transaction is **simulated** (Helius
   `simulateTransaction`) and must succeed before the operator is asked to sign.
   A failing simulation aborts the run — the on-chain analog of §7.0's dry-run
   default.
5. **Idempotent payout ledger.** Each run records an **attempted-then-paid
   ledger keyed by `{ mint, epoch, owner }`**, written **before** each send and
   finalized **after** confirmation (the same attempted/paid discipline the CLI
   ledger uses, §7.2 / lib `writeManifest`). A re-run **skips owners already
   paid for that epoch**, so a confirm-timeout retry never double-pays.
6. **LP excluded.** The pump.fun / AMM **liquidity-pool position is excluded**
   from payouts — the excluded LP owner is
   **`5ZZLXY1YGvkexPgFQjH5pnhviaDsRut56PgEiYeAyTRE`**. Per §5.1 this is the
   token-account **OWNER** (not a pool / market / mint / ATA address) — pro-rata
   matches on owner, so this is the address that actually removes the LP from the
   reward set. The pool/self wallets (creator / builder / treasury / buyback)
   are likewise filtered, exactly as the dry-run preview already does.

> **Same model, two entry points.** The dashboard Execute flow and the
> `distribute-to-holders.mjs` CLI (§7.2) implement the **same** §5 pro-rata
> distribution with the **same** denominators (§5.2) and the **same** exclude /
> dust / idempotency rules — the dashboard is the operator-friendly path; the
> CLI remains for headless / scripted runs. Always read the dry-run preview
> (Phase 1) before pressing **Execute** (Phase 2).

---

## 8. Configuration reference

Operators copy the committed example to the gitignored real file and edit every
`EDIT_…` placeholder:

```bash
cp scripts/tokenomics/config.example.json \
   scripts/tokenomics/config.json
```

Schema (example values — **everything marked EDIT must change before
`--execute`**):

```jsonc
{
  // RPC comes from env RPC_URL (fallback SOLANA_RPC_URL), not this file.
  "mint": "DijmsEDeTXsWCkCLkhYJNTutKaHf541xZshVrCUbcozy", // fixed — do NOT edit
  "tokenDecimals": 6,                  // EDIT-VERIFY via getMint before trusting

  "wallets": {
    "creator":          "EDIT_CREATOR_WALLET_PUBKEY",   // fee recipient + SIGNER (secret in env)
    "builder":          "EDIT_BUILDER_POOL_PUBKEY",
    "treasury":         "EDIT_TREASURY_PUBKEY",
    "buyback":          "EDIT_BUYBACK_PUBKEY",
    "buybackTokenDest": "EDIT_OR_SAME_AS_buyback"        // where bought $DTOUR lands
  },

  "splitBps": {            // MUST sum to exactly 10000 or every script exits(1)
    "builder":  3000,      // EDIT — 30%
    "holders":  4000,      // EDIT — 40% (the pro-rata reward pool)
    "buyback":  2000,      // EDIT — 20%
    "treasury": 1000       // EDIT — 10%
  },

  "collect": {
    "priorityFeeSol":    0.000001,  // EDIT — PumpPortal claim priority fee
    "creatorReserveSol": 0.02       // EDIT — SOL left in creator wallet after split
  },

  "distribution": {
    "snapshotMethod":  "getProgramAccounts", // "getProgramAccounts" (complete) | "getTokenLargestAccounts" (capped 20)
    "minBalanceTokens": 1000,                 // EDIT — ignore holders below this
    "minPayoutSol":     0.001,                // EDIT — dust floor
    "excludeWallets": [                        // EDIT — see §5.1 (exclude by OWNER)
      "EDIT_CREATOR_WALLET_PUBKEY",
      "EDIT_BUILDER_POOL_PUBKEY",
      "EDIT_TREASURY_PUBKEY",
      "EDIT_BUYBACK_PUBKEY",
      "EDIT_LP_TOKEN_ACCOUNT_OWNER_PDA"        // the OWNER (PDA) of the LP token account — NOT the pool/market/ATA address
    ]
  },

  "buyback": {
    "venue":          "jupiter",   // "jupiter" | "pumpportal"
    "slippageBps":    200,         // EDIT
    "priorityFeeSol": 0.000001     // EDIT — pumpportal venue
  }
}
```

Validation enforced at config load: (1) every `splitBps` value is a non-negative
integer AND they sum to exactly 10000, else exit 1; (2) all `wallets.*` are valid
base58 PublicKeys and none is the all-ones default / System Program id; (3)
`excludeWallets` contains creator + builder + treasury + buyback at minimum
(warns if the LP-owner address is missing); (4) `mint` matches `DijmsED…` (guards
against wrong-token config).

### Environment variables (gitignored `.env` / shell env — never committed)

| Var | Used by | Notes |
|-----|---------|-------|
| `CREATOR_WALLET_SECRET` | the scripts (under `--execute`) | base58 secret key of the creator/signer wallet. **Never commit, never log.** |
| `RPC_URL` | scripts | A **provider** RPC endpoint (primary). **Required** for the `getProgramAccounts` holder snapshot — Token-2022 `getProgramAccounts` is excluded from public-RPC secondary indexes (RPC error -32010). |
| `SOLANA_RPC_URL` | scripts (fallback) + Convex | RPC fallback when `RPC_URL` is unset; also the existing gate/Convex endpoint. Public `api.mainnet-beta.solana.com` will fail `getProgramAccounts` for Token-2022. |

---

## 9. Securities / legal disclaimer

**This is not financial, investment, or legal advice, and $DTOUR is not offered
as an investment.**

- $DTOUR rewards are **a share of fees Detour actually collected** (pump.fun
  creator fees, §3). They are **discretionary, variable in amount, and paid in
  arrears** — you can only ever distribute SOL that already accrued.
- There is **no promised return, no APY, no interest rate, no guaranteed
  payout**, and **no emissions** (the mint authority is revoked; supply is fixed
  at 1e9). Nothing in this document should be read as a promise of profit.
- The 20% usage discount is a **product discount** tied to holding a threshold
  amount of the token, **not** a financial yield. It is **not currently enforced
  in billing** (§7.5).
- Distributing rewards funded by fees, framed around token holdings, can
  implicate securities, money-transmission, and consumer-protection law in some
  jurisdictions. **Obtain qualified legal counsel before any public launch of a
  staking, rewards, or distribution program**, and before describing $DTOUR's
  economics to the public.
- Token decimals, the bonding-curve/AMM pool address, the current trading venue
  (bonding curve / PumpSwap / Raydium-migrated, §3), the LP exclude owner
  (`5ZZLXY1YGvkexPgFQjH5pnhviaDsRut56PgEiYeAyTRE`, §5.1 / §7.6 — verify it is the
  token-account **OWNER**, not a pool/market/ATA address), and all wallet
  addresses are **operator-verified facts** — confirm them on-chain before any
  `--execute` or dashboard **Execute** run.
