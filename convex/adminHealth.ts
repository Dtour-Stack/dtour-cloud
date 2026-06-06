import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import {
  assessOpenRouterCredits,
  type OpenRouterCreditStatus,
  type OpenRouterRequestClass,
} from "./openrouterPolicy";
import { requireRole } from "./rbac";

const USD = 1_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const EVENT_EXPORT_LIMIT = 1000;
const DEFAULT_OPENROUTER_PAID_RESERVE_USD = 5;
const DEFAULT_OPENROUTER_FREE_RESERVE_USD = 25;

type EventExportRow = {
  type: string;
  pubkey: string | null;
  data: string | null;
  at: number;
};

type TrafficAllowance = {
  allowed: boolean;
  reason: "above_reserve" | "missing_key" | "missing_status" | "low_credits" | "negative_credits";
  remainingUsd: number | null;
  reserveUsd: number;
  fetchedAt: number | null;
};

export type AdminHealthPacket = {
  generatedAt: number;
  eventExports: {
    last24h: EventExportRow[];
    last7d: EventExportRow[];
    last7dTruncated: boolean;
    byType24h: Record<string, number>;
    byType7d: Record<string, number>;
  };
  convexFunctionLogs: {
    rawRuntimeLogsAttached: boolean;
    source: string;
    persistedErrors7d: number;
    errorsByType7d: Record<string, number>;
    recentErrors: Array<{
      source: string;
      type: string;
      detail: string | null;
      at: number;
    }>;
  };
  usageLedgerAggregates: {
    creditBalances: {
      wallets: number;
      totalBalanceUsd: number;
      negativeWallets: number;
    };
    creditTopUps: {
      rows: number;
      totalGrantedUsd: number;
      byAsset: Record<string, { rows: number; grantedUsd: number }>;
      lastAt: number | null;
    };
    codingUsage: {
      rows: number;
      costUsd: number;
      chargedUsd: number;
      durationSec: number;
      holderDiscountRows: number;
      lastAt: number | null;
    };
    inferenceUsage: {
      rows: number;
      costUsd: number;
      chargedUsd: number;
      freeRows: number;
      fallbackRows: number;
      holderDiscountRows: number;
      bySurface: Record<string, number>;
      byGateway: Record<string, number>;
      lastAt: number | null;
    };
  };
  tableCounts: Record<string, number>;
  anomalyCounts: Record<string, number>;
  testerWaitlistRows: Array<{
    email: string;
    pubkey: string | null;
    kind: "early_access" | "dev_tester";
    name: string | null;
    reason: string | null;
    at: number;
  }>;
  providerHealth: {
    openrouter: {
      configured: boolean;
      remainingUsd: number | null;
      fetchedAt: number | null;
      paidTraffic: TrafficAllowance;
      freeTraffic: TrafficAllowance;
      reserve: { paidReserveUsd: number; freeReserveUsd: number };
    };
    elizacloud: { configured: boolean };
    detourFallback: { configured: boolean };
    agentMail: { configured: boolean; webhookConfigured: boolean };
    coding: {
      e2bConfigured: boolean;
      liveSessions: number;
      connectedDesktopDevices24h: number;
      pendingPairings: number;
    };
    remoteProvisioning: {
      deploymentsByStatus: Record<string, number>;
      activeProvider: Record<string, number>;
      fallbackStatus: Record<string, number>;
      staleHeartbeats: number;
    };
    inferenceFallbacks7d: {
      rows: number;
      byGateway: Record<string, number>;
      byRouteVariant: Record<string, number>;
    };
  };
};

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function openRouterReserve() {
  return {
    paidReserveUsd: envNumber(
      "OPENROUTER_PAID_RESERVE_USD",
      DEFAULT_OPENROUTER_PAID_RESERVE_USD,
    ),
    freeReserveUsd: envNumber(
      "OPENROUTER_FREE_RESERVE_USD",
      DEFAULT_OPENROUTER_FREE_RESERVE_USD,
    ),
  };
}

function preview(value: string, max = 360): string {
  const flat = value.trim().replace(/\s+/g, " ");
  return flat.length > max ? `${flat.slice(0, max)}...` : flat;
}

function requiredNumber(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableNumber(value: number | null | undefined): number | null {
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseOpenRouterStatus(json: string | undefined): OpenRouterCreditStatus | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Partial<OpenRouterCreditStatus>;
    const fetchedAt = requiredNumber(parsed.fetchedAt);
    const usageUsd = requiredNumber(parsed.usageUsd);
    const dailyUsageUsd = requiredNumber(parsed.dailyUsageUsd);
    const weeklyUsageUsd = requiredNumber(parsed.weeklyUsageUsd);
    const monthlyUsageUsd = requiredNumber(parsed.monthlyUsageUsd);
    if (
      fetchedAt === null ||
      usageUsd === null ||
      dailyUsageUsd === null ||
      weeklyUsageUsd === null ||
      monthlyUsageUsd === null
    ) {
      return null;
    }
    return {
      label: typeof parsed.label === "string" ? parsed.label : null,
      limitUsd: nullableNumber(parsed.limitUsd),
      remainingUsd: nullableNumber(parsed.remainingUsd),
      usageUsd,
      dailyUsageUsd,
      weeklyUsageUsd,
      monthlyUsageUsd,
      freeTier: parsed.freeTier === true,
      fetchedAt,
    };
  } catch {
    return null;
  }
}

function increment(record: Record<string, number>, key: string) {
  const current = record[key];
  record[key] = current === undefined ? 1 : current + 1;
}

function countBy<T>(rows: T[], keyFor: (row: T) => string | null): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = keyFor(row);
    if (key) increment(counts, key);
  }
  return counts;
}

function latestAt<T>(rows: T[], atFor: (row: T) => number): number | null {
  let latest: number | null = null;
  for (const row of rows) {
    const at = atFor(row);
    if (latest === null || at > latest) latest = at;
  }
  return latest;
}

function usdFromMicro(micro: number): number {
  return micro / USD;
}

function eventRow(row: Doc<"events">): EventExportRow {
  return {
    type: row.type,
    pubkey: row.pubkey ?? null,
    data: row.data ? preview(row.data, 700) : null,
    at: row.at,
  };
}

function eventLooksErrored(row: Doc<"events">): boolean {
  const haystack = `${row.type} ${row.data ?? ""}`.toLowerCase();
  return haystack.includes("error") || haystack.includes("failed") || haystack.includes("fail");
}

function trafficAllowance(
  configured: boolean,
  status: OpenRouterCreditStatus | null,
  requestClass: OpenRouterRequestClass,
  reserveUsd: number,
): TrafficAllowance {
  if (!configured) {
    return {
      allowed: false,
      reason: "missing_key",
      remainingUsd: null,
      reserveUsd,
      fetchedAt: null,
    };
  }
  if (!status) {
    return {
      allowed: false,
      reason: "missing_status",
      remainingUsd: null,
      reserveUsd,
      fetchedAt: null,
    };
  }
  const decision = assessOpenRouterCredits(status, requestClass, {
    paidReserveUsd: reserveUsd,
    freeReserveUsd: reserveUsd,
  });
  if (decision.ok) {
    return {
      allowed: true,
      reason: "above_reserve",
      remainingUsd: status.remainingUsd,
      reserveUsd,
      fetchedAt: status.fetchedAt,
    };
  }
  return {
    allowed: false,
    reason: decision.reason,
    remainingUsd: decision.remainingUsd,
    reserveUsd: decision.reserveUsd,
    fetchedAt: status.fetchedAt,
  };
}

export async function buildAdminHealthPacket(
  ctx: QueryCtx | MutationCtx,
  now = Date.now(),
): Promise<AdminHealthPacket> {
  const sevenDayAgo = now - 7 * DAY_MS;
  const dayAgo = now - DAY_MS;
  const [
    users,
    profiles,
    sessions,
    whitelist,
    waitlist,
    configs,
    flags,
    agents,
    remoteDeployments,
    agentWorkflowLinks,
    appBuilds,
    externalConnections,
    mcpConnections,
    agentChats,
    agentTurnTraces,
    agentMessageExtras,
    agentMessages,
    messages,
    adminAssistantThreads,
    adminAssistantMessages,
    testerOutreach,
    agentMailWebhookEvents,
    designDocs,
    workflowRuns,
    assets,
    workflowTemplates,
    tokenomicsRows,
    payoutLedger,
    creditBalances,
    creditTopUps,
    codingUsage,
    codingWorkspaces,
    inferenceUsage,
    freetourUsage,
    openrouterPrices,
    openrouterKeyStatus,
    apiKeys,
    affiliates,
    referrals,
    affiliatePayouts,
    codingProviderSecrets,
    codingSessions,
    codingDevices,
    codingDevicePairings,
    events7d,
  ] = await Promise.all([
    ctx.db.query("users").collect(),
    ctx.db.query("profiles").collect(),
    ctx.db.query("sessions").collect(),
    ctx.db.query("whitelist").collect(),
    ctx.db.query("waitlist").collect(),
    ctx.db.query("config").collect(),
    ctx.db.query("featureFlags").collect(),
    ctx.db.query("agents").collect(),
    ctx.db.query("remoteAgentDeployments").collect(),
    ctx.db.query("agentWorkflowLinks").collect(),
    ctx.db.query("appBuilds").collect(),
    ctx.db.query("agentExternalConnections").collect(),
    ctx.db.query("mcpConnections").collect(),
    ctx.db.query("agentChats").collect(),
    ctx.db.query("agentTurnTraces").collect(),
    ctx.db.query("agentMessageExtras").collect(),
    ctx.db.query("agentMessages").collect(),
    ctx.db.query("messages").collect(),
    ctx.db.query("adminAssistantThreads").collect(),
    ctx.db.query("adminAssistantMessages").collect(),
    ctx.db.query("testerOutreach").collect(),
    ctx.db.query("agentMailWebhookEvents").collect(),
    ctx.db.query("designDocs").collect(),
    ctx.db.query("workflowRuns").collect(),
    ctx.db.query("assets").collect(),
    ctx.db.query("workflowTemplates").collect(),
    ctx.db.query("tokenomicsConfig").collect(),
    ctx.db.query("payoutLedger").collect(),
    ctx.db.query("creditBalances").collect(),
    ctx.db.query("creditTopUps").collect(),
    ctx.db.query("codingUsage").collect(),
    ctx.db.query("codingWorkspaces").collect(),
    ctx.db.query("inferenceUsage").collect(),
    ctx.db.query("freetourUsage").collect(),
    ctx.db.query("openrouterPrices").collect(),
    ctx.db.query("openrouterKeyStatus").collect(),
    ctx.db.query("apiKeys").collect(),
    ctx.db.query("affiliates").collect(),
    ctx.db.query("referrals").collect(),
    ctx.db.query("affiliatePayouts").collect(),
    ctx.db.query("codingProviderSecrets").collect(),
    ctx.db.query("codingSessions").collect(),
    ctx.db.query("codingDevices").collect(),
    ctx.db.query("codingDevicePairings").collect(),
    ctx.db
      .query("events")
      .withIndex("by_at", (q) => q.gte("at", sevenDayAgo))
      .order("desc")
      .take(EVENT_EXPORT_LIMIT),
  ]);

  const events24h = events7d.filter((row) => row.at >= dayAgo);
  const recentInference7d = inferenceUsage.filter((row) => row.at >= sevenDayAgo);
  const inferenceFallbackRows = recentInference7d.filter((row) => row.fallbackUsed === true);
  const openRouterStatus = parseOpenRouterStatus(openrouterKeyStatus[0]?.json);
  const openRouterConfigured = !!process.env.OPENROUTER_API_KEY;
  const reserve = openRouterReserve();
  const errorEvents = events7d.filter(eventLooksErrored);
  const failedOutreach = testerOutreach.filter((row) => row.status === "failed");
  const erroredWorkflowRuns = workflowRuns.filter((row) => row.status === "error");
  const failedAdminMessages = adminAssistantMessages.filter((row) => row.status === "failed");
  const balancePubkeys = new Set(creditBalances.map((row) => row.pubkey));
  const staleHeartbeatCutoff = now - 10 * 60 * 1000;

  const totalBalanceMicro = creditBalances.reduce(
    (sum, row) => sum + row.balanceMicroUsd,
    0,
  );
  const topUpByAsset: Record<string, { rows: number; grantedUsd: number }> = {};
  for (const row of creditTopUps) {
    const asset = row.asset === undefined ? "DTOUR" : row.asset;
    const current = topUpByAsset[asset];
    if (current) {
      current.rows += 1;
      current.grantedUsd += usdFromMicro(row.usdMicro);
    } else {
      topUpByAsset[asset] = { rows: 1, grantedUsd: usdFromMicro(row.usdMicro) };
    }
  }

  const codingCostMicro = codingUsage.reduce((sum, row) => sum + row.costMicroUsd, 0);
  const codingPriceMicro = codingUsage.reduce((sum, row) => sum + row.priceMicroUsd, 0);
  const codingDurationSec = codingUsage.reduce((sum, row) => sum + row.durationSec, 0);
  const inferenceCostMicro = inferenceUsage.reduce((sum, row) => sum + row.costMicroUsd, 0);
  const inferencePriceMicro = inferenceUsage.reduce((sum, row) => sum + row.priceMicroUsd, 0);
  const recentErrors = [
    ...errorEvents.slice(0, 40).map((row) => ({
      source: "events",
      type: row.type,
      detail: row.data ? preview(row.data) : null,
      at: row.at,
    })),
    ...failedOutreach.slice(0, 20).map((row) => ({
      source: "testerOutreach",
      type: "testerOutreach.failed",
      detail: row.error ? preview(row.error) : row.email,
      at: row.updatedAt,
    })),
    ...erroredWorkflowRuns.slice(0, 20).map((row) => ({
      source: "workflowRuns",
      type: "workflow.error",
      detail: preview(row.nodes),
      at: row.updatedAt,
    })),
    ...failedAdminMessages.slice(0, 20).map((row) => ({
      source: "adminAssistantMessages",
      type: "adminAssistant.failed",
      detail: preview(row.content),
      at: row.at,
    })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 50);

  const tableCounts: Record<string, number> = {
    users: users.length,
    profiles: profiles.length,
    sessions: sessions.length,
    whitelist: whitelist.length,
    waitlist: waitlist.length,
    config: configs.length,
    featureFlags: flags.length,
    agents: agents.length,
    remoteAgentDeployments: remoteDeployments.length,
    agentWorkflowLinks: agentWorkflowLinks.length,
    appBuilds: appBuilds.length,
    agentExternalConnections: externalConnections.length,
    mcpConnections: mcpConnections.length,
    agentChats: agentChats.length,
    agentTurnTraces: agentTurnTraces.length,
    agentMessageExtras: agentMessageExtras.length,
    agentMessages: agentMessages.length,
    messages: messages.length,
    adminAssistantThreads: adminAssistantThreads.length,
    adminAssistantMessages: adminAssistantMessages.length,
    testerOutreach: testerOutreach.length,
    agentMailWebhookEvents: agentMailWebhookEvents.length,
    events: events7d.length,
    designDocs: designDocs.length,
    workflowRuns: workflowRuns.length,
    assets: assets.length,
    workflowTemplates: workflowTemplates.length,
    tokenomicsConfig: tokenomicsRows.length,
    payoutLedger: payoutLedger.length,
    creditBalances: creditBalances.length,
    creditTopUps: creditTopUps.length,
    codingUsage: codingUsage.length,
    codingWorkspaces: codingWorkspaces.length,
    inferenceUsage: inferenceUsage.length,
    freetourUsage: freetourUsage.length,
    openrouterPrices: openrouterPrices.length,
    openrouterKeyStatus: openrouterKeyStatus.length,
    apiKeys: apiKeys.length,
    affiliates: affiliates.length,
    referrals: referrals.length,
    affiliatePayouts: affiliatePayouts.length,
    codingProviderSecrets: codingProviderSecrets.length,
    codingSessions: codingSessions.length,
    codingDevices: codingDevices.length,
    codingDevicePairings: codingDevicePairings.length,
  };

  const anomalyCounts: Record<string, number> = {
    expiredSessions: sessions.filter((row) => row.expiresAt < now).length,
    usersMissingCreditBalance: users.filter((row) => !balancePubkeys.has(row.pubkey)).length,
    negativeCreditBalances: creditBalances.filter((row) => row.balanceMicroUsd < 0).length,
    testerApplicationsMissingPubkey: waitlist.filter(
      (row) => (row.kind ?? "early_access") === "dev_tester" && !row.pubkey,
    ).length,
    testerApplicationsMissingReason: waitlist.filter(
      (row) => (row.kind ?? "early_access") === "dev_tester" && !row.reason,
    ).length,
    remoteDeploymentsInError: remoteDeployments.filter((row) => row.status === "error").length,
    remoteDeploymentsStaleHeartbeat: remoteDeployments.filter(
      (row) => row.status === "running" && (!row.lastHeartbeatAt || row.lastHeartbeatAt < staleHeartbeatCutoff),
    ).length,
    externalConnectionsInError: externalConnections.filter((row) => row.status === "error").length,
    workflowRunsInError: erroredWorkflowRuns.length,
    adminAssistantFailedMessages: failedAdminMessages.length,
    failedTesterOutreach: failedOutreach.length,
    persistedErrorEvents7d: errorEvents.length,
    inferenceFallbacks7d: inferenceFallbackRows.length,
    openRouterStatusMissing: openRouterConfigured && openRouterStatus === null ? 1 : 0,
    requestedAffiliatePayouts: affiliatePayouts.filter((row) => row.status === "requested").length,
    pendingDesktopPairings: codingDevicePairings.filter((row) => row.status === "pending").length,
  };

  return {
    generatedAt: now,
    eventExports: {
      last24h: events24h.map(eventRow),
      last7d: events7d.map(eventRow),
      last7dTruncated: events7d.length === EVENT_EXPORT_LIMIT,
      byType24h: countBy(events24h, (row) => row.type),
      byType7d: countBy(events7d, (row) => row.type),
    },
    convexFunctionLogs: {
      rawRuntimeLogsAttached: false,
      source: "persisted events, workflow statuses, admin assistant statuses, and outreach statuses",
      persistedErrors7d: errorEvents.length + failedOutreach.length + erroredWorkflowRuns.length + failedAdminMessages.length,
      errorsByType7d: countBy(errorEvents, (row) => row.type),
      recentErrors,
    },
    usageLedgerAggregates: {
      creditBalances: {
        wallets: creditBalances.length,
        totalBalanceUsd: usdFromMicro(totalBalanceMicro),
        negativeWallets: creditBalances.filter((row) => row.balanceMicroUsd < 0).length,
      },
      creditTopUps: {
        rows: creditTopUps.length,
        totalGrantedUsd: usdFromMicro(creditTopUps.reduce((sum, row) => sum + row.usdMicro, 0)),
        byAsset: topUpByAsset,
        lastAt: latestAt(creditTopUps, (row) => row.at),
      },
      codingUsage: {
        rows: codingUsage.length,
        costUsd: usdFromMicro(codingCostMicro),
        chargedUsd: usdFromMicro(codingPriceMicro),
        durationSec: codingDurationSec,
        holderDiscountRows: codingUsage.filter((row) => row.holderDiscount).length,
        lastAt: latestAt(codingUsage, (row) => row.at),
      },
      inferenceUsage: {
        rows: inferenceUsage.length,
        costUsd: usdFromMicro(inferenceCostMicro),
        chargedUsd: usdFromMicro(inferencePriceMicro),
        freeRows: inferenceUsage.filter((row) => row.free === true).length,
        fallbackRows: inferenceUsage.filter((row) => row.fallbackUsed === true).length,
        holderDiscountRows: inferenceUsage.filter((row) => row.holderDiscount).length,
        bySurface: countBy(inferenceUsage, (row) => row.surface),
        byGateway: countBy(inferenceUsage, (row) => row.gateway ?? "unrecorded"),
        lastAt: latestAt(inferenceUsage, (row) => row.at),
      },
    },
    tableCounts,
    anomalyCounts,
    testerWaitlistRows: waitlist
      .slice()
      .sort((a, b) => b.at - a.at)
      .map((row) => ({
        email: row.email,
        pubkey: row.pubkey ?? null,
        kind: row.kind ?? "early_access",
        name: row.name ?? null,
        reason: row.reason ?? null,
        at: row.at,
      })),
    providerHealth: {
      openrouter: {
        configured: openRouterConfigured,
        remainingUsd: openRouterStatus?.remainingUsd ?? null,
        fetchedAt: openRouterStatus?.fetchedAt ?? null,
        paidTraffic: trafficAllowance(
          openRouterConfigured,
          openRouterStatus,
          "paid",
          reserve.paidReserveUsd,
        ),
        freeTraffic: trafficAllowance(
          openRouterConfigured,
          openRouterStatus,
          "free",
          reserve.freeReserveUsd,
        ),
        reserve,
      },
      elizacloud: {
        configured: !!(process.env.ELIZACLOUD_API_KEY || process.env.ELIZAOS_CLOUD_API_KEY),
      },
      detourFallback: {
        configured: !!(process.env.DETOUR_REMOTE_RUNTIME_URL && process.env.DETOUR_REMOTE_RUNTIME_KEY),
      },
      agentMail: {
        configured: !!(
          process.env.AGENTMAIL_API_KEY &&
          (process.env.AGENTMAIL_INBOX_ID || process.env.AGENTMAIL_FROM_INBOX_ID)
        ),
        webhookConfigured: !!process.env.AGENTMAIL_WEBHOOK_SECRET,
      },
      coding: {
        e2bConfigured: !!process.env.E2B_API_KEY,
        liveSessions: codingSessions.filter((row) => row.status === "live").length,
        connectedDesktopDevices24h: codingDevices.filter(
          (row) => row.revoked !== true && row.lastSeenAt !== undefined && row.lastSeenAt >= dayAgo,
        ).length,
        pendingPairings: codingDevicePairings.filter((row) => row.status === "pending").length,
      },
      remoteProvisioning: {
        deploymentsByStatus: countBy(remoteDeployments, (row) => row.status),
        activeProvider: countBy(remoteDeployments, (row) => row.activeProvider ?? "none"),
        fallbackStatus: countBy(remoteDeployments, (row) => row.fallbackStatus ?? "none"),
        staleHeartbeats: anomalyCounts.remoteDeploymentsStaleHeartbeat,
      },
      inferenceFallbacks7d: {
        rows: inferenceFallbackRows.length,
        byGateway: countBy(inferenceFallbackRows, (row) => row.gateway ?? "unrecorded"),
        byRouteVariant: countBy(inferenceFallbackRows, (row) => row.routeVariant ?? "unrecorded"),
      },
    },
  };
}

export const packet = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireRole(ctx, token, "admin");
    return buildAdminHealthPacket(ctx);
  },
});
