import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import {
  type MutationCtx,
  type QueryCtx,
  action,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { logEvent } from "./events";

// ── direct-gateway inference + metering ───────────────────────────────────────
// Strategy (docs/COMPETE.md): under Model 1 we pay ElizaCloud FULL price (no
// reseller discount), so routing chat DIRECT to OpenRouter (our key) skips
// ElizaCloud's +20% — we end up cheaper than ElizaCloud AND finally have margin.
// We meter the real OpenRouter token cost, mark it up, and debit USD-credits.
//
// Markup/holder-discount are COUPLED (the math in COMPETE.md §2): to stay cheaper
// than ElizaCloud (×1.2 over OpenRouter) for non-holders AND keep holders above
// cost, both guards hold at markup +15% / holder-discount 10%:
//   non-holder 1.15 (< 1.20 → cheaper than Eliza, +15% margin)
//   holder     1.15×0.90 = 1.035 (≥ cost → no loss; ~14% under Eliza)
const MARKUP_FRACTION = 0.15;
const HOLDER_DISCOUNT = 0.1;
const MIN_CHARGE_MICRO_USD = 1; // effectively no floor on inference (tiny calls)

const DTOUR_SUPPLY = 989_000_000;
const HOLDER_THRESHOLD = 0.005;
const USD = 1_000_000;
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const PRICE_TTL_MS = 60 * 60 * 1000; // refresh the OpenRouter price catalog hourly

async function sessionPubkey(ctx: QueryCtx | MutationCtx, token: string): Promise<string | null> {
  const s = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!s || s.expiresAt < Date.now()) return null;
  return s.pubkey;
}

// ── OpenRouter price catalog (cached) ─────────────────────────────────────────

export const _priceCache = internalQuery({
  args: {},
  handler: async (ctx): Promise<{ json: string; fetchedAt: number } | null> => {
    const row = await ctx.db.query("openrouterPrices").first();
    return row ? { json: row.json, fetchedAt: row.fetchedAt } : null;
  },
});

export const _setPriceCache = internalMutation({
  args: { json: v.string() },
  handler: async (ctx, { json }) => {
    const row = await ctx.db.query("openrouterPrices").first();
    if (row) await ctx.db.patch(row._id, { json, fetchedAt: Date.now() });
    else await ctx.db.insert("openrouterPrices", { json, fetchedAt: Date.now() });
  },
});

/** Per-token USD rates by model id, from OpenRouter /models (cached hourly). */
async function getPrices(
  ctx: { runQuery: any; runMutation: any },
): Promise<Record<string, { prompt: number; completion: number }>> {
  const cached = (await ctx.runQuery(internal.inference._priceCache, {})) as
    | { json: string; fetchedAt: number }
    | null;
  if (cached && Date.now() - cached.fetchedAt < PRICE_TTL_MS) {
    try {
      return JSON.parse(cached.json);
    } catch {
      /* fall through to refetch */
    }
  }
  try {
    const res = await fetch(`${OPENROUTER_BASE}/models`);
    if (!res.ok) throw new Error(`OpenRouter models ${res.status}`);
    const j = (await res.json()) as {
      data?: Array<{ id?: string; pricing?: { prompt?: string; completion?: string } }>;
    };
    const map: Record<string, { prompt: number; completion: number }> = {};
    for (const m of j.data ?? []) {
      if (!m.id) continue;
      map[m.id] = {
        prompt: Number(m.pricing?.prompt) || 0,
        completion: Number(m.pricing?.completion) || 0,
      };
    }
    await ctx.runMutation(internal.inference._setPriceCache, { json: JSON.stringify(map) });
    return map;
  } catch {
    // Stale cache beats no cache; else empty (cost 0 → we never overcharge).
    if (cached) {
      try {
        return JSON.parse(cached.json);
      } catch {
        /* ignore */
      }
    }
    return {};
  }
}

// ── charge (idempotent by refId) ──────────────────────────────────────────────

export const _charge = internalMutation({
  args: {
    pubkey: v.string(),
    refId: v.string(),
    surface: v.string(),
    model: v.string(),
    promptTokens: v.optional(v.number()),
    completionTokens: v.optional(v.number()),
    costMicroUsd: v.number(),
  },
  handler: async (ctx, a): Promise<{ chargedMicro: number }> => {
    // Idempotency: one charge per logical call (refId). A retry inserts nothing.
    const existing = await ctx.db
      .query("inferenceUsage")
      .withIndex("by_ref", (q) => q.eq("refId", a.refId))
      .unique();
    if (existing) return { chargedMicro: existing.priceMicroUsd };

    const user = await ctx.db
      .query("users")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", a.pubkey))
      .unique();
    const lifetime = user?.plan === "lifetime";
    const qualifies =
      DTOUR_SUPPLY > 0 && (user?.balance ?? 0) / DTOUR_SUPPLY >= HOLDER_THRESHOLD;

    const marked = a.costMicroUsd * (1 + MARKUP_FRACTION) * (qualifies ? 1 - HOLDER_DISCOUNT : 1);
    const priceMicro = lifetime ? 0 : Math.max(MIN_CHARGE_MICRO_USD, Math.round(marked));

    await ctx.db.insert("inferenceUsage", {
      pubkey: a.pubkey,
      refId: a.refId,
      surface: a.surface,
      model: a.model,
      promptTokens: a.promptTokens,
      completionTokens: a.completionTokens,
      costMicroUsd: Math.round(a.costMicroUsd),
      priceMicroUsd: priceMicro,
      holderDiscount: qualifies,
      at: Date.now(),
    });
    if (priceMicro > 0) {
      const row = await ctx.db
        .query("creditBalances")
        .withIndex("by_pubkey", (q) => q.eq("pubkey", a.pubkey))
        .unique();
      const after = (row?.balanceMicroUsd ?? 0) - priceMicro;
      if (row) await ctx.db.patch(row._id, { balanceMicroUsd: after, updatedAt: Date.now() });
      else await ctx.db.insert("creditBalances", { pubkey: a.pubkey, balanceMicroUsd: after, updatedAt: Date.now() });
    }
    await logEvent(ctx, "inference.charge", {
      pubkey: a.pubkey,
      data: { surface: a.surface, model: a.model, costMicro: a.costMicroUsd, priceMicro, lifetime },
    });
    return { chargedMicro: priceMicro };
  },
});

// ── public: can this user run paid inference? (gate before a call) ────────────
export const canInfer = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) return { ok: false, reason: "no session" };
    const user = await ctx.db
      .query("users")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    if (user?.plan === "lifetime") return { ok: true, lifetime: true, balanceUsd: 0 };
    const bal = (
      await ctx.db
        .query("creditBalances")
        .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
        .unique()
    )?.balanceMicroUsd ?? 0;
    // Metering only bites once OpenRouter is wired; until then chat is free, so
    // don't block. With the gateway live, require a positive balance.
    if (!process.env.OPENROUTER_API_KEY) return { ok: true, lifetime: false, balanceUsd: bal / USD };
    if (bal <= 0) return { ok: false, reason: "out of credits", lifetime: false, balanceUsd: 0 };
    return { ok: true, lifetime: false, balanceUsd: bal / USD };
  },
});

/** Whether direct-gateway metered inference is live (OpenRouter key set). */
export const status = action({
  args: {},
  handler: async (): Promise<{ openrouter: boolean }> => {
    return { openrouter: !!process.env.OPENROUTER_API_KEY };
  },
});

/**
 * Run a chat completion + meter it. If OPENROUTER_API_KEY is set: call OpenRouter
 * DIRECT (cheaper than ElizaCloud, with margin) and charge the metered cost.
 * Otherwise fall back to ElizaCloud (current free behavior) — no charge. Charging
 * is idempotent by refId. Returns the assistant text.
 */
export const runChat = action({
  args: {
    token: v.string(),
    model: v.string(),
    messages: v.array(v.object({ role: v.string(), content: v.string() })),
    refId: v.string(),
  },
  handler: async (ctx, { token, model, messages, refId }): Promise<{ text: string; source: string }> => {
    const me = (await ctx.runQuery(api.users.me, { token })) as { pubkey: string } | null;
    if (!me) throw new Error("Not signed in");
    const pubkey = me.pubkey;
    const orKey = process.env.OPENROUTER_API_KEY;

    if (orKey) {
      // Gate on credits (lifetime bypass handled in _charge; pre-check balance).
      const gate = (await ctx.runQuery(api.inference.canInfer, { token })) as { ok: boolean; reason?: string };
      if (!gate.ok) throw new Error(gate.reason === "out of credits" ? "Out of credits — top up to keep chatting." : "Cannot run inference.");

      const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${orKey}`,
          "content-type": "application/json",
          "http-referer": "https://detour.ninja",
          "x-title": "Detour Cloud",
        },
        body: JSON.stringify({ model, messages }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Inference failed (${res.status}): ${t.slice(0, 160)}`);
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
        model?: string;
      };
      const text = json.choices?.[0]?.message?.content;
      if (typeof text !== "string") throw new Error("No text returned");

      const usedModel = json.model || model;
      const prompt = json.usage?.prompt_tokens ?? 0;
      const completion = json.usage?.completion_tokens ?? 0;
      // OpenRouter returns the AUTHORITATIVE per-request USD cost inline
      // (usage.cost) — exactly what we pay (incl. provider variance + cache
      // discounts). Use it; fall back to the per-token catalog only if absent.
      let costMicroUsd: number;
      if (typeof json.usage?.cost === "number") {
        costMicroUsd = json.usage.cost * USD;
      } else {
        const prices = await getPrices(ctx);
        const rate = prices[usedModel] ?? prices[model] ?? { prompt: 0, completion: 0 };
        costMicroUsd = (prompt * rate.prompt + completion * rate.completion) * USD;
      }
      await ctx.runMutation(internal.inference._charge, {
        pubkey,
        refId,
        surface: "chat",
        model: usedModel,
        promptTokens: prompt,
        completionTokens: completion,
        costMicroUsd,
      });
      return { text, source: "openrouter" };
    }

    // Fallback: ElizaCloud (unmetered/free until the gateway key lands).
    const base = process.env.ELIZACLOUD_API_URL || "https://api.elizacloud.ai";
    const key = process.env.ELIZACLOUD_API_KEY || process.env.ELIZAOS_CLOUD_API_KEY;
    if (!key) throw new Error("Inference isn't configured.");
    const res = await fetch(`${base.replace(/\/$/, "")}/api/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model, messages }),
    });
    if (!res.ok) throw new Error(`Inference failed (${res.status})`);
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content;
    if (typeof text !== "string") throw new Error("No text returned");
    return { text, source: "elizacloud" };
  },
});

/**
 * Generate an image via OpenRouter (same /chat/completions endpoint, modalities
 * ["image","text"]). Returns a data URL. Metered from usage.cost like chat —
 * one gateway for chat + image (OpenRouter now does media; no Fal needed). Falls
 * back to ElizaCloud /api/v1/generate-image when OPENROUTER_API_KEY is unset.
 */
export const runImage = action({
  args: { token: v.string(), model: v.optional(v.string()), prompt: v.string(), refId: v.string() },
  handler: async (ctx, { token, model, prompt, refId }): Promise<{ url: string; source: string }> => {
    const me = (await ctx.runQuery(api.users.me, { token })) as { pubkey: string } | null;
    if (!me) throw new Error("Not signed in");
    const pubkey = me.pubkey;
    const orKey = process.env.OPENROUTER_API_KEY;

    if (orKey) {
      const gate = (await ctx.runQuery(api.inference.canInfer, { token })) as { ok: boolean; reason?: string };
      if (!gate.ok) throw new Error(gate.reason === "out of credits" ? "Out of credits — top up to generate." : "Cannot run inference.");
      const usedModel = model && model !== "Auto" && model !== "auto" ? model : "google/gemini-2.5-flash-image";
      const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${orKey}`,
          "content-type": "application/json",
          "http-referer": "https://detour.ninja",
          "x-title": "Detour Cloud",
        },
        body: JSON.stringify({
          model: usedModel,
          messages: [{ role: "user", content: prompt }],
          modalities: ["image", "text"],
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Image generation failed (${res.status}): ${t.slice(0, 160)}`);
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
        usage?: { cost?: number };
        model?: string;
      };
      const dataUrl = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (typeof dataUrl !== "string" || !dataUrl) throw new Error("No image returned");
      // An action can't RETURN a multi-MB base64 data URL (exceeds the value
      // size limit) — store it in Convex storage and return a small hosted URL
      // (same pattern as assets.ts). Store BEFORE charging so a store failure
      // doesn't bill the user without a deliverable.
      let url = dataUrl;
      const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (m) {
        const bin = atob(m[2]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const storageId = await ctx.storage.store(new Blob([bytes], { type: m[1] }));
        url = (await ctx.storage.getUrl(storageId)) ?? dataUrl;
      }
      const costMicroUsd = (json.usage?.cost ?? 0) * USD;
      await ctx.runMutation(internal.inference._charge, {
        pubkey,
        refId,
        surface: "image",
        model: json.model || usedModel,
        costMicroUsd,
      });
      return { url, source: "openrouter" };
    }

    // Fallback: ElizaCloud (unmetered/free until the gateway key lands).
    const base = process.env.ELIZACLOUD_API_URL || "https://api.elizacloud.ai";
    const key = process.env.ELIZACLOUD_API_KEY || process.env.ELIZAOS_CLOUD_API_KEY;
    if (!key) throw new Error("Image generation isn't configured.");
    const res = await fetch(`${base.replace(/\/$/, "")}/api/v1/generate-image`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Image generation failed (${res.status})${t ? ` — ${t.slice(0, 120)}` : ""}`);
    }
    const j = (await res.json()) as { data?: Array<{ url?: string }>; url?: string; image?: string };
    const url = j.data?.[0]?.url ?? j.url ?? j.image;
    if (typeof url !== "string" || !url) throw new Error("No image returned");
    return { url, source: "elizacloud" };
  },
});

/** Per-user inference spend summary (powers the usage dashboard). */
export const mySpend = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) return null;
    const rows = await ctx.db
      .query("inferenceUsage")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .collect();
    const totalMicro = rows.reduce((s, r) => s + r.priceMicroUsd, 0);
    return { calls: rows.length, totalUsd: totalMicro / USD };
  },
});
