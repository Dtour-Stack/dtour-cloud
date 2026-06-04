import { McpGateway } from "convex-mcp-gateway";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { Logger } from "./logger";

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
      Logger.warn("[Init] API token encryption key unset", {
        apiKeysEnabled: false,
        encryptedProviderSecretsEnabled: false,
      });
    }
  },
});
