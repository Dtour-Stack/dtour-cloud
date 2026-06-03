# M0 — Portable Session Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the backend-agnostic **Session** data model in Convex — the single source of truth that local and cloud backends will attach to — with its decision logic fully unit-tested.

**Architecture:** All branching logic (backend-attach transitions, the handoff-needs-checkpoint invariant, status guards, column mapping, branch-name derivation) lives in a **pure, Convex-free module** (`convex/codingSessionState.ts`) that runs in the existing vitest harness. The Convex schema table (`codingSessions`) and the query/mutation module (`convex/codingSessions.ts`) are **thin glue** over that pure module, following the exact patterns in `convex/coding.ts` (token→pubkey auth via a local `sessionPubkey` helper, `logEvent`, integer fields, `Date.now()`).

**Tech Stack:** Convex (`mutation`/`query` from `./_generated/server`, `v` from `convex/values`), vitest 4 (Node env, `src|convex/**/*.test.ts`), TypeScript.

**Naming note:** the `sessions` table is already taken by **auth** (token→pubkey). This model uses **`codingSessions`** (consistent with `codingUsage` / `codingWorkspaces` / `codingProviderSecrets`).

---

### Task 1: Pure session state module (the real logic — TDD)

**Files:**
- Modify: `vitest.config.ts` (add `convex/**/*.test.ts` to `include`)
- Create: `convex/codingSessionState.ts`
- Test: `convex/codingSessionState.test.ts`

> Convex's bundler ignores `*.test.ts`, so the test file is never deployed as a function (this is the official convex-test layout). `codingSessionState.ts` imports nothing from `./_generated`, so it runs in plain Node. _Fallback if a `convex dev` push ever complains: move the test to `src/lib/codingSession/codingSessionState.test.ts` and import `../../../convex/codingSessionState` — the existing `src/**` include already covers it._

- [ ] **Step 1: Broaden the vitest include**

In `vitest.config.ts`, change:
```ts
    include: ["src/**/*.test.ts"],
```
to:
```ts
    include: ["src/**/*.test.ts", "convex/**/*.test.ts"],
```

- [ ] **Step 2: Write the failing test**

Create `convex/codingSessionState.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  applyBackendChange,
  deriveBranchName,
  toColumns,
  fromColumns,
  nextStatus,
  HandoffWithoutCheckpointError,
  SessionStateError,
  type ActiveBackend,
} from "./codingSessionState";

const DETACHED: ActiveBackend = { kind: "detached" };

describe("applyBackendChange", () => {
  it("attaches a cloud backend from detached", () => {
    expect(applyBackendChange(DETACHED, { kind: "cloud", sandboxId: "sbx_1" })).toEqual({
      kind: "cloud",
      sandboxId: "sbx_1",
    });
  });

  it("attaches a local backend from detached", () => {
    expect(applyBackendChange(DETACHED, { kind: "local", deviceId: "dev_1" })).toEqual({
      kind: "local",
      deviceId: "dev_1",
    });
  });

  it("is idempotent when re-attaching the same target", () => {
    const cur: ActiveBackend = { kind: "cloud", sandboxId: "sbx_1" };
    expect(applyBackendChange(cur, { kind: "cloud", sandboxId: "sbx_1" })).toEqual(cur);
  });

  it("refuses to move a live session to a different backend without a checkpoint", () => {
    const cur: ActiveBackend = { kind: "cloud", sandboxId: "sbx_1" };
    expect(() => applyBackendChange(cur, { kind: "local", deviceId: "dev_1" })).toThrow(
      HandoffWithoutCheckpointError,
    );
  });

  it("allows a checkpointed handoff between backends", () => {
    const cur: ActiveBackend = { kind: "cloud", sandboxId: "sbx_1" };
    expect(
      applyBackendChange(cur, { kind: "local", deviceId: "dev_1", checkpointed: true }),
    ).toEqual({ kind: "local", deviceId: "dev_1" });
  });

  it("allows detaching a live backend without a checkpoint", () => {
    const cur: ActiveBackend = { kind: "local", deviceId: "dev_1" };
    expect(applyBackendChange(cur, { kind: "detached" })).toEqual({ kind: "detached" });
  });

  it("rejects an empty deviceId", () => {
    expect(() => applyBackendChange(DETACHED, { kind: "local", deviceId: " " })).toThrow(
      SessionStateError,
    );
  });

  it("rejects an empty sandboxId", () => {
    expect(() => applyBackendChange(DETACHED, { kind: "cloud", sandboxId: "" })).toThrow(
      SessionStateError,
    );
  });
});

describe("column mapping round-trips", () => {
  it("local", () => {
    const b: ActiveBackend = { kind: "local", deviceId: "dev_1" };
    expect(fromColumns(toColumns(b))).toEqual(b);
  });
  it("cloud", () => {
    const b: ActiveBackend = { kind: "cloud", sandboxId: "sbx_1" };
    expect(fromColumns(toColumns(b))).toEqual(b);
  });
  it("detached", () => {
    expect(fromColumns(toColumns(DETACHED))).toEqual(DETACHED);
  });
});

describe("deriveBranchName", () => {
  it("is deterministic and namespaced", () => {
    expect(deriveBranchName("abc123")).toBe("dtour/session-abc123");
  });
});

describe("nextStatus", () => {
  it("allows live → idle", () => {
    expect(nextStatus("live", "idle")).toBe("idle");
  });
  it("allows idle → archived", () => {
    expect(nextStatus("idle", "archived")).toBe("archived");
  });
  it("refuses to reactivate an archived session", () => {
    expect(() => nextStatus("archived", "live")).toThrow(SessionStateError);
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `bun run test convex/codingSessionState.test.ts`
Expected: FAIL — `Failed to resolve import "./codingSessionState"` (module does not exist yet).

- [ ] **Step 4: Write the implementation**

Create `convex/codingSessionState.ts`:
```ts
// Pure, Convex-free session-state logic for portable coding sessions (spec §2/§4).
// Imports nothing from ./_generated, so it runs in plain Node and is unit-tested
// in the existing vitest harness. The Convex glue (codingSessions.ts) wraps this.

export type SessionStatus = "live" | "idle" | "archived";

/** Which backend a session is currently attached to (normalized form). */
export type ActiveBackend =
  | { kind: "detached" }
  | { kind: "local"; deviceId: string }
  | { kind: "cloud"; sandboxId: string };

/** Flat representation persisted in a Convex row (the backend columns). */
export interface BackendColumns {
  activeBackend: "detached" | "local" | "cloud";
  activeDeviceId?: string;
  activeSandboxId?: string;
}

/** A request to change which backend a session runs on. */
export type AttachEvent =
  | { kind: "detached" }
  | { kind: "local"; deviceId: string; checkpointed?: boolean }
  | { kind: "cloud"; sandboxId: string; checkpointed?: boolean };

/** Generic invalid-state error (bad backend args, illegal status move). */
export class SessionStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionStateError";
  }
}

/** Moving a live session to a different backend without checkpointing first. */
export class HandoffWithoutCheckpointError extends Error {
  constructor() {
    super("Refusing to move a live session to another backend without a checkpoint");
    this.name = "HandoffWithoutCheckpointError";
  }
}

function sameTarget(a: ActiveBackend, e: AttachEvent): boolean {
  if (a.kind !== e.kind) return false;
  if (a.kind === "local" && e.kind === "local") return a.deviceId === e.deviceId;
  if (a.kind === "cloud" && e.kind === "cloud") return a.sandboxId === e.sandboxId;
  return a.kind === "detached"; // both detached
}

/**
 * Compute the next active backend. Enforces the handoff invariant (spec §4):
 * moving a LIVE session from one backend to a *different* one requires
 * `checkpointed` (working tree committed/stashed + turn flushed) so in-flight
 * work is never silently dropped. Same-target attaches are idempotent.
 */
export function applyBackendChange(
  current: ActiveBackend,
  event: AttachEvent,
): ActiveBackend {
  if (event.kind === "local" && !event.deviceId.trim()) {
    throw new SessionStateError("deviceId is required to attach a local backend");
  }
  if (event.kind === "cloud" && !event.sandboxId.trim()) {
    throw new SessionStateError("sandboxId is required to attach a cloud backend");
  }

  if (sameTarget(current, event)) return current; // idempotent no-op

  const leavingLiveBackend = current.kind !== "detached";
  const goingToNewBackend = event.kind !== "detached";
  const checkpointed = "checkpointed" in event && event.checkpointed === true;
  if (leavingLiveBackend && goingToNewBackend && !checkpointed) {
    throw new HandoffWithoutCheckpointError();
  }

  switch (event.kind) {
    case "detached":
      return { kind: "detached" };
    case "local":
      return { kind: "local", deviceId: event.deviceId };
    case "cloud":
      return { kind: "cloud", sandboxId: event.sandboxId };
  }
}

/** Map the normalized ActiveBackend → the flat columns stored in Convex. */
export function toColumns(b: ActiveBackend): BackendColumns {
  switch (b.kind) {
    case "detached":
      return { activeBackend: "detached" };
    case "local":
      return { activeBackend: "local", activeDeviceId: b.deviceId };
    case "cloud":
      return { activeBackend: "cloud", activeSandboxId: b.sandboxId };
  }
}

/** Map the flat Convex columns → the normalized ActiveBackend. */
export function fromColumns(c: BackendColumns): ActiveBackend {
  switch (c.activeBackend) {
    case "local":
      return { kind: "local", deviceId: c.activeDeviceId ?? "" };
    case "cloud":
      return { kind: "cloud", sandboxId: c.activeSandboxId ?? "" };
    default:
      return { kind: "detached" };
  }
}

/** The dedicated git branch a session works on. Deterministic + pure (spec §6). */
export function deriveBranchName(sessionId: string): string {
  return `dtour/session-${sessionId}`;
}

/** Status transition guard. Archived is terminal. */
export function nextStatus(current: SessionStatus, to: SessionStatus): SessionStatus {
  if (current === "archived" && to !== "archived") {
    throw new SessionStateError("Archived sessions cannot be reactivated");
  }
  return to;
}
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `bun run test convex/codingSessionState.test.ts`
Expected: PASS — all assertions green.

- [ ] **Step 6: Confirm the existing suite still passes**

Run: `bun run test`
Expected: PASS — pre-existing `src/**` tests plus the new file, no regressions.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts convex/codingSessionState.ts convex/codingSessionState.test.ts
git commit -m "feat(coding): pure session-state logic for portable coding sessions"
```

---

### Task 2: `codingSessions` schema table

**Files:**
- Modify: `convex/schema.ts` (add one table at the end of the schema object, before the closing `});`)

- [ ] **Step 1: Add the table**

In `convex/schema.ts`, add this table definition immediately after the `codingProviderSecrets` table (inside `defineSchema({ ... })`):
```ts
  // Portable coding sessions — the backend-agnostic source of truth (spec §2).
  // A session is bound to a PROJECT, not to where it runs; local + cloud
  // backends ATTACH to it. Git history + chat history live OUTSIDE the row
  // (in the repo and in the @convex-dev/agent thread), so a destroyed sandbox
  // loses no history (spec §5).
  codingSessions: defineTable({
    owner: v.string(), // owner pubkey
    title: v.string(),
    // Project identity (spec §2): git remote URL (if any) + a stable fingerprint.
    projectOrigin: v.optional(v.string()),
    projectFingerprint: v.string(),
    // Code pointer (spec §6).
    branch: v.string(), // session working branch, e.g. dtour/session-<id>
    baseRef: v.string(), // forked from: a commit sha or a branch name
    workingChangesStorageId: v.optional(v.id("_storage")), // uncommitted-diff patch
    // Conversation: a @convex-dev/agent thread id (backfilled, like agentChats).
    threadId: v.optional(v.string()),
    // Environment spec — HOW to re-warm, not the warm state itself (spec §5).
    envSpec: v.optional(v.string()), // JSON: { setup: string[], detected: string }
    // Active backend, stored as flat columns; normalized in codingSessionState.ts.
    activeBackend: v.union(
      v.literal("detached"),
      v.literal("local"),
      v.literal("cloud"),
    ),
    activeDeviceId: v.optional(v.string()),
    activeSandboxId: v.optional(v.string()),
    // Optional warm-environment snapshot handle (speed feature, spec §5).
    snapshotStorageId: v.optional(v.id("_storage")),
    snapshotSandboxId: v.optional(v.string()),
    status: v.union(v.literal("live"), v.literal("idle"), v.literal("archived")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["owner"])
    .index("by_owner_status", ["owner", "status"]),
```

- [ ] **Step 2: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(coding): add codingSessions schema table"
```

> Schema is declarative glue (no unit test, per repo convention). It is validated against the backend by `bunx convex dev` in Task 4.

---

### Task 3: `codingSessions` query/mutation module (thin glue)

**Files:**
- Create: `convex/codingSessions.ts`

This module follows `convex/coding.ts` exactly: a local `sessionPubkey` token→pubkey helper (the same shape coding.ts inlines), `logEvent` on writes, all decisions delegated to the pure `codingSessionState` module.

- [ ] **Step 1: Write the module**

Create `convex/codingSessions.ts`:
```ts
import { v } from "convex/values";
import {
  type MutationCtx,
  type QueryCtx,
  mutation,
  query,
} from "./_generated/server";
import { logEvent } from "./events";
import {
  applyBackendChange,
  deriveBranchName,
  fromColumns,
  nextStatus,
  toColumns,
  type ActiveBackend,
  type AttachEvent,
} from "./codingSessionState";

// Token → pubkey (mirrors the helper in coding.ts; auth "sessions" table).
async function sessionPubkey(
  ctx: QueryCtx | MutationCtx,
  token: string,
): Promise<string | null> {
  const s = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!s || s.expiresAt < Date.now()) return null;
  return s.pubkey;
}

// ── user: create a session ─────────────────────────────────────────────────
export const create = mutation({
  args: {
    token: v.string(),
    title: v.string(),
    projectFingerprint: v.string(),
    projectOrigin: v.optional(v.string()),
    baseRef: v.string(),
  },
  handler: async (ctx, a) => {
    const pubkey = await sessionPubkey(ctx, a.token);
    if (!pubkey) throw new Error("Not authenticated");
    const now = Date.now();
    const id = await ctx.db.insert("codingSessions", {
      owner: pubkey,
      title: a.title.trim().slice(0, 120) || "Untitled session",
      projectFingerprint: a.projectFingerprint,
      projectOrigin: a.projectOrigin,
      branch: "", // patched below once we know the id
      baseRef: a.baseRef,
      activeBackend: "detached",
      status: "live",
      createdAt: now,
      updatedAt: now,
    });
    const branch = deriveBranchName(id);
    await ctx.db.patch(id, { branch });
    await logEvent(ctx, "coding.session_create", {
      pubkey,
      data: { id, projectFingerprint: a.projectFingerprint },
    });
    return { id, branch };
  },
});

// ── user: list my non-archived sessions ────────────────────────────────────
export const list = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) return [];
    const rows = await ctx.db
      .query("codingSessions")
      .withIndex("by_owner_status", (q) =>
        q.eq("owner", pubkey).eq("status", "live"),
      )
      .order("desc")
      .take(50);
    return rows.map((r) => ({
      id: r._id,
      title: r.title,
      branch: r.branch,
      activeBackend: fromColumns(r),
      status: r.status,
      updatedAt: r.updatedAt,
    }));
  },
});

// ── user: get one of my sessions ───────────────────────────────────────────
export const get = query({
  args: { token: v.string(), id: v.id("codingSessions") },
  handler: async (ctx, { token, id }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) return null;
    const row = await ctx.db.get(id);
    if (!row || row.owner !== pubkey) return null;
    return {
      id: row._id,
      title: row.title,
      branch: row.branch,
      baseRef: row.baseRef,
      projectOrigin: row.projectOrigin,
      projectFingerprint: row.projectFingerprint,
      threadId: row.threadId,
      envSpec: row.envSpec,
      activeBackend: fromColumns(row),
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },
});

// ── user: rename ───────────────────────────────────────────────────────────
export const rename = mutation({
  args: { token: v.string(), id: v.id("codingSessions"), title: v.string() },
  handler: async (ctx, { token, id, title }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) throw new Error("Not authenticated");
    const row = await ctx.db.get(id);
    if (!row || row.owner !== pubkey) throw new Error("Session not found");
    await ctx.db.patch(id, {
      title: title.trim().slice(0, 120) || "Untitled session",
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

// ── backend control: attach/detach/handoff (delegates to the pure module) ──
export const setBackend = mutation({
  args: {
    token: v.string(),
    id: v.id("codingSessions"),
    backend: v.union(
      v.object({ kind: v.literal("detached") }),
      v.object({
        kind: v.literal("local"),
        deviceId: v.string(),
        checkpointed: v.optional(v.boolean()),
      }),
      v.object({
        kind: v.literal("cloud"),
        sandboxId: v.string(),
        checkpointed: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, { token, id, backend }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) throw new Error("Not authenticated");
    const row = await ctx.db.get(id);
    if (!row || row.owner !== pubkey) throw new Error("Session not found");

    const current: ActiveBackend = fromColumns(row);
    const next = applyBackendChange(current, backend as AttachEvent); // throws on bad handoff
    await ctx.db.patch(id, { ...toColumns(next), updatedAt: Date.now() });
    await logEvent(ctx, "coding.session_backend", {
      pubkey,
      data: { id, from: current.kind, to: next.kind },
    });
    return { ok: true, activeBackend: next };
  },
});

// ── user: archive (terminal; always detaches) ──────────────────────────────
export const archive = mutation({
  args: { token: v.string(), id: v.id("codingSessions") },
  handler: async (ctx, { token, id }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) throw new Error("Not authenticated");
    const row = await ctx.db.get(id);
    if (!row || row.owner !== pubkey) throw new Error("Session not found");
    const status = nextStatus(row.status, "archived");
    await ctx.db.patch(id, {
      status,
      ...toColumns({ kind: "detached" }),
      updatedAt: Date.now(),
    });
    await logEvent(ctx, "coding.session_archive", { pubkey, data: { id } });
    return { ok: true };
  },
});
```

- [ ] **Step 2: Run the suite (no regressions)**

Run: `bun run test`
Expected: PASS — the pure tests still green; this glue module has no unit test (repo convention), so the suite count is unchanged.

- [ ] **Step 3: Commit**

```bash
git add convex/codingSessions.ts
git commit -m "feat(coding): codingSessions create/list/get/rename/setBackend/archive"
```

---

### Task 4: Integration validation (schema + functions push)

**Files:** none (verification only)

- [ ] **Step 1: Push schema + functions to the self-hosted Convex backend**

Run: `bunx convex dev --once`
Expected: schema validates, `codingSessions` table is created, and `convex/_generated/api.d.ts` now lists `codingSessions.{create,list,get,rename,setBackend,archive}`. No type errors.

> Requires the self-hosted Convex backend running (`./scripts/convex-selfhost.sh`). If the backend is not available in this environment, mark this step blocked and hand back to the user to run — it is the only step that needs the live backend.

- [ ] **Step 2: Smoke-test create + list from the CLI (optional, if a dev session token exists)**

Run:
```bash
bunx convex run codingSessions:list '{"token":"<dev-session-token>"}'
```
Expected: `[]` for a fresh user (auth ok, table queryable). A mint-a-dev-session path exists per the project's browser-verify memory if needed.

---

## Self-Review

**Spec coverage (M0 slice of `docs/superpowers/specs/2026-06-03-portable-coding-sessions-design.md` §2):**
- Session is the Convex source of truth → `codingSessions` table (Task 2). ✅
- chat pointer (`threadId`), code pointer (`branch`/`baseRef`/`workingChangesStorageId`), env spec, `activeBackend`, snapshot pointer, status → all columns present (Task 2). ✅
- backends *attach* to a session; handoff is a swap → `applyBackendChange` + `setBackend` (Tasks 1, 3). ✅
- §4 "checkpoint before swap; never drop in-flight work" → `HandoffWithoutCheckpointError` enforced + tested (Task 1). ✅
- §6 deterministic session branch → `deriveBranchName` + tested (Task 1). ✅
- Naming collision with auth `sessions` → resolved (`codingSessions`). ✅

**Out of M0 scope (later milestones, intentionally not here):** the local agent/daemon (M1), E2B dispatch + worktree seeding (M2), handoff git mechanics + re-warm (M3), agentic UI (M4), and writing into `threadId` (wired when the agent thread is attached in M2/M4). The columns exist now so later milestones only add behavior, not migrations.

**Placeholder scan:** none — every step has full code/commands.

**Type consistency:** `ActiveBackend` / `AttachEvent` / `BackendColumns` names and the `kind` discriminants match across Task 1 (definition), Task 1 test, and Task 3 (`setBackend` arg validator mirrors `AttachEvent`; `fromColumns(row)` relies on the row carrying `activeBackend`/`activeDeviceId`/`activeSandboxId` from Task 2). `deriveBranchName`/`nextStatus`/`toColumns`/`fromColumns` signatures are identical where used.
