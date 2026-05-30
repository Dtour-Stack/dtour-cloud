import { Hono } from "hono";
import { runtimeCache } from "@/lib/eliza/runtime/cache";
import type { UserContext } from "@/lib/eliza/user-context";

const startedAt = Date.now();

/**
 * Minimal inspection surface. `GET /status` reports liveness + the number of
 * warm runtimes; `/activity` and `/memory` are reserved for sub-project 3
 * (dashboard inspection) and return 501 for now. All session-gated.
 */
export function inspectRoutes(deps: {
  verifySession: (token: string) => Promise<UserContext | null>;
}) {
  const app = new Hono();

  app.get("/status", async (c) => {
    const token = c.req.header("authorization")?.replace(/^Bearer /i, "") ?? "";
    const userCtx = await deps.verifySession(token);
    if (!userCtx) return c.json({ error: "unauthorized" }, 401);

    return c.json({
      ok: true,
      agents: runtimeCache.getStats().size,
      uptimeMs: Date.now() - startedAt,
    });
  });

  // Reserved for sub-project 3 (dashboard activity + memory inspection).
  app.get("/activity", (c) => c.json({ error: "not implemented yet" }, 501));
  app.get("/memory", (c) => c.json({ error: "not implemented yet" }, 501));

  return app;
}
