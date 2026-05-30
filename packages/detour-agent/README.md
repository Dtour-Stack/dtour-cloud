# @dtour/detour-agent

Headless Detour Cloud agent server. Boots an elizaOS `AgentRuntime` through the
vendored `cloud-shared` harness against Postgres and answers streamed chat turns
over HTTP, gated by the $DTOUR session.

Inference routes through the cloud-shared harness with `ELIZAOS_CLOUD_API_KEY`,
so billable model usage and its fees pass to ElizaOS Cloud. Detour adds its
markup at the Convex billing layer, not here.

This is sub-project 1: the pipe, proven with a minimal Squirrel character and an
empty plugin set. The portable Detour plugin subset, dashboard wiring, the
coding-agents PTY, and the droplet deploy are sub-projects 2 to 4.

## Routes

- `GET  /agent/health` - liveness, no auth.
- `POST /agent/chat` - session-gated. Body `{ roomId, text, agentId? }`, header
  `Authorization: Bearer <dtour-session-token>`. Streams each model chunk as an
  SSE `data:` frame and ends with `data: [DONE]`.
- `GET  /agent/status` - session-gated. `{ ok, agents, uptimeMs }`.
- `GET  /agent/activity`, `GET /agent/memory` - reserved (501) for sub-project 3.

## Environment

| Var | Purpose |
|-----|---------|
| `AGENT_PORT` | Listen port (default 3000) |
| `CONVEX_URL` | Convex deployment URL, for the `sessions:verify` query |
| `DATABASE_URL` | Postgres connection string for the runtime DB adapter |
| `ELIZAOS_CLOUD_API_KEY` | ElizaOS Cloud key; attached to every UserContext so fees pass |
| `RUN_INTEGRATION` | Set to `1` to enable the integration + smoke tests |

## Run

```sh
# from the repo root (so the @elizaos/* symlinks resolve)
AGENT_PORT=3000 CONVEX_URL=... DATABASE_URL=... ELIZAOS_CLOUD_API_KEY=... \
  bun run packages/detour-agent/src/index.ts
```

## Tests

```sh
# unit (mocks Convex; no Postgres needed)
cd packages/detour-agent && bun test test/auth.test.ts

# integration boot + end-to-end smoke (gated)
#   1. start a local Postgres, e.g. docker run -p 5432:5432 -e POSTGRES_PASSWORD=pw postgres:16
#   2. seed a session: insert a `sessions` row (token, pubkey, expiresAt) + a
#      `users` row (pubkey, balance > 0) via `bunx convex run`
#   3. start the server (above), then:
RUN_INTEGRATION=1 DATABASE_URL=... ELIZAOS_CLOUD_API_KEY=... \
  SMOKE_SESSION_TOKEN=<seeded-token> AGENT_BASE_URL=http://localhost:3000 \
  bun test test/runtime-boot.integration.test.ts test/chat.smoke.test.ts
```

The smoke test asserts a `200`, at least one non-empty SSE `data:` chunk, and a
trailing `[DONE]`, proving the full pipe: auth -> runtime boot -> ElizaOS Cloud
inference -> SSE.
