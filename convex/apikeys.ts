import { v } from "convex/values";
import { type Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx, mutation, query } from "./_generated/server";
import { apiTokens } from "./componentApiTokens";
import { logEvent } from "./events";
import { legacyApiKeyHash } from "./mcpAuth";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

async function sessionPubkey(ctx: QueryCtx | MutationCtx, token: string): Promise<string | null> {
  const s = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!s || s.expiresAt < Date.now()) return null;
  return s.pubkey;
}

export type ApiKeyRow = {
  id: string;
  label: string;
  masked: string;
  createdAt: number;
  lastUsedAt: number | null;
  legacy: boolean;
};

/** List API keys: component tokens (`sk_*`) + legacy `dt_live_*` rows (revoke-only). */
export const list = query({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<ApiKeyRow[]> => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) return [];

    const [modern, legacy] = await Promise.all([
      apiTokens.list(ctx, { namespace: pubkey, includeRevoked: false }),
      ctx.db
        .query("apiKeys")
        .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
        .collect(),
    ]);

    const rows: ApiKeyRow[] = modern
      .filter((t) => !t.revoked)
      .map((t) => ({
        id: t.tokenId,
        label: t.name ?? "API key",
        masked: t.tokenPrefix,
        createdAt: t.createdAt,
        lastUsedAt: t.lastUsedAt ?? null,
        legacy: false,
      }));

    for (const r of legacy.filter((x) => !x.revoked)) {
      rows.push({
        id: r._id,
        label: `${r.label} (legacy)`,
        masked: `${r.prefix}••••••••`,
        createdAt: r.createdAt,
        lastUsedAt: r.lastUsedAt ?? null,
        legacy: true,
      });
    }

    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Mint a component API token (`sk_*`). Plaintext shown once. */
export const create = mutation({
  args: { token: v.string(), label: v.string() },
  handler: async (ctx, { token, label }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) throw new Error("Not signed in");
    if (!process.env.API_TOKENS_ENCRYPTION_KEY) {
      throw new Error(
        "API token encryption is not configured. Run scripts/generate-api-tokens-key.sh and set API_TOKENS_ENCRYPTION_KEY on the deployment.",
      );
    }
    const result = await apiTokens.create(ctx, {
      namespace: pubkey,
      name: label.trim() || "API key",
      metadata: { scopes: ["api", "mcp"] },
      expiresAt: Date.now() + NINETY_DAYS_MS,
      maxIdleMs: 30 * 24 * 60 * 60 * 1000,
    });
    await logEvent(ctx, "apikey.create", { pubkey, data: { prefix: result.tokenPrefix } });
    return { key: result.token };
  },
});

/** Revoke a modern (`tokenId`) or legacy (`apiKeys` id) key. */
export const revoke = mutation({
  args: { token: v.string(), id: v.string() },
  handler: async (ctx, { token, id }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) throw new Error("Not signed in");

    const legacy = await ctx.db.get(id as Id<"apiKeys">);
    if (legacy) {
      if (legacy.pubkey !== pubkey) throw new Error("Not found");
      await ctx.db.patch(legacy._id, { revoked: true });
      await logEvent(ctx, "apikey.revoke", { pubkey, data: { prefix: legacy.prefix, legacy: true } });
      return { ok: true };
    }

    const tokens = await apiTokens.list(ctx, { namespace: pubkey, includeRevoked: true });
    if (!tokens.some((t) => t.tokenId === id)) throw new Error("Not found");
    await apiTokens.invalidateById(ctx, { tokenId: id });
    await logEvent(ctx, "apikey.revoke", { pubkey, data: { tokenId: id } });
    return { ok: true };
  },
});

/** @internal Validate programmatic access (HTTP/MCP). */
export async function validateProgrammaticBearer(
  ctx: QueryCtx | MutationCtx,
  bearer: string,
): Promise<string | null> {
  if (bearer.startsWith("sk_")) {
    const validated = await apiTokens.validate(ctx, { token: bearer });
    return validated.ok && validated.namespace ? String(validated.namespace) : null;
  }
  if (bearer.startsWith("dt_live_")) {
    const body = bearer.slice("dt_live_".length);
    const prefix = `dt_live_${body.slice(0, 4)}`;
    const hash = legacyApiKeyHash(bearer);
    const candidates = await ctx.db
      .query("apiKeys")
      .withIndex("by_prefix", (q) => q.eq("prefix", prefix))
      .collect();
    const row = candidates.find((r) => !r.revoked && r.keyHash === hash);
    if (row) {
      await ctx.db.patch(row._id, { lastUsedAt: Date.now() });
      return row.pubkey;
    }
  }
  return null;
}
