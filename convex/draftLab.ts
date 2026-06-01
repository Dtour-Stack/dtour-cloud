import { createThread } from "@convex-dev/agent";
import { start } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { resolveRole } from "./rbac";

async function requireOwnedAgent(
  ctx: MutationCtx,
  owner: string,
  agentId: Id<"agents">,
) {
  const a = await ctx.db.get(agentId);
  if (!a || a.owner !== owner) return null;
  return a;
}

/** Lightweight agent smoke-test from Coding — same inference path as /agents chat. */
export const quickTurn = mutation({
  args: {
    token: v.string(),
    agentId: v.id("agents"),
    message: v.string(),
    chatId: v.optional(v.id("agentChats")),
  },
  handler: async (ctx, args) => {
    const caller = await resolveRole(ctx, args.token);
    if (!caller) throw new Error("Not authenticated");
    const agent = await requireOwnedAgent(ctx, caller.pubkey, args.agentId);
    if (!agent) throw new Error("Agent not found");

    const trimmed = args.message.trim();
    if (!trimmed) throw new Error("Empty message");

    let chatId = args.chatId;
    if (!chatId) {
      const now = Date.now();
      const threadId = await createThread(ctx, components.agent, {
        userId: caller.pubkey,
        title: "Draft lab",
      });
      chatId = await ctx.db.insert("agentChats", {
        agentId: args.agentId,
        owner: caller.pubkey,
        title: "Draft lab",
        threadId,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      const chat = await ctx.db.get(chatId);
      if (!chat || chat.owner !== caller.pubkey || chat.agentId !== args.agentId) {
        throw new Error("Chat not found");
      }
    }

    await ctx.runMutation(internal.agentComponentStore.ensureThreadId, {
      chatId,
      owner: caller.pubkey,
    });

    await start(ctx, internal.agentChatWorkflow.agentTurn, {
      token: args.token,
      agentId: args.agentId,
      chatId,
      message: trimmed,
    });
    return { ok: true as const, chatId };
  },
});

export const labHint = query({
  args: {},
  handler: async () => ({
    summary:
      "Runs your lightweight Detour agent (persona + plugins + model) through the same Eliza/OpenRouter path as Agents chat. Billed as inference, not sandbox time.",
    sandboxNote:
      "In E2B, use opencode/codex/claude/pi to iterate on plugins and workflows; use Draft lab here to validate prompts and persona.",
  }),
});
