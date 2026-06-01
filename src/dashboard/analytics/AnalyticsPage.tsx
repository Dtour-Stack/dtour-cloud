import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import type { ReactNode } from "react";
import { AppShell } from "@/dashboard/AppShell";
import { getDtourSessionToken } from "@/lib/session";
import { cn, Icon, Panel, StatCard } from "@/ui";

type SurfaceStat = { usd: number; calls: number };

type Overview =
  | {
      balanceUsd: number;
      totalSpendUsd: number;
      inferenceSpendUsd: number;
      codingSpendUsd: number;
      bySurface: Record<string, SurfaceStat>;
      inferenceCalls: number;
      codingSessions: number;
      agents: number;
      recentActivity: Array<{ type: string; at: number; detail: string }>;
    }
  | null
  | undefined;

// Inference charges floor at 1 µ$, so totals can be sub-cent. Show enough
// precision that a real-but-tiny spend doesn't read as a flat "$0.00".
const usd = (n: number) => {
  const a = Math.abs(n);
  if (a === 0) return "$0.00";
  if (a < 0.01) return `$${n.toFixed(4)}`;
  if (a < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
};

// Fixed surface order + presentation. Anything outside this list (an unexpected
// surface) is appended after, so it's never dropped from the breakdown.
const SURFACE_ORDER = ["chat", "image", "speech", "video"] as const;
const SURFACE_META: Record<string, { label: string; icon: ReactNode; bar: string }> = {
  chat: { label: "Chat", icon: <Icon.Sparkles />, bar: "from-violet-500 to-indigo-500" },
  image: { label: "Image", icon: <Icon.Image />, bar: "from-indigo-500 to-blue-500" },
  speech: { label: "Speech", icon: <Icon.Mic />, bar: "from-blue-500 to-cyan-500" },
  video: { label: "Video", icon: <Icon.Play />, bar: "from-fuchsia-500 to-violet-500" },
};

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AnalyticsPage() {
  const token = getDtourSessionToken();
  const o = useQuery(anyApi.analytics.overview, token ? { token } : "skip") as Overview;
  const loading = o === undefined;

  // Order the breakdown: known surfaces first, then any extras the ledger holds.
  const surfaceKeys = o
    ? [
        ...SURFACE_ORDER.filter((k) => k in o.bySurface),
        ...Object.keys(o.bySurface).filter((k) => !SURFACE_ORDER.includes(k as never)),
      ]
    : [];
  const maxSurfaceUsd = o ? Math.max(0, ...surfaceKeys.map((k) => o.bySurface[k].usd)) : 0;
  const anySurfaceSpend = maxSurfaceUsd > 0;

  return (
    <AppShell title="Analytics">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Usage &amp; spend</h1>
          <p className="mt-1 text-sm text-white/45">
            Credit balance, metered inference, and coding-sandbox usage.
          </p>
        </div>

        {/* Headline stats */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            label="Credit balance"
            value={o ? usd(o.balanceUsd) : "—"}
            sub={o && o.balanceUsd < 0 ? "Overdrawn — top up" : "USD credits"}
            icon={<Icon.Wallet />}
            loading={loading}
          />
          <StatCard
            label="Total spend"
            value={o ? usd(o.totalSpendUsd) : "—"}
            sub={
              o
                ? `${usd(o.inferenceSpendUsd)} inference · ${usd(o.codingSpendUsd)} coding`
                : undefined
            }
            icon={<Icon.Coins />}
            loading={loading}
          />
          <StatCard
            label="Calls & sessions"
            value={o ? o.inferenceCalls + o.codingSessions : "—"}
            sub={
              o
                ? `${o.inferenceCalls} inference · ${o.codingSessions} coding · ${o.agents} agents`
                : undefined
            }
            icon={<Icon.Activity />}
            loading={loading}
          />
        </div>

        {/* Spend by surface — simple CSS bars (no chart lib) */}
        <Panel className="p-5">
          <div className="text-[11px] font-medium uppercase tracking-widest text-white/50">
            Inference spend by surface
          </div>
          {loading ? (
            <div className="mt-4 space-y-3">
              {SURFACE_ORDER.map((k) => (
                <div key={k} className="h-9 animate-pulse rounded-lg bg-white/[0.04]" />
              ))}
            </div>
          ) : !anySurfaceSpend ? (
            <p className="mt-4 text-sm text-white/40">
              No inference spend yet. Chat or generate an image to see your breakdown here.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {surfaceKeys.map((key) => {
                const stat = o!.bySurface[key];
                const meta = SURFACE_META[key] ?? {
                  label: key.charAt(0).toUpperCase() + key.slice(1),
                  icon: <Icon.Zap />,
                  bar: "from-slate-500 to-slate-400",
                };
                const pct = maxSurfaceUsd > 0 ? (stat.usd / maxSurfaceUsd) * 100 : 0;
                return (
                  <div key={key}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-white/80">
                        <span className="text-white/40">{meta.icon}</span>
                        {meta.label}
                      </span>
                      <span className="tabular-nums text-white/55">
                        ${stat.usd.toFixed(4)}
                        <span className="ml-2 text-white/30">
                          {stat.calls} {stat.calls === 1 ? "call" : "calls"}
                        </span>
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.05]">
                      <div
                        className={cn(
                          "h-full rounded-full bg-gradient-to-r transition-[width] duration-500",
                          meta.bar,
                        )}
                        style={{ width: `${Math.max(stat.usd > 0 ? 4 : 0, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {/* Recent activity — merged inference + coding feed */}
        <Panel className="overflow-hidden p-0">
          <div className="border-b border-white/10 px-5 py-3 text-[11px] font-medium uppercase tracking-widest text-white/50">
            Recent activity
          </div>
          {!o ? (
            <p className="p-5 text-sm text-white/40">Loading…</p>
          ) : o.recentActivity.length === 0 ? (
            <p className="p-5 text-sm text-white/40">No activity yet.</p>
          ) : (
            o.recentActivity.map((a, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-4 border-b border-white/5 px-5 py-3 text-sm last:border-0"
              >
                <span className="flex items-center gap-2 text-white/85">
                  <span className="text-white/35">
                    {(SURFACE_META[a.type]?.icon ?? <Icon.Activity />)}
                  </span>
                  <span className="capitalize">{a.type}</span>
                </span>
                <span className="flex items-center gap-3 text-xs">
                  <span className="truncate text-white/45">{a.detail}</span>
                  <span className="shrink-0 text-white/30">{timeAgo(a.at)}</span>
                </span>
              </div>
            ))
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
