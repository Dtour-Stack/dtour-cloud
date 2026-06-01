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

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function stringField(record: JsonRecord | null, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
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
