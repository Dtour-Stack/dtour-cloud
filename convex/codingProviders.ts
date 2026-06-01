import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { UI_PROVIDER_ROWS } from "./codingProviderTypes";

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

const providerValidator = v.union(
  v.literal("openrouter"),
  v.literal("openai"),
  v.literal("anthropic"),
);

/** Which provider keys the user has saved (no plaintext). */
export const listKeys = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) return null;
    const rows = await ctx.db
      .query("codingProviderSecrets")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .collect();
    const byStorage = new Map(rows.map((r) => [r.provider, r]));
    return UI_PROVIDER_ROWS.map(({ id, storageKey }) => {
      const row = byStorage.get(storageKey);
      return {
        id,
        configured: !!row,
        prefix: row?.prefix ?? null,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  },
});

export const clearKey = mutation({
  args: { token: v.string(), provider: providerValidator },
  handler: async (ctx, { token, provider }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) throw new Error("Not signed in");
    const row = await ctx.db
      .query("codingProviderSecrets")
      .withIndex("by_pubkey_provider", (q) =>
        q.eq("pubkey", pubkey).eq("provider", provider),
      )
      .unique();
    if (row) await ctx.db.delete(row._id);
  },
});

export const resolvePubkey = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => sessionPubkey(ctx, token),
});

export const upsertSecret = internalMutation({
  args: {
    pubkey: v.string(),
    provider: v.string(),
    ciphertext: v.string(),
    iv: v.string(),
    prefix: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("codingProviderSecrets")
      .withIndex("by_pubkey_provider", (q) =>
        q.eq("pubkey", args.pubkey).eq("provider", args.provider),
      )
      .unique();
    const patch = {
      ciphertext: args.ciphertext,
      iv: args.iv,
      prefix: args.prefix,
      updatedAt: Date.now(),
    };
    if (existing) await ctx.db.patch(existing._id, patch);
    else
      await ctx.db.insert("codingProviderSecrets", {
        pubkey: args.pubkey,
        provider: args.provider,
        ...patch,
      });
  },
});

export const secretsForPubkey = internalQuery({
  args: { pubkey: v.string() },
  handler: async (ctx, { pubkey }) => {
    return ctx.db
      .query("codingProviderSecrets")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .collect();
  },
});
