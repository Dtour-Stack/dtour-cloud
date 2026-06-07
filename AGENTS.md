# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this is

Detour Cloud — a **white-label reseller of ElizaOS Cloud** (flat 20% markup). It
has a **completely custom dashboard/frontend**, but the backend "plumbing" is
vendored from the elizaOS monorepo and **proxied** to ElizaCloud's deployed
infra (agent execution, gateways, containers — we don't run our own). dtour's
own data + auth live in **self-hosted Convex**. Token: **$DTOUR** (Solana SPL
`DijmsEDeTXsWCkCLkhYJNTutKaHf541xZshVrCUbcozy`), domain detour.ninja.

**This file is the single source of truth.** `CLAUDE.md` at the repo root is a
redundant copy — update this one, not both.

## UI work → read DESIGN.md first

Any frontend/UI task MUST follow `DESIGN.md` at the repo root — it is the source
of truth for colors, type, spacing, radii, motion, and component recipes (dark
glass, violet→indigo→blue accent, white-pill actions, Inter). Do not invent
tokens outside it.

## Commands

```bash
bun run dev               # Vite dev server (frontend) → http://localhost:5174
bun run build             # Vite production build
bun run typecheck:shared  # tsc the vendored cloud-shared (also :api :sdk :routing)
./node_modules/.bin/tsc --noEmit -p packages/cloud-api/tsconfig.json   # any vendored pkg

./scripts/setup.sh        # recreate eliza symlinks + bun install (run after fresh clone)
./scripts/convex-selfhost.sh   # stand up self-hosted Convex (Docker) + print admin key

bunx convex dev           # push convex/ functions to the self-hosted backend + gen types
bunx convex run auth:getNonce            # invoke a deployed function
bunx convex env set SOLANA_RPC_URL <url> # set a deployment env var
```

```bash
bun run test               # vitest (unit: src/**/*.test.ts convex/**/*.test.ts services/**/*.test.ts)
bun run test:e2e           # Playwright (tests/e2e/*.spec.ts — builds first)
bun run test:e2e:ui        # same, with Playwright UI mode
VITE_PLAYWRIGHT_TEST_AUTH=true bun run test:e2e   # E2E requires this env var

bunx biome check --write <path>   # lint/format (biome dep exists, no npm script wrapper)
```

## Architecture — four layers

1. **Vendored backend** (`packages/cloud-api`, `cloud-shared`, `cloud-sdk`,
   `cloud-routing`, `security`): copied byte-identical from the elizaOS monorepo
   so fixes can be PR'd back upstream. cloud-api is a Hono app on Cloudflare
   Workers; routes are **file-based** (`<dir>/route.ts` → `/api/<dir>`) and
   compiled into `src/_router.generated.ts` by
   `node packages/cloud-api/src/_generate-router.mjs`.
   Run codegen after adding/removing a route.
2. **Linked elizaOS runtime** (`@elizaos/core`, `shared`, `ui`, `plugin-*`): NOT
   vendored. Resolved via symlinks (`packages/{core,shared,ui,contracts}`,
   `plugins/`) into a local elizaOS checkout at
   `/Users/home/Documents/milady/eliza` (develop branch). This is why the repo
   is **not portable** without that checkout — `scripts/setup.sh` recreates the
   links. Third-party deps install normally; `@elizaos/*` resolve via tsconfig
   `paths`, never node_modules.
3. **Self-hosted Convex** (`convex/`): dtour's own backend — the $DTOUR token
   gate (nonce + SIWS verify + on-chain balance, `gate.ts` is a `"use node"`
   action), sessions, and user profiles. See "Auth" below.
   **Data model:** `convex/schema.ts` (724 lines) — read this before adding tables.
4. **Custom frontend** (`src/`, `index.html`, `vite.config.ts`): Vite 8 + React
   19 + react-router-dom 7 + Tailwind v4. The dashboard shell
   (`src/dashboard/dtour-dashboard-page.tsx`) is the central hub; features get
   added one surface at a time (catalog: `docs/elizacloud-surfaces.md`).

## Auth — $DTOUR token gate (Convex, not cloud-api)

`/login` connects a Solana wallet → `convex auth.getNonce` (single-use nonce) →
SIWS sign → `convex gate.verify` (consumes nonce, verifies signature, reads
on-chain $DTOUR balance via `SOLANA_RPC_URL`) → issues a session token
(localStorage `dtour-session`) only if balance > 0 → routes to `/onboarding`
(username + email → `profiles.save`) or `/dashboard`. `RequireSession` guards
the dashboard. ElizaCloud's Steward OAuth/wallet login is deliberately replaced;
`StewardProvider` is a harmless stub.

## Critical conventions / gotchas

- **Keep vendored `packages/cloud-*` byte-identical to upstream.** Put all dtour
  wiring in OUTER files (root `package.json`, `tsconfig.json`, symlinks) — never
  edit vendored `.ts` to make the build work. Verify with
  `diff -rq -x node_modules -x dist <eliza>/packages/<pkg> packages/<pkg>`.
- **Root `tsconfig.json` must NOT set `baseUrl`** — it breaks cloud-api's
  relative `paths` (caused 3000+ phantom errors). Vendored configs resolve
  `@elizaos/*` to monorepo source via the symlinks.
- **cloud-api resolves `@elizaos/plugin-elizacloud` via its built `dist`** (only
  @elizaos import without a tsconfig src-path). If its `dist/node/index.d.ts`
  shim is missing, run `bun run build.ts` in that plugin (setup.sh does this).
  Do NOT point cloud-api at the plugin *src* — it cascades 48 spurious errors.
- **Frontend uses Convex `anyApi`** (from `convex/server`), so it builds WITHOUT
  `convex/_generated/` (which only exists after `bunx convex dev`).
- **Vite 8 + Solana wallets:** `vite-plugin-node-polyfills` is incompatible with
  Vite 8 (rolldown). Use the hand-rolled `src/polyfills.ts` (Buffer shim,
  imported first in `main.tsx`) + `define: { global: "globalThis" }`.
- **Tailwind v4** is scoped with `@import "tailwindcss" source(none)` + `@source`
  in `src/globals.css` so it doesn't scan the symlinked monorepo.
- **TypeScript 6** is used with `--ignoreDeprecations 6.0` on all typecheck scripts.
  Do not remove that flag — TS 6 ships breaking changes gated behind it.
- **Deployment** lives in `deploy/` — single DigitalOcean droplet (Docker + Caddy).
  `deploy/deploy.sh` builds the frontend in `oven/bun`, brings up Convex + Caddy,
  runs `bunx convex codegen && bunx convex deploy`. See `docs/DEPLOY.md`.
  `VITE_CONVEX_URL` is baked at **build time** — change it ⇒ rebuild.
- Machine-specific symlinks (`/plugins`, `/packages/{core,shared,ui,contracts}`),
  `node_modules`, `convex/_generated`, `docker-compose.yml`, and `.env.local`
  are gitignored. Vendored `cloud-*` packages ARE tracked.
