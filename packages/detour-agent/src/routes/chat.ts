import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { createMessageHandler } from "@/lib/eliza/message-handler";
import type { UserContext } from "@/lib/eliza/user-context";
import { getRuntimeForRequest } from "../runtime-boot";

interface ChatBody {
  agentId?: string;
  roomId?: string;
  text?: string;
}

/**
 * POST /chat: a session-gated, SSE-streamed chat turn.
 *
 * Flow: Bearer token -> verifySession -> UserContext -> boot/reuse the runtime
 * -> createMessageHandler -> process the turn, streaming each model chunk as an
 * SSE `data:` frame and ending with `data: [DONE]`. Inference runs through the
 * cloud-shared harness, so fees pass to ElizaOS Cloud.
 */
export function chatRoutes(deps: {
  verifySession: (token: string) => Promise<UserContext | null>;
}) {
  const app = new Hono();

  app.post("/chat", async (c) => {
    const token = c.req.header("authorization")?.replace(/^Bearer /i, "") ?? "";
    const userCtx = await deps.verifySession(token);
    if (!userCtx) return c.json({ error: "unauthorized" }, 401);

    const body = await c.req.json<ChatBody>().catch(() => null);
    if (!body?.roomId || !body?.text) {
      return c.json({ error: "roomId and text are required" }, 400);
    }
    const { roomId, text } = body;
    const agentId = body.agentId ?? "default";

    const runtime = await getRuntimeForRequest(userCtx, agentId);
    const handler = createMessageHandler(runtime, userCtx);

    return streamSSE(c, async (stream) => {
      try {
        await handler.process({
          roomId,
          text,
          onStreamChunk: async (chunk) => {
            await stream.writeSSE({ data: chunk });
          },
        });
        await stream.writeSSE({ data: "[DONE]" });
      } catch (err) {
        await stream.writeSSE({
          event: "error",
          data: err instanceof Error ? err.message : String(err),
        });
      }
    });
  });

  return app;
}
