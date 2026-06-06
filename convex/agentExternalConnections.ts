import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { resolveRole } from "./rbac";

const authModeValidator = v.union(
  v.literal("none"),
  v.literal("bearer"),
  v.literal("api_key"),
  v.literal("custom_header"),
  v.literal("x402"),
);

const meshModeValidator = v.union(
  v.literal("public_internet"),
  v.literal("detour_private"),
  v.literal("tailscale"),
  v.literal("headscale"),
);

type AuthMode = "none" | "bearer" | "api_key" | "custom_header" | "x402";
type MeshMode = "public_internet" | "detour_private" | "tailscale" | "headscale";

function cleanText(value: string | undefined, label: string, max = 120): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw new Error(`${label} is required`);
  if (trimmed.length > max) throw new Error(`${label} is too long`);
  return trimmed;
}

function optionalText(value: string | undefined, max = 240): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > max) throw new Error("Field is too long");
  return trimmed;
}

function externalUrl(value: string | undefined, label: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`${label} must use http or https`);
  }
  return parsed.toString().replace(/\/$/, "");
}

async function requireOwnedAgent(
  ctx: QueryCtx | MutationCtx,
  token: string,
  agentId: Id<"agents">,
) {
  const caller = await resolveRole(ctx, token);
  if (!caller) throw new Error("Not authenticated");
  const agent = await ctx.db.get(agentId);
  if (!agent || agent.owner !== caller.pubkey) throw new Error("Agent not found");
  return { caller, agent };
}

function statusFor(authMode: AuthMode, secretRef: string | undefined) {
  return authMode === "none" || secretRef ? "configured" : "needs_secret";
}

function validateMesh(mode: MeshMode, tailnet?: string, headscaleUrl?: string) {
  if (mode === "tailscale" && !tailnet) {
    throw new Error("Tailnet is required for Tailscale mesh access");
  }
  if (mode === "headscale" && !headscaleUrl) {
    throw new Error("Headscale URL is required for Headscale mesh access");
  }
}

export const list = query({
  args: { token: v.string(), agentId: v.id("agents") },
  handler: async (ctx, { token, agentId }) => {
    const { caller } = await requireOwnedAgent(ctx, token, agentId);
    const rows = await ctx.db
      .query("agentExternalConnections")
      .withIndex("by_owner_agent", (q) =>
        q.eq("owner", caller.pubkey).eq("agentId", agentId),
      )
      .collect();
    return rows
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((row) => ({
        id: row._id,
        label: row.label,
        provider: row.provider,
        baseUrl: row.baseUrl,
        apiBaseUrl: row.apiBaseUrl ?? null,
        a2aUrl: row.a2aUrl ?? null,
        mcpUrl: row.mcpUrl ?? null,
        authMode: row.authMode,
        authHeaderName: row.authHeaderName ?? null,
        authSecretRef: row.authSecretRef ?? null,
        meshMode: row.meshMode,
        tailnet: row.tailnet ?? null,
        headscaleUrl: row.headscaleUrl ?? null,
        meshHostname: row.meshHostname ?? null,
        notes: row.notes ?? null,
        status: row.status,
        lastError: row.lastError ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
  },
});

export const listAll = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) return [];
    const rows = await ctx.db
      .query("agentExternalConnections")
      .withIndex("by_owner", (q) => q.eq("owner", caller.pubkey))
      .collect();
    return rows
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((row) => ({
        id: row._id,
        agentId: row.agentId,
        label: row.label,
        provider: row.provider,
        baseUrl: row.baseUrl,
        apiBaseUrl: row.apiBaseUrl ?? null,
        a2aUrl: row.a2aUrl ?? null,
        mcpUrl: row.mcpUrl ?? null,
        authMode: row.authMode,
        authHeaderName: row.authHeaderName ?? null,
        authSecretRef: row.authSecretRef ?? null,
        meshMode: row.meshMode,
        tailnet: row.tailnet ?? null,
        headscaleUrl: row.headscaleUrl ?? null,
        meshHostname: row.meshHostname ?? null,
        notes: row.notes ?? null,
        status: row.status,
        lastError: row.lastError ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
  },
});

export const upsert = mutation({
  args: {
    token: v.string(),
    agentId: v.id("agents"),
    connectionId: v.optional(v.id("agentExternalConnections")),
    label: v.string(),
    provider: v.string(),
    baseUrl: v.string(),
    apiBaseUrl: v.optional(v.string()),
    a2aUrl: v.optional(v.string()),
    mcpUrl: v.optional(v.string()),
    authMode: authModeValidator,
    authHeaderName: v.optional(v.string()),
    authSecretRef: v.optional(v.string()),
    meshMode: meshModeValidator,
    tailnet: v.optional(v.string()),
    headscaleUrl: v.optional(v.string()),
    meshHostname: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { caller } = await requireOwnedAgent(ctx, args.token, args.agentId);
    const baseUrl = externalUrl(args.baseUrl, "Base URL");
    if (!baseUrl) throw new Error("Base URL is required");
    const apiBaseUrl = externalUrl(args.apiBaseUrl, "API base URL");
    const a2aUrl = externalUrl(args.a2aUrl, "A2A URL");
    const mcpUrl = externalUrl(args.mcpUrl, "MCP URL");
    if (!apiBaseUrl && !a2aUrl && !mcpUrl) {
      throw new Error("Add at least one API, A2A, or MCP URL");
    }
    const label = cleanText(args.label, "Connection label", 80);
    const provider = cleanText(args.provider, "Provider", 80);
    const authHeaderName =
      args.authMode === "custom_header"
        ? cleanText(args.authHeaderName, "Auth header", 80)
        : optionalText(args.authHeaderName, 80);
    const authSecretRef =
      args.authMode === "none" ? undefined : optionalText(args.authSecretRef, 120);
    const tailnet = optionalText(args.tailnet, 120);
    const headscaleUrl = externalUrl(args.headscaleUrl, "Headscale URL");
    const meshHostname = optionalText(args.meshHostname, 80);
    validateMesh(args.meshMode, tailnet, headscaleUrl);
    const now = Date.now();
    const update = {
      owner: caller.pubkey,
      agentId: args.agentId,
      label,
      provider,
      baseUrl,
      apiBaseUrl,
      a2aUrl,
      mcpUrl,
      authMode: args.authMode,
      authHeaderName,
      authSecretRef,
      meshMode: args.meshMode,
      tailnet,
      headscaleUrl,
      meshHostname,
      notes: optionalText(args.notes, 800),
      status: statusFor(args.authMode, authSecretRef),
      updatedAt: now,
    };
    if (args.connectionId) {
      const existing = await ctx.db.get(args.connectionId);
      if (
        !existing ||
        existing.owner !== caller.pubkey ||
        existing.agentId !== args.agentId
      ) {
        throw new Error("External connection not found");
      }
      await ctx.db.patch(args.connectionId, update);
      return { id: args.connectionId };
    }
    const id = await ctx.db.insert("agentExternalConnections", {
      ...update,
      createdAt: now,
    });
    return { id };
  },
});

export const remove = mutation({
  args: { token: v.string(), connectionId: v.id("agentExternalConnections") },
  handler: async (ctx, { token, connectionId }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) throw new Error("Not authenticated");
    const row = await ctx.db.get(connectionId);
    if (!row || row.owner !== caller.pubkey) {
      throw new Error("External connection not found");
    }
    await ctx.db.delete(connectionId);
    return { ok: true as const };
  },
});
