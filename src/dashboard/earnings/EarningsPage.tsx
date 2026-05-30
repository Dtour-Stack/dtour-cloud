import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { Link } from "react-router-dom";
import { AppShell } from "@/dashboard/AppShell";
import { getDtourSessionToken } from "@/lib/session";

type Stats = { referrals: number; earnedUsd: number; pendingUsd: number } | null | undefined;

export default function EarningsPage() {
  const token = getDtourSessionToken();
  const stats = useQuery(anyApi.affiliates.myStats, token ? { token } : "skip") as Stats;

  return (
    <AppShell title="Earnings">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Earnings</h1>
          <p className="mt-1 text-sm text-white/50">
            Your affiliate revenue. $DTOUR creator-fee rewards (for holders) are distributed
            separately on-chain.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Total earned" value={stats ? `$${stats.earnedUsd.toFixed(2)}` : "—"} />
          <Stat label="Pending payout" value={stats ? `$${stats.pendingUsd.toFixed(2)}` : "—"} />
          <Stat label="Referrals" value={stats?.referrals ?? "—"} />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/60">
          Earnings come from the <span className="text-white">affiliate program</span> — a share of
          the platform fee on what your referrals spend.{" "}
          <Link to="/affiliates" className="text-purple-300 hover:underline">
            Manage affiliates →
          </Link>
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
