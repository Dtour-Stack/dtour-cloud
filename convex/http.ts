import { httpRouter, makeFunctionReference } from "convex/server";
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

type JsonRecord = Record<string, unknown>;
type RemoteGatewaySurface = "bridge" | "a2a" | "mcp";
type RemoteGatewayProvider = "elizacloud" | "detour";
type RemoteGatewayContextArgs = {
  agentId: string;
  token?: string;
  surface: RemoteGatewaySurface;
};
type RemoteGatewayContextResult =
  | { allowed: false; status: number; reason: string }
  | {
      allowed: true;
      agent: {
        id: string;
        name: string;
        description: string | null;
        model: string;
        plugins: string[];
      };
      deployment: {
        upstreamAgentId: string;
        apiBaseUrl: string;
        activeProvider: RemoteGatewayProvider;
        fallbackStatus: "standby" | "active" | "unavailable";
      };
    };
type RemoteGatewayProviderResult = {
  status: number;
  payload: JsonRecord;
  provider: RemoteGatewayProvider;
};

const remoteGatewayContextRef = makeFunctionReference<
  "query",
  RemoteGatewayContextArgs,
  RemoteGatewayContextResult
>("remoteAgentDeployments:gatewayContext");

const remoteCorsHeaders: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-max-age": "86400",
  "x-detour-runtime-strategy": "elizacloud-primary-detour-fallback",
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function stringField(record: JsonRecord | null, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function idField(record: JsonRecord | null): string | number | undefined {
  const value = record?.id;
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

function remoteHeaders(
  provider?: RemoteGatewayProvider,
  extra?: HeadersInit,
): Headers {
  const headers = new Headers(extra);
  for (const [key, value] of Object.entries(remoteCorsHeaders)) {
    headers.set(key, value);
  }
  if (provider) headers.set("x-detour-runtime-provider", provider);
  return headers;
}

function remoteJson(
  payload: JsonRecord,
  status = 200,
  provider?: RemoteGatewayProvider,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: remoteHeaders(provider, { "content-type": "application/json" }),
  });
}

function bearerToken(headers: Headers): string | undefined {
  const header = headers.get("authorization");
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || undefined;
}

function parseRemoteAgentPath(
  request: Request,
): { agentId: string; surface: RemoteGatewaySurface } | null {
  const pathname = new URL(request.url).pathname;
  const match = /^\/remote-agents\/([^/]+)\/(bridge|a2a|mcp)\/?$/.exec(
    pathname,
  );
  if (!match) return null;
  return {
    agentId: decodeURIComponent(match[1]),
    surface: match[2] as RemoteGatewaySurface,
  };
}

async function requestJsonRecord(request: Request): Promise<JsonRecord | Response> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await request.text());
  } catch {
    return remoteJson({ error: "Invalid JSON" }, 400);
  }
  const record = asRecord(parsed);
  return record ?? remoteJson({ error: "Expected JSON object" }, 400);
}

function parseResponsePayload(text: string): JsonRecord {
  if (!text.trim()) return {};
  const parsed = JSON.parse(text) as unknown;
  const record = asRecord(parsed);
  if (!record) throw new Error("Expected JSON object response");
  return record;
}

async function elizaCloudBridgeRequest(
  upstreamAgentId: string,
  payload: JsonRecord,
): Promise<RemoteGatewayProviderResult> {
  const base = process.env.ELIZACLOUD_API_URL;
  const key = process.env.ELIZACLOUD_API_KEY;
  if (!base || !key) {
    return {
      status: 503,
      provider: "elizacloud",
      payload: { error: "ElizaCloud proxy is not configured" },
    };
  }
  try {
    const response = await fetch(
      `${base.replace(/\/$/, "")}/api/v1/eliza/agents/${encodeURIComponent(
        upstreamAgentId,
      )}/bridge`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
    return {
      status: response.status,
      provider: "elizacloud",
      payload: parseResponsePayload(await response.text()),
    };
  } catch (error) {
    return {
      status: 502,
      provider: "elizacloud",
      payload: {
        error:
          error instanceof Error ? error.message : "ElizaCloud bridge request failed",
      },
    };
  }
}

async function detourFallbackBridgeRequest(
  agentId: string,
  payload: JsonRecord,
): Promise<RemoteGatewayProviderResult | null> {
  const base = process.env.DETOUR_REMOTE_RUNTIME_URL;
  if (!base) return null;
  const key = process.env.DETOUR_REMOTE_RUNTIME_KEY;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key) headers.authorization = `Bearer ${key}`;
  try {
    const response = await fetch(
      `${base.replace(/\/$/, "")}/remote-agents/${encodeURIComponent(agentId)}/bridge`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      },
    );
    return {
      status: response.status,
      provider: "detour",
      payload: parseResponsePayload(await response.text()),
    };
  } catch (error) {
    return {
      status: 502,
      provider: "detour",
      payload: {
        error:
          error instanceof Error ? error.message : "Detour fallback request failed",
      },
    };
  }
}

async function remoteBridgeRequest(
  agentId: string,
  upstreamAgentId: string,
  payload: JsonRecord,
): Promise<RemoteGatewayProviderResult> {
  const primary = await elizaCloudBridgeRequest(upstreamAgentId, payload);
  if (primary.status < 500) return primary;
  const fallback = await detourFallbackBridgeRequest(agentId, payload);
  return fallback ?? primary;
}

function textFromMessageParams(params: JsonRecord | null): string | null {
  const direct = stringField(params, "text") ?? stringField(params, "message");
  if (direct) return direct;
  const messages = params?.messages;
  if (!Array.isArray(messages)) return null;
  const last = asRecord(messages.at(-1));
  return stringField(last, "content") ?? stringField(last, "text") ?? null;
}

function emailFromAddress(value: unknown): string | undefined {
  if (Array.isArray(value)) return emailFromAddress(value[0]);
  if (typeof value !== "string") return undefined;
  const match = value.match(/<([^>]+)>/)?.[1] ?? value;
  const clean = match.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) ? clean : undefined;
}

function base64Bytes(value: string): Uint8Array {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
  return bytes;
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function verifyAgentMailWebhook(raw: string, headers: Headers): Promise<Response | null> {
  const secret = process.env.AGENTMAIL_WEBHOOK_SECRET;
  if (!secret) return new Response("AgentMail webhook secret missing", { status: 503 });
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signature = headers.get("svix-signature");
  if (!id || !timestamp || !signature) return new Response("Missing signature", { status: 400 });
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return new Response("Invalid timestamp", { status: 400 });
  if (Math.abs(Date.now() / 1000 - ts) > 5 * 60) {
    return new Response("Stale signature", { status: 400 });
  }
  const keyBytes = base64Bytes(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  const key = await crypto.subtle.importKey(
    "raw",
    arrayBuffer(keyBytes),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = arrayBuffer(new TextEncoder().encode(`${id}.${timestamp}.${raw}`));
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, signed));
  const valid = signature.split(" ").some((part) => {
    const [, encoded] = part.split(",");
    if (!encoded) return false;
    return constantTimeEqual(expected, base64Bytes(encoded));
  });
  return valid ? null : new Response("Invalid signature", { status: 400 });
}

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

const remoteAgentGateway = httpAction(async (ctx, request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: remoteHeaders() });
  }
  const path = parseRemoteAgentPath(request);
  if (!path) return remoteJson({ error: "Remote agent endpoint not found" }, 404);
  if (request.method !== "GET" && request.method !== "POST") {
    return remoteJson({ error: "Method not allowed" }, 405);
  }

  const context = await ctx.runQuery(remoteGatewayContextRef, {
    agentId: path.agentId,
    token: bearerToken(request.headers),
    surface: path.surface,
  });
  if (!context.allowed) {
    return remoteJson({ error: context.reason }, context.status);
  }

  const url = new URL(request.url);
  const base = `${url.origin}/remote-agents/${encodeURIComponent(path.agentId)}`;

  if (path.surface === "bridge") {
    if (request.method !== "POST") {
      return remoteJson({ error: "Bridge endpoint requires POST" }, 405);
    }
    const payload = await requestJsonRecord(request);
    if (payload instanceof Response) return payload;
    const result = await remoteBridgeRequest(
      path.agentId,
      context.deployment.upstreamAgentId,
      payload,
    );
    return remoteJson(result.payload, result.status, result.provider);
  }

  if (path.surface === "a2a") {
    if (request.method === "GET") {
      return remoteJson({
        name: context.agent.name,
        description: context.agent.description ?? "Detour remote agent",
        url: `${base}/a2a`,
        provider: "Detour Cloud",
        version: "0.1.0",
        capabilities: {
          streaming: false,
          pushNotifications: false,
        },
        skills: context.agent.plugins.map((plugin) => ({
          id: plugin,
          name: plugin,
        })),
      });
    }

    const payload = await requestJsonRecord(request);
    if (payload instanceof Response) return payload;
    const method = stringField(payload, "method") ?? "message.send";
    const params = asRecord(payload.params);
    const id = idField(payload) ?? null;
    if (method === "getAgentCard" || method === "getAgentInfo") {
      return remoteJson({
        jsonrpc: "2.0",
        id,
        result: {
          name: context.agent.name,
          description: context.agent.description,
          endpoint: `${base}/a2a`,
          model: context.agent.model,
          plugins: context.agent.plugins,
        },
      });
    }
    if (
      method !== "chat" &&
      method !== "message.send" &&
      method !== "message/send"
    ) {
      return remoteJson({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: "Unsupported A2A method" },
      }, 400);
    }

    const text = textFromMessageParams(params);
    if (!text) {
      return remoteJson({
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: "Message text is required" },
      }, 400);
    }
    const result = await remoteBridgeRequest(
      path.agentId,
      context.deployment.upstreamAgentId,
      {
        jsonrpc: "2.0",
        id: id ?? "a2a-message",
        method: "message.send",
        params: { text },
      },
    );
    return remoteJson({
      jsonrpc: "2.0",
      id,
      result: result.payload,
    }, result.status, result.provider);
  }

  if (request.method === "GET") {
    return remoteJson({
      name: context.agent.name,
      description: context.agent.description ?? "Detour remote agent tools",
      endpoint: `${base}/mcp`,
      transport: "http",
      tools: [
        {
          name: "chat",
          description: "Send a message to the remote agent.",
          inputSchema: {
            type: "object",
            properties: { text: { type: "string" } },
            required: ["text"],
          },
        },
        {
          name: "get_info",
          description: "Read the remote agent metadata.",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    });
  }

  const payload = await requestJsonRecord(request);
  if (payload instanceof Response) return payload;
  const method = stringField(payload, "method");
  const id = idField(payload) ?? null;
  if (method === "initialize") {
    return remoteJson({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: context.agent.name, version: "0.1.0" },
      },
    });
  }
  if (method === "tools/list") {
    return remoteJson({
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "chat",
            description: "Send a message to the remote agent.",
            inputSchema: {
              type: "object",
              properties: { text: { type: "string" } },
              required: ["text"],
            },
          },
          {
            name: "get_info",
            description: "Read the remote agent metadata.",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      },
    });
  }
  if (method === "ping") {
    return remoteJson({ jsonrpc: "2.0", id, result: {} });
  }
  if (method !== "tools/call") {
    return remoteJson({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Unsupported MCP method" },
    }, 400);
  }

  const params = asRecord(payload.params);
  const toolName = stringField(params, "name");
  const toolArgs = asRecord(params?.arguments);
  if (toolName === "get_info") {
    return remoteJson({
      jsonrpc: "2.0",
      id,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              name: context.agent.name,
              description: context.agent.description,
              model: context.agent.model,
              plugins: context.agent.plugins,
            }),
          },
        ],
      },
    });
  }
  if (toolName !== "chat") {
    return remoteJson({
      jsonrpc: "2.0",
      id,
      error: { code: -32602, message: "Unknown tool" },
    }, 400);
  }
  const text = stringField(toolArgs, "text");
  if (!text) {
    return remoteJson({
      jsonrpc: "2.0",
      id,
      error: { code: -32602, message: "Tool argument text is required" },
    }, 400);
  }
  const result = await remoteBridgeRequest(
    path.agentId,
    context.deployment.upstreamAgentId,
    {
      jsonrpc: "2.0",
      id: id ?? "mcp-chat",
      method: "message.send",
      params: { text },
    },
  );
  return remoteJson({
    jsonrpc: "2.0",
    id,
    result: {
      content: [{ type: "text", text: JSON.stringify(result.payload) }],
    },
  }, result.status, result.provider);
});

for (const method of ["GET", "POST", "OPTIONS"] as const) {
  http.route({ pathPrefix: "/remote-agents/", method, handler: remoteAgentGateway });
}

const oauthDiscovery = httpAction(async (ctx, request) =>
  gateway.serveProtectedResourceMetadata(ctx, request),
);

http.route({
  pathPrefix: "/.well-known/oauth-protected-resource/",
  method: "GET",
  handler: oauthDiscovery,
});

const agentMailWebhook = httpAction(async (ctx, request) => {
  const raw = await request.text();
  const verificationError = await verifyAgentMailWebhook(raw, request.headers);
  if (verificationError) return verificationError;
  let payload: JsonRecord;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const record = asRecord(parsed);
    if (!record) return new Response("Invalid payload", { status: 400 });
    payload = record;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const message = asRecord(payload.message);
  const eventType = stringField(payload, "event_type") ?? "unknown";
  const eventId =
    stringField(payload, "event_id") ??
    request.headers.get("svix-id") ??
    stringField(message, "message_id") ??
    `${eventType}:${Date.now()}`;
  const email = emailFromAddress(message?.from);
  const replyText =
    stringField(message, "extracted_text") ??
    stringField(message, "text") ??
    stringField(message, "preview");
  await ctx.runMutation(internal.adminAssistant.recordAgentMailWebhook, {
    eventId,
    eventType,
    email,
    inboxId: stringField(message, "inbox_id"),
    messageId: stringField(message, "message_id"),
    replyText,
    payload: raw,
  });
  return new Response(null, { status: 204 });
});

http.route({
  path: "/agentmail/webhook",
  method: "POST",
  handler: agentMailWebhook,
});

export default http;
