# Deploying Detour Cloud

The frontend is a Vite SPA hosted on **Vercel**. Its backend is **Convex**
(this guide assumes **Convex Cloud** for production). The vendored
`packages/cloud-*` are NOT part of the Vercel build — only `src/` ships.

## 1. Convex Cloud (backend)

The local dev backend is self-hosted Docker; production uses Convex Cloud. The
Cloud database starts **empty** — you must re-seed it (step 1.4).

```bash
# 1.1  Make the CLI target Cloud, not the local self-host.
#      Comment out / remove these from .env.local for the deploy:
#        CONVEX_SELF_HOSTED_URL, CONVEX_SELF_HOSTED_ADMIN_KEY
bunx convex login

# 1.2  Deploy functions + schema to a Cloud project (creates one if needed).
#      Prints the production URL, e.g. https://your-project.convex.cloud
bunx convex deploy

# 1.3  Set the deployment env var the gate needs for the authoritative
#      on-chain $DTOUR balance read (use a real RPC, not public mainnet-beta).
bunx convex env set SOLANA_RPC_URL https://your-rpc-endpoint --prod

# 1.4  Re-seed the fresh Cloud DB (owner wallet shown — change as needed):
bunx convex run config:seed --prod
bunx convex run flags:seed --prod
bunx convex run admin:bootstrapSuperAdmin '{"pubkey":"2V7ZZ96oJX6DLQZHj83hsevJw2uLsrfMQZ5GUWRdRuj7","note":"owner"}' --prod
bunx convex run admin:setPlan '{"pubkey":"2V7ZZ96oJX6DLQZHj83hsevJw2uLsrfMQZ5GUWRdRuj7","plan":"lifetime"}' --prod
# Add any other allowlisted wallets:
#   bunx convex run whitelist:add '{"pubkey":"...","note":"..."}' --prod
```

> The super_admin, lifetime grant, config, agents, designs, and templates you
> created in local dev live in the **Docker volume only** — they do not migrate
> to Cloud. Re-seed the essentials above; the rest is created through the app.

## 2. Vercel (frontend)

1. Import the GitHub repo (`Dtour-Stack/dtour-cloud`) in Vercel.
   `vercel.json` already sets framework (Vite), build (`bun run build`),
   output (`dist`), and the SPA rewrite — no manual config needed.
   Vercel auto-detects `bun.lock` and installs with bun.
2. Set **Environment Variables** (Production + Preview):

   | Variable | Value |
   |---|---|
   | `VITE_CONVEX_URL` | the Convex Cloud URL from step 1.2 (`https://….convex.cloud`) |
   | `VITE_SOLANA_RPC_URL` | a real Solana RPC (Helius/QuickNode/Triton) — public mainnet-beta 403s in browsers |

   Both **must be HTTPS**. An HTTPS Vercel page cannot call `http://` or
   `localhost` (mixed content) — that's why the local `:3210` default won't work
   in production.
3. Deploy. Every push to `main` redeploys.

## 3. Waitlist

Non-holders (and non-whitelisted wallets) who connect at `/login` see a
"Join the waitlist" email field. Entries land in the Convex `waitlist` table.
View them as an admin:

```bash
bunx convex run waitlist:list '{"token":"<your dtour-session token>"}' --prod
```

## Notes

- `bun run build` is portable: the only `@elizaos` reference in `src/` is a
  type-only import (erased at build), so the missing monorepo symlinks don't
  matter on Vercel.
- The vendored `packages/cloud-*` backend stays out of git (an upstream test
  fixture trips GitHub secret scanning, and Vercel doesn't build it). Restore it
  locally with `./scripts/setup.sh`.
