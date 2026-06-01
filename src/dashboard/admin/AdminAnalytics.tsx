import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { getDtourSessionToken } from "@/lib/session";
import { Icon, StatCard } from "@/ui";

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

export function AdminAnalytics() {
  const token = getDtourSessionToken();
  const s = useQuery(
    anyApi.events.summary,
    token ? { token } : "skip",
  ) as Summary;
  const rollup = useQuery(
    anyApi.adminUsage.inferenceRollup,
    token ? { token } : "skip",
  ) as InferenceRollup;
  const loading = s === undefined;
  const rollupLoading = rollup === undefined;

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
    </div>
  );
}
