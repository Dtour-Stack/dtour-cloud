import { createThread, listMessages, saveMessage } from "@convex-dev/agent";
import { v } from "convex/values";
import { components } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
} from "./_generated/server";

const HISTORY_LIMIT = 20;

/** Ensure a dtour chat row has a durable-agent thread id. */
export const ensureThreadId = internalMutation({
  args: {
    chatId: v.id("agentChats"),
    owner: v.string(),
    title: v.optional(v.string()),
  },
  handler: async (ctx, { chatId, owner, title }) => {
    const chat = await ctx.db.get(chatId);
    if (!chat || chat.owner !== owner) throw new Error("Chat not found");
    if (chat.threadId) return chat.threadId;
    const threadId = await createThread(ctx, components.agent, {
      userId: owner,
      title: title ?? chat.title,
    });
    await ctx.db.patch(chatId, { threadId });
    return threadId;
  },
});

export const listThreadHistory = internalQuery({
  args: { threadId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { threadId, limit }) => {
    const { page } = await listMessages(ctx, components.agent, {
      threadId,
      paginationOpts: { numItems: limit ?? HISTORY_LIMIT, cursor: null },
      excludeToolMessages: true,
      statuses: ["success", "failed"],
    });
    const chronological = [...page].reverse();
    return chronological.map((m) => ({
      role: m.message.role as string,
      content: m.text ?? "",
    }));
  },
});

export const saveUserTurn = internalMutation({
  args: {
    threadId: v.string(),
    owner: v.string(),
    content: v.string(),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, { threadId, owner, content, imageUrl }) => {
    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId,
      userId: owner,
      prompt: content || (imageUrl ? "What's in this image?" : ""),
    });
    if (imageUrl) {
      await ctx.db.insert("agentMessageExtras", { messageId, imageUrl });
    }
    return messageId;
  },
});

export const startAssistantTurn = internalMutation({
  args: { threadId: v.string(), owner: v.string() },
  handler: async (ctx, { threadId, owner }) => {
    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId,
      userId: owner,
      message: { role: "assistant", content: "" },
      metadata: { status: "pending" },
    });
    return messageId;
  },
});

export const setAssistantTurn = internalMutation({
  args: {
    messageId: v.string(),
    owner: v.string(),
    content: v.string(),
    status: v.union(v.literal("success"), v.literal("failed")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { messageId, content, status, error }) => {
    await ctx.runMutation(components.agent.messages.updateMessage, {
      messageId: messageId as never,
      patch: {
        message: { role: "assistant", content },
        status,
        ...(error ? { error } : {}),
      },
    });
  },
});

export const setTurnTrace = internalMutation({
  args: { messageId: v.string(), trace: v.string() },
  handler: async (ctx, { messageId, trace }) => {
    const existing = await ctx.db
      .query("agentTurnTraces")
      .withIndex("by_message", (q) => q.eq("messageId", messageId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { trace });
    } else {
      await ctx.db.insert("agentTurnTraces", { messageId, trace });
    }
  },
});

export const clearThread = internalMutation({
  args: { threadId: v.string(), owner: v.string(), chatId: v.id("agentChats") },
  handler: async (ctx, { threadId, owner, chatId }) => {
    await ctx.runMutation(components.agent.threads.deleteAllForThreadIdAsync, {
      threadId: threadId as never,
    });
    const newThreadId = await createThread(ctx, components.agent, {
      userId: owner,
      title: "New chat",
    });
    await ctx.db.patch(chatId, { threadId: newThreadId, updatedAt: Date.now() });
    return newThreadId;
  },
});

export const deleteThread = internalMutation({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    await ctx.runMutation(components.agent.threads.deleteAllForThreadIdAsync, {
      threadId: threadId as never,
    });
  },
});
