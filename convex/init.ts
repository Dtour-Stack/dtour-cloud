import { McpGateway } from "convex-mcp-gateway";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const gateway = new McpGateway(components.mcpGateway);

/** Run after deploy: `bunx convex dev --run init` or `bunx convex run init`. */
export default internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(internal.cronJobs.ensureRegistered, {});

    const oauthServer = process.env.MCP_OAUTH_AUTHORIZATION_SERVER_URL;
    if (oauthServer) {
      await gateway.setOAuthConfig(ctx, {
        authServerUrl: oauthServer,
        resourceUrl: process.env.MCP_OAUTH_RESOURCE_URL ?? null,
      });
    } else {
      await gateway.setOAuthConfig(ctx, { authServerUrl: null });
    }

    if (!process.env.API_TOKENS_ENCRYPTION_KEY) {
      console.warn(
        "[init] API_TOKENS_ENCRYPTION_KEY is unset — sk_* API keys and encrypted provider secrets are disabled until set (see scripts/generate-api-tokens-key.sh).",
      );
    }
  },
});
