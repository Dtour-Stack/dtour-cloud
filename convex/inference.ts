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
// These are now ADMIN-CONFIGURABLE (tokenomicsConfig.inferenceMarkupBps /
// inferenceHolderDiscountBps); _charge reads them per-call and these constants
// are only the fallback when the config row is absent. Two pricing guards must
// hold whatever the admin sets: (1) markup keeps non-holders cheaper than
// ElizaCloud (×1.20) → markup ≤ ~20%; (2) markup ≥ 0.25 is ONLY required IF the
// holder discount applies, so that (1+markup)×(1-discount) ≥ cost (no loss on
// holders). The default 15%/10% holds: 1.15×0.90 = 1.035 ≥ cost.
// Fallbacks when tokenomicsConfig is absent (mirrors tokenomics.DEFAULT_CONFIG).
// Integer basis points: 1500 bps = +15% markup, 1000 bps = 10% holder discount.
const DEFAULT_MARKUP_BPS = 1500;
const DEFAULT_HOLDER_DISCOUNT_BPS = 1000;
const MIN_CHARGE_MICRO_USD = 1; // effectively no floor on inference (tiny calls)
// OpenRouter image gen (/chat/completions, modalities:["image","text"]) does NOT
// always return an authoritative usage.cost for google/gemini-2.5-flash-image —
// it can be absent or returned as 0 intermittently. Unlike chat we can't fall
// back to the per-token catalog (image isn't priced per token), so when usage.cost
// is missing or non-positive we meter at ElizaCloud's published image rate so an
// image is never billed at ~$0 (margin leak). $0.0468/req → micro-USD via × USD.
const ELIZACLOUD_IMAGE_USD = 0.0468;

const DTOUR_SUPPLY = 989_000_000;
const HOLDER_THRESHOLD = 0.005;
const USD = 1_000_000;
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const PRICE_TTL_MS = 60 * 60 * 1000; // refresh the OpenRouter price catalog hourly

// ── freetour: free OpenRouter models ($0), rate-limited ───────────────────────
// Curated :free instruct models tried in priority order via OpenRouter's models[]
// fallback (it tries the next on a model error), with openrouter/free — their own
// router across ALL free models, vision/tool-capable — as the always-valid
// catch-all. Free models bill $0, so we record usage but never charge. Their rate
// limits (20/min; 50–1000/day) are ACCOUNT-WIDE on our one key, so we also keep a
// per-user daily cap. Two triggers: the FREETOUR env flag (dev — route everything
// free, no per-user cap) and the user-selectable "freetour" model (prod — capped).
// OpenRouter caps the models[] fallback array at 3 entries, so: 2 curated :free
// instruct models + openrouter/free (their own all-free router) as the catch-all.
const FREE_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "openrouter/free",
];
const FREETOUR_DAILY_CAP = 50; // per-user free calls/day (soft; the pool is shared)

/** freetour is on when the dev env flag is set OR the user picked the "Free"
 *  option (model "freetour" / OpenRouter's own "openrouter/free" router). */
function freetourActive(model: string): boolean {
  return !!process.env.FREETOUR || model === "freetour" || model === "openrouter/free";
}
function utcDay(): string {
  return new Date(Date.now()).toISOString().slice(0, 10);
}

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

    // Admin-configurable markup + holder discount (tokenomicsConfig, single row).
    // ctx.runQuery is unavailable in a mutation, so read the row directly via
    // ctx.db and default to the same 15%/10% the constants encode when absent
    // (or when a field is unset on a row saved before these columns existed).
    const cfg = await ctx.db.query("tokenomicsConfig").first();
    const markupBps = cfg?.inferenceMarkupBps ?? DEFAULT_MARKUP_BPS;
    const discountBps = cfg?.inferenceHolderDiscountBps ?? DEFAULT_HOLDER_DISCOUNT_BPS;
    const markupFraction = markupBps / 10_000;
    const holderDiscount = discountBps / 10_000;

    const marked =
      a.costMicroUsd * (1 + markupFraction) * (qualifies ? 1 - holderDiscount : 1);
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

// ── freetour: per-user daily free-call counter ────────────────────────────────

export const _freetourUsed = internalQuery({
  args: { pubkey: v.string() },
  handler: async (ctx, { pubkey }): Promise<number> => {
    const row = await ctx.db
      .query("freetourUsage")
      .withIndex("by_pubkey_day", (q) => q.eq("pubkey", pubkey).eq("day", utcDay()))
      .unique();
    return row?.count ?? 0;
  },
});

/** Record a free inference call: $0 usage row (for the dashboard) + bump the
 *  per-user daily counter. Idempotent by refId, like _charge. */
export const _recordFree = internalMutation({
  args: {
    pubkey: v.string(),
    refId: v.string(),
    surface: v.string(),
    model: v.string(),
    promptTokens: v.optional(v.number()),
    completionTokens: v.optional(v.number()),
    costMicroUsd: v.number(),
  },
  handler: async (ctx, a) => {
    const existing = await ctx.db
      .query("inferenceUsage")
      .withIndex("by_ref", (q) => q.eq("refId", a.refId))
      .unique();
    if (existing) return; // retry → no double count

    await ctx.db.insert("inferenceUsage", {
      pubkey: a.pubkey,
      refId: a.refId,
      surface: a.surface,
      model: a.model,
      promptTokens: a.promptTokens,
      completionTokens: a.completionTokens,
      costMicroUsd: Math.round(a.costMicroUsd),
      priceMicroUsd: 0, // free — never charged (bypasses _charge's micro-USD floor)
      holderDiscount: false,
      free: true,
      at: Date.now(),
    });
    const day = utcDay();
    const row = await ctx.db
      .query("freetourUsage")
      .withIndex("by_pubkey_day", (q) => q.eq("pubkey", a.pubkey).eq("day", day))
      .unique();
    if (row) await ctx.db.patch(row._id, { count: row.count + 1, updatedAt: Date.now() });
    else await ctx.db.insert("freetourUsage", { pubkey: a.pubkey, day, count: 1, updatedAt: Date.now() });
  },
});

/** Free-tier budget left today (powers the "N free left" hint in the UI). */
export const freetourStatus = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) return { used: 0, cap: FREETOUR_DAILY_CAP, remaining: 0 };
    const row = await ctx.db
      .query("freetourUsage")
      .withIndex("by_pubkey_day", (q) => q.eq("pubkey", pubkey).eq("day", utcDay()))
      .unique();
    const used = row?.count ?? 0;
    return { used, cap: FREETOUR_DAILY_CAP, remaining: Math.max(0, FREETOUR_DAILY_CAP - used) };
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
    imageUrl: v.optional(v.string()),
    refId: v.string(),
  },
  handler: async (ctx, { token, model, messages, imageUrl, refId }): Promise<{ text: string; source: string }> => {
    const me = (await ctx.runQuery(api.users.me, { token })) as { pubkey: string } | null;
    if (!me) throw new Error("Not signed in");
    const pubkey = me.pubkey;
    const orKey = process.env.OPENROUTER_API_KEY;

    if (orKey) {
      // Admin kill-switches (toggle without redeploy): paid_inference_enabled,
      // freetour_enabled. Absent row → default on (only an explicit false blocks).
      const flags = (await ctx.runQuery(api.flags.all, {})) as Record<string, boolean>;
      const free = freetourActive(model);
      if (free) {
        if (flags.freetour_enabled === false)
          throw new Error("Free inference is paused right now — try again later or use credits.");
        // freetour: the dev env flag routes everything free with no per-user cap;
        // the user-facing "Free" option is capped (the OpenRouter pool is shared).
        if (!process.env.FREETOUR) {
          const used = (await ctx.runQuery(internal.inference._freetourUsed, { pubkey })) as number;
          if (used >= FREETOUR_DAILY_CAP)
            throw new Error(
              `Free daily limit reached (${FREETOUR_DAILY_CAP}/day). Add credits for unlimited inference, or try again tomorrow.`,
            );
        }
      } else {
        if (flags.paid_inference_enabled === false)
          throw new Error("Inference is temporarily paused — please try again shortly.");
        // Gate on credits (lifetime bypass handled in _charge; pre-check balance).
        const gate = (await ctx.runQuery(api.inference.canInfer, { token })) as { ok: boolean; reason?: string };
        if (!gate.ok) throw new Error(gate.reason === "out of credits" ? "Out of credits — top up to keep chatting." : "Cannot run inference.");
      }

      // Vision: when an image is attached, attach it to the last user message as
      // OpenRouter multimodal content + force a multimodal model (the agent's
      // chosen model may be text-only). The image is a public Convex-storage URL.
      let reqModel = model;
      let reqMessages: unknown[] = messages;
      if (imageUrl) {
        reqModel = "google/gemini-2.5-flash";
        const out = messages.map((m) => ({ role: m.role, content: m.content as unknown }));
        for (let i = out.length - 1; i >= 0; i--) {
          if (out[i].role === "user") {
            out[i] = {
              role: "user",
              content: [
                { type: "text", text: (messages[i].content as string) || "Describe this image." },
                { type: "image_url", image_url: { url: imageUrl } },
              ],
            };
            break;
          }
        }
        reqMessages = out;
      }

      // freetour routes to free models: the curated models[] fallback for text, or
      // openrouter/free for vision (it filters for image-capable free models).
      // Otherwise send the requested model as-is.
      const body: Record<string, unknown> = { messages: reqMessages };
      if (free && imageUrl) body.model = "openrouter/free";
      else if (free) body.models = FREE_MODELS;
      else body.model = reqModel;

      const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${orKey}`,
          "content-type": "application/json",
          "http-referer": "https://detour.ninja",
          "x-title": "Detour Cloud",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        // Free pool exhausted: 429 = per-minute, 402 = daily account cap. Tell the
        // user to wait/retry rather than surfacing a raw gateway error.
        if (free && (res.status === 429 || res.status === 402))
          throw new Error("Free models are busy right now — wait a few seconds and try again.");
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
      if (free) {
        // Free models bill $0 — record usage (dashboard + daily cap) but never charge.
        await ctx.runMutation(internal.inference._recordFree, {
          pubkey,
          refId,
          surface: "chat",
          model: usedModel,
          promptTokens: prompt,
          completionTokens: completion,
          costMicroUsd,
        });
      } else {
        await ctx.runMutation(internal.inference._charge, {
          pubkey,
          refId,
          surface: "chat",
          model: usedModel,
          promptTokens: prompt,
          completionTokens: completion,
          costMicroUsd,
        });
      }
      return { text, source: free ? "freetour" : "openrouter" };
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
      const flags = (await ctx.runQuery(api.flags.all, {})) as Record<string, boolean>;
      if (flags.paid_inference_enabled === false)
        throw new Error("Image generation is temporarily paused — please try again shortly.");
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
      // usage.cost is the authoritative per-request USD cost; use it when present
      // AND positive. If absent or 0 (OpenRouter does this intermittently for the
      // image model), meter at ElizaCloud's image rate so we never bill ~$0 — the
      // guard is deliberately stricter than chat (> 0, not just typeof number)
      // because there is no legitimate zero-cost image.
      const costUsd =
        typeof json.usage?.cost === "number" && json.usage.cost > 0
          ? json.usage.cost
          : ELIZACLOUD_IMAGE_USD;
      const costMicroUsd = costUsd * USD;
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

/**
 * Generate speech (TTS) from text + meter it. OpenRouter does NOT expose a TTS
 * endpoint that returns an authoritative usage.cost (its /audio/speech, if any,
 * yields raw bytes — no cost signal), so unlike chat/image there's no metering
 * advantage to it. We use ElizaCloud's ElevenLabs TTS (POST /api/elevenlabs/tts,
 * returns audio/mpeg bytes) and meter by character count at ElizaCloud's
 * published rate ($0.06 / 1k chars). Audio bytes can't be RETURNED inline (multi-
 * MB > value-size limit → "Server Error"), so we store them in Convex storage and
 * return a small hosted URL — same pattern as runImage. Charging is idempotent by
 * refId; gated on credits via canInfer. This is the LIVE path: it does NOT branch
 * on OPENROUTER_API_KEY (that key is set in prod, but ElizaCloud is the TTS rail).
 */
export const runSpeech = action({
  args: {
    token: v.string(),
    text: v.string(),
    modelId: v.optional(v.string()),
    refId: v.string(),
  },
  handler: async (ctx, { token, text, modelId, refId }): Promise<{ url: string; source: string }> => {
    const me = (await ctx.runQuery(api.users.me, { token })) as { pubkey: string } | null;
    if (!me) throw new Error("Not signed in");
    const pubkey = me.pubkey;
    if (!text.trim()) throw new Error("No text to speak");

    // TTS is OFF by default (the ElizaCloud ElevenLabs endpoint 404s in prod). An
    // admin flips tts_enabled on once it's live — this returns a clean message
    // instead of letting users hit a raw gateway 404.
    const flags = (await ctx.runQuery(api.flags.all, {})) as Record<string, boolean>;
    if (flags.tts_enabled !== true) throw new Error("Voice / text-to-speech is temporarily unavailable.");

    // Gate on credits (lifetime bypass handled in _charge; pre-check balance).
    const gate = (await ctx.runQuery(api.inference.canInfer, { token })) as { ok: boolean; reason?: string };
    if (!gate.ok) {
      throw new Error(gate.reason === "out of credits" ? "Out of credits — top up to generate speech." : "Cannot run inference.");
    }

    const base = process.env.ELIZACLOUD_API_URL || "https://api.elizacloud.ai";
    const key = process.env.ELIZACLOUD_API_KEY || process.env.ELIZAOS_CLOUD_API_KEY;
    if (!key) throw new Error("Speech generation isn't configured.");
    const usedModel = modelId && modelId.trim() ? modelId : "eleven_flash_v2_5";

    // ElevenLabs TTS returns a streaming audio/mpeg body (not JSON).
    const res = await fetch(`${base.replace(/\/$/, "")}/api/elevenlabs/tts`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ text, modelId: usedModel }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Speech generation failed (${res.status})${t ? ` — ${t.slice(0, 120)}` : ""}`);
    }
    const type = res.headers.get("content-type") || "audio/mpeg";
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0) throw new Error("No audio returned");

    // Store BEFORE charging so a store failure doesn't bill without a deliverable.
    const storageId = await ctx.storage.store(new Blob([bytes], { type }));
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("Couldn't host the generated audio");

    // ElizaCloud voice-tts pricing: $0.06 / 1000 chars → micro-USD raw cost.
    // _charge applies markup + holder discount on top (cost vs price split).
    const costMicroUsd = Math.ceil(text.length / 1000) * 0.06 * USD;
    await ctx.runMutation(internal.inference._charge, {
      pubkey,
      refId,
      surface: "speech",
      model: usedModel,
      costMicroUsd,
    });
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
