import { v } from "convex/values";
import {
  type MutationCtx,
  type QueryCtx,
  mutation,
  query,
} from "./_generated/server";
import { STARTER_CREDIT_USD, USD_MICRO, starterCreditSignature } from "./creditConstants";
import { logEvent } from "./events";
import { requireRole } from "./rbac";

// ── pricing constants ─────────────────────────────────────────────────────────
// E2B cost rates in micro-USD per unit-second — KEEP IN SYNC WITH e2b.dev/pricing.
// CPU $0.000014/vCPU-s = 14 µ$ ; RAM $0.0000045/GiB-s = 4.5 µ$.
const CPU_MICRO_PER_VCPU_SEC = 14;
const RAM_MICRO_PER_GIB_SEC = 4.5;
const MARKUP_FRACTION = 0.5; // 1.5× metered E2B cost — modest margin, not 2×
const HOLDER_DISCOUNT = 0.2; // 20% off the marked-up price for qualifying holders
const MIN_CHARGE_MICRO_USD = 10_000; // $0.01 floor per session (covers overhead)
/** Flat fee to persist a sandbox workspace snapshot (≤ max bytes). */
export const WORKSPACE_SAVE_MICRO_USD = 50_000; // $0.05
export const WORKSPACE_MAX_BYTES = 5 * 1024 * 1024; // 5 MiB compressed archive cap

// $DTOUR holder-discount eligibility from the CACHED users.balance (no RPC):
// holder = ≥ 0.5% of total supply. Supply is fixed (Token-2022, no mint auth).
const DTOUR_SUPPLY = 989_000_000;
const HOLDER_THRESHOLD = 0.005;

const USD = USD_MICRO;

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

async function balanceMicro(
  ctx: QueryCtx | MutationCtx,
  pubkey: string,
): Promise<number> {
  const row = await ctx.db
    .query("creditBalances")
    .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
    .unique();
  return row?.balanceMicroUsd ?? 0;
}

async function holderQualifies(
  ctx: QueryCtx | MutationCtx,
  pubkey: string,
): Promise<boolean> {
  const u = await ctx.db
    .query("users")
    .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
    .unique();
  const bal = u?.balance ?? 0;
  return DTOUR_SUPPLY > 0 && bal / DTOUR_SUPPLY >= HOLDER_THRESHOLD;
}

/** The accurate price for a session: metered E2B cost × markup × holder-discount,
 *  floored at the minimum charge. Returns both the raw cost and the charge. */
function computePrice(
  durationSec: number,
  vcpu: number,
  ramGiB: number,
  qualifies: boolean,
): { costMicro: number; chargeMicro: number } {
  const cost =
    durationSec * (vcpu * CPU_MICRO_PER_VCPU_SEC + ramGiB * RAM_MICRO_PER_GIB_SEC);
  const marked =
    cost * (1 + MARKUP_FRACTION) * (qualifies ? 1 - HOLDER_DISCOUNT : 1);
  return {
    costMicro: Math.round(cost),
    chargeMicro: Math.max(MIN_CHARGE_MICRO_USD, Math.round(marked)),
  };
}

// ── public: rate card (for the purchase UI) ───────────────────────────────────
export const pricing = query({
  args: {},
  handler: async () => {
    const perHour = (vcpu: number, ram: number, q: boolean) =>
      computePrice(3600, vcpu, ram, q).chargeMicro / USD;
    return {
      markupFraction: MARKUP_FRACTION,
      holderDiscount: HOLDER_DISCOUNT,
      minChargeUsd: MIN_CHARGE_MICRO_USD / USD,
      workspaceSaveUsd: WORKSPACE_SAVE_MICRO_USD / USD,
      workspaceMaxMiB: WORKSPACE_MAX_BYTES / (1024 * 1024),
      // representative default sandbox (2 vCPU / 0.5 GiB)
      example: {
        vcpu: 2,
        ramGiB: 0.5,
        nonHolderPerHourUsd: perHour(2, 0.5, false),
        holderPerHourUsd: perHour(2, 0.5, true),
      },
    };
  },
});

// ── user: my credit balance ───────────────────────────────────────────────────
export const myCredits = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) return null;
    const micro = await balanceMicro(ctx, pubkey);
    const starter = await ctx.db
      .query("creditTopUps")
      .withIndex("by_signature", (q) => q.eq("signature", starterCreditSignature(pubkey)))
      .unique();
    return {
      balanceUsd: micro / USD,
      balanceMicroUsd: micro,
      holder: await holderQualifies(ctx, pubkey),
      starterClaimed: !!starter,
      starterUsd: starter ? starter.usdMicro / USD : STARTER_CREDIT_USD,
    };
  },
});

// ── relay: may this session start? (gate on credits before spinning up E2B) ───
export const canStart = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) return { ok: false, reason: "no session" };
    const bal = await balanceMicro(ctx, pubkey);
    if (bal < MIN_CHARGE_MICRO_USD) {
      return { ok: false, reason: "insufficient credits", balanceUsd: bal / USD };
    }
    return { ok: true, balanceUsd: bal / USD };
  },
});

// ── relay: meter + debit after a session ends ─────────────────────────────────
export const recordSession = mutation({
  args: {
    token: v.string(),
    sandboxId: v.string(),
    startedAtMs: v.number(),
    endedAtMs: v.number(),
    vcpu: v.number(),
    ramGiB: v.number(),
  },
  handler: async (ctx, a) => {
    const pubkey = await sessionPubkey(ctx, a.token);
    if (!pubkey) return { ok: false as const };

    // Idempotency: a sandbox is billed at most once.
    const existing = await ctx.db
      .query("codingUsage")
      .withIndex("by_sandbox", (q) => q.eq("sandboxId", a.sandboxId))
      .unique();
    if (existing) return { ok: true as const, chargedUsd: existing.priceMicroUsd / USD };

    const durationSec = Math.max(0, (a.endedAtMs - a.startedAtMs) / 1000);
    const qualifies = await holderQualifies(ctx, pubkey);
    const { costMicro, chargeMicro } = computePrice(durationSec, a.vcpu, a.ramGiB, qualifies);

    const row = await ctx.db
      .query("creditBalances")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    const after = (row?.balanceMicroUsd ?? 0) - chargeMicro; // canStart gates entry; one session can dip negative
    if (row) await ctx.db.patch(row._id, { balanceMicroUsd: after, updatedAt: Date.now() });
    else await ctx.db.insert("creditBalances", { pubkey, balanceMicroUsd: after, updatedAt: Date.now() });

    await ctx.db.insert("codingUsage", {
      pubkey,
      sandboxId: a.sandboxId,
      startedAt: a.startedAtMs,
      endedAt: a.endedAtMs,
      durationSec,
      vcpu: a.vcpu,
      ramGiB: a.ramGiB,
      costMicroUsd: costMicro,
      priceMicroUsd: chargeMicro,
      holderDiscount: qualifies,
      at: Date.now(),
    });
    await logEvent(ctx, "coding.session", {
      pubkey,
      data: { durationSec, costMicro, chargeMicro, qualifies },
    });
    return { ok: true as const, chargedUsd: chargeMicro / USD, balanceUsd: after / USD };
  },
});

// ── admin: grant USD credits (top-up stand-in until the payment rail exists) ──
// ── user: saved workspace archives ───────────────────────────────────────────
export const listWorkspaces = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) return [];
    const rows = await ctx.db
      .query("codingWorkspaces")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .order("desc")
      .take(40);
    return Promise.all(
      rows.map(async (r) => ({
        id: r._id,
        name: r.name,
        sizeBytes: r.sizeBytes,
        at: r.at,
        downloadUrl: (await ctx.storage.getUrl(r.storageId)) ?? null,
      })),
    );
  },
});

export const prepareWorkspaceSave = mutation({
  args: { token: v.string(), name: v.string(), sizeBytes: v.number() },
  handler: async (ctx, { token, name, sizeBytes }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) throw new Error("Not authenticated");
    const trimmed = name.trim().slice(0, 80) || "workspace";
    if (!(sizeBytes > 0) || sizeBytes > WORKSPACE_MAX_BYTES) {
      throw new Error(`Workspace must be under ${WORKSPACE_MAX_BYTES / (1024 * 1024)} MiB`);
    }
    const qualifies = await holderQualifies(ctx, pubkey);
    const chargeMicro = Math.round(
      WORKSPACE_SAVE_MICRO_USD * (qualifies ? 1 - HOLDER_DISCOUNT : 1),
    );
    const bal = await balanceMicro(ctx, pubkey);
    if (bal < chargeMicro) {
      throw new Error(`Need $${(chargeMicro / USD).toFixed(2)} credits to save (balance $${(bal / USD).toFixed(2)})`);
    }
    const uploadUrl = await ctx.storage.generateUploadUrl();
    return {
      uploadUrl,
      name: trimmed,
      chargeUsd: chargeMicro / USD,
    };
  },
});

export const finalizeWorkspaceSave = mutation({
  args: {
    token: v.string(),
    storageId: v.id("_storage"),
    name: v.string(),
    sizeBytes: v.number(),
    sandboxId: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const pubkey = await sessionPubkey(ctx, a.token);
    if (!pubkey) return { ok: false as const, reason: "no session" };

    const existing = await ctx.db
      .query("codingWorkspaces")
      .withIndex("by_storage", (q) => q.eq("storageId", a.storageId))
      .unique();
    if (existing) {
      return {
        ok: true as const,
        id: existing._id,
        chargedUsd: existing.priceMicroUsd / USD,
      };
    }

    if (!(a.sizeBytes > 0) || a.sizeBytes > WORKSPACE_MAX_BYTES) {
      throw new Error("Invalid workspace size");
    }

    const qualifies = await holderQualifies(ctx, pubkey);
    const chargeMicro = Math.round(
      WORKSPACE_SAVE_MICRO_USD * (qualifies ? 1 - HOLDER_DISCOUNT : 1),
    );

    const row = await ctx.db
      .query("creditBalances")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    const after = (row?.balanceMicroUsd ?? 0) - chargeMicro;
    if (row) await ctx.db.patch(row._id, { balanceMicroUsd: after, updatedAt: Date.now() });
    else await ctx.db.insert("creditBalances", { pubkey, balanceMicroUsd: after, updatedAt: Date.now() });

    const id = await ctx.db.insert("codingWorkspaces", {
      pubkey,
      name: a.name.trim().slice(0, 80) || "workspace",
      sandboxId: a.sandboxId,
      storageId: a.storageId,
      sizeBytes: a.sizeBytes,
      priceMicroUsd: chargeMicro,
      at: Date.now(),
    });
    await logEvent(ctx, "coding.workspace_save", {
      pubkey,
      data: { sizeBytes: a.sizeBytes, chargeMicro },
    });
    return { ok: true as const, id, chargedUsd: chargeMicro / USD, balanceUsd: after / USD };
  },
});

// ── admin: grant USD credits (top-up stand-in until the payment rail exists) ──
export const grantCredits = mutation({
  args: { token: v.string(), pubkey: v.string(), amountUsd: v.number() },
  handler: async (ctx, { token, pubkey, amountUsd }) => {
    const caller = await requireRole(ctx, token, "admin");
    if (!(amountUsd > 0) || !Number.isFinite(amountUsd)) {
      throw new Error("amountUsd must be a positive number");
    }
    const micro = Math.round(amountUsd * USD);
    const row = await ctx.db
      .query("creditBalances")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    const after = (row?.balanceMicroUsd ?? 0) + micro;
    if (row) await ctx.db.patch(row._id, { balanceMicroUsd: after, updatedAt: Date.now() });
    else await ctx.db.insert("creditBalances", { pubkey, balanceMicroUsd: after, updatedAt: Date.now() });
    await logEvent(ctx, "coding.grant", {
      pubkey: caller.pubkey,
      data: { target: pubkey, amountUsd },
    });
    return { ok: true, balanceUsd: after / USD };
  },
});
