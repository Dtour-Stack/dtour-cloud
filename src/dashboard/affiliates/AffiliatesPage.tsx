import { useAction, useMutation } from "convex/react";
import { anyApi } from "convex/server";
import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { getDtourSessionToken } from "@/lib/session";
import { Button, Icon } from "@/ui";

type Stats = {
  code: string | null;
  link: string | null;
  shareBps: number;
  referrals: number;
  earnedUsd: number;
  pendingUsd: number;
  earnedEliza: number;
  pendingEliza: number;
  elizaPriceUsd: number;
  payoutNetwork: string | null;
  payoutAddress: string | null;
} | null;

const NETWORKS = [
  { id: "solana", label: "Solana" },
  { id: "base", label: "Base" },
  { id: "ethereum", label: "Ethereum" },
];

export function AffiliatesHome() {
  const token = getDtourSessionToken();
  const myStats = useAction(anyApi.affiliates.myStats);
  const setWallet = useMutation(anyApi.affiliates.setPayoutWallet);
  const requestPayout = useAction(anyApi.affiliates.requestPayout);

  const [stats, setStats] = useState<Stats>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [network, setNetwork] = useState("solana");
  const [address, setAddress] = useState("");

  const load = useCallback(() => {
    if (!token) return;
    void myStats({ token })
      .then((s) => {
        setStats(s as Stats);
        if (s) {
          setNetwork((s as Stats)?.payoutNetwork ?? "solana");
          setAddress((s as Stats)?.payoutAddress ?? "");
        }
      })
      .catch(() => {});
  }, [token, myStats]);
  useEffect(load, [load]);

  const share = stats ? (stats.shareBps / 100).toFixed(0) : "20";

  async function saveWallet() {
    if (!token) return;
    try {
      await setWallet({ token, network, address });
      setMsg("Wallet saved");
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
    setTimeout(() => setMsg(null), 2500);
  }

  async function payout() {
    if (!token) return;
    try {
      const r = (await requestPayout({ token })) as { ok: boolean; reason?: string; requestedEliza?: number };
      setMsg(r.ok ? `Requested ${(r.requestedEliza ?? 0).toFixed(2)} $ELIZA` : r.reason || "Failed");
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
    setTimeout(() => setMsg(null), 3000);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <div>
          <h1 className="text-xl font-semibold text-white">Affiliate program</h1>
          <p className="mt-1 text-sm text-white/50">
            Share your link to earn {share}% of the platform fee on referred coding sandbox usage
            while the beta affiliate rail is live. Earnings are paid as{" "}
            <span className="text-white">$ELIZA</span> to any EVM or Solana wallet.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Referrals" value={stats?.referrals ?? "—"} />
          <Stat label="Earned ($ELIZA)" value={stats ? stats.earnedEliza.toFixed(2) : "—"} />
          <Stat label="Pending ($ELIZA)" value={stats ? stats.pendingEliza.toFixed(2) : "—"} />
        </div>

        {/* Invite link */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="text-xs uppercase tracking-widest text-white/50">Your invite link</div>
          <p className="mt-1 text-xs text-white/45">
            You earn a share of referred coding sandbox fees. Top-ups and MCP connections do not
            accrue affiliate earnings yet.
          </p>
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
              <Icon.Copy size={13} /> {msg === "Copied!" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        {/* $ELIZA payout wallet */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="text-xs uppercase tracking-widest text-white/50">$ELIZA payout wallet</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <select
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
              className="rounded-lg border border-white/15 bg-white/5 px-2 py-2 text-sm text-white focus:outline-none"
            >
              {NETWORKS.map((n) => (
                <option key={n.id} value={n.id}>{n.label}</option>
              ))}
            </select>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={network === "solana" ? "Solana address" : "0x… EVM address"}
              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 font-mono text-xs text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none"
            />
            <Button size="sm" variant="secondary" onClick={saveWallet} disabled={!address.trim()}>
              Save
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-white/35">
            Send to a self-custody wallet — not an exchange deposit address (it may reject $ELIZA).
          </p>
        </div>

        {/* Payout */}
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div>
            <div className="text-sm text-white">Withdraw</div>
            <div className="text-xs text-white/45">
              Pending {stats?.pendingEliza.toFixed(2) ?? "0.00"} $ELIZA
              {stats && stats.elizaPriceUsd > 0 ? ` (~$${stats.pendingUsd.toFixed(2)})` : ""}
            </div>
          </div>
          <Button
            size="sm"
            disabled={!stats || stats.pendingEliza <= 0 || !stats.payoutAddress}
            onClick={payout}
          >
            Withdraw $ELIZA
          </Button>
        </div>

        {msg && <p className="text-xs text-emerald-200/80">{msg}</p>}
    </div>
  );
}

export default function AffiliatesPage() {
  return <Navigate to="/profile/affiliates" replace />;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="text-xs uppercase tracking-widest text-white/45">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-white">{value}</div>
    </div>
  );
}
