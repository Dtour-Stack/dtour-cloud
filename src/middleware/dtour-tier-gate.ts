/**
 * Detour Markup — 20% on top of ElizaOS Cloud billing. That's it.
 */

import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "@/types/cloud-worker-env";

const MARKUP = 1.2;

export const dtourTierGate: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (new URL(c.req.url).pathname.startsWith("/api/")) {
    c.set("dtourMarkup" as never, MARKUP);
  }
  await next();
};
