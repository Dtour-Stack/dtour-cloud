import { ApiTokens } from "convex-api-tokens";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { internalMutation } from "./_generated/server";

/**
 * Convex component API tokens (`sk_*`). Coexists with legacy `apikeys.ts`
 * (`dt_live_*` + djb2 hash) until the dashboard migrates callers.
 */
export const apiTokens = new ApiTokens(components.apiTokens, {
  API_TOKENS_ENCRYPTION_KEY: process.env.API_TOKENS_ENCRYPTION_KEY,
});

/** Scheduled garbage collection for expired / revoked tokens. */
export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    await apiTokens.cleanup(ctx);
  },
});
