# Messaging Control of the Coding Agent — Requirements & Architecture

_Research briefing, 2026-06-03. "What do we need to host or have" to let users prompt/control their Detour coding agent from **iMessage, Discord, and Telegram** (like Codex/Claude now offer)._

---

## 0. TL;DR — the gap, and why it fits what we just built

- **The market gap (verified):** every first-party *cloud* coding agent — Codex, Claude Code (cloud), Cursor, Devin, Copilot, Jules — offers messaging control through **Slack ONLY** (Copilot adds Teams). **None** does Discord/Telegram/iMessage.
- **The only first-party iMessage/Discord/Telegram option is Anthropic's "Claude Code Channels"** (research preview, Mar 2026) — but it runs the work **on your own machine** (an MCP server pushing into a *local* Claude Code session), **not in the cloud**.
- **So nobody ships a *cloud-hosted* coding agent you can drive from iMessage/Discord/Telegram.** That's Detour's opening.
- **The fit:** the account-linking each channel needs is the **same one-time-code/deep-link handshake we just built for device pairing (E3)**. And iMessage's only sane per-user path is **a bridge on the user's own Mac** — which Detour *already has*: the **detour desktop app** we're wiring as the Self-host backend. So messaging control is mostly an *extension* of the self-host work, not a new subsystem.

---

## 1. What competitors ship now

| Agent | Messaging control | Runs where |
| --- | --- | --- |
| OpenAI Codex | **Slack** only (`@Codex`, GA Oct 2025) | cloud |
| Claude Code (cloud) | **Slack** only (`@Claude`, Dec 2025) | cloud |
| Cursor | **Slack** only (`@Cursor`) | cloud VM |
| Devin | **Slack** only (+ event-triggers) | cloud |
| GitHub Copilot agent | **Slack + Teams** | GH Actions |
| Google Jules | Slack via API (alpha) | cloud VM |
| **Claude Code "Channels"** (Mar 2026) | **Telegram + Discord + iMessage** | **your local machine** (not cloud) |
| OSS (OpenACP, Photon, OpenClaw) | all channels | DIY / self-host |

**Takeaway:** cloud agents = Slack-only; the only iMessage/Discord/Telegram first-party option is local-only. A *managed cloud* agent on those channels is unserved.

---

## 2. Per-channel hosting requirements

| Channel | Hosting model | Serverless OK? | Cost to Detour | Difficulty |
| --- | --- | --- | --- | --- |
| **Telegram** | Webhook on Cloudflare Workers (the cloud-api Worker already lives at `detour.ninja/api/*`) | ✅ yes (`setWebhook` + `waitUntil`) | Free API, ~$0 host | **Low** |
| **Discord — slash-cmd** | Interactions webhook endpoint | ✅ yes | Free, ~$0 | **Low–Med** |
| **Discord — full DM/message read** | **Gateway** (persistent WS) + privileged *Message Content* intent | ❌ no — needs an always-on process | Free API + ~$5–10/mo VM/Durable Object | **Med** |
| **iMessage — BlueBubbles self-host** | OSS server on an always-on Mac + webhooks | ❌ no — needs a Mac | ~$600 Mac mini + ops | **High** |
| **iMessage — provider (SendBlue/LoopMessage)** | vendor-hosted Macs, REST + webhooks | ❌ no | ~$100+/line/mo + **Apple-ToS risk** | **Med** |
| **iMessage — per-user bridge on the user's own Mac** | the **detour desktop app** (their Apple ID/Messages.app) | ❌ no | **$0 to Detour**; user needs a Mac | **Med** (user-side) |

Notes:
- **Telegram** is trivially the first win: BotFather token, one HTTPS webhook handler (drop into the existing cloud-api Worker), free, instant.
- **Discord**: if we accept a **slash-command UX** (`/code <prompt>`), it's serverless (interactions webhook). Free-form DM reading needs the Gateway → a small always-on process (we already run one: `services/coding-relay` could host it, or a sibling service).
- **iMessage** has **no serverless path** — a Mac must exist somewhere. The provider path (SendBlue) costs ~$100/line/mo and inherits Apple's history of shutting down unofficial access (e.g. Beeper Mini). The **per-user-Mac path avoids both** by using the detour app the user already runs.

---

## 3. Architecture for Detour (reuses the self-host work)

**One inbound "prompt bus", three channel adapters, linking = device pairing.**

- **Linking (all channels) = the E3 pairing pattern.** A logged-in (wallet-gated) user requests "link Telegram/Discord/iMessage" → Detour mints a single-use code → the channel delivers it (Telegram `t.me/<bot>?start=<code>`, Discord OAuth2 `state=<code>`, iMessage text-the-code) → the adapter binds the platform identity → the Detour pubkey. This is the **same `codingDevicePairings` mechanism** we built; generalize it to `channelLinks { pubkey, platform, platformUserId }`.
- **Telegram + Discord = centrally hosted** in the cloud-api Worker (Telegram webhook; Discord slash-cmds) and/or a small gateway process. An inbound message from a linked identity → resolve the user → dispatch a prompt to their **coding session** (cloud E2B *or* their Self-host detour device, via the relay/Session model from M0/E2) → stream the agent's reply back to the chat.
- **iMessage = the user's own detour Mac.** The detour desktop app (already on their Mac, already dialing our relay as a Self-host device) bridges iMessage locally via Messages.app — exactly the Claude-Code-Channels model, but pointed at Detour. Inbound iMessage → detour app → (already-open relay socket) → the user's agent → reply back out through iMessage. **No central Mac farm, no SendBlue bill, no concentrated Apple-ToS risk.**
- **Net:** the only genuinely new infra is (a) a Telegram webhook handler, (b) a Discord adapter (serverless if slash-only), and (c) an iMessage module *inside the detour app* (part of E4). Everything else — auth, sessions, the relay, streaming — already exists or is being built.

---

## 4. Recommended phasing

1. **Telegram (first — days, not weeks):** webhook in cloud-api + `channelLinks` (generalized pairing) + dispatch to the coding session. Serverless, free, lowest risk. Proves "text your agent."
2. **Discord (second):** start with slash-command UX (serverless, `/code`, `/status`); add the Gateway process later only if free-form DM control is wanted.
3. **iMessage (third, premium / differentiated):** ship inside the detour Mac app (per-user bridge). This is the **headline differentiator** — a cloud coding agent you text from iMessage — and it costs Detour nothing per user. Gate to Mac owners / a premium tier.

## 5. Security (default-deny)
- Only **linked, allowlisted** identities may prompt the agent (Channels uses sender allowlists — match it).
- Trust the platform's **authenticated user id** (`from.id`, OAuth Discord id), never display names/phone numbers (spoofable — iMessage sender authenticity is weakest; second-factor sensitive actions).
- Verify inbound webhook authenticity (Telegram secret-token header, Discord Ed25519 signature, BlueBubbles/local token).
- Scope each linked identity to specific repos/sessions; confirm destructive actions; rate-limit prompts per identity (cost/abuse).
- Linking codes: single-use, short-TTL, high-entropy, revoke on use (already true of `codingDevicePairings`).

---

## 6. Monetization — sell it as an upsell, resell ElizaCloud underneath

### The two cost layers (keep them separate or pricing gets muddy)
- **(A) Channel transport** — Telegram webhook / Discord gateway / iMessage bridge. **Detour's own near-zero infra** (or the user's Mac). Mostly a shared fixed cost.
- **(B) Agent compute + inference** — the persistent messaging agent + tokens. **Resold from ElizaCloud at our markup.**

The "resell ElizaCloud + markup" story is layer **(B)**. The "$5 host serves 100 users" story is layer **(A)**.

### ElizaCloud's real prices (from their billing code vendored in-repo = our COST)
elizacloud.ai has no public pricing page; these are ElizaCloud's **hardcoded rates** (already include ElizaCloud's own ×1.2 over raw AWS/Hetzner):
- **Hosted Agent (Hetzner)** — `cloud-shared/.../agent-pricing.ts` — **$0.01/hr ≈ $7.20/mo** running, ~$1.80/mo idle. **This is the messaging-agent SKU** (confirmed: `agent-managed-discord.ts` writes to the Hetzner `eliza_sandboxes` table, not the AWS container).
- AWS **Container** — `pricing.ts` — $0.028/hr ($20/mo) — custom Docker, **not** what a messaging persona uses.
- **Inference + gateway passthrough** (SMS/iMessage/voice) — `billing/markup.ts` `DEFAULT_MARKUP_RATE = 0.2` → billed **raw provider cost × 1.2**. Credits = **USD 1:1**.

### The three-layer markup stack (the load-bearing rule)
```
Raw provider (AWS/Hetzner)
  → ×1.2  ElizaCloud price        = DETOUR COST      (agent ≈ $7.20/mo)
     → ×1.2  Detour resale        = DETOUR FLOOR     (agent ≈ $8.64/mo)
        → ×0.8 $DTOUR holder      = holder price     (≈ $6.91/mo)
```
**Rule: Detour minimum profitable price = ElizaCloud's price × 1.2.** Passing the ElizaCloud price straight through nets $0.

> ⚠️ **Markup to decide:** the $DTOUR/ElizaCloud resale convention is **×1.2 (20%)** (CLAUDE.md / tokenomics). But `convex/coding.ts` marks **raw E2B up ×1.5 (50%)** — a *different* product (raw infra, not an ElizaCloud resale). Recommendation: **×1.2 for everything sourced from ElizaCloud** (agents/inference/gateway), keep ×1.5 only for raw-E2B coding. Founder to confirm. Both then take the 20% holder discount.

### Self-host transport floor (layer A, if not reselling ElizaCloud transport)
- **Telegram:** Cloudflare Worker webhook — free to 100k req/day, then **$5/mo flat** for ~10M req, **shared across all users**. ≈ **$0.05/user/mo** at 100 users. Serverless, multiplexes ~infinitely.
- **Discord:** *shared slash-command bot* = serverless (~$0.05/user, recommended default). *Per-user gateway bots* = always-on, **memory-bound to ~30–50 clients per $5/256–512 MB host** (Fly ~$2/mo, Hetzner CAX11 ~€4.49/mo) → ~$0.15–0.50/user/mo.
- **iMessage:** the user's own Mac (Detour desktop app) = **$0 to Detour**. Central Mac mini ≈ $17/mo amortized + ops; SendBlue **$100/line/mo** + Apple-ToS risk → avoid for day one.

### Recommended pricing
| Channel | Min profitable | **Suggested upsell** |
| --- | --- | --- |
| **Telegram** | ~$1/mo (transport ≈ $0) | **$5/mo** add-on |
| **Discord** | ~$1–2/mo transport | **$5–10/mo** add-on |
| **iMessage** | $0 marginal (user's Mac) | **$15–20/mo premium** (the differentiator) |
| **Bundle (all 3)** | — | **$15–20/mo** flat |

- Apply the **20% $DTOUR-holder discount** to the add-on.
- **Meter agent-runtime + inference to the user's credit balance at ×1.2** — the add-on price buys *channel access*; **credits buy the compute**, so Detour never eats variable cost.

### Cheapest "make money from day one"
1. **Telegram** webhook in the **existing `detour.ninja/api/*` Cloudflare Worker** (free–$5 flat, zero new infra) → resell the ElizaCloud $7.20/mo agent + per-token inference at ×1.2, metered to credits. **Profitable at user #1**, >90% margin on the add-on.
2. **Discord** as a **shared slash-command bot** (serverless) — only build per-user gateways if customers demand free-form DM control.
3. **iMessage** via the **user's own Mac** (Detour desktop app) — $0 marginal, premium tier, the headline no-one-else-ships feature.

### Primary-source pricing files
- `packages/cloud-shared/src/lib/constants/agent-pricing.ts` (Hetzner agent $7.20/mo — the messaging SKU)
- `packages/cloud-shared/src/lib/constants/pricing.ts` (AWS container $20/mo)
- `packages/cloud-shared/src/billing/markup.ts` (`DEFAULT_MARKUP_RATE = 0.2`)
- `packages/cloud-shared/src/lib/services/agent-managed-discord.ts` (Discord agent → Hetzner SKU)
- `packages/cloud-api/cron/{agent,container}-billing/route.ts` (live billing crons)
- `convex/coding.ts` (Detour's ×1.5 E2B markup — the inconsistency to reconcile)

## Sources
Codex Slack (developers.openai.com/codex/integrations/slack) · Claude Code Slack (venturebeat.com/ai/anthropics-claude-code-can-now-read-your-slack-messages) · **Claude Code Channels** (code.claude.com/docs/en/channels, claude.com/plugins/telegram, /discord) · Cursor Slack (cursor.com/docs/integrations/slack) · Devin (docs.devin.ai/integrations/slack) · Copilot (github.blog/changelog/2025-10-28-work-with-copilot-coding-agent-in-slack) · Jules (developers.google.com/jules/api) · Telegram (core.telegram.org/bots/features#deep-linking, CF Workers + grammY) · Discord (docs.discord.com/developers/events/gateway, /topics/oauth2) · iMessage (docs.bluebubbles.app, sendblue.com/pricing, loopmessage.com/pricing, developers.beeper.com)
