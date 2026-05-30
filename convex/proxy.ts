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
