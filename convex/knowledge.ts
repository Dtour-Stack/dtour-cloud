import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  action,
  internalAction,
  internalQuery,
} from "./_generated/server";
import { previewText } from "./agentTrace";
import { Logger } from "./logger";
import { agentNamespace, getRag, ragConfigured } from "./ragInstance";
import { resolveRole } from "./rbac";

export type KnowledgeHit = {
  id: string;
  text: string;
  score: number;
  source?: string;
};

export type KnowledgeSearchResult = {
  configured: boolean;
  hits: KnowledgeHit[];
  error?: "search_failed";
};

async function requireOwnedAgentId(
  ctx: { runQuery: (ref: unknown, args: unknown) => Promise<unknown> },
  token: string,
  agentId: Id<"agents">,
) {
  const agent = (await ctx.runQuery(internal.knowledge.agentDoc, { agentId })) as
    | { owner: string }
    | null;
  if (!agent) return null;
  const caller = await ctx.runQuery(internal.knowledge.callerForToken, { token });
  if (!caller || caller.pubkey !== agent.owner) return null;
  return agent;
}

export const callerForToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    return await resolveRole(ctx, token);
  },
});

export const agentDoc = internalQuery({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const a = await ctx.db.get(agentId);
    if (!a) return null;
    return {
      owner: a.owner,
      name: a.name,
      description: a.description ?? null,
      systemPrompt: a.systemPrompt,
    };
  },
});

/** Semantic search over an agent's knowledge namespace (@convex-dev/rag). */
export const search = internalAction({
  args: {
    owner: v.string(),
    agentId: v.id("agents"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<KnowledgeSearchResult> => {
    void args.owner;
    const rag = getRag();
    if (!rag) return { configured: false, hits: [] };
    const q = args.query.trim();
    if (!q) return { configured: true, hits: [] };

    try {
      const { results, entries } = await rag.search(ctx, {
        namespace: agentNamespace(args.agentId),
        query: q,
        limit: args.limit ?? 5,
        vectorScoreThreshold: 0.32,
        chunkContext: { before: 1, after: 0 },
      });
      const titles = new Map(entries.map((e) => [e.entryId, e.title ?? null]));
      return {
        configured: true,
        hits: results.map((r) => ({
          id: String(r.entryId),
          text: r.content.map((c) => c.text).join("\n"),
          score: r.score,
          source: titles.get(r.entryId) ?? undefined,
        })),
      };
    } catch (e) {
      Logger.error("[Knowledge] search failed", {
        agentId: String(args.agentId),
        reason: e instanceof Error ? e.message : String(e),
      });
      return { configured: true, hits: [], error: "search_failed" };
    }
  },
});

/** Index agent name, description, and system prompt into RAG (key: instructions). */
export const syncAgentInstructions = internalAction({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const rag = getRag();
    if (!rag) return { ok: false, reason: "embeddings not configured" };
    const agent = await ctx.runQuery(internal.knowledge.agentDoc, { agentId });
    if (!agent) return { ok: false, reason: "agent not found" };

    const text = [
      agent.name ? `# ${agent.name}` : "",
      agent.description ? `Description: ${agent.description}` : "",
      agent.systemPrompt,
    ]
      .filter(Boolean)
      .join("\n\n")
      .trim();
    if (!text) return { ok: true, skipped: true };

    await rag.add(ctx, {
      namespace: agentNamespace(agentId),
      key: "instructions",
      title: "Agent instructions",
      text,
    });
    return { ok: true };
  },
});

export const addDocument = action({
  args: {
    token: v.string(),
    agentId: v.id("agents"),
    title: v.string(),
    text: v.string(),
  },
  handler: async (ctx, { token, agentId, title, text }) => {
    if (!(await requireOwnedAgentId(ctx, token, agentId))) {
      throw new Error("Not found");
    }
    const rag = getRag();
    if (!rag) {
      throw new Error("Knowledge search requires OPENROUTER_API_KEY or OPENAI_API_KEY on Convex");
    }
    const trimmed = text.trim();
    if (!trimmed) throw new Error("Text is required");
    const key = `doc:${Date.now()}`;
    await rag.add(ctx, {
      namespace: agentNamespace(agentId),
      key,
      title: title.trim() || "Knowledge",
      text: trimmed,
    });
    return { ok: true, key };
  },
});

export const listDocuments = action({
  args: { token: v.string(), agentId: v.id("agents") },
  handler: async (ctx, { token, agentId }) => {
    if (!(await requireOwnedAgentId(ctx, token, agentId))) {
      throw new Error("Not found");
    }
    if (!ragConfigured()) {
      return { configured: false, entries: [] as Array<{ key: string; title: string | null }> };
    }
    const rag = getRag();
    if (!rag) return { configured: false, entries: [] };

    const ns = await rag.getNamespace(ctx, { namespace: agentNamespace(agentId) });
    if (!ns) return { configured: true, entries: [] };

    const page = await rag.list(ctx, {
      namespaceId: ns.namespaceId,
      limit: 30,
      status: "ready",
      order: "desc",
    });
    return {
      configured: true,
      entries: page.page.map((e) => ({
        key: e.key ?? String(e.entryId),
        title: e.title ?? null,
      })),
    };
  },
});

export const reindexAgent = action({
  args: { token: v.string(), agentId: v.id("agents") },
  handler: async (ctx, { token, agentId }) => {
    if (!(await requireOwnedAgentId(ctx, token, agentId))) {
      throw new Error("Not found");
    }
    return await ctx.runAction(internal.knowledge.syncAgentInstructions, { agentId });
  },
});

export const status = action({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const caller = await ctx.runQuery(internal.knowledge.callerForToken, { token });
    if (!caller) throw new Error("Not authenticated");
    return { configured: ragConfigured() };
  },
});

/** Format hits for injection into the system prompt. */
export function formatKnowledgeBlock(hits: KnowledgeHit[]): string {
  if (!hits.length) return "";
  const body = hits
    .map((h, i) => {
      const label = h.source ? `[${h.source}]` : `[${i + 1}]`;
      return `${label} ${previewText(h.text, 900)}`;
    })
    .join("\n\n");
  return `\n\nRelevant knowledge (semantic retrieval):\n${body}`;
}
