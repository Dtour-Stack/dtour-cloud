import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import {
  type MutationCtx,
  type QueryCtx,
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import {
  extractReasoning,
  type AgentTurnTrace,
  serializeTrace,
  stripReasoningTags,
} from "./agentTrace";
import { logEvent } from "./events";
import {
  gatewayAttemptOrder,
  resolveRouteVariant,
  type InferenceGateway,
  type InferenceRouteVariant,
} from "./inferenceRouting";

// ── direct-gateway inference + metering ───────────────────────────────────────
// Paid chat: try gateways in per-user A/B order (INFERENCE_ROUTE_MODE=ab default)
// — eliza_first or openrouter_first — then failover to the other. Gateway/source
// is recorded on inferenceUsage + turn traces (admin); the UI lists models only.
// OpenRouter wins are metered; ElizaCloud path is unmetered fallback today.
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
const OPENROUTER_KEY_STATUS_TTL_MS = 60 * 1000;
const DEFAULT_OPENROUTER_PAID_RESERVE_USD = 5;
const DEFAULT_OPENROUTER_FREE_RESERVE_USD = 25;

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
import { FREE_MODELS, FREETOUR_MODEL, freetourActive } from "./freeModels";
import { FREETOUR_DAILY_CAP, rateLimiter } from "./rateLimits";
import { requireRole } from "./rbac";
import {
  assessOpenRouterCredits,
  normalizeOpenRouterKeyResponse,
  openRouterRequestClass,
  openRouterServiceTier,
  type OpenRouterCreditDecision,
  type OpenRouterCreditStatus,
  type OpenRouterKeyResponse,
  type OpenRouterPlan,
  type OpenRouterRequestClass,
  type OpenRouterServiceTier,
} from "./openrouterPolicy";
import { atLeast, type Role } from "./roles";
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

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function openRouterReserve() {
  return {
    paidReserveUsd: envNumber(
      "OPENROUTER_PAID_RESERVE_USD",
      DEFAULT_OPENROUTER_PAID_RESERVE_USD,
    ),
    freeReserveUsd: envNumber(
      "OPENROUTER_FREE_RESERVE_USD",
      DEFAULT_OPENROUTER_FREE_RESERVE_USD,
    ),
  };
}

function parseOpenRouterCreditStatus(json: string): OpenRouterCreditStatus | null {
  try {
    return JSON.parse(json) as OpenRouterCreditStatus;
  } catch {
    return null;
  }
}

function openRouterCreditMessage(decision: Exclude<OpenRouterCreditDecision, { ok: true }>) {
  if (decision.reason === "negative_credits") {
    return "OpenRouter credits are exhausted — top up the platform account before using this rail.";
  }
  return `OpenRouter is below the reserved platform balance ($${decision.remainingUsd.toFixed(
    2,
  )} remaining, $${decision.reserveUsd.toFixed(2)} reserved).`;
}

// ── OpenRouter price catalog (cached) ─────────────────────────────────────────

export const _keyStatusCache = internalQuery({
  args: {},
  handler: async (ctx): Promise<{ json: string; fetchedAt: number } | null> => {
    const row = await ctx.db.query("openrouterKeyStatus").first();
    return row ? { json: row.json, fetchedAt: row.fetchedAt } : null;
  },
});

export const _setKeyStatusCache = internalMutation({
  args: { json: v.string(), fetchedAt: v.number() },
  handler: async (ctx, { json, fetchedAt }) => {
    const row = await ctx.db.query("openrouterKeyStatus").first();
    if (row) await ctx.db.patch(row._id, { json, fetchedAt });
    else await ctx.db.insert("openrouterKeyStatus", { json, fetchedAt });
  },
});

async function getOpenRouterKeyStatus(
  ctx: MeterCtx,
  apiKey: string,
): Promise<OpenRouterCreditStatus | null> {
  const cached = (await ctx.runQuery(internal.inference._keyStatusCache, {})) as
    | { json: string; fetchedAt: number }
    | null;
  if (cached && Date.now() - cached.fetchedAt < OPENROUTER_KEY_STATUS_TTL_MS) {
    const parsed = parseOpenRouterCreditStatus(cached.json);
    if (parsed) return parsed;
  }
  try {
    const res = await fetch(`${OPENROUTER_BASE}/key`, {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`OpenRouter key ${res.status}`);
    const status = normalizeOpenRouterKeyResponse(
      (await res.json()) as OpenRouterKeyResponse,
      Date.now(),
    );
    await ctx.runMutation(internal.inference._setKeyStatusCache, {
      json: JSON.stringify(status),
      fetchedAt: status.fetchedAt,
    });
    return status;
  } catch {
    if (!cached) return null;
    return parseOpenRouterCreditStatus(cached.json);
  }
}

async function assessOpenRouterRequest(
  ctx: MeterCtx,
  apiKey: string,
  requestClass: OpenRouterRequestClass,
): Promise<{
  serviceTier: OpenRouterServiceTier;
  servedStatus: OpenRouterCreditStatus | null;
}> {
  const serviceTier = openRouterServiceTier(requestClass);
  const servedStatus = await getOpenRouterKeyStatus(ctx, apiKey);
  if (servedStatus) {
    const decision = assessOpenRouterCredits(servedStatus, requestClass, openRouterReserve());
    if (!decision.ok) throw new Error(openRouterCreditMessage(decision));
  }
  return { serviceTier, servedStatus };
}

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
    serviceTier: v.optional(v.string()),
    servedServiceTier: v.optional(v.string()),
    routeVariant: v.optional(v.string()),
    gateway: v.optional(v.string()),
    fallbackUsed: v.optional(v.boolean()),
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
      serviceTier: a.serviceTier,
      servedServiceTier: a.servedServiceTier,
      routeVariant: a.routeVariant,
      gateway: a.gateway,
      fallbackUsed: a.fallbackUsed,
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
      data: {
        surface: a.surface,
        model: a.model,
        costMicro: a.costMicroUsd,
        priceMicro,
        lifetime,
        routeVariant: a.routeVariant,
        gateway: a.gateway,
        fallbackUsed: a.fallbackUsed,
        serviceTier: a.serviceTier,
        servedServiceTier: a.servedServiceTier,
      },
    });
    await ctx.runMutation(internal.aggregates.recordInferenceSpend, {
      pubkey: a.pubkey,
      refId: a.refId,
      priceMicroUsd: priceMicro,
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
    serviceTier: v.optional(v.string()),
    servedServiceTier: v.optional(v.string()),
    routeVariant: v.optional(v.string()),
    gateway: v.optional(v.string()),
    fallbackUsed: v.optional(v.boolean()),
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
      serviceTier: a.serviceTier,
      servedServiceTier: a.servedServiceTier,
      routeVariant: a.routeVariant,
      gateway: a.gateway ?? "freetour",
      fallbackUsed: a.fallbackUsed,
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
    const { value: used } = await rateLimiter.getValue(ctx, "freetourDaily", { key: pubkey });
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

export const openRouterCreditStatus = action({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const me = (await ctx.runQuery(api.users.me, { token })) as { role: Role } | null;
    if (!me || !atLeast(me.role, "admin")) throw new Error("Forbidden");
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) {
      return {
        configured: false,
        status: null,
        paid: { ok: false as const },
        free: { ok: false as const },
      };
    }
    const keyStatus = await getOpenRouterKeyStatus(ctx, key);
    return {
      configured: true,
      status: keyStatus,
      paid: keyStatus ? assessOpenRouterCredits(keyStatus, "paid", openRouterReserve()) : null,
      free: keyStatus ? assessOpenRouterCredits(keyStatus, "free", openRouterReserve()) : null,
    };
  },
});

type ChatCoreResult = {
  text: string;
  source: "freetour" | "openrouter" | "elizacloud";
  modelUsed: string;
  modelRequested: string;
  durationMs: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    costUsd?: number;
    free?: boolean;
    serviceTier?: OpenRouterServiceTier;
    servedServiceTier?: string | null;
  };
  reasoning?: string;
  routeVariant: InferenceRouteVariant;
  fallbackUsed: boolean;
};

type MeterCtx = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runQuery: (ref: any, args: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runMutation: (ref: any, args: any) => Promise<any>;
};

/** Build OpenRouter multimodal messages when an image is attached. */
function openRouterMessages(
  model: string,
  messages: Array<{ role: string; content: string }>,
  imageUrl?: string,
): { reqModel: string; reqMessages: unknown[] } {
  if (!imageUrl) return { reqModel: model, reqMessages: messages };
  const reqModel = "google/gemini-2.5-flash";
  const out = messages.map((m) => ({ role: m.role, content: m.content as unknown }));
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].role === "user") {
      out[i] = {
        role: "user",
        content: [
          { type: "text", text: messages[i].content || "Describe this image." },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      };
      break;
    }
  }
  return { reqModel, reqMessages: out };
}

async function runOpenRouterChat(
  ctx: MeterCtx,
  args: {
    pubkey: string;
    token: string;
    model: string;
    messages: Array<{ role: string; content: string }>;
    imageUrl?: string;
    refId: string;
    role: Role;
    plan: OpenRouterPlan;
    routeVariant: InferenceRouteVariant;
    fallbackUsed: boolean;
  },
): Promise<ChatCoreResult> {
  const started = Date.now();
  const orKey = process.env.OPENROUTER_API_KEY;
  if (!orKey) throw new Error("OpenRouter not configured");

  const flags = (await ctx.runQuery(api.flags.all, {})) as Record<string, boolean>;
  const free = freetourActive(args.model);
  const requestClass = openRouterRequestClass({ free, role: args.role, plan: args.plan });
  let serviceTier: OpenRouterServiceTier;
  if (free) {
    if (!flags.freetour_enabled)
      throw new Error("Free inference is paused right now — try again later or use credits.");
    ({ serviceTier } = await assessOpenRouterRequest(ctx, orKey, requestClass));
    if (!process.env.FREETOUR) {
      await ctx.runMutation(internal.rateLimits.consumeFreetour, { pubkey: args.pubkey });
    }
  } else {
    if (!flags.paid_inference_enabled)
      throw new Error("Inference is temporarily paused — please try again shortly.");
    const gate = (await ctx.runQuery(api.inference.canInfer, { token: args.token })) as {
      ok: boolean;
      reason?: string;
    };
    if (!gate.ok)
      throw new Error(
        gate.reason === "out of credits"
          ? "Out of credits — top up to keep chatting."
          : "Cannot run inference.",
      );
    ({ serviceTier } = await assessOpenRouterRequest(ctx, orKey, requestClass));
    await ctx.runMutation(internal.rateLimits.consumePaidInference, { pubkey: args.pubkey });
  }

  const { reqModel, reqMessages } = openRouterMessages(args.model, args.messages, args.imageUrl);
  const modelForBody =
    args.model === "auto" || !args.model || args.model === FREETOUR_MODEL ? reqModel : args.model;
  const body: Record<string, unknown> = { messages: reqMessages };
  if (free && args.imageUrl) body.model = "openrouter/free";
  else if (free && args.model === FREETOUR_MODEL) body.models = FREE_MODELS;
  else if (free) body.model = modelForBody;
  else body.model = modelForBody;
  body.service_tier = serviceTier;

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
    if (free && (res.status === 429 || res.status === 402))
      throw new Error("Free models are busy right now — wait a few seconds and try again.");
    throw new Error(`Inference failed (${res.status}): ${t.slice(0, 160)}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{
      message?: { content?: string; reasoning?: string; reasoning_content?: string };
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
    model?: string;
    service_tier?: string | null;
  };
  const rawText = json.choices?.[0]?.message?.content;
  if (typeof rawText !== "string") throw new Error("No text returned");
  const reasoning = extractReasoning(rawText, json.choices?.[0]?.message);
  const text = stripReasoningTags(rawText) || rawText;

  const usedModel = json.model || args.model;
  const prompt = json.usage?.prompt_tokens ?? 0;
  const completion = json.usage?.completion_tokens ?? 0;
  let costMicroUsd: number;
  if (typeof json.usage?.cost === "number") {
    costMicroUsd = json.usage.cost * USD;
  } else {
    const prices = await getPrices(ctx);
    const rate = prices[usedModel] ?? prices[args.model] ?? { prompt: 0, completion: 0 };
    costMicroUsd = (prompt * rate.prompt + completion * rate.completion) * USD;
  }

  const routeMeta = {
    routeVariant: args.routeVariant,
    gateway: free ? "freetour" : "openrouter",
    fallbackUsed: args.fallbackUsed,
    serviceTier,
    servedServiceTier: json.service_tier ?? null,
  };
  if (free) {
    await ctx.runMutation(internal.inference._recordFree, {
      pubkey: args.pubkey,
      refId: args.refId,
      surface: "chat",
      model: usedModel,
      promptTokens: prompt,
      completionTokens: completion,
      costMicroUsd,
      ...routeMeta,
    });
  } else {
    await ctx.runMutation(internal.inference._charge, {
      pubkey: args.pubkey,
      refId: args.refId,
      surface: "chat",
      model: usedModel,
      promptTokens: prompt,
      completionTokens: completion,
      costMicroUsd,
      ...routeMeta,
    });
  }

  return {
    text,
    source: free ? "freetour" : "openrouter",
    modelUsed: usedModel,
    modelRequested: args.model,
    durationMs: Date.now() - started,
    reasoning,
    routeVariant: args.routeVariant,
    fallbackUsed: args.fallbackUsed,
    usage: {
      promptTokens: prompt,
      completionTokens: completion,
      costUsd: costMicroUsd / USD,
      free,
      serviceTier,
      servedServiceTier: json.service_tier ?? null,
    },
  };
}

/** Paid Eliza path — no credit charge; still logged for A/B monitoring. */
export const _recordGatewayProbe = internalMutation({
  args: {
    pubkey: v.string(),
    refId: v.string(),
    model: v.string(),
    routeVariant: v.string(),
    gateway: v.string(),
    fallbackUsed: v.boolean(),
  },
  handler: async (ctx, a) => {
    const existing = await ctx.db
      .query("inferenceUsage")
      .withIndex("by_ref", (q) => q.eq("refId", a.refId))
      .unique();
    if (existing) return;
    await ctx.db.insert("inferenceUsage", {
      pubkey: a.pubkey,
      refId: a.refId,
      surface: "chat",
      model: a.model,
      costMicroUsd: 0,
      priceMicroUsd: 0,
      holderDiscount: false,
      routeVariant: a.routeVariant,
      gateway: a.gateway,
      fallbackUsed: a.fallbackUsed,
      at: Date.now(),
    });
  },
});

async function runElizaChat(
  ctx: MeterCtx,
  args: {
    pubkey: string;
    refId: string;
    model: string;
    messages: Array<{ role: string; content: string }>;
    routeVariant: InferenceRouteVariant;
    fallbackUsed: boolean;
  },
): Promise<ChatCoreResult> {
  const started = Date.now();
  const base = process.env.ELIZACLOUD_API_URL || "https://api.elizacloud.ai";
  const key = process.env.ELIZACLOUD_API_KEY || process.env.ELIZAOS_CLOUD_API_KEY;
  if (!key) throw new Error("ElizaCloud not configured");
  const res = await fetch(`${base.replace(/\/$/, "")}/api/v1/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: args.model, messages: args.messages }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Inference failed (${res.status}): ${t.slice(0, 160)}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string; reasoning?: string; reasoning_content?: string } }>;
    model?: string;
  };
  const rawText = json.choices?.[0]?.message?.content;
  if (typeof rawText !== "string") throw new Error("No text returned");
  const reasoning = extractReasoning(rawText, json.choices?.[0]?.message);
  const text = stripReasoningTags(rawText) || rawText;
  const usedModel = json.model || args.model;
  await ctx.runMutation(internal.inference._recordGatewayProbe, {
    pubkey: args.pubkey,
    refId: args.refId,
    model: usedModel,
    routeVariant: args.routeVariant,
    gateway: "elizacloud",
    fallbackUsed: args.fallbackUsed,
  });
  return {
    text,
    source: "elizacloud",
    modelUsed: usedModel,
    modelRequested: args.model,
    durationMs: Date.now() - started,
    reasoning,
    routeVariant: args.routeVariant,
    fallbackUsed: args.fallbackUsed,
  };
}

/**
 * Run a chat completion + meter it. Paid routes use A/B gateway order with failover.
 * Charging is idempotent by refId. Returns the assistant text.
 */
export const runChat = action({
  args: {
    token: v.string(),
    model: v.string(),
    messages: v.array(v.object({ role: v.string(), content: v.string() })),
    imageUrl: v.optional(v.string()),
    refId: v.string(),
  },
  handler: async (ctx, args): Promise<ChatCoreResult> => {
    return (await ctx.runAction(internal.inference.runChatCore, args)) as ChatCoreResult;
  },
});

export const runChatCore = internalAction({
  args: {
    token: v.string(),
    model: v.string(),
    messages: v.array(v.object({ role: v.string(), content: v.string() })),
    imageUrl: v.optional(v.string()),
    refId: v.string(),
  },
  handler: async (ctx, { token, model, messages, imageUrl, refId }): Promise<ChatCoreResult> => {
    const me = (await ctx.runQuery(api.users.me, { token })) as {
      pubkey: string;
      role: Role;
      plan: OpenRouterPlan;
    } | null;
    if (!me) throw new Error("Not signed in");
    const pubkey = me.pubkey;
    const routeVariant = resolveRouteVariant(pubkey);
    const orKey = !!process.env.OPENROUTER_API_KEY;
    const elizaKey = !!(process.env.ELIZACLOUD_API_KEY || process.env.ELIZAOS_CLOUD_API_KEY);
    const free = freetourActive(model);

    // Free tier always uses OpenRouter's free pool.
    if (free) {
      if (!orKey) throw new Error("Inference isn't configured.");
      return runOpenRouterChat(ctx, {
        pubkey,
        token,
        model,
        messages,
        imageUrl,
        refId,
        role: me.role,
        plan: me.plan,
        routeVariant,
        fallbackUsed: false,
      });
    }

    const flags = (await ctx.runQuery(api.flags.all, {})) as Record<string, boolean>;
    if (!flags.paid_inference_enabled)
      throw new Error("Inference is temporarily paused — please try again shortly.");

    // Vision: prefer OpenRouter (multimodal); Eliza text-only fallback is weak here.
    const order: InferenceGateway[] = imageUrl
      ? gatewayAttemptOrder("openrouter_first", { elizacloud: elizaKey, openrouter: orKey })
      : gatewayAttemptOrder(routeVariant, { elizacloud: elizaKey, openrouter: orKey });

    if (order.length === 0) throw new Error("Inference isn't configured.");

    let lastError: Error | null = null;
    for (let i = 0; i < order.length; i++) {
      const gw = order[i];
      const fallbackUsed = i > 0;
      try {
        if (gw === "openrouter") {
          return await runOpenRouterChat(ctx, {
            pubkey,
            token,
            model,
            messages,
            imageUrl,
            refId,
            role: me.role,
            plan: me.plan,
            routeVariant,
            fallbackUsed,
          });
        }
        return await runElizaChat(ctx, {
          pubkey,
          refId,
          model,
          messages,
          routeVariant,
          fallbackUsed,
        });
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
      }
    }
    throw lastError ?? new Error("Inference failed");
  },
});

/** Admin: A/B gateway monitoring from inferenceUsage (chat surface). */
export const routeMonitor = query({
  args: { token: v.string(), sinceMs: v.optional(v.number()) },
  handler: async (ctx, { token, sinceMs }) => {
    await requireRole(ctx, token, "admin");
    const since = sinceMs ?? Date.now() - 7 * 24 * 60 * 60 * 1000;
    const rows = await ctx.db
      .query("inferenceUsage")
      .withIndex("by_pubkey")
      .collect();
    const chat = rows.filter((r) => r.surface === "chat" && r.at >= since);

    type Bucket = {
      calls: number;
      fallbacks: number;
      byGateway: Record<string, number>;
    };
    const byVariant: Record<string, Bucket> = {};
    const bump = (variant: string, gateway: string | undefined, fallback: boolean) => {
      const v = variant || "unknown";
      byVariant[v] ??= { calls: 0, fallbacks: 0, byGateway: {} };
      byVariant[v].calls += 1;
      if (fallback) byVariant[v].fallbacks += 1;
      const g = gateway ?? "unknown";
      byVariant[v].byGateway[g] = (byVariant[v].byGateway[g] ?? 0) + 1;
    };
    for (const r of chat) {
      bump(r.routeVariant ?? "unknown", r.gateway, r.fallbackUsed === true);
    }
    return {
      since,
      total: chat.length,
      mode: process.env.INFERENCE_ROUTE_MODE ?? "ab",
      byVariant,
    };
  },
});

async function runElizaImage(
  prompt: string,
  elizaKey: string | undefined,
): Promise<{ url: string; source: string }> {
  const base = process.env.ELIZACLOUD_API_URL || "https://api.elizacloud.ai";
  if (!elizaKey) throw new Error("Image generation isn't configured.");
  const res = await fetch(`${base.replace(/\/$/, "")}/api/v1/generate-image`, {
    method: "POST",
    headers: { authorization: `Bearer ${elizaKey}`, "content-type": "application/json" },
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
}

/**
 * Generate an image via OpenRouter (same /chat/completions endpoint, modalities
 * ["image","text"]). Returns a data URL. Metered from usage.cost like chat —
 * one gateway for chat + image (OpenRouter now does media; no Fal needed). Falls
 * back to ElizaCloud /api/v1/generate-image when OPENROUTER_API_KEY is unset.
 */
export const runImage = action({
  args: { token: v.string(), model: v.optional(v.string()), prompt: v.string(), refId: v.string() },
  handler: async (ctx, { token, model, prompt, refId }): Promise<{ url: string; source: string }> => {
    const me = (await ctx.runQuery(api.users.me, { token })) as {
      pubkey: string;
      role: Role;
      plan: OpenRouterPlan;
    } | null;
    if (!me) throw new Error("Not signed in");
    const pubkey = me.pubkey;
    const orKey = process.env.OPENROUTER_API_KEY;
    const elizaKey = process.env.ELIZACLOUD_API_KEY || process.env.ELIZAOS_CLOUD_API_KEY;
    if (orKey) {
      const flags = (await ctx.runQuery(api.flags.all, {})) as Record<string, boolean>;
      if (!flags.image_generation_enabled)
        throw new Error("Image generation is temporarily unavailable.");
      if (!flags.paid_inference_enabled)
        throw new Error("Image generation is temporarily paused — please try again shortly.");
      const gate = (await ctx.runQuery(api.inference.canInfer, { token })) as { ok: boolean; reason?: string };
      if (!gate.ok) throw new Error(gate.reason === "out of credits" ? "Out of credits — top up to generate." : "Cannot run inference.");
      const requestClass = openRouterRequestClass({
        free: false,
        role: me.role,
        plan: me.plan,
      });
      let openRouterGate: { serviceTier: OpenRouterServiceTier } | null = null;
      try {
        openRouterGate = await assessOpenRouterRequest(ctx, orKey, requestClass);
      } catch (e) {
        if (!elizaKey) throw e;
      }
      if (!openRouterGate) {
        return await runElizaImage(prompt, elizaKey);
      }
      const usedModel = model && model !== "Auto" && model !== "auto" ? model : "google/gemini-2.5-flash-image";
      const serviceTier = openRouterGate.serviceTier;
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
          service_tier: serviceTier,
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
        service_tier?: string | null;
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
        serviceTier,
        servedServiceTier: json.service_tier ?? null,
      });
      return { url, source: "openrouter" };
    }

    const flags = (await ctx.runQuery(api.flags.all, {})) as Record<string, boolean>;
    if (!flags.image_generation_enabled)
      throw new Error("Image generation is temporarily unavailable.");
    if (!flags.paid_inference_enabled)
      throw new Error("Image generation is temporarily paused — please try again shortly.");

    return await runElizaImage(prompt, elizaKey);
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
    if (!flags.tts_enabled) throw new Error("Voice / text-to-speech is temporarily unavailable.");

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
