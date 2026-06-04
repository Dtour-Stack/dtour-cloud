import { useAction, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/dashboard/AppShell";
import { getDtourSessionToken } from "@/lib/session";

type Stats = {
  referrals: number;
  earnedEliza: number;
  pendingEliza: number;
  earnedUsd: number;
} | null;

export default function EarningsPage() {
  const token = getDtourSessionToken();
  const myStats = useAction(anyApi.affiliates.myStats);
  const me = useQuery(anyApi.users.me, token ? { token } : "skip") as
    | { creatorRewardsEligible?: boolean }
    | null
    | undefined;
  const [stats, setStats] = useState<Stats>(null);

  useEffect(() => {
    if (!token) return;
    void myStats({ token }).then((s) => setStats(s as Stats)).catch(() => {});
  }, [token, myStats]);

  return (
    <AppShell title="Earnings">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Earnings</h1>
          <p className="mt-1 text-sm text-white/50">
            Your affiliate revenue from referred coding sandbox margin, shown in{" "}
            <span className="text-white">$ELIZA</span> terms for payout requests. Dev/tester
            accounts are also marked for creator reward splits.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Total ($ELIZA)" value={stats ? stats.earnedEliza.toFixed(2) : "—"} />
          <Stat label="Pending ($ELIZA)" value={stats ? stats.pendingEliza.toFixed(2) : "—"} />
          <Stat label="Referrals" value={stats?.referrals ?? "—"} />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/60">
          Earnings come from the <span className="text-white">affiliate program</span> — your share
          of referred coding sandbox fees.{" "}
          <Link to="/profile/affiliates" className="text-purple-300 hover:underline">
            Manage affiliates & request payout →
          </Link>
        </div>
        {me?.creatorRewardsEligible && (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4 text-sm text-emerald-100/80">
            This wallet is marked as a dev/tester creator-reward participant.
          </div>
        )}
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
