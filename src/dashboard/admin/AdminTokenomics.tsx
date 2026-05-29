import { useAction, useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useMemo, useState } from "react";
import { getDtourSessionToken } from "@/lib/session";
import { buildExcludeSet } from "@/lib/tokenomics-exec";
import {
  Button,
  Icon,
  Panel,
  SectionHeading,
  Skeleton,
  StatCard,
} from "@/ui";
import { AdminTokenomicsExecute } from "./AdminTokenomicsExecute";

// The LP pool OWNER (Token-2022, ~256M / ~26% of supply) MUST be excluded or it
// tops the pro-rata payout and drains the holder slice.
const LP_OWNER = "5ZZLXY1YGvkexPgFQjH5pnhviaDsRut56PgEiYeAyTRE";

type Cfg = {
  splitBps: { builder: number; holders: number; buyback: number; treasury: number };
  wallets: { creator: string; builder: string; treasury: string; buyback: string };
  minBalanceTokens: number;
  minPayoutSol: number;
  creatorReserveSol: number;
  excludeWallets: string[];
  perRunCapSol: number;
  updatedAt?: number | null;
};
type Snap = {
  holders: Array<{ owner: string; amount: number }>;
  holderCount: number;
  creatorBalanceSol: number;
  supply: number;
  decimals: number;
};

const field =
  "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none";
const trunc = (a: string) => (a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);
const fmt = (n: number, d = 4) =>
  n.toLocaleString(undefined, { maximumFractionDigits: d });

export function AdminTokenomics() {
  const token = getDtourSessionToken();
  const remote = useQuery(anyApi.tokenomics.getConfig, token ? { token } : "skip") as
    | Cfg
    | undefined;
  const setConfig = useMutation(anyApi.tokenomics.setConfig);
  const snapshot = useAction(anyApi.tokenomics.snapshot);

  const [draft, setDraft] = useState<Cfg | null>(null);
  const cfg = draft ?? remote ?? null;
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [loadingSnap, setLoadingSnap] = useState(false);

  function patch(p: Partial<Cfg>) {
    if (!cfg) return;
    setDraft({ ...cfg, ...p });
  }
  function patchSplit(k: keyof Cfg["splitBps"], pct: number) {
    if (!cfg) return;
    setDraft({ ...cfg, splitBps: { ...cfg.splitBps, [k]: Math.round(pct * 100) } });
  }

  const splitSumPct = cfg
    ? (cfg.splitBps.builder + cfg.splitBps.holders + cfg.splitBps.buyback + cfg.splitBps.treasury) / 100
    : 0;

  async function save() {
    if (!token || !cfg) return;
    setSaving(true);
    setErr(null);
    try {
      const { updatedAt: _u, ...rest } = cfg;
      await setConfig({ token, ...rest });
      setDraft(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function runSnapshot() {
    if (!token) return;
    setLoadingSnap(true);
    setErr(null);
    try {
      setSnap((await snapshot({ token })) as Snap);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Snapshot failed");
    } finally {
      setLoadingSnap(false);
    }
  }

  // Client-side dry-run preview from snapshot + config.
  const preview = useMemo(() => {
    if (!snap || !cfg) return null;
    const splitTotal = Math.max(0, snap.creatorBalanceSol - cfg.creatorReserveSol);
    const slice = (bps: number) => (splitTotal * bps) / 10000;
    // Exclude the 4 pool wallets (always, in code) UNION the config exclude list
    // (the LP owner et al.) — same set the distribute plan uses.
    const exclude = buildExcludeSet(cfg);
    const eligible = snap.holders.filter((h) => !exclude.has(h.owner));
    const totalWeight = eligible.reduce((s, h) => s + h.amount, 0);
    const holdersSlice = slice(cfg.splitBps.holders);
    const payouts = eligible
      .map((h) => ({ owner: h.owner, amount: h.amount, sol: totalWeight > 0 ? (holdersSlice * h.amount) / totalWeight : 0 }))
      .filter((p) => p.sol >= cfg.minPayoutSol)
      .sort((a, b) => b.sol - a.sol);
    const paid = payouts.reduce((s, p) => s + p.sol, 0);
    return {
      splitTotal,
      builder: slice(cfg.splitBps.builder),
      holders: holdersSlice,
      buyback: slice(cfg.splitBps.buyback),
      treasury: slice(cfg.splitBps.treasury),
      payouts,
      paid,
      dust: holdersSlice - paid,
      eligibleCount: eligible.length,
    };
  }, [snap, cfg]);

  if (!cfg) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <header className="fade-up">
        <h1 className="text-2xl font-semibold tracking-tight">Tokenomics</h1>
        <p className="mt-1 text-[13px] text-white/45">
          Configure the creator-fee split + holder discount, and preview a
          distribution. $DTOUR holders ≥0.5% of supply get 20% off; rewards are a
          share of real fees — no emissions.
        </p>
      </header>

      {/* Split */}
      <Panel className="fade-up p-6">
        <SectionHeading
          title="Fee split"
          description={`Creator fees split by % — must total 100% (now ${splitSumPct}%).`}
        />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["builder", "holders", "buyback", "treasury"] as const).map((k) => (
            <div key={k}>
              <label className="mb-1.5 block text-xs uppercase tracking-widest text-white/50">
                {k}
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={cfg.splitBps[k] / 100}
                  onChange={(e) => patchSplit(k, Number(e.target.value))}
                  className={field}
                />
                <span className="text-sm text-white/40">%</span>
              </div>
            </div>
          ))}
        </div>
        {splitSumPct !== 100 && (
          <p className="mt-2 text-xs text-amber-300/90">Must total 100% to save.</p>
        )}
      </Panel>

      {/* Wallets + thresholds */}
      <Panel className="fade-up p-6" style={{ animationDelay: "60ms" }}>
        <SectionHeading title="Wallets & thresholds" description="Pubkeys only — secret keys never touch the server." />
        <div className="mt-4 space-y-3">
          {(["creator", "builder", "treasury", "buyback"] as const).map((w) => (
            <div key={w}>
              <label className="mb-1.5 block text-xs uppercase tracking-widest text-white/50">{w}</label>
              <input
                value={cfg.wallets[w]}
                onChange={(e) => patch({ wallets: { ...cfg.wallets, [w]: e.target.value.trim() } })}
                className={`${field} font-mono`}
              />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-widest text-white/50">Min balance ($DTOUR)</label>
              <input type="number" value={cfg.minBalanceTokens} onChange={(e) => patch({ minBalanceTokens: Number(e.target.value) })} className={field} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-widest text-white/50">Min payout (SOL)</label>
              <input type="number" step="0.001" value={cfg.minPayoutSol} onChange={(e) => patch({ minPayoutSol: Number(e.target.value) })} className={field} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-widest text-white/50">Creator reserve (SOL)</label>
              <input type="number" step="0.01" value={cfg.creatorReserveSol} onChange={(e) => patch({ creatorReserveSol: Number(e.target.value) })} className={field} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs uppercase tracking-widest text-white/50">Per-run cap (SOL)</label>
              <input type="number" step="0.1" value={cfg.perRunCapSol} onChange={(e) => patch({ perRunCapSol: Number(e.target.value) })} className={field} />
            </div>
          </div>

          {/* Exclude list — owners removed from pro-rata beyond the 4 pools. */}
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-widest text-white/50">
              Exclude wallets (one per line)
            </label>
            <textarea
              value={(cfg.excludeWallets ?? []).join("\n")}
              onChange={(e) =>
                patch({
                  excludeWallets: e.target.value
                    .split(/\s+/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              rows={Math.max(3, (cfg.excludeWallets ?? []).length + 1)}
              placeholder="LP pool owner, market makers, …"
              className={`${field} font-mono resize-y`}
            />
            <p className="mt-1.5 text-xs text-white/40">
              The 4 pool wallets are always excluded automatically. Add the LP pool OWNER and
              any other addresses to keep out of pro-rata.
            </p>
            {!(cfg.excludeWallets ?? []).includes(LP_OWNER) && (
              <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/[0.06] px-3 py-2 text-xs text-amber-200">
                ⚠ The LP pool owner ({LP_OWNER.slice(0, 4)}…{LP_OWNER.slice(-4)}) is NOT in the
                exclude list. It holds ~26% of supply and would top the payout, draining the
                holder slice. Add it before executing.
              </p>
            )}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={save} disabled={saving || splitSumPct !== 100 || !draft}>
            {saving ? "Saving…" : draft ? "Save config" : "Saved"}
          </Button>
          {cfg.updatedAt ? (
            <span className="text-xs text-white/35">
              Updated {new Date(cfg.updatedAt).toLocaleString()}
            </span>
          ) : null}
        </div>
      </Panel>

      {/* Snapshot + preview */}
      <Panel className="fade-up p-6" style={{ animationDelay: "120ms" }}>
        <SectionHeading
          title="Dry-run preview"
          description="Live snapshot from Helius. Computes the split + per-holder payouts. Moves nothing."
          action={
            <Button size="sm" variant="secondary" onClick={runSnapshot} disabled={loadingSnap}>
              <Icon.Activity size={14} /> {loadingSnap ? "Loading…" : "Refresh snapshot"}
            </Button>
          }
        />
        {snap && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Creator balance" value={`${fmt(snap.creatorBalanceSol)} SOL`} />
            <StatCard label="Eligible holders" value={String(snap.holderCount)} />
            <StatCard label="Supply" value={fmt(snap.supply, 0)} />
          </div>
        )}
        {preview && (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Builder" value={`${fmt(preview.builder)} SOL`} />
              <StatCard label="Holders" value={`${fmt(preview.holders)} SOL`} />
              <StatCard label="Buyback" value={`${fmt(preview.buyback)} SOL`} />
              <StatCard label="Treasury" value={`${fmt(preview.treasury)} SOL`} />
            </div>
            <div className="text-xs text-white/45">
              Splitting {fmt(preview.splitTotal)} SOL (balance − reserve). Holder
              pool {fmt(preview.holders)} SOL → {preview.payouts.length} payouts (
              {fmt(preview.paid)} SOL), {fmt(preview.dust)} SOL below the dust floor stays put.
            </div>
            <div className="max-h-72 overflow-auto rounded-lg border border-white/10">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-black/40 text-left text-[11px] uppercase tracking-wider text-white/40">
                  <tr>
                    <th className="px-3 py-2">Holder</th>
                    <th className="px-3 py-2 text-right">$DTOUR</th>
                    <th className="px-3 py-2 text-right">Payout (SOL)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {preview.payouts.slice(0, 100).map((p) => (
                    <tr key={p.owner}>
                      <td className="px-3 py-1.5 font-mono text-white/80">{trunc(p.owner)}</td>
                      <td className="px-3 py-1.5 text-right text-white/60">{fmt(p.amount, 0)}</td>
                      <td className="px-3 py-1.5 text-right text-white/90">{fmt(p.sol)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-white/40">
              The preview above is read-only. The Execute panel below uses the SAME eligibility
              (pools ∪ exclude list) and pro-rata math to move real SOL — sign with the creator
              wallet.
            </p>
          </div>
        )}
      </Panel>

      {/* Execute — semi-auto, signs with the connected creator wallet. */}
      <AdminTokenomicsExecute cfg={cfg} snap={snap} />

      {err && <p className="text-sm text-red-400/90">{err}</p>}
    </div>
  );
}
