import { createThread, listMessages } from "@convex-dev/agent";
import { start } from "@convex-dev/workflow";
import { v } from "convex/values";
import { api, components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { previewText } from "./agentTrace";
import { getConfig } from "./config_read";
import { logEvent } from "./events";
import { listFreeModelOptions } from "./freeModels";
import { resolveRole } from "./rbac";

const HISTORY_LIMIT = 20;
const MESSAGE_PAGE = 200;

function previewMessage(content: string): string {
  const t = content.trim().replace(/\s+/g, " ");
  if (!t) return "";
  return t.length > 72 ? `${t.slice(0, 72)}…` : t;
}

async function requireOwnedAgent(
  ctx: QueryCtx | MutationCtx,
  callerPubkey: string,
  agentId: Id<"agents">,
) {
  const a = await ctx.db.get(agentId);
  if (!a || a.owner !== callerPubkey) return null;
  return a;
}

function legacyChatMessages(ctx: QueryCtx | MutationCtx, chatId: Id<"agentChats">) {
  return ctx.db.query("agentMessages").withIndex("by_chat", (q) => q.eq("chatId", chatId));
}

async function requireOwnedChat(
  ctx: QueryCtx | MutationCtx,
  callerPubkey: string,
  chatId: Id<"agentChats">,
) {
  const chat = await ctx.db.get(chatId);
  if (!chat || chat.owner !== callerPubkey) return null;
  const agent = await requireOwnedAgent(ctx, callerPubkey, chat.agentId);
  if (!agent) return null;
  return chat;
}

async function ensureChatThread(
  ctx: MutationCtx,
  chatId: Id<"agentChats">,
  owner: string,
) {
  return await ctx.runMutation(internal.agentComponentStore.ensureThreadId, {
    chatId,
    owner,
  });
}

async function lastPreviewForChat(ctx: QueryCtx, chat: { threadId?: string }) {
  if (chat.threadId) {
    const { page } = await listMessages(ctx, components.agent, {
      threadId: chat.threadId,
      paginationOpts: { numItems: 1, cursor: null },
      excludeToolMessages: true,
    });
    const last = page[0];
    if (last) return previewMessage(last.text ?? "");
  }
  return null;
}

async function listDurableMessages(ctx: QueryCtx, threadId: string) {
  const { page } = await listMessages(ctx, components.agent, {
    threadId,
    paginationOpts: { numItems: MESSAGE_PAGE, cursor: null },
    excludeToolMessages: true,
  });
  const chronological = [...page].reverse();
  const ids = chronological.map((m) => m._id);
  const traces = new Map<string, string>();
  const extras = new Map<string, string>();
  await Promise.all(
    ids.map(async (id) => {
      const t = await ctx.db
        .query("agentTurnTraces")
        .withIndex("by_message", (q) => q.eq("messageId", id))
        .unique();
      if (t) traces.set(id, t.trace);
      const ex = await ctx.db
        .query("agentMessageExtras")
        .withIndex("by_message", (q) => q.eq("messageId", id))
        .unique();
      if (ex?.imageUrl) extras.set(id, ex.imageUrl);
    }),
  );
  return chronological
    .filter((m) => m.message.role === "user" || m.message.role === "assistant")
    .map((m) => ({
      id: m._id,
      role: m.message.role as string,
      content: m.text ?? "",
      imageUrl: extras.get(m._id) ?? null,
      trace: traces.get(m._id) ?? null,
      at: m._creationTime,
      pending: m.status === "pending",
    }));
}

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
    const enriched = await Promise.all(
      rows.map(async (a) => {
        const chats = await ctx.db
          .query("agentChats")
          .withIndex("by_agent_owner", (q) =>
            q.eq("agentId", a._id).eq("owner", caller.pubkey),
          )
          .collect();
        const latestChat = chats.sort((x, y) => y.updatedAt - x.updatedAt)[0];
        const previewFromThread = latestChat
          ? await lastPreviewForChat(ctx, latestChat)
          : null;
        const lastLegacy = latestChat
          ? await legacyChatMessages(ctx, latestChat._id).order("desc").first()
          : await ctx.db
              .query("agentMessages")
              .withIndex("by_agent_owner", (q) =>
                q.eq("agentId", a._id).eq("owner", caller.pubkey),
              )
              .order("desc")
              .first();
        const lastPreview =
          previewFromThread ??
          (lastLegacy ? previewMessage(lastLegacy.content) : null);
        return {
          id: a._id,
          name: a.name,
          description: a.description ?? null,
          model: a.model,
          type: a.type,
          createdAt: a.createdAt,
          plugins: a.plugins ?? [],
          published: a.published ?? false,
          priceUsd: a.priceUsd ?? null,
          lastChatAt: lastLegacy?.at ?? latestChat?.updatedAt ?? a.createdAt,
          lastPreview,
        };
      }),
    );
    return enriched.sort((a, b) => b.lastChatAt - a.lastChatAt);
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
      plugins: a.plugins ?? [],
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
    await ctx.scheduler.runAfter(0, internal.knowledge.syncAgentInstructions, { agentId: id });
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
    const chats = await ctx.db
      .query("agentChats")
      .withIndex("by_agent_owner", (q) => q.eq("agentId", id).eq("owner", caller.pubkey))
      .collect();
    for (const c of chats) {
      if (c.threadId) {
        await ctx.runMutation(internal.agentComponentStore.deleteThread, {
          threadId: c.threadId,
        });
      }
      const msgs = await legacyChatMessages(ctx, c._id).collect();
      for (const m of msgs) await ctx.db.delete(m._id);
      await ctx.db.delete(c._id);
    }
    const msgs = await ctx.db
      .query("agentMessages")
      .withIndex("by_agent", (q) => q.eq("agentId", id))
      .collect();
    for (const m of msgs) await ctx.db.delete(m._id);
    await ctx.db.delete(id);
    return { ok: true };
  },
});

export const listChats = query({
  args: { token: v.string(), agentId: v.id("agents") },
  handler: async (ctx, { token, agentId }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) return [];
    if (!(await requireOwnedAgent(ctx, caller.pubkey, agentId))) return [];
    const rows = await ctx.db
      .query("agentChats")
      .withIndex("by_agent_owner", (q) =>
        q.eq("agentId", agentId).eq("owner", caller.pubkey),
      )
      .collect();
    return rows
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((c) => ({
        id: c._id,
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }));
  },
});

export const getOrCreateDefaultChat = mutation({
  args: { token: v.string(), agentId: v.id("agents") },
  handler: async (ctx, { token, agentId }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) throw new Error("Not authenticated");
    if (!(await requireOwnedAgent(ctx, caller.pubkey, agentId))) {
      throw new Error("Not found");
    }
    const existing = await ctx.db
      .query("agentChats")
      .withIndex("by_agent_owner", (q) =>
        q.eq("agentId", agentId).eq("owner", caller.pubkey),
      )
      .collect();
    if (existing.length > 0) {
      const chat = existing.sort((a, b) => b.updatedAt - a.updatedAt)[0];
      await ensureChatThread(ctx, chat._id, caller.pubkey);
      return { chatId: chat._id, created: false };
    }
    const now = Date.now();
    const threadId = await createThread(ctx, components.agent, {
      userId: caller.pubkey,
      title: "New chat",
    });
    const chatId = await ctx.db.insert("agentChats", {
      agentId,
      owner: caller.pubkey,
      title: "New chat",
      threadId,
      createdAt: now,
      updatedAt: now,
    });
    return { chatId, created: true };
  },
});

export const createChat = mutation({
  args: { token: v.string(), agentId: v.id("agents"), title: v.optional(v.string()) },
  handler: async (ctx, { token, agentId, title }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) throw new Error("Not authenticated");
    if (!(await requireOwnedAgent(ctx, caller.pubkey, agentId))) {
      throw new Error("Not found");
    }
    const now = Date.now();
    const chatTitle = title?.trim() || "New chat";
    const threadId = await createThread(ctx, components.agent, {
      userId: caller.pubkey,
      title: chatTitle,
    });
    const chatId = await ctx.db.insert("agentChats", {
      agentId,
      owner: caller.pubkey,
      title: chatTitle,
      threadId,
      createdAt: now,
      updatedAt: now,
    });
    return { chatId };
  },
});

export const deleteChat = mutation({
  args: { token: v.string(), chatId: v.id("agentChats") },
  handler: async (ctx, { token, chatId }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) throw new Error("Not authenticated");
    const chat = await requireOwnedChat(ctx, caller.pubkey, chatId);
    if (!chat) throw new Error("Not found");
    if (chat.threadId) {
      await ctx.runMutation(internal.agentComponentStore.deleteThread, {
        threadId: chat.threadId,
      });
    }
    const msgs = await legacyChatMessages(ctx, chatId).collect();
    for (const m of msgs) await ctx.db.delete(m._id);
    await ctx.db.delete(chatId);
    return { ok: true };
  },
});

export const messages = query({
  args: { token: v.string(), chatId: v.id("agentChats") },
  handler: async (ctx, { token, chatId }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) return [];
    const chat = await requireOwnedChat(ctx, caller.pubkey, chatId);
    if (!chat) return [];

    if (chat.threadId) {
      const durable = await listDurableMessages(ctx, chat.threadId);
      if (durable.length > 0) return durable;
    }

    const rows = await legacyChatMessages(ctx, chatId).order("asc").collect();
    return rows.map((m) => ({
      id: m._id,
      role: m.role,
      content: m.content,
      imageUrl: m.imageUrl ?? null,
      trace: m.trace ?? null,
      at: m.at,
      pending: false,
    }));
  },
});

export const clearChat = mutation({
  args: { token: v.string(), chatId: v.id("agentChats") },
  handler: async (ctx, { token, chatId }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) throw new Error("Not authenticated");
    const chat = await requireOwnedChat(ctx, caller.pubkey, chatId);
    if (!chat) throw new Error("Not found");
    if (chat.threadId) {
      await ctx.runMutation(internal.agentComponentStore.clearThread, {
        threadId: chat.threadId,
        owner: caller.pubkey,
        chatId,
      });
    } else {
      const msgs = await legacyChatMessages(ctx, chatId).collect();
      for (const m of msgs) await ctx.db.delete(m._id);
      await ctx.db.patch(chatId, { updatedAt: Date.now() });
    }
    return { ok: true };
  },
});

export const forChat = internalQuery({
  args: {
    token: v.string(),
    agentId: v.id("agents"),
    chatId: v.id("agentChats"),
  },
  handler: async (ctx, { token, agentId, chatId }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) return null;
    const a = await requireOwnedAgent(ctx, caller.pubkey, agentId);
    if (!a) return null;
    const chat = await requireOwnedChat(ctx, caller.pubkey, chatId);
    if (!chat || chat.agentId !== agentId) return null;

    const routed =
      a.model && a.model !== "auto"
        ? a.model
        : (await getConfig(ctx, "default_chat_model", "")) || "openrouter/auto";

    let history: { role: string; content: string }[] = [];
    let historyTurns = 0;
    if (chat.threadId) {
      history = await ctx.runQuery(internal.agentComponentStore.listThreadHistory, {
        threadId: chat.threadId,
        limit: HISTORY_LIMIT,
      });
      historyTurns = history.length;
    } else {
      const rows = await legacyChatMessages(ctx, chatId)
        .order("desc")
        .take(HISTORY_LIMIT);
      history = rows.reverse().map((m) => ({ role: m.role, content: m.content }));
      historyTurns = rows.length;
    }

    return {
      owner: caller.pubkey,
      threadId: chat.threadId ?? null,
      agentModel: a.model,
      model: routed,
      systemPrompt: a.systemPrompt,
      plugins: a.plugins ?? [],
      baseUrl: await getConfig(ctx, "elizacloud_base_url", "https://api.elizacloud.ai"),
      history,
      historyTurns,
    };
  },
});

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

export const touchChat = internalMutation({
  args: { chatId: v.id("agentChats"), owner: v.string() },
  handler: async (ctx, { chatId, owner }) => {
    const chat = await ctx.db.get(chatId);
    if (!chat || chat.owner !== owner) return;
    await ctx.db.patch(chatId, { updatedAt: Date.now() });
  },
});

export const maybeSetChatTitle = internalMutation({
  args: {
    chatId: v.id("agentChats"),
    owner: v.string(),
    fromMessage: v.string(),
  },
  handler: async (ctx, { chatId, owner, fromMessage }) => {
    const chat = await ctx.db.get(chatId);
    if (!chat || chat.owner !== owner) return;
    if (chat.title !== "New chat") return;
    const title = previewMessage(fromMessage) || "New chat";
    await ctx.db.patch(chatId, { title, updatedAt: Date.now() });
    if (chat.threadId) {
      await ctx.runMutation(components.agent.threads.updateThread, {
        threadId: chat.threadId as never,
        patch: { title },
      });
    }
  },
});

export const modelEnv = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) return null;
    return {
      baseUrl: await getConfig(ctx, "elizacloud_base_url", "https://api.elizacloud.ai"),
    };
  },
});

export const chat = action({
  args: {
    token: v.string(),
    agentId: v.id("agents"),
    chatId: v.id("agentChats"),
    message: v.string(),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.message.trim() && !args.imageUrl) throw new Error("Empty message");
    const data = await ctx.runQuery(internal.agents.forChat, {
      token: args.token,
      agentId: args.agentId,
      chatId: args.chatId,
    });
    if (!data) throw new Error("Not found");
    await ctx.runMutation(internal.agentComponentStore.ensureThreadId, {
      chatId: args.chatId,
      owner: data.owner,
    });
    await start(ctx, internal.agentChatWorkflow.agentTurn, args);
    return { ok: true };
  },
});

/** Public model picker — ids only (no gateway labels). */
export const listModels = action({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<Array<{ id: string; free?: boolean }>> => {
    const ctxData = await ctx.runQuery(internal.agents.modelEnv, { token });
    if (!ctxData) return [];

    const flags = (await ctx.runQuery(api.flags.all, {})) as Record<string, boolean>;
    const freeOpts =
      flags.freetour_user_visible && flags.freetour_enabled ? listFreeModelOptions() : [];

    const ids = new Map<string, { id: string; free?: boolean }>();
    for (const m of freeOpts) ids.set(m.id, m);

    const elizaKey = process.env.ELIZACLOUD_API_KEY || process.env.ELIZAOS_CLOUD_API_KEY;
    if (elizaKey) {
      try {
        const res = await fetch(`${ctxData.baseUrl}/api/v1/models`, {
          headers: { authorization: `Bearer ${elizaKey}` },
        });
        if (res.ok) {
          const json = await res.json();
          const elizaIds: string[] = (json.data ?? json.models ?? [])
            .map((m: { id?: string; name?: string }) => m.id ?? m.name)
            .filter(Boolean);
          for (const id of elizaIds) {
            if (!ids.has(id)) ids.set(id, { id });
          }
        }
      } catch {
        /* Eliza catalog optional */
      }
    }

    const orKey = process.env.OPENROUTER_API_KEY;
    if (orKey) {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/models", {
          headers: { authorization: `Bearer ${orKey}` },
        });
        if (res.ok) {
          const json = (await res.json()) as { data?: Array<{ id?: string }> };
          for (const m of json.data ?? []) {
            const id = m.id;
            if (!id || ids.has(id)) continue;
            ids.set(id, { id, ...(id.endsWith(":free") ? { free: true } : {}) });
          }
        }
      } catch {
        /* OpenRouter catalog optional */
      }
    }

    const all = [...ids.values()];
    const free = freeOpts.length
      ? all
          .filter((m) => m.free || m.id === "freetour")
          .sort((a, b) => {
            if (a.id === "freetour") return -1;
            if (b.id === "freetour") return 1;
            return a.id.localeCompare(b.id);
          })
      : [];
    const paid = all
      .filter((m) => !m.free && m.id !== "freetour")
      .sort((a, b) => a.id.localeCompare(b.id));
    return [...free, ...paid];
  },
});
