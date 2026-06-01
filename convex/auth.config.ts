import type { AuthConfig } from "convex/server";

/**
 * JWT issuers for MCP browser clients (Claude.ai OAuth completion).
 *
 * API keys (`sk_*`), dashboard session tokens, and legacy `dt_live_*` keys are
 * resolved in `http.ts` via `resolveIdentity` — they do not need entries here.
 *
 * When you have an OIDC issuer, add a customJwt provider (see Convex docs) and
 * set MCP_JWT_* deployment env vars. Until then, keep `providers` empty.
 */
export default {
  providers: [],
} satisfies AuthConfig;
