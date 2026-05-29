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

export function AdminAnalytics() {
  const token = getDtourSessionToken();
  const s = useQuery(
    anyApi.events.summary,
    token ? { token } : "skip",
  ) as Summary;
  const loading = s === undefined;

  return (
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
  );
}
