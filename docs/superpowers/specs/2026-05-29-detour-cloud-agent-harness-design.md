# Detour Cloud: headless agent harness (design spec)

**Date:** 2026-05-29
**Status:** approved direction. Pending implementation plan.
**Scope:** run the Detour Squirrel agent (the shareable, portable subset of the desktop app) as a headless elizaOS agent on the Digital Ocean droplet, behind the existing Detour Cloud dashboard and $DTOUR token gate. This spec covers sub-project 1 (the agent harness + server) and frames the rest.

## Context

Detour Cloud (`/Users/home/dtour-cloud`) is a white-label reseller of ElizaOS Cloud. Already built: the dashboard/frontend (Vite + React + Tailwind), the $DTOUR token gate (Convex: Solana SIWS + on-chain balance), the vendored elizaOS cloud runtime (`packages/cloud-shared/src/lib/eliza/runtime`), and droplet deploy scaffolding (`deploy/`: Caddy + docker-compose.prod + bootstrap/deploy scripts). The gap: it runs no agent of its own.

The Detour agent lives in a separate repo (`/Users/home/Documents/ddtour/detour`) as a macOS Electrobun desktop app wrapping an elizaOS AgentRuntime, with the persona, X-tweets, taste gate, and radar/style/feedback work built recently. This spec brings the portable part of that agent to the cloud.

## Grounding from the codebase (verified 2026-05-29)

A thorough read of dtour-cloud confirmed and refined this:
- **No agent-server exists yet.** `packages/cloud-api/eliza/rooms/route.ts` returns 501 and references a `services/agent-server` Node sidecar that is not on disk; the Cloudflare Workers cloud-api cannot run a long-lived AgentRuntime. The headless agent server is net-new: create `packages/detour-agent/`.
- **The runtime harness is ready** (cloud-shared, headless, no Cloudflare/Electrobun deps). Build on `RuntimeFactory.createRuntimeForUser` + `createMessageHandler`.
- **An agent surface already exists.** Convex has `agents` + `agentMessages` tables and an `agents.chat` action that streams from ElizaCloud's OpenAI-compatible endpoint (lightweight persona+model, NOT a full AgentRuntime). Frontend `/agents` (`AgentChat.tsx`, `AgentsHome.tsx`, `ChatSidebar.tsx`). The new full-runtime agents extend this: add `backendType` / `backendServerUrl` to the `agents` table and a Convex action that proxies to the detour-agent server using the same fetch + stream + throttle pattern (`convex/agents.ts:242`).
- **wterm is already integrated** on the `/coding` page (a sandbox bash terminal). The Coding Agents surface extends that existing wterm view to connect to the agent server's `WS /agent/pty` running a Detour coding agent, rather than a net-new wterm setup.
- **Auth:** session token in localStorage (`dtour-session`), validated via `resolveRole(ctx, token)`. The agent server authenticates by calling a new Convex `sessions.verify` query to derive the `UserContext`.
- **Deploy:** `deploy/docker-compose.prod.yml` runs Convex backend + dashboard + Caddy (routes `/convex/*`, `/`). No Postgres, no agent service. Add a `postgres` service, a `detour-agent` service, and a Caddy `/agent/*` route; extend `deploy.sh` / `env.prod.example`.
- **Surfaces** are added via `App.tsx` lazy routes + `RequireSession` + `AppShell` nav + the `ContextSwitcher` dropdown (which already has Coding / Design / User).

## The product split (the guiding decision)

The desktop client and the cloud are deliberately different products:

- **Desktop client (Detour app):** the personal agent. Full machine access: desktop control, mac automation, sprite pets, the embedded Phantom wallet UI, the local browser. Stays rich and intimate. Unchanged by this work.
- **Detour Cloud (the droplet):** a multi-agent hosting platform. Each $DTOUR holder creates and runs their own one or more agents from a shared capability toolkit (X, memory, goals, channels, media, crypto), with the Detour Squirrel as the default base character. Token-gated. No machine-access surfaces.

The plugin split maps exactly onto this, so the cloud being a subset is the product, not a limitation.

## The harness ("follow the cloud's lead")

Reuse the runtime already vendored in dtour-cloud. It boots a real AgentRuntime in-process (it is NOT a proxy to ElizaCloud):

- `RuntimeFactory.createRuntimeForUser(context: UserContext): Promise<AgentRuntime>` (`packages/cloud-shared/src/lib/eliza/runtime/initializer.ts`) constructs `new AgentRuntime({ character, plugins, agentId, settings })`, registers a DB adapter, and calls `runtime.initialize()`.
- `createMessageHandler(runtime, userContext).process({ roomId, text, attachments?, onStreamChunk? }): Promise<MessageResult>` (`packages/cloud-shared/src/lib/eliza/message-handler.ts`) runs one turn through `runtime.messageService.handleMessage`, with token-by-token streaming via `onStreamChunk`.
- `RuntimeCache` (50 max, LRU, health-checked) caches runtimes keyed by agent + org + mode + plugin hash.
- DB: Postgres via `DATABASE_URL` (preferred on the droplet) or PGLite via `PGLITE_DATA_DIR`.
- No hard Cloudflare dependency in the runtime itself; the Cloudflare bindings live in cloud-api, not the harness.

## Fees and billing (pass all fees to Eliza)

Detour Cloud is a white-label reseller: ALL underlying usage fees pass through to ElizaOS Cloud, and Detour Cloud charges the $DTOUR-gated user with its flat 20% markup on top. The cloud agent must therefore route every billable operation through ElizaOS Cloud, not through direct provider accounts.

- **Inference:** the cloud agent's LLM provider is ElizaOS Cloud (the `elizacloud` plugin + `ELIZAOS_CLOUD_API_KEY`, which the vendored `buildRuntimeSettings` already wires). It does NOT use the desktop's direct provider keys (the codex-chatgpt subscription, OpenRouter, raw Anthropic/OpenAI) for billable calls, because those bypass ElizaCloud billing.
- **Media / audio / embeddings / web search:** route through ElizaCloud's billable surfaces where they incur cost, so those fees pass too.
- **Free / non-metered operations** (X via cookie auth, GMGN HTTP, channel sends) do not flow through ElizaCloud billing and run directly.
- **Detour's take:** the 20% markup is applied at the Detour Cloud billing layer (Convex + the existing reseller plumbing), on top of the pass-through ElizaCloud cost.

## The agent: portable plugin subset

These portable plugins are the CAPABILITY toolkit available to every user agent (each user runs their own one or more agents); the Detour Squirrel persona ships as the default/base character a new agent forks from. Compose them onto the harness (confirmed portable: plain eliza Plugin objects, no Electrobun, no macOS APIs):

- Persona + social: `x-tweets` (persona, taste gate, radar/style/feedback) and media (`audio-generation`, `media-generation`). LLM inference routes through ElizaOS Cloud (the `elizacloud` plugin + `ELIZAOS_CLOUD_API_KEY`) so fees pass to Eliza, NOT the desktop's `codex-chatgpt` / `openrouter` direct keys. See "Fees and billing".
- Memory + cognition: `pensieve-tools`, `contact-dossier`, `detour-goal`, `trajectory-lessons`, `open-questions`, `capabilities`, `agent-skills`.
- Channels: Discord / Telegram (eliza plugins) + the `*-media` attach plugins, when configured.
- Crypto + cloud: `gmgn-tools`, `superteam-earn`, `cloud-apps`.
- Background services (portable): radar / style / feedback `setInterval` services, goal, pensieve, channels gateway, inbox, task, dream, continuous-improvement.

Dropped (desktop-only, stay on the desktop client): `desktop-control`, `mac-automate`, `codex-pets`, the vault `BROWSER_FILL_LOGIN` action, `portless-tools`, local browser/preview windows.

Shimmed: `phantom-wallet-tools` (replace the embedded-webview call with a REST/Solana-RPC path or disable), `agent-projects` (keep scaffold + cloud deploy, drop the local preview window).

Desktop plumbing to stub on the server: the RPC `broadcaster.broadcast` becomes a no-op (no windows to fan out to), `invokeFirstViewRequest` throws or routes to an HTTP fallback, the kernel window/tray factory is not loaded.

## Plugin sourcing: vendor a snapshot

Vendor a snapshot of the portable Detour plugins into dtour-cloud (a `vendor/detour-plugins/` or `packages/detour-agent/` dir), matching dtour-cloud's existing "vendor byte-identical, wire in outer files" convention. The detour repo stays the source of truth and keeps the desktop-only plugins, so the desktop client stays personal and the two can diverge.

A future refactor can extract a shared `@detour/plugins` package consumed by both repos to dedupe. Not now (YAGNI).

## The server

A small Node/Bun Hono service on the droplet (`packages/detour-agent/` or a top-level `agent-server/`):

- `POST /agent/chat` and a WS endpoint for streaming, calling `createRuntimeForUser` + `createMessageHandler` per the harness.
- `GET /agent/status`, `GET /agent/activity`, `GET /agent/memory` for the dashboard inspection surfaces.
- `WS /agent/pty` for the Coding Agents surface: a WebSocket-to-PTY bridge that wterm (`@wterm/react` in the dashboard) connects to, running a Detour coding agent (the `agent-projects` + coding-tools + orchestrator stack) in a sandboxed PTY per session. Coding-agent inference also routes through ElizaOS Cloud (fees pass).
- Auth: gated by the existing Convex $DTOUR session token (verify the session, derive the `UserContext`). ElizaCloud Steward OAuth stays stubbed, as today.
- Multi-tenant via `RuntimeCache` keyed per user/org/agent.
- Agent management: per-user create / list / configure / delete agents (each its own character + memory), since a user can run multiple. The Detour Squirrel character is the default template a new agent forks from.

## Database + deploy

- Postgres on the droplet (a `postgres` service in docker-compose.prod, `DATABASE_URL` injected) for agent memory.
- Add a `detour-agent` service to `deploy/docker-compose.prod.yml` (Node/Bun image, the agent server), a Caddy route (`/agent/*` to the service), and env in `deploy/env.prod.example`. Follow the existing Convex + dashboard + Caddy pattern.

## Decomposition (each its own spec to plan to build)

1. **Agent harness + server (this spec):** the headless runtime + Hono API + the portable plugin subset, runnable locally against Postgres.
2. **Plugin portability + vendoring:** snapshot the portable Detour plugins into dtour-cloud, shim phantom/agent-projects, stub the desktop plumbing, get a clean typecheck + boot.
3. **Dashboard wiring:** connect the existing dashboard surfaces (chat, activity, memory) to the agent API, behind the session gate. Add a new **Coding Agents** dropdown surface using `@wterm/react` (vercel-labs/wterm: a DOM-based web terminal, Zig/WASM core, ~12KB, connects to a PTY over WebSocket) wired to the agent server's `WS /agent/pty` bridge, so $DTOUR holders run Detour coding agents in a browser terminal. Requires copying `wterm.wasm` into the dashboard `public/` dir.
4. **Droplet deploy:** Postgres + the agent service in docker-compose.prod + Caddy + bootstrap, deployed and reachable at detour.ninja.

Recommended build order: 2 (get the plugins composing + booting headless against Postgres) is the riskiest and gates 1; in practice 1 and 2 are done together as "a headless Detour agent boots and answers a chat turn," then 3, then 4.

## Open questions (resolve in the plan)

- (RESOLVED) **Agent model.** Per-user and multi-agent: each $DTOUR holder can create and run MULTIPLE agents, each with its own identity, character, and memory. The Detour Squirrel is the BASE agent only (the default starter character a user forks and customizes from), NOT a shared singleton and NOT the user-facing identity. This is the white-label ElizaOS Cloud model; `createRuntimeForUser` (per user + character) fits directly.
- **Secrets/vault on the droplet.** The desktop uses a local encrypted vault + the shared `~/.eliza/auth`. The cloud needs a server-side secret story (per-user API keys via the existing settings flow, or org-level). Likely the cloud-shared `buildSettings` + Convex-stored per-user keys.
- **X identity.** The cloud agent should NOT post as @detour_squirrel (that is the desktop owner's account). Per-user X auth, or X disabled by default on the cloud, decided in the plan.
- **Phantom/agent-projects shims.** Exact replacement (REST vs disable) decided when those plugins are vendored.
- **Billable routing.** Confirm which operations must pass through ElizaCloud (inference, media, embeddings, web search) vs which run free/direct (X cookie auth, GMGN, channel sends), and that the 20% markup is applied at the Convex billing layer on top of the pass-through cost.
- **Coding-agent isolation (security).** Running coding agents in PTYs for token-holders on a shared droplet needs per-session sandboxing, resource limits, and filesystem isolation (a container/jail per session). Decide the isolation model before exposing `WS /agent/pty`; do not run untrusted coding sessions in the agent server's own process.

## Success criteria

- A headless Detour agent boots on Node/Bun against Postgres with the portable plugin subset, no Electrobun, no macOS calls.
- `POST /agent/chat` returns an in-character Squirrel response (streamed), gated by a valid $DTOUR session.
- The existing dashboard chat surface talks to it.
- It deploys to the droplet via `deploy/docker-compose.prod` + Caddy and is reachable behind the token gate.
- The desktop client is untouched and keeps all its personal/machine-access capabilities.
