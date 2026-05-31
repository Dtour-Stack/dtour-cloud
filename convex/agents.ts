import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { getConfig } from "./config_read";
import { logEvent } from "./events";
import { resolveRole } from "./rbac";

const HISTORY_LIMIT = 20;

export const list = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) return [];
    const rows = await ctx.db
      .query("agents")
      .withIndex("by_owner", (q) => q.eq("owner", caller.pubkey))
      .order("desc")
      .collect();
    return rows.map((a) => ({
      id: a._id,
      name: a.name,
      description: a.description ?? null,
      model: a.model,
      type: a.type,
      createdAt: a.createdAt,
      plugins: a.plugins ?? [],
      published: a.published ?? false,
      priceUsd: a.priceUsd ?? null,
    }));
  },
});

export const get = query({
  args: { token: v.string(), id: v.id("agents") },
  handler: async (ctx, { token, id }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) return null;
    const a = await ctx.db.get(id);
    if (!a || a.owner !== caller.pubkey) return null;
    return {
      id: a._id,
      name: a.name,
      description: a.description ?? null,
      systemPrompt: a.systemPrompt,
      model: a.model,
      type: a.type,
    };
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    systemPrompt: v.string(),
    model: v.optional(v.string()),
    plugins: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { token, name, description, systemPrompt, model, plugins }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) throw new Error("Not authenticated");
    if (!name.trim()) throw new Error("Agent name is required");
    const id = await ctx.db.insert("agents", {
      owner: caller.pubkey,
      name: name.trim(),
      description: description?.trim() || undefined,
      systemPrompt: systemPrompt.trim() || "You are a helpful assistant.",
      model: model?.trim() || "auto",
      type: "lightweight",
      createdAt: Date.now(),
      plugins: plugins && plugins.length ? plugins : undefined,
    });
    await logEvent(ctx, "agent.create", { pubkey: caller.pubkey, data: { id, name } });
    return { id };
  },
});

export const setModel = mutation({
  args: { token: v.string(), id: v.id("agents"), model: v.string() },
  handler: async (ctx, { token, id, model }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) throw new Error("Not authenticated");
    const a = await ctx.db.get(id);
    if (!a || a.owner !== caller.pubkey) throw new Error("Not found");
    await ctx.db.patch(id, { model: model.trim() || "auto" });
    return { ok: true };
  },
});

/** Set the plugins attached to an agent (the builders' multi-attach). */
export const setPlugins = mutation({
  args: { token: v.string(), id: v.id("agents"), plugins: v.array(v.string()) },
  handler: async (ctx, { token, id, plugins }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) throw new Error("Not authenticated");
    const a = await ctx.db.get(id);
    if (!a || a.owner !== caller.pubkey) throw new Error("Not found");
    await ctx.db.patch(id, { plugins: plugins.length ? plugins : undefined });
    return { ok: true };
  },
});

/** Publish/unpublish an agent as a monetized app (My Apps). */
export const setApp = mutation({
  args: {
    token: v.string(),
    id: v.id("agents"),
    published: v.boolean(),
    priceUsd: v.optional(v.number()),
  },
  handler: async (ctx, { token, id, published, priceUsd }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) throw new Error("Not authenticated");
    const a = await ctx.db.get(id);
    if (!a || a.owner !== caller.pubkey) throw new Error("Not found");
    await ctx.db.patch(id, { published, priceUsd: priceUsd && priceUsd > 0 ? priceUsd : undefined });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { token: v.string(), id: v.id("agents") },
  handler: async (ctx, { token, id }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) throw new Error("Not authenticated");
    const a = await ctx.db.get(id);
    if (!a || a.owner !== caller.pubkey) throw new Error("Not found");
    const msgs = await ctx.db
      .query("agentMessages")
      .withIndex("by_agent", (q) => q.eq("agentId", id))
      .collect();
    for (const m of msgs) await ctx.db.delete(m._id);
    await ctx.db.delete(id);
    return { ok: true };
  },
});

export const messages = query({
  args: { token: v.string(), agentId: v.id("agents") },
  handler: async (ctx, { token, agentId }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) return [];
    const a = await ctx.db.get(agentId);
    if (!a || a.owner !== caller.pubkey) return [];
    const rows = await ctx.db
      .query("agentMessages")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .order("asc")
      .collect();
    return rows.map((m) => ({ id: m._id, role: m.role, content: m.content, at: m.at }));
  },
});

export const clearChat = mutation({
  args: { token: v.string(), agentId: v.id("agents") },
  handler: async (ctx, { token, agentId }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) throw new Error("Not authenticated");
    const a = await ctx.db.get(agentId);
    if (!a || a.owner !== caller.pubkey) throw new Error("Not found");
    const msgs = await ctx.db
      .query("agentMessages")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .collect();
    for (const m of msgs) await ctx.db.delete(m._id);
    return { ok: true };
  },
});

// ── internal helpers for the chat action ──
export const forChat = internalQuery({
  args: { token: v.string(), agentId: v.id("agents") },
  handler: async (ctx, { token, agentId }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) return null;
    const a = await ctx.db.get(agentId);
    if (!a || a.owner !== caller.pubkey) return null;
    const rows = await ctx.db
      .query("agentMessages")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .order("desc")
      .take(HISTORY_LIMIT);
    // "auto" / empty → route to the admin-set default, else ElizaCloud's free model.
    const routed =
      a.model && a.model !== "auto"
        ? a.model
        : (await getConfig(ctx, "default_chat_model", "")) ||
          "openai/gpt-oss-120b:free";
    return {
      owner: caller.pubkey,
      model: routed,
      systemPrompt: a.systemPrompt,
      baseUrl: await getConfig(
        ctx,
        "elizacloud_base_url", "https://api.elizacloud.ai",
      ),
      history: rows.reverse().map((m) => ({ role: m.role, content: m.content })),
    };
  },
});

// One-off cleanup: agents created under the old hardcoded fallback got a stale,
// non-routable model id. Reset those to "auto" so routing takes over.
const STALE_MODELS = new Set(["gpt-4o-mini", "gpt-4o", "claude-3-5-sonnet"]);
export const migrateStaleModels = internalMutation({
  args: {},
  handler: async (ctx) => {
    let migrated = 0;
    for (const a of await ctx.db.query("agents").collect()) {
      if (STALE_MODELS.has(a.model)) {
        await ctx.db.patch(a._id, { model: "auto" });
        migrated++;
      }
    }
    return { migrated };
  },
});

export const addMessage = internalMutation({
  args: {
    agentId: v.id("agents"),
    owner: v.string(),
    role: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("agentMessages", { ...args, at: Date.now() });
  },
});

export const startAssistantMessage = internalMutation({
  args: { agentId: v.id("agents"), owner: v.string() },
  handler: async (ctx, { agentId, owner }) => {
    return await ctx.db.insert("agentMessages", {
      agentId,
      owner,
      role: "assistant",
      content: "",
      at: Date.now(),
    });
  },
});

export const setMessageContent = internalMutation({
  args: { id: v.id("agentMessages"), content: v.string() },
  handler: async (ctx, { id, content }) => {
    await ctx.db.patch(id, { content });
  },
});

export const modelEnv = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) return null;
    return {
      baseUrl: await getConfig(
        ctx,
        "elizacloud_base_url", "https://api.elizacloud.ai",
      ),
    };
  },
});

/** Send a message to a lightweight agent. Inference is STREAMED from
 *  ElizaCloud's OpenAI-compatible endpoint: the assistant message doc is
 *  patched as tokens arrive, so the reactive query renders them live. */
export const chat = action({
  args: { token: v.string(), agentId: v.id("agents"), message: v.string() },
  handler: async (ctx, { token, agentId, message }) => {
    if (!message.trim()) throw new Error("Empty message");
    const data = await ctx.runQuery(internal.agents.forChat, { token, agentId });
    if (!data) throw new Error("Agent not found");

    await ctx.runMutation(internal.agents.addMessage, {
      agentId,
      owner: data.owner,
      role: "user",
      content: message.trim(),
    });
    const asstId = await ctx.runMutation(internal.agents.startAssistantMessage, {
      agentId,
      owner: data.owner,
    });

    const apiKey = process.env.ELIZACLOUD_API_KEY || process.env.ELIZAOS_CLOUD_API_KEY;
    if (!apiKey) {
      await ctx.runMutation(internal.agents.setMessageContent, {
        id: asstId,
        content:
          "⚠️ Chat isn't configured yet. An admin needs to set ELIZAOS_CLOUD_API_KEY on the Convex deployment.",
      });
      return { ok: true };
    }

    try {
      // ElizaCloud OpenAI-compatible endpoint: POST /api/v1/chat/completions
      // (verified live with an eliza_ API key). Non-streaming for reliability —
      // one request, parse choices[0].message.content, write the full reply.
      const res = await fetch(`${data.baseUrl}/api/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: data.model && data.model !== "auto" ? data.model : "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: data.systemPrompt },
            ...data.history,
            { role: "user", content: message.trim() },
          ],
        }),
      });
      if (!res.ok) {
        throw new Error(`Inference failed (${res.status})`);
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const reply = json.choices?.[0]?.message?.content;
      await ctx.runMutation(internal.agents.setMessageContent, {
        id: asstId,
        content: typeof reply === "string" && reply ? reply : "(no response)",
      });
    } catch (e) {
      await ctx.runMutation(internal.agents.setMessageContent, {
        id: asstId,
        content: `⚠️ ${e instanceof Error ? e.message : "Inference error"}`,
      });
    }
    return { ok: true };
  },
});

/** ElizaCloud's live model catalog, labeled "Detour Cloud" so users can tell
 *  these apart from their own agents / HuggingFace models. Returns [] when the
 *  catalog can't be reached — the UI defaults to Auto routing, so users never
 *  have to pick a model. */
export const listModels = action({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<
    Array<{ id: string; source: string }>
  > => {
    const ctxData = await ctx.runQuery(internal.agents.modelEnv, { token });
    if (!ctxData) return [];
    const apiKey = process.env.ELIZACLOUD_API_KEY || process.env.ELIZAOS_CLOUD_API_KEY;
    if (!apiKey) return [];
    try {
      const res = await fetch(`${ctxData.baseUrl}/api/v1/models`, {
        headers: { authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) return [];
      const json = await res.json();
      const ids: string[] = (json.data ?? json.models ?? [])
        .map((m: { id?: string; name?: string }) => m.id ?? m.name)
        .filter(Boolean);
      return ids.map((id) => ({ id, source: "Detour Cloud" }));
    } catch {
      return [];
    }
  },
});
