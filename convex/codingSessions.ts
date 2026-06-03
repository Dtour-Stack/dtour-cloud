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
