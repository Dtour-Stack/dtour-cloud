import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { logEvent } from "./events";
import { resolveRole } from "./rbac";

type RemoteRuntimeStatus =
  | "not_configured"
  | "configured"
  | "creating"
  | "queued"
  | "provisioning"
  | "running"
  | "suspended"
  | "error"
  | "unknown";

type RemoteRuntimeMode = "on_demand" | "remote_24_7";
type RemoteRuntimeDomainMode = "detour" | "custom";
type RemoteRuntimeAccess = "private" | "public";
type JsonValue = string | number | boolean | null | JsonValue[] | JsonRecord;
type JsonRecord = { [key: string]: JsonValue };
type ProvisionContextArgs = { token: string; agentId: Id<"agents"> };
type RecordProvisionStateArgs = {
  token: string;
  agentId: Id<"agents">;
  status: RemoteRuntimeStatus;
  upstreamAgentId?: string;
  upstreamJobId?: string;
  webUiUrl?: string;
  apiBaseUrl?: string;
  lastHeartbeatAt?: number;
  lastError?: string;
};

const statusValidator = v.union(
  v.literal("not_configured"),
  v.literal("configured"),
  v.literal("creating"),
  v.literal("queued"),
  v.literal("provisioning"),
  v.literal("running"),
  v.literal("suspended"),
  v.literal("error"),
  v.literal("unknown"),
);

const modeValidator = v.union(v.literal("on_demand"), v.literal("remote_24_7"));
const domainModeValidator = v.union(v.literal("detour"), v.literal("custom"));
const accessValidator = v.union(v.literal("private"), v.literal("public"));

function defaultDetourSubdomain(agentId: string): string {
  const compact = agentId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(-10);
  return `agent-${compact || "runtime"}.detour.ninja`;
}

function configuredStatus(
  mode: RemoteRuntimeMode,
  existing?: RemoteRuntimeStatus,
): RemoteRuntimeStatus {
  if (mode === "on_demand") return "not_configured";
  if (
    existing === "creating" ||
    existing === "queued" ||
    existing === "provisioning" ||
    existing === "running" ||
    existing === "suspended" ||
    existing === "error"
  ) {
    return existing;
  }
  return "configured";
}

function normalizeCustomDomain(domain?: string): string | undefined {
  const trimmed = domain?.trim().toLowerCase();
  return trimmed || undefined;
}

function runtimeUrl(
  agentId: Id<"agents">,
  domainMode: RemoteRuntimeDomainMode,
  customDomain?: string,
): string {
  if (domainMode === "custom" && customDomain) return `https://${customDomain}`;
  return `https://${defaultDetourSubdomain(agentId)}`;
}

function apiUrl(agentId: Id<"agents">, upstreamAgentId?: string): string {
  if (upstreamAgentId) return `https://api.detour.ninja/v1/agents/${upstreamAgentId}`;
  return `https://api.detour.ninja/v1/agents/${agentId}`;
}

function serializeDeployment(
  agentId: Id<"agents">,
  deployment: Doc<"remoteAgentDeployments"> | null,
) {
  const domainMode = deployment?.domainMode ?? "detour";
  const customDomain = deployment?.customDomain;
  const upstreamAgentId = deployment?.upstreamAgentId;
  return {
    id: deployment?._id ?? null,
    agentId,
    mode: deployment?.mode ?? "on_demand",
    status: deployment?.status ?? "not_configured",
    upstreamAgentId: upstreamAgentId ?? null,
    upstreamJobId: deployment?.upstreamJobId ?? null,
    domainMode,
    detourSubdomain: deployment?.detourSubdomain ?? defaultDetourSubdomain(agentId),
    customDomain: customDomain ?? null,
    webVisibility: deployment?.webVisibility ?? "private",
    apiVisibility: deployment?.apiVisibility ?? "private",
    a2aEnabled: deployment?.a2aEnabled ?? false,
    mcpEnabled: deployment?.mcpEnabled ?? false,
    webUiUrl: deployment?.webUiUrl ?? runtimeUrl(agentId, domainMode, customDomain),
    apiBaseUrl: deployment?.apiBaseUrl ?? apiUrl(agentId, upstreamAgentId),
    lastHeartbeatAt: deployment?.lastHeartbeatAt ?? null,
    lastSyncedAt: deployment?.lastSyncedAt ?? null,
    lastError: deployment?.lastError ?? null,
    createdAt: deployment?.createdAt ?? null,
    updatedAt: deployment?.updatedAt ?? null,
  };
}

type SerializedDeployment = ReturnType<typeof serializeDeployment>;
type ProvisionContextResult = {
  caller: { pubkey: string; role: string };
  agent: {
    id: Id<"agents">;
    name: string;
    description: string | null;
    systemPrompt: string;
    model: string;
    plugins: string[];
  };
  deployment: SerializedDeployment;
};

const provisionContextRef = makeFunctionReference<
  "query",
  ProvisionContextArgs,
  ProvisionContextResult
>("remoteAgentDeployments:provisionContext");

const recordProvisionStateRef = makeFunctionReference<
  "mutation",
  RecordProvisionStateArgs,
  SerializedDeployment
>("remoteAgentDeployments:recordProvisionState");

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

async function deploymentForAgent(
  ctx: QueryCtx | MutationCtx,
  agentId: Id<"agents">,
) {
  return await ctx.db
    .query("remoteAgentDeployments")
    .withIndex("by_agent", (q) => q.eq("agentId", agentId))
    .unique();
}

function isJsonRecord(value: JsonValue): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseJsonRecord(text: string): JsonRecord {
  if (!text.trim()) return {};
  const parsed: JsonValue = JSON.parse(text);
  if (!isJsonRecord(parsed)) throw new Error("Expected JSON object from ElizaCloud");
  return parsed;
}

function recordProp(record: JsonRecord, key: string): JsonRecord | null {
  const value = record[key];
  return value && isJsonRecord(value) ? value : null;
}

function stringProp(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function numberProp(record: JsonRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" ? value : null;
}

function dateMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function statusFromCloud(value: string | null): RemoteRuntimeStatus {
  switch (value) {
    case "pending":
      return "queued";
    case "provisioning":
    case "in_progress":
      return "provisioning";
    case "running":
      return "running";
    case "stopped":
    case "disconnected":
    case "suspended":
      return "suspended";
    case "error":
      return "error";
    case null:
      return "unknown";
    default:
      return "unknown";
  }
}

function cloudError(payload: JsonRecord, status: number): string {
  return (
    stringProp(payload, "error") ??
    stringProp(payload, "message") ??
    `ElizaCloud request failed (${status})`
  );
}

async function elizaFetch(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: JsonRecord,
) {
  const base = process.env.ELIZACLOUD_API_URL;
  const key = process.env.ELIZACLOUD_API_KEY;
  if (!base || !key) {
    throw new Error(
      "ElizaCloud proxy is not configured. Set ELIZACLOUD_API_URL and ELIZACLOUD_API_KEY.",
    );
  }
  const response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = parseJsonRecord(await response.text());
  if (!response.ok) throw new Error(cloudError(payload, response.status));
  return { status: response.status, payload };
}

export const list = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) return [];
    const [agents, deployments] = await Promise.all([
      ctx.db
        .query("agents")
        .withIndex("by_owner", (q) => q.eq("owner", caller.pubkey))
        .order("desc")
        .collect(),
      ctx.db
        .query("remoteAgentDeployments")
        .withIndex("by_owner", (q) => q.eq("owner", caller.pubkey))
        .collect(),
    ]);
    const byAgent = new Map(deployments.map((d) => [d.agentId, d]));
    return agents.map((agent) => ({
      agent: {
        id: agent._id,
        name: agent.name,
        description: agent.description ?? null,
        model: agent.model,
        type: agent.type,
        plugins: agent.plugins ?? [],
        createdAt: agent.createdAt,
      },
      deployment: serializeDeployment(agent._id, byAgent.get(agent._id) ?? null),
    }));
  },
});

export const configure = mutation({
  args: {
    token: v.string(),
    agentId: v.id("agents"),
    mode: modeValidator,
    domainMode: domainModeValidator,
    customDomain: v.optional(v.string()),
    webVisibility: accessValidator,
    apiVisibility: accessValidator,
    a2aEnabled: v.boolean(),
    mcpEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { caller } = await requireOwnedAgent(ctx, args.token, args.agentId);
    const customDomain = normalizeCustomDomain(args.customDomain);
    if (args.domainMode === "custom" && !customDomain) {
      throw new Error("Custom domain is required");
    }
    const existing = await deploymentForAgent(ctx, args.agentId);
    const now = Date.now();
    const status = configuredStatus(args.mode, existing?.status);
    const base = {
      owner: caller.pubkey,
      mode: args.mode,
      status,
      domainMode: args.domainMode,
      detourSubdomain: defaultDetourSubdomain(args.agentId),
      customDomain,
      webVisibility: args.webVisibility,
      apiVisibility: args.apiVisibility,
      a2aEnabled: args.a2aEnabled,
      mcpEnabled: args.mcpEnabled,
      webUiUrl: runtimeUrl(args.agentId, args.domainMode, customDomain),
      apiBaseUrl: existing?.apiBaseUrl ?? apiUrl(args.agentId, existing?.upstreamAgentId),
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, base);
    } else {
      await ctx.db.insert("remoteAgentDeployments", {
        agentId: args.agentId,
        ...base,
        createdAt: now,
      });
    }
    await logEvent(ctx, "remote_runtime.configure", {
      pubkey: caller.pubkey,
      data: { agentId: args.agentId, mode: args.mode, status },
    });
    return serializeDeployment(
      args.agentId,
      await deploymentForAgent(ctx, args.agentId),
    );
  },
});

export const provisionContext = internalQuery({
  args: { token: v.string(), agentId: v.id("agents") },
  handler: async (ctx, { token, agentId }) => {
    const { caller, agent } = await requireOwnedAgent(ctx, token, agentId);
    const deployment = await deploymentForAgent(ctx, agentId);
    return {
      caller,
      agent: {
        id: agent._id,
        name: agent.name,
        description: agent.description ?? null,
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        plugins: agent.plugins ?? [],
      },
      deployment: serializeDeployment(agentId, deployment),
    };
  },
});

export const recordProvisionState = internalMutation({
  args: {
    token: v.string(),
    agentId: v.id("agents"),
    status: statusValidator,
    upstreamAgentId: v.optional(v.string()),
    upstreamJobId: v.optional(v.string()),
    webUiUrl: v.optional(v.string()),
    apiBaseUrl: v.optional(v.string()),
    lastHeartbeatAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { caller } = await requireOwnedAgent(ctx, args.token, args.agentId);
    const existing = await deploymentForAgent(ctx, args.agentId);
    const now = Date.now();
    const patch = {
      owner: caller.pubkey,
      mode: existing?.mode ?? ("remote_24_7" as const),
      status: args.status,
      upstreamAgentId: args.upstreamAgentId ?? existing?.upstreamAgentId,
      upstreamJobId: args.upstreamJobId ?? existing?.upstreamJobId,
      domainMode: existing?.domainMode ?? ("detour" as const),
      detourSubdomain: existing?.detourSubdomain ?? defaultDetourSubdomain(args.agentId),
      customDomain: existing?.customDomain,
      webVisibility: existing?.webVisibility ?? ("private" as const),
      apiVisibility: existing?.apiVisibility ?? ("private" as const),
      a2aEnabled: existing?.a2aEnabled ?? false,
      mcpEnabled: existing?.mcpEnabled ?? false,
      webUiUrl: args.webUiUrl ?? existing?.webUiUrl,
      apiBaseUrl:
        args.apiBaseUrl ??
        existing?.apiBaseUrl ??
        apiUrl(args.agentId, args.upstreamAgentId ?? existing?.upstreamAgentId),
      lastHeartbeatAt: args.lastHeartbeatAt ?? existing?.lastHeartbeatAt,
      lastSyncedAt: now,
      lastError: args.lastError,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("remoteAgentDeployments", {
        agentId: args.agentId,
        ...patch,
        createdAt: now,
      });
    }
    return serializeDeployment(
      args.agentId,
      await deploymentForAgent(ctx, args.agentId),
    );
  },
});

export const deploy = action({
  args: { token: v.string(), agentId: v.id("agents") },
  handler: async (ctx, { token, agentId }) => {
    const context = await ctx.runQuery(provisionContextRef, {
      token,
      agentId,
    });
    if (context.deployment.mode !== "remote_24_7") {
      throw new Error("Enable 24/7 remote runtime before deploying");
    }
    await ctx.runMutation(recordProvisionStateRef, {
      token,
      agentId,
      status: "creating",
    });

    let upstreamAgentId = context.deployment.upstreamAgentId ?? undefined;
    if (!upstreamAgentId) {
      const { payload } = await elizaFetch("POST", "/api/v1/eliza/agents", {
        agentName: context.agent.name,
        agentConfig: {
          detourAgentId: context.agent.id,
          description: context.agent.description,
          systemPrompt: context.agent.systemPrompt,
          model: context.agent.model,
          plugins: context.agent.plugins,
        },
      });
      const data = recordProp(payload, "data");
      upstreamAgentId = data ? stringProp(data, "id") ?? undefined : undefined;
      if (!upstreamAgentId) throw new Error("ElizaCloud did not return an agent id");
      await ctx.runMutation(recordProvisionStateRef, {
        token,
        agentId,
        status: statusFromCloud(data ? stringProp(data, "status") : null),
        upstreamAgentId,
        apiBaseUrl: apiUrl(agentId, upstreamAgentId),
      });
    }

    const { status, payload } = await elizaFetch(
      "POST",
      `/api/v1/eliza/agents/${encodeURIComponent(upstreamAgentId)}/provision`,
    );
    const data = recordProp(payload, "data");
    const bridgeUrl = data ? stringProp(data, "bridgeUrl") : null;
    const jobId = data ? stringProp(data, "jobId") : null;
    const runtimeStatus =
      bridgeUrl || status === 200
        ? "running"
        : status === 202 || status === 409
          ? "queued"
          : statusFromCloud(data ? stringProp(data, "status") : null);
    await ctx.runMutation(recordProvisionStateRef, {
      token,
      agentId,
      status: runtimeStatus,
      upstreamAgentId,
      upstreamJobId: jobId ?? undefined,
      apiBaseUrl: bridgeUrl ?? apiUrl(agentId, upstreamAgentId),
    });
    return {
      ok: true as const,
      status: runtimeStatus,
      upstreamAgentId,
      upstreamJobId: jobId,
    };
  },
});

export const sync = action({
  args: { token: v.string(), agentId: v.id("agents") },
  handler: async (ctx, { token, agentId }) => {
    const context = await ctx.runQuery(provisionContextRef, {
      token,
      agentId,
    });
    const upstreamAgentId = context.deployment.upstreamAgentId;
    if (!upstreamAgentId) {
      throw new Error("Deploy the remote runtime before syncing status");
    }
    const { payload } = await elizaFetch(
      "GET",
      `/api/v1/eliza/agents/${encodeURIComponent(upstreamAgentId)}`,
    );
    const data = recordProp(payload, "data");
    if (!data) throw new Error("ElizaCloud did not return agent detail");
    const admin = recordProp(data, "adminDetails");
    const bridgeUrl = stringProp(data, "bridgeUrl");
    const webUiUrl = admin ? stringProp(admin, "webUiUrl") : null;
    const lastHeartbeatAt = dateMs(stringProp(data, "lastHeartbeatAt"));
    const lastError = stringProp(data, "errorMessage") ?? undefined;
    const deployment = await ctx.runMutation(
      recordProvisionStateRef,
      {
        token,
        agentId,
        status: statusFromCloud(stringProp(data, "status")),
        upstreamAgentId,
        webUiUrl: webUiUrl ?? undefined,
        apiBaseUrl: bridgeUrl ?? undefined,
        lastHeartbeatAt,
        lastError,
      },
    );
    return { ok: true as const, deployment };
  },
});

export const openWebUi = action({
  args: { token: v.string(), agentId: v.id("agents") },
  handler: async (ctx, { token, agentId }) => {
    const context = await ctx.runQuery(provisionContextRef, {
      token,
      agentId,
    });
    const upstreamAgentId = context.deployment.upstreamAgentId;
    if (!upstreamAgentId) throw new Error("Deploy the remote runtime first");
    const { status, payload } = await elizaFetch(
      "POST",
      `/api/v1/eliza/agents/${encodeURIComponent(upstreamAgentId)}/pairing-token`,
    );
    const data = recordProp(payload, "data");
    if (!data) throw new Error("ElizaCloud did not return pairing data");
    if (status === 202) {
      const jobId = stringProp(data, "jobId") ?? undefined;
      const retryAfterMs = numberProp(data, "retryAfterMs") ?? 5000;
      await ctx.runMutation(recordProvisionStateRef, {
        token,
        agentId,
        status: "queued",
        upstreamAgentId,
        upstreamJobId: jobId,
      });
      return {
        ready: false as const,
        retryAfterMs,
        jobId: jobId ?? null,
        message:
          stringProp(data, "message") ??
          "Runtime is starting. Retry after the suggested interval.",
      };
    }
    const redirectUrl = stringProp(data, "redirectUrl");
    if (!redirectUrl) throw new Error("ElizaCloud did not return a web UI URL");
    await ctx.runMutation(recordProvisionStateRef, {
      token,
      agentId,
      status: "running",
      upstreamAgentId,
      webUiUrl: redirectUrl,
    });
    return { ready: true as const, url: redirectUrl };
  },
});

export const suspend = action({
  args: { token: v.string(), agentId: v.id("agents") },
  handler: async (ctx, { token, agentId }) => {
    const context = await ctx.runQuery(provisionContextRef, {
      token,
      agentId,
    });
    const upstreamAgentId = context.deployment.upstreamAgentId;
    if (!upstreamAgentId) throw new Error("Deploy the remote runtime first");
    const { payload } = await elizaFetch(
      "PATCH",
      `/api/v1/eliza/agents/${encodeURIComponent(upstreamAgentId)}`,
      { action: "suspend" },
    );
    const data = recordProp(payload, "data");
    const jobId = data ? stringProp(data, "jobId") ?? undefined : undefined;
    await ctx.runMutation(recordProvisionStateRef, {
      token,
      agentId,
      status: "suspended",
      upstreamAgentId,
      upstreamJobId: jobId,
    });
    return { ok: true as const, jobId: jobId ?? null };
  },
});
