import { httpRouter } from "convex/server";
import { McpGateway, type McpAuthorizerHandler, type McpIdentityResolver } from "convex-mcp-gateway";
import { components, internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { tools } from "./mcp";

const gateway = new McpGateway(components.mcpGateway);

const MCP_REQUIRE_AUTH = process.env.MCP_REQUIRE_AUTH === "1";

const authorize: McpAuthorizerHandler = async (_ctx, { toolMetadata, identity }) => {
  const meta = (toolMetadata ?? {}) as { public?: boolean };
  if (meta.public) return { allowed: true };
  if (!identity) return { allowed: false, reason: "Unauthorized" };
  return { allowed: true };
};

const http = httpRouter();

const mcp = httpAction(async (ctx, req) => {
  const resolveBearer: McpIdentityResolver = async (bearer) => {
    const row = await ctx.runMutation(internal.mcpAuth.resolveBearer, { bearer });
    if (!row) return null;
    return { subject: row.subject, claims: { authKind: row.kind } };
  };

  return gateway.handleMcpRequest(ctx, req, {
    authorize,
    tools,
    resolveIdentity: resolveBearer,
    requireAuth: MCP_REQUIRE_AUTH,
    serverInfo: { name: "detour-cloud-mcp", version: "0.1.0" },
  });
});

for (const path of ["/mcp/", "/mcp"]) {
  http.route({ path, method: "POST", handler: mcp });
  http.route({ path, method: "GET", handler: mcp });
  http.route({ path, method: "DELETE", handler: mcp });
}

const oauthDiscovery = httpAction(async (ctx, request) =>
  gateway.serveProtectedResourceMetadata(ctx, request),
);

http.route({
  pathPrefix: "/.well-known/oauth-protected-resource/",
  method: "GET",
  handler: oauthDiscovery,
});

export default http;
