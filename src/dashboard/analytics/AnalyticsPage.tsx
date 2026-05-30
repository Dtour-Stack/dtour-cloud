import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { AppShell } from "@/dashboard/AppShell";
import { getDtourSessionToken } from "@/lib/session";

type Overview = {
  sessions: number;
  totalSpendUsd: number;
  agents: number;
  recentActivity: Array<{ type: string; at: number; detail: string }>;
} | null | undefined;

export default function AnalyticsPage() {
  const token = getDtourSessionToken();
  const o = useQuery(anyApi.analytics.overview, token ? { token } : "skip") as Overview;

  return (
    <AppShell title="Analytics">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-xl font-semibold text-white">Analytics</h1>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Coding sessions" value={o?.sessions ?? "—"} />
          <Stat label="Total spend" value={o ? `$${o.totalSpendUsd.toFixed(2)}` : "—"} />
          <Stat label="Agents" value={o?.agents ?? "—"} />
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
          <div className="border-b border-white/10 px-4 py-3 text-xs uppercase tracking-widest text-white/45">
            Recent activity
          </div>
          {!o ? (
            <p className="p-4 text-sm text-white/40">Loading…</p>
          ) : o.recentActivity.length === 0 ? (
            <p className="p-4 text-sm text-white/40">No activity yet.</p>
          ) : (
            o.recentActivity.map((a, i) => (
              <div
                key={i}
                className="flex items-center justify-between border-b border-white/5 px-4 py-2.5 text-sm last:border-0"
              >
                <span className="text-white/80">{a.type}</span>
                <span className="text-xs text-white/40">{a.detail}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="text-xs uppercase tracking-widest text-white/45">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-white">{value}</div>
    </div>
  );
}
