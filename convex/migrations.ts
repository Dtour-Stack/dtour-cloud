import { createThread } from "@convex-dev/agent";
import { Migrations } from "@convex-dev/migrations";
import { components } from "./_generated/api";
import { internalMutation } from "./_generated/server";

export const migrations = new Migrations(components.migrations, { internalMutation });

/** Backfill `agentChats.threadId` for rows created before the agent component migration. */
export const backfillAgentChatThreads = migrations.define({
  table: "agentChats",
  migrateOne: async (ctx, chat) => {
    if (chat.threadId) return;
    const threadId = await createThread(ctx, components.agent, {
      userId: chat.owner,
      title: chat.title,
    });
    await ctx.db.patch(chat._id, { threadId });
  },
});

export const run = migrations.runner();
