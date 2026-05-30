import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useEffect, useState } from "react";
import { AppShell } from "@/dashboard/AppShell";
import { getDtourSessionToken } from "@/lib/session";
import { Button, Icon } from "@/ui";

type Stats = {
  code: string | null;
  link: string | null;
  shareBps: number;
  referrals: number;
  earnedUsd: number;
  pendingUsd: number;
} | null;

export default function AffiliatesPage() {
  const token = getDtourSessionToken();
  const stats = useQuery(anyApi.affiliates.myStats, token ? { token } : "skip") as Stats | undefined;
  const getOrCreate = useMutation(anyApi.affiliates.getOrCreateCode);
  const requestPayout = useMutation(anyApi.affiliates.requestPayout);
  const [msg, setMsg] = useState<string | null>(null);

  // Mint the code on first visit if the user doesn't have one yet.
  useEffect(() => {
    if (token && stats !== undefined && stats && !stats.code) {
      void getOrCreate({ token }).catch(() => {});
    }
  }, [token, stats, getOrCreate]);

  const share = stats ? (stats.shareBps / 100).toFixed(0) : "20";

  return (
    <AppShell title="Affiliates">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Affiliate program</h1>
          <p className="mt-1 text-sm text-white/50">
            Earn {share}% of the platform fee on everything your referrals spend — funded by the
            fee itself, so it costs them nothing extra.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Referrals" value={stats?.referrals ?? "—"} />
          <Stat label="Earned" value={stats ? `$${stats.earnedUsd.toFixed(2)}` : "—"} />
          <Stat label="Pending" value={stats ? `$${stats.pendingUsd.toFixed(2)}` : "—"} />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="text-xs uppercase tracking-widest text-white/50">Your referral link</div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-black/40 px-3 py-2 font-mono text-xs text-white">
              {stats?.link ?? "minting…"}
            </code>
            <button
              type="button"
              disabled={!stats?.link}
              onClick={() => {
                if (stats?.link) {
                  navigator.clipboard?.writeText(stats.link);
                  setMsg("Copied!");
                  setTimeout(() => setMsg(null), 1500);
                }
              }}
              className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white/70 hover:bg-white/10"
            >
              <Icon.Copy size={13} /> {msg ?? "Copy"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-white">Payout</div>
              <div className="text-xs text-white/45">
                Pending ${stats?.pendingUsd.toFixed(2) ?? "0.00"} — paid in $DTOUR.
              </div>
            </div>
            <Button
              size="sm"
              disabled={!token || !stats || stats.pendingUsd <= 0}
              onClick={async () => {
                if (!token) return;
                try {
                  await requestPayout({ token });
                  setMsg("Payout requested");
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : "Failed");
                }
                setTimeout(() => setMsg(null), 2000);
              }}
            >
              Request payout
            </Button>
          </div>
        </div>

        <p className="text-xs text-white/40">
          How it works: share your link, anyone who signs up through it is attributed to you (once,
          no self-referral). As they use paid features, your share of the platform fee accrues here.
        </p>
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
