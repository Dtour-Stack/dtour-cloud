import { v } from "convex/values";
import { type MutationCtx, type QueryCtx, mutation, query } from "./_generated/server";
import { logEvent } from "./events";

async function sessionPubkey(ctx: QueryCtx | MutationCtx, token: string): Promise<string | null> {
  const s = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!s || s.expiresAt < Date.now()) return null;
  return s.pubkey;
}

// Non-reversible lookup hash for the stored secret (never store plaintext). djb2
// — adequate for "can't recover the key from the row"; a future hardening could
// swap to SHA-256 via crypto.subtle in an action.
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

/** List the user's API keys (masked — the secret is shown only once at create). */
export const list = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) return [];
    const rows = await ctx.db
      .query("apiKeys")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .collect();
    return rows
      .filter((r) => !r.revoked)
      .map((r) => ({
        id: r._id,
        label: r.label,
        masked: `${r.prefix}••••••••`,
        createdAt: r.createdAt,
        lastUsedAt: r.lastUsedAt ?? null,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** Mint a new key. Returns the FULL secret ONCE — only a hash is stored. */
export const create = mutation({
  args: { token: v.string(), label: v.string() },
  handler: async (ctx, { token, label }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) throw new Error("Not signed in");
    const rand = crypto.randomUUID().replace(/-/g, "");
    const key = `dt_live_${rand}`;
    const prefix = `dt_live_${rand.slice(0, 4)}`;
    await ctx.db.insert("apiKeys", {
      pubkey,
      label: label.trim() || "API key",
      keyHash: hash(key),
      prefix,
      createdAt: Date.now(),
    });
    await logEvent(ctx, "apikey.create", { pubkey, data: { prefix } });
    return { key }; // shown once, never returned again
  },
});

/** Revoke a key (only the owner's). */
export const revoke = mutation({
  args: { token: v.string(), id: v.id("apiKeys") },
  handler: async (ctx, { token, id }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) throw new Error("Not signed in");
    const row = await ctx.db.get(id);
    if (!row || row.pubkey !== pubkey) throw new Error("Not found");
    await ctx.db.patch(id, { revoked: true });
    await logEvent(ctx, "apikey.revoke", { pubkey, data: { prefix: row.prefix } });
    return { ok: true };
  },
});
