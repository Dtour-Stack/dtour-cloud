import { useAction, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { type ReactNode, useEffect, useState } from "react";
import { readDtourPlaywrightUser } from "@/lib/playwright-dtour-auth";
import { getDtourSessionToken } from "@/lib/session";
import { Badge, Button, cn, Icon, Panel, Skeleton, StatCard } from "@/ui";

type Summary =
  | {
      totalUsers: number;
      totalProfiles: number;
      whitelisted: number;
      admins: number;
      eventsLast24h: number;
    }
  | null
  | undefined;

type InferenceRollup =
  | {
      platform: { spendUsd: number; paidCalls: number };
      topSpenders: Array<{ pubkey: string; spendUsd: number; calls: number }>;
      note?: string;
    }
  | null
  | undefined;

type OpenRouterDecision =
  | { ok: true }
  | {
      ok: false;
      reason?: "low_credits" | "negative_credits";
      remainingUsd?: number;
      reserveUsd?: number;
    };

type OpenRouterHealth =
  | {
      configured: boolean;
      status: { remainingUsd: number | null; fetchedAt: number } | null;
      paid: OpenRouterDecision | null;
      free: OpenRouterDecision | null;
      reserve: { paidReserveUsd: number; freeReserveUsd: number };
    }
  | null
  | undefined;

type HealthEventRow = {
  type: string;
  pubkey: string | null;
  data: string | null;
  at: number;
};

type AdminHealthPacket =
  | {
      generatedAt: number;
      eventExports: {
        last24h: HealthEventRow[];
        last7d: HealthEventRow[];
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
          paidTraffic: { allowed: boolean; reason: string };
          freeTraffic: { allowed: boolean; reason: string };
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
    }
  | undefined;

const TEST_SUMMARY: Exclude<Summary, null | undefined> = {
  totalUsers: 0,
  totalProfiles: 0,
  whitelisted: 0,
  admins: 0,
  eventsLast24h: 0,
};

const TEST_ROLLUP: Exclude<InferenceRollup, null | undefined> = {
  platform: { spendUsd: 0, paidCalls: 0 },
  topSpenders: [],
};

const TEST_OPENROUTER_HEALTH: Exclude<OpenRouterHealth, null | undefined> = {
  configured: true,
  status: { remainingUsd: 4.25, fetchedAt: Date.now() },
  paid: { ok: false, reason: "low_credits", remainingUsd: 4.25, reserveUsd: 5 },
  free: { ok: false, reason: "low_credits", remainingUsd: 4.25, reserveUsd: 25 },
  reserve: { paidReserveUsd: 5, freeReserveUsd: 25 },
};

const TEST_ADMIN_HEALTH_PACKET: Exclude<AdminHealthPacket, undefined> = {
  generatedAt: Date.now(),
  eventExports: {
    last24h: [{ type: "credits.starter", pubkey: "playwright", data: null, at: Date.now() }],
    last7d: [{ type: "credits.starter", pubkey: "playwright", data: null, at: Date.now() }],
    last7dTruncated: false,
    byType24h: { "credits.starter": 1 },
    byType7d: { "credits.starter": 1 },
  },
  convexFunctionLogs: {
    rawRuntimeLogsAttached: false,
    source: "persisted events, workflow statuses, admin assistant statuses, and outreach statuses",
    persistedErrors7d: 1,
    errorsByType7d: { "inference.error": 1 },
    recentErrors: [
      {
        source: "events",
        type: "inference.error",
        detail: "test error summary",
        at: Date.now(),
      },
    ],
  },
  usageLedgerAggregates: {
    creditBalances: { wallets: 1, totalBalanceUsd: 0.25, negativeWallets: 0 },
    creditTopUps: {
      rows: 1,
      totalGrantedUsd: 0.25,
      byAsset: { STARTER: { rows: 1, grantedUsd: 0.25 } },
      lastAt: Date.now(),
    },
    codingUsage: {
      rows: 0,
      costUsd: 0,
      chargedUsd: 0,
      durationSec: 0,
      holderDiscountRows: 0,
      lastAt: null,
    },
    inferenceUsage: {
      rows: 2,
      costUsd: 0.01,
      chargedUsd: 0.012,
      freeRows: 1,
      fallbackRows: 1,
      holderDiscountRows: 0,
      bySurface: { chat: 2 },
      byGateway: { openrouter: 1, elizacloud: 1 },
      lastAt: Date.now(),
    },
  },
  tableCounts: {
    users: 1,
    waitlist: 2,
    creditTopUps: 1,
    codingUsage: 0,
    inferenceUsage: 2,
  },
  anomalyCounts: {
    negativeCreditBalances: 0,
    persistedErrorEvents7d: 1,
    inferenceFallbacks7d: 1,
  },
  testerWaitlistRows: [
    {
      email: "tester@example.com",
      pubkey: "playwright",
      kind: "dev_tester",
      name: "Playwright",
      reason: "Test full row export",
      at: Date.now(),
    },
  ],
  providerHealth: {
    openrouter: {
      configured: true,
      remainingUsd: 4.25,
      fetchedAt: Date.now(),
      paidTraffic: { allowed: false, reason: "low_credits" },
      freeTraffic: { allowed: false, reason: "low_credits" },
      reserve: { paidReserveUsd: 5, freeReserveUsd: 25 },
    },
    elizacloud: { configured: true },
    detourFallback: { configured: false },
    agentMail: { configured: true, webhookConfigured: true },
    coding: {
      e2bConfigured: false,
      liveSessions: 0,
      connectedDesktopDevices24h: 0,
      pendingPairings: 0,
    },
    remoteProvisioning: {
      deploymentsByStatus: { configured: 1 },
      activeProvider: { elizacloud: 1 },
      fallbackStatus: { standby: 1 },
      staleHeartbeats: 0,
    },
    inferenceFallbacks7d: {
      rows: 1,
      byGateway: { elizacloud: 1 },
      byRouteVariant: { openrouter_first: 1 },
    },
  },
};

function usd(n: number | null | undefined): string {
  if (typeof n === "number") return `$${n.toFixed(2)}`;
  if (n === null) return "Unlimited";
  return "—";
}

function decisionLabel(decision: OpenRouterDecision | null): string {
  if (!decision) return "Unknown";
  return decision.ok ? "Allowed" : "Paused";
}

function decisionTone(decision: OpenRouterDecision | null): "success" | "warning" | "danger" | "neutral" {
  if (!decision) return "neutral";
  if (decision.ok) return "success";
  return decision.reason === "negative_credits" ? "danger" : "warning";
}

function decisionDetail(decision: OpenRouterDecision | null, reserveUsd: number): string {
  if (!decision) return "Status unavailable";
  if (decision.ok) return `Above ${usd(reserveUsd)} reserve`;
  if (decision.reason === "negative_credits") return "Platform credits are exhausted";
  return `${usd(decision.remainingUsd)} remaining at ${usd(decision.reserveUsd)} reserve`;
}

function openRouterWarning(health: OpenRouterHealth): string | null {
  if (health === undefined) return null;
  if (!health) return "OpenRouter credit status could not be loaded.";
  if (!health.configured) return "OpenRouter is not configured. Paid and free OpenRouter traffic are unavailable.";
  if (!health.status) return "OpenRouter key balance is unavailable. Reserve gating cannot prove current credit health.";
  if (health.status.remainingUsd !== null && health.status.remainingUsd < 0) {
    return "OpenRouter credits are exhausted. Top up the platform account before routing traffic.";
  }
  if (health.paid?.ok === false && health.free?.ok === false) {
    return "OpenRouter paid and free traffic are paused by the reserve gate.";
  }
  if (health.paid?.ok === false) return "OpenRouter paid traffic is paused by the reserve gate.";
  if (health.free?.ok === false) return "OpenRouter free traffic is paused by the reserve gate.";
  return null;
}

function countTotal(record: Record<string, number>): number {
  return Object.values(record).reduce((sum, value) => sum + value, 0);
}

function healthPacketFilename(packet: Exclude<AdminHealthPacket, undefined>): string {
  const stamp = new Date(packet.generatedAt).toISOString().replaceAll(":", "-");
  return `detour-admin-health-${stamp}.json`;
}

export function AdminAnalytics() {
  const testUser = readDtourPlaywrightUser();
  const testMode = !!testUser;
  const token = getDtourSessionToken();
  const openRouterStatus = useAction(anyApi.inference.openRouterCreditStatus);
  const [openRouterHealth, setOpenRouterHealth] = useState<OpenRouterHealth>(
    testMode ? TEST_OPENROUTER_HEALTH : undefined,
  );
  const [healthNotice, setHealthNotice] = useState<string | null>(null);
  const summary = useQuery(
    anyApi.events.summary,
    token && !testMode ? { token } : "skip",
  ) as Summary;
  const inferenceRollup = useQuery(
    anyApi.adminUsage.inferenceRollup,
    token && !testMode ? { token } : "skip",
  ) as InferenceRollup;
  const healthQuery = useQuery(
    anyApi.adminHealth.packet,
    token && !testMode ? { token } : "skip",
  ) as AdminHealthPacket;
  useEffect(() => {
    if (testMode) {
      setOpenRouterHealth(TEST_OPENROUTER_HEALTH);
      return;
    }
    if (!token) {
      setOpenRouterHealth(null);
      return;
    }
    let active = true;
    setOpenRouterHealth(undefined);
    void openRouterStatus({ token })
      .then((next) => {
        if (active) setOpenRouterHealth(next as OpenRouterHealth);
      })
      .catch(() => {
        if (active) setOpenRouterHealth(null);
      });
    return () => {
      active = false;
    };
  }, [testMode, token, openRouterStatus]);
  const s = testMode ? TEST_SUMMARY : summary;
  const rollup = testMode ? TEST_ROLLUP : inferenceRollup;
  const healthPacket = testMode ? TEST_ADMIN_HEALTH_PACKET : healthQuery;
  const loading = s === undefined;
  const rollupLoading = rollup === undefined;
  const openRouterLoading = openRouterHealth === undefined;
  const healthLoading = healthPacket === undefined;
  const warning = openRouterWarning(openRouterHealth);
  const anomalyTotal = healthPacket ? countTotal(healthPacket.anomalyCounts) : 0;

  async function copyHealthPacket() {
    if (!healthPacket) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(healthPacket, null, 2));
      setHealthNotice("Health packet copied.");
      setTimeout(() => setHealthNotice(null), 1800);
    } catch {
      setHealthNotice("Clipboard access was blocked.");
    }
  }

  function downloadHealthPacket() {
    if (!healthPacket) return;
    const blob = new Blob([JSON.stringify(healthPacket, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = healthPacketFilename(healthPacket);
    link.click();
    URL.revokeObjectURL(url);
    setHealthNotice("Health packet download started.");
    setTimeout(() => setHealthNotice(null), 1800);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Users" loading={loading} value={s?.totalUsers ?? 0} icon={<Icon.User size={16} />} />
        <StatCard label="Profiles" loading={loading} value={s?.totalProfiles ?? 0} icon={<Icon.User size={16} />} />
        <StatCard
          label="Whitelisted"
          loading={loading}
          value={s?.whitelisted ?? 0}
          sub={`${s?.admins ?? 0} with roles`}
          icon={<Icon.Shield size={16} />}
        />
        <StatCard label="Events · 24h" loading={loading} value={s?.eventsLast24h ?? 0} icon={<Icon.Activity size={16} />} />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          label="Inference spend"
          loading={rollupLoading}
          value={rollup ? `$${rollup.platform.spendUsd.toFixed(2)}` : "—"}
          sub={rollup ? `${rollup.platform.paidCalls} paid calls` : undefined}
          icon={<Icon.Zap size={16} />}
        />
        <StatCard
          label="Top spender"
          loading={rollupLoading}
          value={
            rollup?.topSpenders[0]
              ? `$${rollup.topSpenders[0].spendUsd.toFixed(2)}`
              : rollup
                ? "$0"
                : "—"
          }
          sub={
            rollup?.topSpenders[0]
              ? `${rollup.topSpenders[0].pubkey.slice(0, 8)}… · ${rollup.topSpenders[0].calls} calls`
              : undefined
          }
          icon={<Icon.ArrowUpRight size={16} />}
        />
      </div>
      {rollup?.note && (
        <p className="text-xs text-white/40">{rollup.note}</p>
      )}
      <Panel
        className={cn(
          "p-5",
          warning && "border-amber-400/20 bg-amber-400/[0.04]",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Icon.Zap size={16} className="text-white/40" />
              <h2 className="text-sm font-semibold text-white">OpenRouter credit health</h2>
            </div>
            <p className="mt-1 text-[12px] text-white/45">
              Platform key balance and reserve gates for paid priority and free flex traffic.
            </p>
          </div>
          {!openRouterLoading && (
            <Badge tone={warning ? "warning" : "success"}>
              {warning ? "Needs attention" : "Healthy"}
            </Badge>
          )}
        </div>
        {openRouterLoading ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <OpenRouterCell
                label="Remaining balance"
                value={
                  openRouterHealth?.configured
                    ? usd(openRouterHealth.status?.remainingUsd)
                    : "Not configured"
                }
                detail={
                  openRouterHealth?.status
                    ? `Fetched ${new Date(openRouterHealth.status.fetchedAt).toLocaleTimeString()}`
                    : "No key status"
                }
              />
              <OpenRouterCell
                label="Paid traffic"
                value={
                  <Badge tone={decisionTone(openRouterHealth?.paid ?? null)}>
                    {decisionLabel(openRouterHealth?.paid ?? null)}
                  </Badge>
                }
                detail={decisionDetail(
                  openRouterHealth?.paid ?? null,
                  openRouterHealth?.reserve.paidReserveUsd ?? 0,
                )}
              />
              <OpenRouterCell
                label="Free traffic"
                value={
                  <Badge tone={decisionTone(openRouterHealth?.free ?? null)}>
                    {decisionLabel(openRouterHealth?.free ?? null)}
                  </Badge>
                }
                detail={decisionDetail(
                  openRouterHealth?.free ?? null,
                  openRouterHealth?.reserve.freeReserveUsd ?? 0,
                )}
              />
            </div>
            {warning && (
              <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-[12px] text-amber-100/90">
                <span className="font-semibold">OpenRouter credit warning:</span>{" "}
                {warning}
              </div>
            )}
          </>
        )}
      </Panel>
      <Panel className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Icon.Activity size={16} className="text-white/40" />
              <h2 className="text-sm font-semibold text-white">Admin health packet</h2>
            </div>
            <p className="mt-1 text-[12px] text-white/45">
              Sanitized beta-production evidence for Admin Detour and external review.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void copyHealthPacket()}
              disabled={!healthPacket}
            >
              <Icon.Copy size={14} /> Copy packet
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={downloadHealthPacket}
              disabled={!healthPacket}
            >
              <Icon.ArrowDown size={14} /> Download JSON
            </Button>
          </div>
        </div>
        {healthLoading ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <OpenRouterCell
                label="24h events"
                value={healthPacket.eventExports.last24h.length}
                detail={`${healthPacket.eventExports.last7d.length} rows in 7d export`}
              />
              <OpenRouterCell
                label="Usage ledgers"
                value={
                  healthPacket.usageLedgerAggregates.codingUsage.rows +
                  healthPacket.usageLedgerAggregates.inferenceUsage.rows
                }
                detail={`$${healthPacket.usageLedgerAggregates.inferenceUsage.chargedUsd.toFixed(2)} inference charged`}
              />
              <OpenRouterCell
                label="Tester rows"
                value={healthPacket.testerWaitlistRows.length}
                detail="Full waitlist/tester rows included"
              />
              <OpenRouterCell
                label="Anomalies"
                value={anomalyTotal}
                detail={`${healthPacket.convexFunctionLogs.persistedErrors7d} persisted errors`}
              />
            </div>
            <div className="mt-4 grid gap-2 lg:grid-cols-2">
              <HealthChecklistRow
                label="24h / 7d events export"
                value={`${healthPacket.eventExports.last24h.length} / ${healthPacket.eventExports.last7d.length} rows`}
                ok={!healthPacket.eventExports.last7dTruncated}
              />
              <HealthChecklistRow
                label="Convex error/function logs"
                value={
                  healthPacket.convexFunctionLogs.rawRuntimeLogsAttached
                    ? "Raw logs attached"
                    : "Persisted error summary only"
                }
                ok={healthPacket.convexFunctionLogs.persistedErrors7d === 0}
              />
              <HealthChecklistRow
                label="Usage ledger aggregates"
                value={`${healthPacket.usageLedgerAggregates.creditTopUps.rows} top-ups · ${healthPacket.usageLedgerAggregates.inferenceUsage.rows} inference`}
                ok={healthPacket.usageLedgerAggregates.creditBalances.negativeWallets === 0}
              />
              <HealthChecklistRow
                label="Table + anomaly counts"
                value={`${Object.keys(healthPacket.tableCounts).length} tables · ${anomalyTotal} anomalies`}
                ok={anomalyTotal === 0}
              />
              <HealthChecklistRow
                label="Tester/waitlist full rows"
                value={`${healthPacket.testerWaitlistRows.length} rows`}
                ok={true}
              />
              <HealthChecklistRow
                label="Provider health/fallback metrics"
                value={`OpenRouter ${healthPacket.providerHealth.openrouter.configured ? "configured" : "missing"} · ${healthPacket.providerHealth.inferenceFallbacks7d.rows} fallbacks`}
                ok={
                  healthPacket.providerHealth.openrouter.paidTraffic.allowed ||
                  healthPacket.providerHealth.openrouter.freeTraffic.allowed
                }
              />
            </div>
            {healthNotice && (
              <div className="mt-3 text-[12px] text-white/45">{healthNotice}</div>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}

function OpenRouterCell({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="text-[10px] font-medium uppercase tracking-widest text-white/40">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-white">{value}</div>
      <div className="mt-1 text-[11px] text-white/35">{detail}</div>
    </div>
  );
}

function HealthChecklistRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
      <div>
        <div className="text-[12px] font-medium text-white/85">{label}</div>
        <div className="mt-0.5 text-[11px] text-white/40">{value}</div>
      </div>
      <Badge tone={ok ? "success" : "warning"}>{ok ? "Ready" : "Review"}</Badge>
    </div>
  );
}
