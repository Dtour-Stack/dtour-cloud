# Deploying Detour Cloud (single DigitalOcean droplet)

One droplet runs the whole thing in Docker: the **Convex** self-hosted backend
and **Caddy** (auto-HTTPS) serving the built frontend and path-routing the API.
Single domain — frontend at `https://detour.ninja`, Convex at
`https://detour.ninja/convex`. (`/api/v1` is ElizaCloud's inference API, called
on `elizacloud.ai` — not served here.)

The vendored `packages/cloud-*` are **not** needed — only `src/` + `convex/`.

## 0. DNS (do this first)

Point the apex at the droplet (replaces any prior host). Both records matter —
a stale `AAAA` elsewhere breaks Let's Encrypt over IPv6:

| Type | Host | Value |
|------|------|-------|
| A | `@` | `<droplet-ipv4>` |
| AAAA | `@` | `<droplet-ipv6>` (or remove AAAA) |

## 1. Provision the droplet

Ubuntu 24.04 LTS, ≥2 GB RAM. From your machine:

```bash
ssh root@<droplet-ip> 'bash -s' < deploy/bootstrap.sh
```

Installs Docker + Compose v2, UFW (SSH/80/443), swap. Idempotent. (Skip if the
droplet already has Docker, e.g. the DO Docker image.)

## 2. Configure + deploy

```bash
ssh root@<droplet-ip>
git clone https://github.com/Dtour-Stack/dtour-cloud.git /opt/dtour-cloud
cd /opt/dtour-cloud

cp deploy/env.prod.example deploy/.env
# Edit deploy/.env:
#   DOMAIN, CONVEX_CLOUD_ORIGIN, CONVEX_SITE_ORIGIN, VITE_CONVEX_URL
#   INSTANCE_SECRET="$(openssl rand -hex 32)"
#   VITE_SOLANA_RPC_URL=<a real RPC>

bash deploy/deploy.sh   # builds frontend, brings up backend+caddy+dashboard, pushes functions
```

Caddy issues TLS for `DOMAIN` automatically once DNS resolves to the droplet.

## 3. One-time backend setup

The Cloud-fresh DB starts empty. Set the gate's RPC and seed:

```bash
cd /opt/dtour-cloud
# admin key was written to deploy/.env by deploy.sh
export CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
export CONVEX_SELF_HOSTED_ADMIN_KEY=$(grep CONVEX_SELF_HOSTED_ADMIN_KEY deploy/.env | cut -d= -f2-)

bunx convex env set SOLANA_RPC_URL https://your-rpc      # authoritative gate read
bunx convex run config:seed
bunx convex run flags:seed
bunx convex run admin:bootstrapSuperAdmin '{"pubkey":"2V7ZZ96oJX6DLQZHj83hsevJw2uLsrfMQZ5GUWRdRuj7","note":"owner"}'
bunx convex run admin:setPlan '{"pubkey":"2V7ZZ96oJX6DLQZHj83hsevJw2uLsrfMQZ5GUWRdRuj7","plan":"lifetime"}'
```

(Run these in a `oven/bun` container with `--network host` if bun isn't on the host.)

## 4. Operate

```bash
cd /opt/dtour-cloud/deploy
docker compose -f docker-compose.prod.yml --env-file .env ps
docker compose -f docker-compose.prod.yml --env-file .env logs -f caddy backend

# Update after a git pull:
git -C /opt/dtour-cloud pull && bash /opt/dtour-cloud/deploy/deploy.sh

# Convex dashboard (kept private) — tunnel from your machine:
ssh -L 6791:localhost:6791 root@<droplet-ip>   # then open http://localhost:6791
```

## Notes

- `VITE_CONVEX_URL` is baked in at **build time** — change it ⇒ re-run `deploy.sh`.
- Backend ports `3210/3211` bind to `127.0.0.1` only (host can push functions /
  generate the admin key); the public surface is Caddy on 80/443.
- The frontend build is portable (the one `@elizaos` import in `src/` is
  type-only and erased), so it builds in a clean `oven/bun` container.
