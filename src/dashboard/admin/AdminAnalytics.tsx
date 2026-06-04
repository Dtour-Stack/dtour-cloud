import { useAction, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { type ReactNode, useEffect, useState } from "react";
import { readDtourPlaywrightUser } from "@/lib/playwright-dtour-auth";
import { getDtourSessionToken } from "@/lib/session";
import { Badge, cn, Icon, Panel, Skeleton, StatCard } from "@/ui";

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

export function AdminAnalytics() {
  const testUser = readDtourPlaywrightUser();
  const testMode = !!testUser;
  const token = getDtourSessionToken();
  const openRouterStatus = useAction(anyApi.inference.openRouterCreditStatus);
  const [openRouterHealth, setOpenRouterHealth] = useState<OpenRouterHealth>(
    testMode ? TEST_OPENROUTER_HEALTH : undefined,
  );
  const summary = useQuery(
    anyApi.events.summary,
    token && !testMode ? { token } : "skip",
  ) as Summary;
  const inferenceRollup = useQuery(
    anyApi.adminUsage.inferenceRollup,
    token && !testMode ? { token } : "skip",
  ) as InferenceRollup;
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
  const loading = s === undefined;
  const rollupLoading = rollup === undefined;
  const openRouterLoading = openRouterHealth === undefined;
  const warning = openRouterWarning(openRouterHealth);

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
