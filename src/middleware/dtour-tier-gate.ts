/**
 * Default upstream resale markup attached to proxy requests that consume it.
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
