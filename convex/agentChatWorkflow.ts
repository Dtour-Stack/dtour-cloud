import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { previewText, serializeTrace, type AgentTurnTrace } from "./agentTrace";
import { formatKnowledgeBlock } from "./knowledge";
import { workflow } from "./workflowManager";

/** Durable agent turn — @convex-dev/agent threads + workflow + inference metering. */
export const agentTurn = workflow
  .define({
    args: {
      token: v.string(),
      agentId: v.id("agents"),
      chatId: v.id("agentChats"),
      message: v.string(),
      imageUrl: v.optional(v.string()),
    },
    returns: v.null(),
  })
  .handler(async (step, args): Promise<null> => {
    const data = await step.runQuery(internal.agents.forChat, {
      token: args.token,
      agentId: args.agentId,
      chatId: args.chatId,
    });
    if (!data) throw new Error("Agent not found");
    if (!data.threadId) throw new Error("Chat thread not ready");

    const trimmed = args.message.trim();
    if (!trimmed && !args.imageUrl) throw new Error("Empty message");

    await step.runMutation(internal.agentComponentStore.saveUserTurn, {
      threadId: data.threadId,
      owner: data.owner,
      content: trimmed,
      imageUrl: args.imageUrl,
    });

    if (trimmed) {
      await step.runMutation(internal.agents.maybeSetChatTitle, {
        chatId: args.chatId,
        owner: data.owner,
        fromMessage: trimmed,
      });
    }

    const asstId = await step.runMutation(internal.agentComponentStore.startAssistantTurn, {
      threadId: data.threadId,
      owner: data.owner,
    });

    const model =
      data.model && data.model !== "auto" ? data.model : "openrouter/auto";

    const knowledge = await step.runAction(internal.knowledge.search, {
      owner: data.owner,
      agentId: args.agentId,
      query: trimmed || "image",
      limit: 5,
    });
    const knowledgeHits = knowledge.hits;

    const traceBase: AgentTurnTrace = {
      version: 1,
      status: "running",
      modelRequested: model,
      context: {
        agentModel: data.agentModel,
        systemPromptPreview: previewText(data.systemPrompt, 320),
        historyTurns: data.historyTurns,
        plugins: data.plugins,
        imageAttached: !!args.imageUrl,
      },
      steps: [
        {
          id: "route",
          kind: "route",
          title:
            data.agentModel === "auto" || !data.agentModel
              ? "Auto-routed model"
              : "Model selected",
          detail: model,
          at: Date.now(),
        },
        {
          id: "context",
          kind: "context",
          title: "Loaded agent context",
          detail: `${data.historyTurns} prior turns · instructions ${data.systemPrompt.length} chars`,
          at: Date.now(),
        },
        {
          id: "knowledge",
          kind: "memory",
          title: !knowledge.configured
            ? "Knowledge base not configured"
            : knowledge.error
              ? "Knowledge retrieval failed"
            : knowledgeHits.length
              ? `Retrieved ${knowledgeHits.length} knowledge chunks`
              : "No matching knowledge for this turn",
          detail: !knowledge.configured
            ? "Set OPENROUTER_API_KEY or OPENAI_API_KEY on Convex to enable @convex-dev/rag."
            : knowledge.error
              ? "Semantic retrieval failed; this turn continued without retrieved knowledge."
            : knowledgeHits.length
              ? knowledgeHits.map((h) => previewText(h.text, 80)).join(" · ")
              : "Instructions are indexed; add documents under Instructions → Knowledge.",
          at: Date.now(),
        },
        ...(args.imageUrl
          ? [
              {
                id: "vision",
                kind: "resource" as const,
                title: "Vision input attached",
                detail: args.imageUrl,
                href: args.imageUrl,
                at: Date.now(),
              },
            ]
          : []),
        ...(data.plugins.length
          ? data.plugins.map((p, i) => ({
              id: `plugin-${i}`,
              kind: "tool" as const,
              title: `Plugin ready · ${p}`,
              detail:
                "Attached to agent — tool calls arrive in a future harness pass.",
              at: Date.now(),
            }))
          : []),
      ],
    };

    await step.runMutation(internal.agentComponentStore.setTurnTrace, {
      messageId: asstId,
      trace: serializeTrace(traceBase),
    });

    const knowledgeBlock = formatKnowledgeBlock(knowledgeHits);

    try {
      const result = (await step.runAction(api.inference.runChat, {
        token: args.token,
        model,
        messages: [
          { role: "system", content: data.systemPrompt + knowledgeBlock },
          ...data.history,
          { role: "user", content: trimmed || "What's in this image?" },
        ],
        imageUrl: args.imageUrl,
        refId: asstId,
      })) as {
        text: string;
        source: "freetour" | "openrouter" | "elizacloud";
        modelUsed: string;
        modelRequested: string;
        durationMs: number;
        usage?: {
          promptTokens?: number;
          completionTokens?: number;
          costUsd?: number;
          free?: boolean;
        };
        reasoning?: string;
        routeVariant?: string;
        fallbackUsed?: boolean;
      };

      const doneTrace: AgentTurnTrace = {
        ...traceBase,
        status: "complete",
        modelRequested: result.modelRequested,
        modelUsed: result.modelUsed,
        source: result.source,
        routeVariant: result.routeVariant,
        fallbackUsed: result.fallbackUsed,
        durationMs: result.durationMs,
        usage: result.usage,
        reasoning: result.reasoning,
        steps: [
          ...traceBase.steps,
          {
            id: "inference",
            kind: "inference",
            title: "Response generated",
            detail: `${result.modelUsed} · ${Math.round(result.durationMs)}ms`,
            at: Date.now(),
          },
          ...(result.reasoning
            ? [
                {
                  id: "reasoning",
                  kind: "reasoning" as const,
                  title: "Extended reasoning captured",
                  detail: previewText(result.reasoning, 160),
                  at: Date.now(),
                },
              ]
            : []),
        ],
      };

      await step.runMutation(internal.agentComponentStore.setAssistantTurn, {
        messageId: asstId,
        owner: data.owner,
        content: result.text || "(no response)",
        status: "success",
      });
      await step.runMutation(internal.agentComponentStore.setTurnTrace, {
        messageId: asstId,
        trace: serializeTrace(doneTrace),
      });
    } catch (e) {
      const err = e instanceof Error ? e.message : "Inference error";
      const errorTrace: AgentTurnTrace = {
        ...traceBase,
        status: "error",
        error: err,
        steps: [
          ...traceBase.steps,
          {
            id: "error",
            kind: "inference",
            title: "Inference failed",
            detail: err,
            at: Date.now(),
          },
        ],
      };
      await step.runMutation(internal.agentComponentStore.setAssistantTurn, {
        messageId: asstId,
        owner: data.owner,
        content: `⚠️ ${err}`,
        status: "failed",
        error: err,
      });
      await step.runMutation(internal.agentComponentStore.setTurnTrace, {
        messageId: asstId,
        trace: serializeTrace(errorTrace),
      });
    }

    await step.runMutation(internal.agents.touchChat, {
      chatId: args.chatId,
      owner: data.owner,
    });

    return null;
  });
