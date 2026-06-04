# COMPETE — Detour Cloud go-forward strategy

> Source of truth for **why a customer picks Detour, how we stay low-priced and
> still make an honest profit, and what we build next.** Every recommendation is
> grounded in code that exists today (see `convex/`, `services/coding-relay/`,
> the audit). Numbers marked _illustrative_ depend on a wholesale price table we
> do **not** have yet — they show the margin *structure*, not real prices.

Detour is a **white-label reseller of ElizaOS Cloud (Model-1 "biller")**: we
proxy ElizaCloud inference under one Detour `eliza_` key, pay ElizaCloud
wholesale, and bill users ourselves in **USD credits**. We do **not** run the
backend and we **cannot** win on backend features — same infra, same ~19
surfaces. Our entire edge is the **experience + economic layer**.

---

## 1. Positioning — why a customer picks Detour

We compete on two fronts. Against **ElizaCloud** (our own upstream) we win on the
billing/UX layer only. Against the **point-solution clouds** we win by bundling.

### vs ElizaCloud (the thing we resell)

| Axis | ElizaCloud | Detour | Why it matters |
|---|---|---|---|
| Billing unit | reason in **$ELIZA token** math | **USD credits** (integer micro-USD, `creditBalances`) | Mainstream users price in dollars, not a volatile token |
| Top-up rail | $ELIZA-centric | **Solana-native**: $DTOUR _and_ USDC (1:1, no oracle) | Solana-first audience; stablecoin removes rate risk |
| Pricing visibility | opaque token math | **transparent USD price preview** before every run | "No surprise markup" is the bar OpenRouter/Vercel set |
| Holder perk | none | **$DTOUR holder rate on supported billing paths** (coding sandboxes today) | Real, sustainable perk — but a *niche* one (see note) |
| Onboarding | generic | **custom dashboard + curated templates** | Speed-to-value is the #1 conversion lever |
| Community earning | per-user affiliate we can't differentiate | **Detour-native affiliate on referred coding margin today; credit payouts planned** | Keeps live earnings inside shipped rails while the credit-payout rail is built |

### vs the point clouds (OpenRouter / Vercel / Together / Fal / E2B / Modal)

Those tools each do **one** thing well (routing, raw tokens, media, sandboxes).
Detour's edge is **one crypto-native account that bundles** agents + Design
Studio workflows + E2B coding sandboxes + 470 models + media gen + a native
affiliate (+ MCP catalog _coming soon_ — today it stores connections but does
**not** execute tools; see §5.B) — instead of assembling 4–5 point solutions
with 4–5 API keys. We will **never** out-cheap OpenRouter (+5.5%) on raw tokens; we win on the
bundle and the crypto-native rail, and we keep raw-token markup thin enough that
the comparison doesn't embarrass us (see §2).

### The honest lead

> **Lead with: transparent USD pricing + USDC stablecoin top-up + free starter
> credits + the bundle.** These are broad hooks every visitor can use.

The **holder rate is a real perk but not a mass-acquisition lever**: it
triggers at **≥0.5% of supply ≈ ~4.95M $DTOUR** — a whale threshold almost no
ordinary user clears. Treat it as a genuine, enforced perk for large holders, not
as the reason a new customer signs up. Do **not** build the acquisition story on
a discount most customers can't access.

---

## 2. Pricing & profit model — low price, small honest profit

> **#1 BLOCKING UNKNOWN — confirm before pricing or advertising any inference
> markup.** The entire "low-priced inference" thesis assumes **Detour's wholesale
> rate sits below ElizaCloud's own retail** — i.e. that our reseller cost is a
> *genuine discount* off the price a user would pay ElizaCloud directly. Under
> **Model-1** (one Detour org key paying ElizaCloud's posted prices) there may be
> **no reseller discount at all.** If there isn't, the competitive ceiling (guard
> #2 below) is violated at **any** markup `> 0`: every inference call through
> Detour is strictly more expensive than the user going to ElizaCloud direct, and
> there is no honest way to sell inference low-priced. **Confirm the reseller
> margin from ElizaCloud in writing before pricing or advertising any inference
> markup.** This ranks **above** the missing wholesale price table (below): the
> table doesn't help if there's no discount to begin with. The +30% number is
> **not settled** until this is confirmed.

### The principle

Surface markups are set **per-surface** to keep margin honest. Public copy must
only claim holder-rate behavior on a path after that charge path is wired,
priced, and exposed in the UI. Coding sandboxes meet that bar today; inference,
MCP, top-ups, and channel add-ons should stay described as metered or planned
until their user-facing pricing and reward rails are complete.

Two metered surfaces, **two different markups**, for a grounded reason:

- **Coding sandboxes** (E2B) — we meter **raw wholesale compute cost** (CPU
  14µ$/vCPU-s, RAM 4.5µ$/GiB-s). There is no upstream margin baked in, so the
  current **1.5× markup** (`MARKUP_FRACTION=0.5` in `convex/coding.ts`) is the
  live margin on bare compute, floored at $0.01/session.
- **Inference** (chat/media/470 models) — the wholesale price we pay ElizaCloud
  **already contains ElizaCloud's margin.** Stacking a 2× on top would be
  margin-on-margin and would blow past "low-priced." So inference must carry a
  **much thinner markup than coding.**

### The arithmetic that will pin any advertised inference markup

Let `m` = inference markup fraction. Two hard guards bound it before we advertise
an inference price or holder rate:

1. **Holder-margin floor, if a holder rate is enabled for inference** — a holder
   price must stay at or above wholesale. Do not publish an inference holder
   rate until the exact discount and markup are verified against real cost.
2. **Competitive ceiling** — the non-holder price `(1+m)` must land **≤ what the
   user would pay ElizaCloud directly** (only satisfiable if our wholesale sits
   below ElizaCloud retail — see the blocking unknown at the top of §2). If it
   doesn't, "low-priced" is false and there's no reason to route raw tokens
   through us.

Any inference markup remains **operator-configured and unpublished** until the
reseller margin and user-facing billing surface are verified. Do **not** publish
or advertise a percentage as settled until that discount is confirmed in writing
and the UI shows the same price the charge path applies.

> If the band between the two guards is ever empty for a model, we do **not** sell
> that model at a loss. We lower the discount or skip the model.

### Example unit economics (_illustrative_ — assumed wholesale)

We do **not** yet have ElizaCloud's per-model wholesale table (audit flags it as a
**blocking unknown**: we need their response `usage` payload + a wholesale price
list). The table below shows the **margin structure**, not real prices — and it
assumes the reseller discount flagged at the top of §2 actually exists (if our
wholesale is not below ElizaCloud retail, the structure holds but the prices
can't be sold low-priced). Assume a mid-tier chat model at **$2.00 / 1M tokens
wholesale** and a 1,000-token call (0.001M tokens → $0.002 wholesale).

| | Wholesale cost (we pay Eliza) | Example non-holder price | Holder price |
|---|---|---|---|
| per 1M tokens | $2.000 | unpublished until verified | not advertised |
| per 1k-token call | $0.00200 | unpublished until verified | not advertised |
| **our margin / call** | — | depends on verified markup | not claimed |

Media is **per-call** (image/video/TTS), so meter it as a flat per-unit price +
the same markup, with the same $0.01 floor that already exists for coding.

### Free starter credits — sized to convert, not to give away

- Grant a **small fixed micro-USD balance** ($0.25–$0.50) **once** per gated
  wallet on first onboarding (`profiles.save`), recorded as a `creditTopUps`-style
  ledger row so it can **never** be re-granted, **expiring in N days**.
- **Sustainability check:** at the illustrative numbers above, $0.50 ≈ **~190
  full 1k-token chat calls** of *value to the user* but only **~$0.38 of wholesale
  COGS** to us — and that's the worst case where the user burns 100% of it. The
  grant's COGS is **far below the expected margin of a single converted
  top-up customer.** It is a sample, not a subsidy.
- **Sybil bound — the whitelist, not a balance gate (verify before open signup):**
  during early access the **admin-issued whitelist** (`convex/gate.ts` is
  whitelist-only; the on-chain balance check is display-only — "balance no longer
  gates entry") is what bounds Sybils, *not* a $DTOUR balance. The grant being
  one-time-per-wallet, bounded, and expiring **caps the worst-case loss** but does
  **not** make it Sybil-*uneconomic* if the gate ever reverts to `balance > 0`
  (the restored design in CLAUDE.md — dust passes for gas, so it's drainable per
  throwaway wallet). **Tie grant eligibility to the whitelist while it exists, and
  re-evaluate this before any open / self-serve signup.**

### Multi-asset top-up: USDC alongside $DTOUR

- **USDC is strictly safer than $DTOUR**: it's a $1 stablecoin, so credit **1:1
  with no price oracle** (`usdMicro = round(usdc × 1e6)`). No DexScreener call, no
  "price feed unavailable" failure path, no volatility window.
- It **reuses ~90% of the existing rail** (`convex/credits.ts` +
  `src/lib/credits-topup.ts` + `TopUpModal.tsx`): same `applyTopUp`, same
  `creditBalances`/`creditTopUps` tables, same confirm/credit UX, same
  idempotency-by-signature (Solana sigs are globally unique → cross-asset safe).
- **The one real footgun:** USDC uses the **standard SPL Token program**
  (`TokenkegQ…`), **not** Token-2022 — and the program ID is an **ATA derivation
  seed**, so the current 4 hardcoded `TOKEN_2022_PROGRAM_ID` usages would derive
  the wrong token accounts. Parametrize `{mint, programId, decimals, price}` by an
  `asset: "DTOUR" | "USDC"` discriminator.

---

## 3. Prioritized roadmap — the tools / tips / hacks

Ordered by dependency, then leverage. **Effort = engineer-days.** "Uses what we
have" is honest: `true` = real extension of existing code; `false` = net-new.

| # | Feature | Why it wins customers | Days | Uses what we have | Revenue / retention impact |
|---|---|---|---|---|---|
| **0** | **Honesty pass — keep live copy inside shipped rails** (affiliate scope, starter-credit behavior, holder-rate labels, MCP/API/deploy claims) | Cheapest trust win; stops shipping lies while beta rails are still gated | **done, then ongoing** | ✅ copy/labels/gates only | High trust; keep repeating before each new launch surface. |
| **1** | **Meter inference into credits (KEYSTONE)** — gate + debit chat/media/model calls like coding does; interim flat per-request floor first, token-accurate once the wholesale table lands; new `inferenceUsage` ledger | Plugs the 100%-of-non-coding margin leak; **unlocks every usage-denominated feature below** | **3–5** | ✅ reuses `canStart`/`computePrice`/`creditBalances` pattern | **Highest** — converts the default surfaces (chat/media) from pure cost to margin |
| **2** | **USDC top-up rail (Solana)** — generalize the $DTOUR rail with an `asset` discriminator; 1:1, no oracle | Predictable stablecoin pay = removes the #1 friction (token volatility) for mainstream users | **1.5** | ✅ ~90% reuse of `credits.ts` | High acquisition; safer than $DTOUR; default the picker to USDC |
| **3** | **Unified usage dashboard** — spend-by-surface, tokens, top models, live credit burn-down on `/analytics` | Cost control + observability is a top-3 buyer value and a costly retrofit; build it in now | **2** | ✅ extends `analytics.overview` + new ledger | High retention; needs #1 first |
| **4** | **Expand holder-rate enforcement only where billing supports it** — keep coding live, and wire any future surface only after its charge path and preview agree | Turns token utility into an enforced, path-specific perk without overclaiming | **1.5** | ✅ coding live; other paths require verification | Medium; **honesty** (no unsupported inference/MCP/top-up discount claims) |
| **5** | **Transparent pricing page + in-context cost preview** — per-model/per-sandbox effective price, estimate before any run, holder rate only where supported | "Transparent pricing" is our clearest edge vs ElizaCloud's opaque token math | **2** | ✅ uses `dtourPriceUsd()` + `computePrice()` | High acquisition; expose live coding rates accurately and keep planned surfaces labeled |
| **6** | **Model auto-router + cost slider** — "Auto" default + cheapest/fastest toggles over 470 models; post-run "you saved $Z" readout | Auto-route-to-cheapest is the single feature buyers cite for "90% savings"; matches our model-routing principle | **4** | ✅ we already proxy the live catalog | High acquisition; savings readout needs #1 |
| **7** | **Sized free starter credits + activation checklist** — $0.25–$0.50 one-time grant + "ship your first agent, send one message" in <60s | 73% abandon week-1 without an aha; free value before paywall is the top activation lever | **2** | ✅ `grantCredits` + onboarding flow exist | High activation; only bites on chat **after** #1 |
| **8** | **Curated template library** — seed 8–12 ready agents/workflows into `workflowTemplates`; one-click "Use this template" clones into Design Studio / agent creator | Speed-to-value is the #1 onboarding lever | **3** | ✅ `templates.ts` + `workflowTemplates` exist (today: user templates only) | High activation; showcases the whole bundle in one click |
| **9** | **Two-sided referral bonus in CREDITS, on first top-up** — both referrer & referee get a fixed capped credit grant in `applyTopUp` when a referred wallet first tops up | 2026 best practice: two-sided (+85%), credits-over-cash (+18%), reward-on-first-paid-action (Sybil-resistant) | **2** | ✅ `referrals` indexed `by_pubkey` | High growth; funded by margin, not emissions |
| **10** | **Affiliate payout in credits** (keep $ELIZA as optional cash-out) — pending markup-share converts 1:1 into the affiliate's `creditBalances`, no token transfer | Removes a real cash outflow + ops burden; credits recirculate into retention | **1.5** | ✅ reuses `pendingMicroFor` accrual | Medium; widens base once #1 ships |
| **11** | **Spend guardrails** — per-user monthly cap + 80%-of-budget + low-balance alerts; optional auto-top-up trigger | Budget control is a stated buyer priority **and** abuse/churn protection for a reseller paying wholesale | **3** | ✅ `creditBalances` + events/inbox | Medium retention; needs #1 |
| **12** | **Usage points → redeem into credits + weekly leaderboard** — points for real actions (ship agent, publish, refer-a-converter, build-streak); redemption pool = hard-capped margin slice | Gamified loops lift 30-day retention 15–20% **only when points buy something real** | **3** | ✅ `events.ts` already logs actions | Medium retention; pool capped so it can't outrun revenue |
| **13** | **One-click deploy + share** — proxy ElizaCloud's container/social deploy, return a public chat link, gated by a credit check | One-command deploy is a headline capability buyers expect; credit-gate makes it safe to resell | **4** | ⚠️ partial — new wiring over existing proxied infra | Medium; deploy can't run at $0 balance |
| **14** | **Creator one-time app-purchase share** (paid in credits) — buyer pays `priceUsd` from credits to unlock a published agent; 80/20 split; new `appPurchases`/`appEarnings` ledger | `My Apps` only sets a price flag today — there's literally no way to buy an app or for a creator to earn | **5** | ❌ net-new (no `apps`/`app_earnings` table in Convex) | High creator retention; zero Detour outlay beyond margin |
| **15** | **Creator ongoing inference-markup share** — creators earn a slice of the markup on inference their published app drives from other users | "Earn while you build" flywheel, paid from real per-call margin | **4** | ❌ net-new; **hard-depends on #1** | Highest power-creator retention; no metered base until #1 |

---

## 4. Community-earning mechanics (sustainable only)

All earning is **paid in credits from real margin** — never emissions, staking,
yield, or buyback promises. Credits cost us only wholesale COGS and recirculate
into the platform (retention), so they are sustainable by construction.

| Mechanic | Funded by | Sustainability guard |
|---|---|---|
| **Two-sided referral bonus** (#9) | margin on the referee's eventual usage | fixed grant, capped/referrer/day, paid only on **first real top-up** (not signup) — the paid-action trigger (not any balance gate) is what makes it Sybil-uneconomic |
| **Affiliate markup-share, paid in credits** (#10) | the 20%-of-markup the referral actually generated | accrues from real `priceMicroUsd`; $ELIZA cash-out optional and labeled as a cash cost |
| **Creator app-purchase split** (#14) | the buyer's own credits | one-time price, 80/20, no Detour outlay beyond existing margin |
| **Creator inference-markup share** (#15) | real per-call inference margin | configurable slice of a *metered* base; nothing to split until #1 ships |
| **Usage points → credits** (#12) | a **hard-capped** slice of realized margin | points key off action events, redemption budget is a fixed cap that can never outrun revenue; points buy credits, never a new token |
| **Holder rate** (#4) | realized margin on supported billing paths | a product discount, not yield; advertised only where the charge path enforces it |

**Why this is on the right side of 2026:** airdrop fatigue is real; the winning
shift is **participation-driven, fee-funded, behavior-based** rewards over volume
farming and emissions. Detour's no-emissions, creator-fee-funded model already
sits there — lean into _"earn from real usage, paid from real fees."_

---

## 5. NOT doing / checks we can't cash

### A. Honesty constraints now enforced in copy/gates

- Affiliate copy must say earnings accrue from referred coding sandbox fees only
  until `pendingMicroFor` includes another metered base.
- Referral copy must not promise two-sided signup credits until #9 ships on first
  real top-up.
- Holder copy must say holder rates apply only on supported billing paths,
  currently coding sandboxes. Do not claim inference, MCP, top-up, or channel
  add-on discounts until those charge paths enforce them and the UI previews them.
- MCP, API-key, webhook, gateway, and container deploy copy must stay gated or
  "planned" until auth, metering, and runtime verification are complete.

### B. Deliberate non-goals (do NOT promise these)

| Not doing | Why |
|---|---|
| **Base / EVM USDC** | EVM verify is a fundamentally different shape (ERC-20 Transfer log via `eth_getTransactionReceipt`, new RPC, wagmi/viem stack); our $DTOUR-gated auth can't bind an EVM address to a Solana login pubkey. **v2 only on real EVM demand** — do not build the abstraction now. |
| **Real MCP execution** | `mcps.ts` only stores id strings — no transport, no tool registration, no execution. Mark "coming soon"; don't imply tools run. Remove/disable the dead `tools.search` workflow node so it stops erroring as if mis-wired. |
| **Programmatic API-key product** | API keys are **display-only** — `keyHash`/`by_prefix` are never read; `proxy.forward` auths by session, not key. Keep API keys and live proxy execution behind launch gates until real key-auth and metering ship. |
| **Out-pricing OpenRouter on raw tokens** | +5.5% / +0% is a bar we can't beat as a reseller paying wholesale. We compete on the **bundle + crypto rail**, not raw-token price. |
| **Staking / yield / emissions / buyback-as-promise** | $DTOUR is **holder status + supported holder rates only**, with any rewards funded by collected creator fees. No emissions, no yield, no buyback commitment (buyback is documented-intent only). |
| **Backend feature parity races vs ElizaCloud** | We resell the same infra. We can't win there; we win on UX + economics. |
| **`proxy.forward` as a free inference faucet** | Until #1, API Explorer must stay gated and any enabled catalog mode must restrict live calls to read-only/GET. Meter before promoting POST/chat/media routes. |

---

## 6. Sequencing — 30 / 60 / 90

### First ~30 days — stop the bleed, stop the lies, add the safe rail
- **#0 Honesty pass** (0.5d) — ship day one, in parallel with everything.
- **#1 Meter inference** (3–5d) — the keystone. Interim flat per-request floor
  first to stop the leak immediately; token-accurate once the wholesale table is
  obtained. **Blocking dependency: get ElizaCloud's `usage` payload + per-model
  wholesale prices.**
- **#2 USDC top-up** (1.5d) — independent of #1; runs alongside.
- **Gate `proxy.forward`** so the API Explorer can't be a free faucet.

### ~31–60 days — make metering visible and trustworthy
- **#3 Usage dashboard** (2d), **#4 Expand holder-rate enforcement only where supported** (1.5d),
  **#5 Transparent pricing page** (2d) — all unlocked by #1.
- **#7 Free starter credits + activation checklist** (2d) — now bites on chat.
- **#9 Two-sided referral bonus in credits** (2d) — independent, growth flywheel.

### ~61–90 days — differentiate and turn on community earning
- **#6 Auto-router + savings readout** (4d) — the "90% savings" headline.
- **#8 Curated templates** (3d) — speed-to-value showcase.
- **#10 Affiliate payout in credits** (1.5d), **#11 Spend guardrails** (3d),
  **#12 Usage points** (3d).
- **Stretch / net-new:** **#13 one-click deploy** (4d), **#14 creator
  app-purchase** (5d), **#15 creator inference share** (4d) — schedule by demand;
  #15 hard-depends on #1.

> **One rule above all:** ship nothing that writes a check the code can't cash.
> Meter before you advertise, enforce before you promise, and pay community
> earnings only from margin we actually realized.
