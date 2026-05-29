# Dtour Cloud

White-label reseller of ElizaOS Cloud — flat 20% markup, a completely custom
dashboard/frontend, and ElizaCloud's deployed infrastructure for compute
(agents, gateways, containers are proxied to ElizaCloud — we don't run our own).

The backend "plumbing" is a **self-contained fork**: the `@elizaos/cloud-*`
packages are vendored here byte-identical to upstream so fixes can be PR'd back
to elizaOS. The runtime/plugins (`@elizaos/core`, `shared`, `ui`, `plugin-*`)
are **not** vendored — they resolve against a local elizaOS `develop` checkout
via symlinks (newest develop, not the lagging npm releases).

## Structure

```
packages/
  cloud-api/            # Vendored ElizaOS Cloud API (Hono on CF Workers)
  cloud-shared/         # Vendored shared cloud logic (billing, db, services)
  cloud-sdk/            # Vendored client SDK
  cloud-routing/        # Vendored cloud routing
  security/             # Vendored security utils
  core,shared,ui,contracts  # symlinks -> local eliza checkout (gitignored)
plugins/                # symlink -> local eliza checkout (gitignored)
src/                    # Custom Dtour frontend (landing, token, vault, login)
src/lib/                # Branding constants
src/middleware/         # 20% markup tier gate (overlay, wired in next phase)
scripts/setup.sh        # Recreates links + installs deps
tsconfig.json           # Root TS config + @elizaos/* path map (NO baseUrl)
wrangler-dtour.toml     # Cloudflare Workers config
```

## Setup

The vendored `packages/cloud-*` and `packages/security` are committed. The
runtime/plugins resolve to a local elizaOS monorepo checkout, so you need one:

```bash
# 1. Have an elizaOS checkout on develop, installed:
#    git clone https://github.com/elizaOS/eliza && cd eliza && git checkout develop && bun install
# 2. From this repo:
ELIZA_DIR=/path/to/eliza ./scripts/setup.sh
```

`setup.sh` creates the symlinks, runs `bun install`, builds
`@elizaos/plugin-elizacloud` if needed (cloud-api resolves it via its built
`dist`), and typechecks. Expected: all four vendored packages = 0 errors.

To track newest develop: `git pull origin develop` in the eliza checkout — the
symlinks pick up changes live; re-run the typechecks.

## Token

**$DTOUR** — `DijmsEDeTXsWCkCLkhYJNTutKaHf541xZshVrCUbcozy` (Solana SPL)

Platform revenue split: 40% stakers · 25% buyback & burn · 15% builders · 10% creators · 10% treasury.
