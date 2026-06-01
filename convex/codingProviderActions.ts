"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import {
  decryptProviderSecret,
  encryptProviderSecret,
} from "./codingProviderCrypto";
import { UI_PROVIDER_ROWS } from "./codingProviderTypes";

function storageKeyForUi(ui: string): "openrouter" | "openai" | "anthropic" {
  const row = UI_PROVIDER_ROWS.find((r) => r.id === ui);
  if (!row) throw new Error("Unknown provider");
  return row.storageKey;
}

const providerValidator = v.union(
  v.literal("openrouter"),
  v.literal("openai"),
  v.literal("anthropic"),
);

function prefixForKey(key: string): string {
  const t = key.trim();
  if (t.length <= 12) return "••••";
  return `${t.slice(0, 8)}…${t.slice(-4)}`;
}

/** Save a provider API key (encrypted). Shown once in the UI — never returned again. */
export const setKey = action({
  args: {
    token: v.string(),
    provider: providerValidator,
    apiKey: v.string(),
  },
  handler: async (ctx, { token, provider, apiKey }) => {
    const trimmed = apiKey.trim();
    if (!trimmed) throw new Error("API key is empty");
    const pubkey = await ctx.runQuery(internal.codingProviders.resolvePubkey, { token });
    if (!pubkey) throw new Error("Not signed in");
    const { ciphertext, iv } = encryptProviderSecret(trimmed);
    await ctx.runMutation(internal.codingProviders.upsertSecret, {
      pubkey,
      provider,
      ciphertext,
      iv,
      prefix: prefixForKey(trimmed),
    });
    return { ok: true as const };
  },
});

/** Set key from UI provider tab id (opencode | codex | claude | pi). */
export const setKeyForUi = action({
  args: {
    token: v.string(),
    uiProvider: v.union(
      v.literal("opencode"),
      v.literal("codex"),
      v.literal("claude"),
      v.literal("pi"),
    ),
    apiKey: v.string(),
  },
  handler: async (ctx, args) => {
    const trimmed = args.apiKey.trim();
    if (!trimmed) throw new Error("API key is empty");
    const pubkey = await ctx.runQuery(internal.codingProviders.resolvePubkey, {
      token: args.token,
    });
    if (!pubkey) throw new Error("Not signed in");
    const provider = storageKeyForUi(args.uiProvider);
    const { ciphertext, iv } = encryptProviderSecret(trimmed);
    await ctx.runMutation(internal.codingProviders.upsertSecret, {
      pubkey,
      provider,
      ciphertext,
      iv,
      prefix: prefixForKey(trimmed),
    });
    return { ok: true as const };
  },
});

/** Decrypt saved keys for sandbox env injection (browser WASM session only). */
export const sessionEnvForSandbox = action({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const pubkey = await ctx.runQuery(internal.codingProviders.resolvePubkey, { token });
    if (!pubkey) return null;
    const rows = await ctx.runQuery(internal.codingProviders.secretsForPubkey, { pubkey });
    const env: Record<string, string> = {};
    for (const row of rows) {
      const plain = decryptProviderSecret(row.ciphertext, row.iv);
      if (row.provider === "openrouter") env.OPENROUTER_API_KEY = plain;
      if (row.provider === "openai") env.OPENAI_API_KEY = plain;
      if (row.provider === "anthropic") env.ANTHROPIC_API_KEY = plain;
    }
    return env;
  },
});

/** Relay-only: decrypt keys for E2B bootstrap (never expose to the browser). */
export const sessionEnvForRelay = action({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const pubkey = await ctx.runQuery(internal.codingProviders.resolvePubkey, { token });
    if (!pubkey) return null;
    const rows = await ctx.runQuery(internal.codingProviders.secretsForPubkey, { pubkey });
    const env: Record<string, string> = {};
    for (const row of rows) {
      const plain = decryptProviderSecret(row.ciphertext, row.iv);
      if (row.provider === "openrouter") env.OPENROUTER_API_KEY = plain;
      if (row.provider === "openai") env.OPENAI_API_KEY = plain;
      if (row.provider === "anthropic") env.ANTHROPIC_API_KEY = plain;
    }
    return env;
  },
});
