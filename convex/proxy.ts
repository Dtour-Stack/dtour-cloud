import { v } from "convex/values";
import { api } from "./_generated/api";
import { action } from "./_generated/server";

// The ElizaCloud API proxy layer. Forwards a request to ElizaCloud's API with a
// server-side key (never exposed to the browser), so the API Explorer "Try it"
// and other proxied surfaces light up the moment these env vars are set:
//   ELIZACLOUD_API_URL  (e.g. https://api.elizacloud.ai)
//   ELIZACLOUD_API_KEY  (server-side secret)
// Pure V8 (fetch only) — runs in the standard Convex runtime.

export const status = action({
  args: {},
  handler: async (): Promise<{ configured: boolean; base: string | null }> => {
    const base = process.env.ELIZACLOUD_API_URL || "";
    return { configured: !!base && !!process.env.ELIZACLOUD_API_KEY, base: base || null };
  },
});

export const forward = action({
  args: {
    token: v.string(),
    method: v.string(),
    path: v.string(),
    body: v.optional(v.string()), // JSON string
  },
  handler: async (
    ctx,
    { token, method, path, body },
  ): Promise<{ ok: boolean; status?: number; data?: string; reason?: string }> => {
    // Require a signed-in Detour session.
    const me = (await ctx.runQuery(api.users.me, { token })) as { pubkey: string } | null;
    if (!me) return { ok: false, reason: "not signed in" };

    const base = process.env.ELIZACLOUD_API_URL;
    const key = process.env.ELIZACLOUD_API_KEY;
    if (!base || !key) {
      return { ok: false, reason: "ElizaCloud proxy not configured (set ELIZACLOUD_API_URL + ELIZACLOUD_API_KEY)" };
    }
    try {
      // Model 1 (biller): all inference flows under Detour's single ElizaCloud
      // org/key. ElizaCloud attributes affiliates at SIGNUP (/api/v1/affiliates
      // + /affiliates/link), not per-request — so no affiliate header here.
      const res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
        method: method.toUpperCase(),
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: body && method.toUpperCase() !== "GET" ? body : undefined,
      });
      const text = await res.text();
      return { ok: res.ok, status: res.status, data: text.slice(0, 20000) };
    } catch (e) {
      return { ok: false, reason: String(e).slice(0, 200) };
    }
  },
});

/** Read the white-label affiliate's real ElizaCloud referral record
 *  (GET /api/v1/referrals → { code, total_referrals, is_active }). Returns
 *  configured:false until the proxy env is set. Pure V8. */
export const referral = action({
  args: { token: v.string() },
  handler: async (
    ctx,
    { token },
  ): Promise<{
    configured: boolean;
    code?: string;
    totalReferrals?: number;
    isActive?: boolean;
  }> => {
    const me = (await ctx.runQuery(api.users.me, { token })) as { pubkey: string } | null;
    if (!me) return { configured: false };
    const base = process.env.ELIZACLOUD_API_URL;
    const key = process.env.ELIZACLOUD_API_KEY;
    if (!base || !key) return { configured: false };
    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/api/v1/referrals`, {
        headers: { authorization: `Bearer ${key}` },
      });
      if (!res.ok) return { configured: true };
      const j = (await res.json()) as {
        code?: string;
        total_referrals?: number;
        is_active?: boolean;
      };
      return {
        configured: true,
        code: typeof j.code === "string" ? j.code : undefined,
        totalReferrals: typeof j.total_referrals === "number" ? j.total_referrals : undefined,
        isActive: typeof j.is_active === "boolean" ? j.is_active : undefined,
      };
    } catch {
      return { configured: true };
    }
  },
});
