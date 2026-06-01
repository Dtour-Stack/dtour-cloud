import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { apiTokens } from "./componentApiTokens";

/** Legacy djb2 hash — matches pre-component `apikeys.ts` rows. */
export function legacyApiKeyHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

export type ResolvedBearer =
  | { subject: string; kind: "session" | "api" | "legacy_api" }
  | null;

/** Resolve a bearer secret to a wallet pubkey (session, sk_*, or legacy dt_live_*). */
export const resolveBearer = internalMutation({
  args: { bearer: v.string() },
  handler: async (ctx, { bearer }): Promise<ResolvedBearer> => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", bearer))
      .unique();
    if (session && session.expiresAt >= Date.now()) {
      return { subject: session.pubkey, kind: "session" };
    }

    if (bearer.startsWith("sk_")) {
      const validated = await apiTokens.validate(ctx, { token: bearer });
      if (validated.ok && validated.namespace) {
        return { subject: String(validated.namespace), kind: "api" };
      }
      return null;
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
        return { subject: row.pubkey, kind: "legacy_api" };
      }
    }

    return null;
  },
});
