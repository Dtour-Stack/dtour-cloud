# Detour Cloud agent server (sub-project 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** stand up a new headless agent server (`packages/detour-agent/`) that boots an elizaOS AgentRuntime via the vendored cloud-shared harness against Postgres and answers a streamed chat turn over `POST /agent/chat`, gated by the existing $DTOUR session.

**Architecture:** a small Hono (Node/Bun) service. It validates the `dtour-session` token by calling a new Convex `sessions.verify` query, derives a `UserContext`, boots/reuses an `AgentRuntime` through the vendored `cloud-shared` runtime factory (so inference routes through ElizaOS Cloud and fees pass to Eliza), runs one turn through `createMessageHandler(...).process({...})`, and streams tokens back as SSE. This plan proves the pipe with a minimal Squirrel character; vendoring the full portable Detour plugin subset is sub-project 2.

**Tech Stack:** Hono, `@elizaos/core` (symlinked), the vendored `packages/cloud-shared` runtime, Postgres via `pg` + `@elizaos/plugin-sql`, Convex client for session verification. Bun/Node.

**Hard rules:** NEVER use em dashes or en dashes anywhere (user rule). Follow dtour-cloud conventions: do NOT edit vendored `packages/cloud-*` to make the build work (wire in outer files); root `tsconfig.json` must not set `baseUrl`; frontend uses `anyApi`. Commit frequently.

---

## File structure

| File | Responsibility |
|------|----------------|
| `packages/detour-agent/package.json` | The new package manifest (Hono server, deps) |
| `packages/detour-agent/tsconfig.json` | TS config that resolves `@elizaos/*` + `cloud-shared` via the existing paths/symlinks, no baseUrl |
| `packages/detour-agent/Dockerfile` | Node/Bun image for the droplet |
| `packages/detour-agent/src/index.ts` | Hono app entry: routes + listen |
| `packages/detour-agent/src/auth.ts` | `verifySession(token) -> UserContext \| null` via Convex |
| `packages/detour-agent/src/runtime-boot.ts` | `getRuntimeForRequest(userCtx, agentId) -> AgentRuntime` (wraps the cloud-shared factory + cache) |
| `packages/detour-agent/src/character.ts` | A minimal Squirrel base `Character` (system prompt, em-dash-free) for the smoke test |
| `packages/detour-agent/src/routes/chat.ts` | `POST /agent/chat` (SSE streaming) |
| `packages/detour-agent/src/routes/inspect.ts` | `GET /agent/status` (and stubs for activity/memory) |
| `packages/detour-agent/test/*.test.ts` | Unit + smoke tests |
| `convex/sessions.ts` | New `verify` query: token -> { valid, pubkey, balance, organizationId } |
| `convex/sessions.test.ts` or manual | Verify the query (Convex has no test runner; smoke via `bunx convex run`) |

---

## Task 1: Convex `sessions.verify` query (the auth primitive)

The agent server cannot read Convex tables directly; it calls a query. Add one that validates a session token and returns the identity needed to build a `UserContext`.

**Files:**
- Create: `convex/sessions.ts`

- [ ] **Step 1: Read the existing auth to match the pattern.** Read `convex/rbac.ts` (`resolveRole`), `convex/auth.ts` (`recordLogin`, the `sessions` table shape: `{ token, pubkey, expiresAt }`), and `convex/schema.ts` (the `sessions` and `users` indexes `by_token`, `by_pubkey`). Confirm `SESSION_TTL_MS` and the user `balance` field.

- [ ] **Step 2: Write `convex/sessions.ts`** using the exact same query style as `rbac.resolveRole`:

```ts
import { query } from "./_generated/server";
import { v } from "convex/values";

/** Validate a dtour-session token for a backend service (the agent server).
 *  Returns the identity needed to build an elizaOS UserContext, or { valid: false }. */
export const verify = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!session || session.expiresAt < Date.now()) {
      return { valid: false as const };
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", session.pubkey))
      .unique();
    return {
      valid: true as const,
      pubkey: session.pubkey,
      balance: user?.balance ?? 0,
      organizationId: session.pubkey,
    };
  },
});
```

Note: `organizationId` uses the pubkey for now (one org per wallet); revisit when org/team support lands.

- [ ] **Step 3: Push + smoke it.** Run `bunx convex dev` (pushes functions + generates types). Then with a real token from a logged-in session (or insert a test session row), run `bunx convex run sessions:verify '{"token":"<token>"}'` and confirm it returns `{ valid: true, pubkey, balance, organizationId }` for a live token and `{ valid: false }` for a bogus one.

- [ ] **Step 4: Commit.**
```bash
git add convex/sessions.ts
git commit -m "feat(convex): sessions.verify query for backend session validation"
```

---

## Task 2: Package skeleton + Dockerfile

**Files:**
- Create: `packages/detour-agent/package.json`, `tsconfig.json`, `Dockerfile`, `src/index.ts`

- [ ] **Step 1: Read conventions first.** Read root `package.json` (workspaces, the `@elizaos/*` versions, that `hono`, `convex`, `pg` are present), `packages/cloud-api/package.json` (a sibling package's manifest + tsconfig shape), and `packages/cloud-api/tsconfig.json` (how it resolves `@elizaos/*` paths WITHOUT a root baseUrl). Mirror these exactly. Confirm how `cloud-shared` is imported by siblings (path alias or workspace name).

- [ ] **Step 2: Create `packages/detour-agent/package.json`:**

```json
{
  "name": "@dtour/detour-agent",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "start": "bun run src/index.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "hono": "4.12.18",
    "convex": "^1.28.0",
    "pg": "^8.20.0"
  }
}
```
(`@elizaos/*` and `cloud-shared` resolve via tsconfig paths/symlinks, not node_modules, per the repo convention. Match the exact version strings to the root package.json.)

- [ ] **Step 3: Create `packages/detour-agent/tsconfig.json`** by copying `packages/cloud-api/tsconfig.json`'s `compilerOptions` and `paths` (the part that maps `@elizaos/*` and `cloud-shared` to the symlinked sources). Do NOT add `baseUrl`. Adjust `include` to `src/**/*` and `test/**/*`.

- [ ] **Step 4: Create `src/index.ts` (minimal Hono app that boots):**

```ts
import { Hono } from "hono";

const app = new Hono();

app.get("/agent/health", (c) => c.json({ ok: true }));

const port = Number(process.env.AGENT_PORT ?? 3000);
console.log(`[detour-agent] listening on :${port}`);
export default { port, fetch: app.fetch };
```

- [ ] **Step 5: Run it.** `cd packages/detour-agent && bun run start`, then `curl localhost:3000/agent/health` returns `{"ok":true}`. Stop it.

- [ ] **Step 6: Create `Dockerfile`:**

```dockerfile
FROM oven/bun:1
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
EXPOSE 3000
CMD ["bun", "run", "packages/detour-agent/src/index.ts"]
```
(The build context is the repo root, so the symlinked `@elizaos/*` resolve; confirm against how `deploy.sh` builds the frontend in a root-context container.)

- [ ] **Step 7: typecheck + commit.**
```bash
cd packages/detour-agent && bun run typecheck   # expect 0 errors
git add packages/detour-agent
git commit -m "feat(detour-agent): package skeleton + Dockerfile + health route"
```

---

## Task 3: Session auth in the agent server

**Files:**
- Create: `packages/detour-agent/src/auth.ts`, `test/auth.test.ts`

- [ ] **Step 1: Write the failing test** (mock the Convex client):

```ts
import { describe, expect, test, mock } from "bun:test";
import { makeVerifySession } from "../src/auth";

describe("verifySession", () => {
  test("returns a UserContext for a valid token", async () => {
    const convex = { query: mock(async () => ({ valid: true, pubkey: "PUB", balance: 5, organizationId: "PUB" })) };
    const verify = makeVerifySession(convex as never, "test-eliza-key");
    const ctx = await verify("good-token");
    expect(ctx?.userId).toBe("PUB");
    expect(ctx?.apiKey).toBe("test-eliza-key");
    expect(ctx?.isAnonymous).toBe(false);
  });
  test("returns null for an invalid token", async () => {
    const convex = { query: mock(async () => ({ valid: false })) };
    const verify = makeVerifySession(convex as never, "k");
    expect(await verify("bad")).toBeNull();
  });
});
```

- [ ] **Step 2: Run, confirm fail** (`cd packages/detour-agent && bun test test/auth.test.ts`).

- [ ] **Step 3: Read the UserContext shape.** Read `packages/cloud-shared/src/lib/eliza/user-context.ts` for the exact `UserContext` fields and the `AgentMode` enum import path. Match them.

- [ ] **Step 4: Implement `src/auth.ts`:**

```ts
import { ConvexClient } from "convex/browser";
import { AgentMode } from "<the AgentMode import path from user-context.ts>";
import type { UserContext } from "<cloud-shared user-context path>";

/** Build a session verifier. Calls the Convex `sessions.verify` query and maps the
 *  result to a UserContext. apiKey is the ElizaOS Cloud key so inference fees pass. */
export function makeVerifySession(convex: ConvexClient, elizaCloudApiKey: string) {
  return async function verifySession(token: string): Promise<UserContext | null> {
    if (!token) return null;
    const res = (await convex.query("sessions:verify" as never, { token } as never)) as
      | { valid: false }
      | { valid: true; pubkey: string; balance: number; organizationId: string };
    if (!res.valid) return null;
    return {
      userId: res.pubkey,
      entityId: res.pubkey,
      organizationId: res.organizationId,
      agentMode: AgentMode.CHAT,
      apiKey: elizaCloudApiKey,
      isAnonymous: false,
      sessionToken: token,
    } as UserContext;
  };
}
```
(Fill the import paths from Step 3. If `UserContext` requires more non-optional fields than these, set sensible defaults and note them.)

- [ ] **Step 5: Run, confirm pass. Commit.**
```bash
bun test test/auth.test.ts   # expect pass
git add packages/detour-agent/src/auth.ts packages/detour-agent/test/auth.test.ts
git commit -m "feat(detour-agent): session verification -> UserContext via Convex"
```

---

## Task 4: Runtime boot via the vendored harness

This is the integration core. It must use the cloud-shared factory so inference routes through ElizaOS Cloud (fees pass).

**Files:**
- Create: `packages/detour-agent/src/character.ts`, `src/runtime-boot.ts`

- [ ] **Step 1: Study the harness to find the exact boot path.** Read `packages/cloud-shared/src/lib/eliza/runtime/initializer.ts` (`RuntimeFactory.createRuntimeForUser`), `runtime/cache.ts` (`runtimeCache`, `buildRuntimeCacheKey`), `database/adapter-pool.ts` (`DbAdapterPool.getOrCreate`), and `database-adapter-config.ts` (Postgres via `DATABASE_URL`). Determine the ONE supported way to boot an agent with a CUSTOM character + plugins:
  - Path A: `createRuntimeForUser` with a `characterId` that the cloud `agentLoader` can resolve, OR
  - Path B: a lower-level construction (the same `new AgentRuntime({ character, plugins, agentId, settings })` + `registerDatabaseAdapter(dbPool.getOrCreate(...))` + `initialize({ skipMigrations: true })` that `initializer.ts` does internally).
  Pick whichever lets us pass our own minimal Squirrel character WITHOUT editing vendored code. Write down the chosen path in a comment.

- [ ] **Step 2: Create `src/character.ts`** with a minimal base Squirrel character (a small, em-dash-free system prompt; the full persona is vendored in sub-project 2):

```ts
import type { Character } from "@elizaos/core";

export const SQUIRREL_BASE_CHARACTER: Character = {
  name: "Detour Squirrel",
  username: "detour_squirrel",
  system: [
    "You are Detour Squirrel, a dry, funny, dev-brained commentator. Short by default.",
    "A real point under every joke. Never use em dashes. No hashtags, no emoji spam.",
  ].join("\n"),
  bio: ["a developer who reads too much and posts about it."],
  messageExamples: [],
  postExamples: [],
  topics: ["AI", "software", "the news"],
  style: { all: ["dry, specific, short"], chat: ["answer like a sharp dev friend"], post: [] },
};
```

- [ ] **Step 3: Implement `src/runtime-boot.ts`** following the path chosen in Step 1. Sketch (adjust to the real API):

```ts
import type { AgentRuntime } from "@elizaos/core";
import type { UserContext } from "<cloud-shared user-context path>";
import { SQUIRREL_BASE_CHARACTER } from "./character";
// import the chosen factory/cache/dbpool symbols from cloud-shared per Step 1

/** Boot or reuse an AgentRuntime for (user, agent). Uses the cloud-shared harness so
 *  inference routes through ElizaOS Cloud (fees pass). Cached per user+agent. */
export async function getRuntimeForRequest(userCtx: UserContext, agentId: string): Promise<AgentRuntime> {
  // 1. derive a cache key (buildRuntimeCacheKey or a local key user:agent)
  // 2. runtimeCache.getWithHealthCheck(...) -> return if present
  // 3. else boot: createRuntimeForUser(userCtx) OR the low-level construction with
  //    SQUIRREL_BASE_CHARACTER + [] plugins (sub-project 2 adds the portable plugin subset),
  //    registerDatabaseAdapter(dbPool.getOrCreate(agentId)), initialize({ skipMigrations: true })
  // 4. runtimeCache.set(...); return runtime
  throw new Error("implement per Step 1 findings");
}
```

- [ ] **Step 4: Integration boot test (needs a real Postgres + ELIZAOS_CLOUD_API_KEY).** Write `test/runtime-boot.integration.test.ts` that sets `DATABASE_URL` to a local Postgres and `ELIZAOS_CLOUD_API_KEY`, calls `getRuntimeForRequest(testCtx, "smoke-agent")`, and asserts it returns a runtime whose `agentId` is set and `messageService` exists. Gate it behind an env flag (`RUN_INTEGRATION=1`) so unit runs do not require Postgres. Run with a local `postgres:16` container.

- [ ] **Step 5: typecheck + commit.**
```bash
bun run typecheck
git add packages/detour-agent/src/character.ts packages/detour-agent/src/runtime-boot.ts packages/detour-agent/test/runtime-boot.integration.test.ts
git commit -m "feat(detour-agent): boot AgentRuntime via cloud-shared harness against Postgres"
```

---

## Task 5: `POST /agent/chat` with SSE streaming

**Files:**
- Create: `packages/detour-agent/src/routes/chat.ts`; Modify: `src/index.ts`

- [ ] **Step 1: Read the message handler.** Read `packages/cloud-shared/src/lib/eliza/message-handler.ts`: `createMessageHandler(runtime, userContext)`, `.process({ roomId, text, attachments?, onStreamChunk })`, the `MessageResult` shape, and the `onStreamChunk(chunk, messageId)` signature.

- [ ] **Step 2: Implement `src/routes/chat.ts`** (SSE; auth via the verifier; runtime via boot):

```ts
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { createMessageHandler } from "<cloud-shared message-handler path>";
import { getRuntimeForRequest } from "../runtime-boot";

export function chatRoutes(deps: { verifySession: (t: string) => Promise<unknown | null> }) {
  const app = new Hono();
  app.post("/chat", async (c) => {
    const token = c.req.header("authorization")?.replace(/^Bearer /, "") ?? "";
    const userCtx = await deps.verifySession(token);
    if (!userCtx) return c.json({ error: "unauthorized" }, 401);
    const body = await c.req.json<{ agentId?: string; roomId: string; text: string }>();
    if (!body?.text || !body?.roomId) return c.json({ error: "roomId and text required" }, 400);
    const runtime = await getRuntimeForRequest(userCtx as never, body.agentId ?? "default");
    const handler = createMessageHandler(runtime, userCtx as never);
    return streamSSE(c, async (stream) => {
      try {
        await handler.process({
          roomId: body.roomId,
          text: body.text,
          onStreamChunk: async (chunk: string) => { await stream.writeSSE({ data: chunk }); },
        });
        await stream.writeSSE({ data: "[DONE]" });
      } catch (err) {
        await stream.writeSSE({ event: "error", data: String(err instanceof Error ? err.message : err) });
      }
    });
  });
  return app;
}
```

- [ ] **Step 3: Mount it in `src/index.ts`** (construct the Convex client + verifier + the chat routes, mount under `/agent`). Wire `CONVEX_URL` and `ELIZAOS_CLOUD_API_KEY` from env.

- [ ] **Step 4: typecheck + commit.**
```bash
bun run typecheck
git add packages/detour-agent/src/routes/chat.ts packages/detour-agent/src/index.ts
git commit -m "feat(detour-agent): POST /agent/chat with SSE streaming, session-gated"
```

---

## Task 6: `GET /agent/status` (minimal inspect)

**Files:** Create `src/routes/inspect.ts`; Modify `src/index.ts`.

- [ ] **Step 1:** Implement `GET /agent/status` returning `{ ok: true, agents: <runtimeCache size>, uptimeMs }` (session-gated). Stub `GET /agent/activity` and `/agent/memory` to `501 not implemented yet` (the dashboard inspection surfaces are sub-project 3). Mount under `/agent`. typecheck + commit `feat(detour-agent): GET /agent/status`.

---

## Task 7: Smoke test (the success criterion)

**Files:** Create `test/chat.smoke.test.ts` (gated by `RUN_INTEGRATION=1`).

- [ ] **Step 1:** With a local Postgres + `ELIZAOS_CLOUD_API_KEY` + a test session token (insert a `sessions` row + `users` row with balance > 0 via `bunx convex run`), start the server, then `POST /agent/chat` with `{ roomId: "smoke", text: "say hi in one line" }` and a valid Bearer token. Assert: 200, an SSE stream with at least one non-empty `data:` chunk, ending in `[DONE]`. This proves the pipe end to end: auth -> runtime boot -> ElizaCloud inference (fees pass) -> SSE.

- [ ] **Step 2:** Document in `packages/detour-agent/README.md` how to run it (the env vars, the local Postgres container, the integration flag). Commit.

---

## Later sub-projects (outline, plan separately after this lands)

- **Sub-project 2 (plugin portability + vendoring):** snapshot the PORTABLE Detour plugins from `/Users/home/Documents/ddtour/detour/src/bun/plugins` into `packages/detour-agent/vendor/` (persona/x-tweets/taste-gate/radar-style-feedback/pensieve/goals/channels/media/crypto), drop desktop-only, shim phantom (REST) and agent-projects (no preview), stub the desktop plumbing (broadcaster no-op, view-invoker throws). Compose them in `runtime-boot.ts`. Swap `SQUIRREL_BASE_CHARACTER` for the full vendored persona. Smoke test: an in-character Squirrel reply that uses the persona + memory.
- **Sub-project 3 (dashboard wiring):** extend the existing Convex `agents` table with `backendType`/`backendServerUrl`; add a Convex action that proxies to `/agent/chat` reusing the `convex/agents.ts:242` fetch+stream+throttle pattern; wire the existing `/agents` chat UI to it; add the Coding Agents view by extending the existing wterm `/coding` surface to a `WS /agent/pty` bridge (sandboxed per session).
- **Sub-project 4 (droplet deploy):** add `postgres:16-alpine` + a `detour-agent` service to `deploy/docker-compose.prod.yml`, a Caddy `/agent/*` route, `DATABASE_URL` + `ELIZAOS_CLOUD_API_KEY` in `deploy/env.prod.example`, and the agent build/migrate steps in `deploy.sh`.

---

## Self-review notes
- Spec coverage: this plan covers the harness boot (Task 4), the server + chat (Tasks 5-6), auth (Tasks 1, 3), and the smoke criterion (Task 7). The portable plugin subset, dashboard wiring, coding/wterm PTY, and deploy are explicitly deferred to sub-projects 2-4 (outlined). Fees-pass-to-Eliza is satisfied by routing inference through the cloud-shared harness with `ELIZAOS_CLOUD_API_KEY` (Task 3 sets `apiKey`).
- Placeholders: the two "throw / implement per Step 1" spots (runtime-boot) are deliberate verify-then-implement steps against the vendored harness, each preceded by a concrete read step naming the exact files/symbols. Not silent TODOs.
- Type consistency: `verifySession` returns `UserContext | null` and is consumed in chat.ts; `getRuntimeForRequest(userCtx, agentId)` signature matches its call site; the Convex `sessions.verify` return shape matches `makeVerifySession`'s parse.
- Em dashes: none in this plan (verify by grepping for the U+2014 character).
