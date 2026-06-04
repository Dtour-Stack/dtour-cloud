# ElizaCloud — Feature & Function Map (by surface)

A catalog of everything ElizaCloud exposes, grouped by **surface** (functional
area). Dtour white-labels ElizaCloud: most surfaces are **proxied** to
ElizaCloud's deployed infra (compute, gateways, containers) with a Dtour
markup; the dashboard is rebuilt custom. Use this to add surfaces to the Dtour
hub **one at a time** — check them off as they land.

**Sources:** vendored `packages/cloud-api` (275 API mounts in
`src/_router.generated.ts`), `cloud-frontend/src/dashboard/*` (UI), `cloud-sdk`
(client), `cloud-services/*` (proxied compute — not vendored).

**Status legend:** ☐ not started · ◐ in progress · ☑ live in Dtour
**Dtour notes:** `proxy` = forward to ElizaCloud · `markup` = +20% billing · `gate` = behind $DTOUR token gate

---

## 1. Identity & Auth  ◐
Wallet + session auth. Dtour replaces the login with the **$DTOUR token gate**
(SIWS + on-chain balance, in Convex) — these are the ElizaCloud equivalents.
- **API:** `auth/siws/nonce`, `auth/siws/verify`, `auth/siwe/nonce`, `auth/siwe/verify`, `auth/steward-session`, `auth/steward-refresh`, `auth/cli-session`, `auth/pair`, `auth/logout`, `auth/anonymous-session`, `auth/migrate-anonymous`, `internal/auth/token`, `internal/auth/refresh`, `.well-known/jwks.json`, `v1/oauth/*`, `v1/api-keys` (3)
- **Dashboard:** `api-keys`, `security`, `security/permissions`, `settings`
- **Dtour:** Convex SIWS token gate and sessions are live; API keys and
  permissions stay planned until programmatic auth is actually enforced.

## 2. Agents  ◐
Create, save, run agents; agent-to-agent + per-agent MCP.
- **API:** `v1/agents` (3), `agents/:id/a2a`, `agents/:id/mcp`, `my-agents/characters`, `my-agents/saved`, `my-agents/saved/:id`, `a2a`, `compat/agents` (+ `:id`, `availability`, `jobs/:jobId` — OpenAI-compatible)
- **Dashboard:** `agents`, `agents/[id]`, `my-agents`
- **Dtour:** basic chat/agent surfaces are open; full deploy/runtime and per-agent
  MCP remain planned.

## 3. Chat & Inference  ◐
LLM chat/completions, responses, message routing, model catalog.
- **API:** `v1/chat` (2), `v1/responses`, `v1/messages`, `v1/models` (3), `v1/pricing`, `compat/*` (OpenAI-compatible endpoint), `v1/eliza` (5), `eliza/rooms`, `eliza/rooms/:roomId`, `v1/search`, `v1/rpc`
- **Dashboard:** `api-explorer`, `chat` (`/chat/[characterRef]`)
- **Dtour:** OpenRouter/Eliza routing and reserve checks exist; complete
  per-call credit metering is still the keystone before broad promotion.

## 4. Credits & Billing  ◐
Credit balance, top-ups, auto-top-up, quotas, invoices, Stripe.
- **API:** `credits/balance`, `credits/transactions`, `v1/credits` (4), `v1/topup` (3), `auto-top-up/trigger`, `v1/billing` (3), `v1/stripe` (2), `stripe` (2), `quotas/usage`, `invoices/list`, `invoices/:id`, `stats/account`, `v1/app-credits` (2)
- **Dashboard:** `billing`, `billing/success`, `invoices`, `invoices/[id]`
- **Dtour:** credit balances, starter credit, Solana top-ups, and coding billing
  are live; invoices, auto-top-up, and complete inference billing remain planned.

## 5. Crypto & Payments  ◐
On-chain payments, x402, Solana, redemptions, referrals, affiliates.
- **API:** `crypto/payments` (+`:id`), `crypto/direct-payments`, `crypto/status`, `crypto/webhook`, `v1/x402` (5), `v1/solana` (2), `v1/redemptions` (5), `v1/referrals` (2), `v1/affiliates` (2), `v1/payment-requests`, `signup-code/redeem`
- **Dashboard:** `affiliates`, `earnings`
- **Dtour:** $DTOUR gate and credit top-ups are live; affiliate earnings only
  apply to referred coding sandbox fees until additional metered bases ship.

## 6. MCP (Model Context Protocol)  ☐
Hosted MCP servers + proxy/registry/streaming.
- **API:** `mcp` (+`info`,`list`,`proxy/:mcpId`,`registry`,`stream`), `mcps/*` (asana, jira, zoom, time, weather, crypto), `v1/mcps` (2), `eliza-app/connections`
- **Dashboard:** `mcps`
- **Dtour:** catalog/connection surfaces are planned; no live tool execution claim
  until transport, auth, and metering are verified.

## 7. Voice & Audio  ☐
TTS, STT, voice catalog/cloning.
- **API:** `elevenlabs/tts`, `elevenlabs/stt`, `elevenlabs/voices` (+`:id`,`jobs`,`user`), `v1/voice` (6)
- **Dashboard:** (within agent/settings)
- **Dtour:** proxy + markup.

## 8. Media Generation  ◐
Image/video generation via fal + gallery.
- **API:** `fal/proxy`, `v1/video` (2), `v1/gallery` (4)
- **Dashboard:** (gallery)
- **Dtour:** gallery/media UI exists, but broad paid media generation still needs
  complete credit metering and spend controls.

## 9. Apps & Deployments  ☐
Containerized full-stack app deploys + custom domains.
- **API:** `v1/apps` (12), `v1/domains` (3), `v1/provisioning-agent`, `v1/remote` (2), `v1/app-auth` (2), `eliza-app/*`
- **Dashboard:** `apps`, `apps/[id]`
- **Dtour:** proxy to ElizaCloud container control-plane (see §17).

## 10. Social Gateways  ☐
Deploy agents to social platforms (proxied gateway services).
- **API:** `v1/x` (7), `v1/twitter` (5), `v1/discord` (7), `v1/telegram` (5), `v1/whatsapp` (3), `v1/twilio` (3), `v1/blooio` (3), `eliza-app/auth/discord`
- **Dashboard:** (per-agent channel config)
- **Dtour:** proxy to gateway-discord / gateway-webhook services (§17).

## 11. Documents  ☐
Document upload/storage/processing for agents.
- **API:** `v1/documents` (5)
- **Dashboard:** `documents`
- **Dtour:** proxy.

## 12. Analytics & Stats  ◐
Usage analytics, exports, projections, reporting.
- **API:** `analytics/overview`, `analytics/breakdown`, `analytics/export`, `analytics/projections`, `v1/track`, `v1/reports`, `stats/account`
- **Dashboard:** `analytics`
- **Dtour:** dashboard/admin analytics and OpenRouter health are live; unified
  spend-by-surface depends on complete metering.

## 13. Organizations & Teams  ☐
Org membership, invites, permissions.
- **API:** `organizations/members`, `organizations/invites`, `invites/accept`, `invites/validate`, `v1/user` (5)
- **Dashboard:** `account`, `security/permissions`
- **Dtour:** proxy.

## 14. Governance & Approvals  ☐
Ballots/voting + sensitive-request approvals.
- **API:** `v1/ballots` (5), `v1/sensitive-requests`, `v1/oauth-intents` (2)
- **Dashboard / pages:** `approve/[approvalId]`, `ballot/[ballotId]`, `sensitive-requests/[requestId]`
- **Dtour:** optional; ties to $DTOUR governance if desired.

## 15. Admin & Infrastructure  ☐
Operator/admin tooling — internal.
- **API:** `admin/buy-eliza/quote`, `admin/redemptions`, `admin/rpc-status`, `v1/admin` (8)
- **Dashboard:** `admin`, `admin/infrastructure`, `admin/metrics`, `admin/redemptions`, `admin/rpc-status`
- **Dtour:** internal-only; keep gated.

## 16. Account & Settings  ☐
Profile, phone, preferences, device bus.
- **API:** `eliza-app/user/me`, `eliza-app/user/phone`, `v1/user` (5), `v1/device-bus` (2), `sessions/current`, `feedback`
- **Dashboard:** `account`, `settings`
- **Dtour:** the Convex profile (username/email) is the dtour-native version.

## 17. Compute & Runtime  (proxied — NOT vendored)  ☐
The actual agent execution + gateways + containers. Dtour does **not** run
these; it proxies to ElizaCloud's deployed services.
- **Services:** `agent-server`, `container-control-plane`, `gateway-discord`, `gateway-webhook`, `coding-remote-runner`, `tunnel-proxy`, `headscale`, `operator`, `vast-pyworker`
- **Dtour:** pure proxy — this is the "use their infra" core.

## 18. Scheduled / Internal (cron)  — internal
Not user-facing; runs server-side.
- **API:** `cron/agent-billing`, `cron/agent-budgets`, `cron/container-billing`, `cron/auto-top-up`, `cron/social-automation`, `cron/compute-metrics`, `cron/audit-log-purge`, `v1/cron` (4)

## 19. Client SDK  ☐
`@elizaos/cloud-sdk` — typed client for the above.
- **Surface:** `client` (CloudClient), `http` (fetch wrapper), `public-routes`, `types` / `types.cloud-api`
- **Dtour:** could wrap as a `@dtour/cloud-sdk` over the proxy.

---

### How to add a surface to the Dtour hub
1. Pick a surface above; add a nav item to the dashboard shell (`src/dashboard/dtour-dashboard-page.tsx`).
2. Build the page under `src/dashboard/<surface>/`.
3. For data: either proxy the ElizaCloud API (with markup) or back it with Convex (dtour-native, like profiles).
4. Flip its status ☐ → ☑ here.
