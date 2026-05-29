/**
 * Detour Vault Dashboard — $DTOUR staking, burn tracker, and builder rewards.
 *
 * This is a Dtour-tenant-only dashboard page. It renders:
 *   1. Staking overview — current stake, lock tier, rewards claimable
 *   2. Burn tracker — total burned, burn rate, supply chart
 *   3. Builder/Creator rewards — earned, claimable, payout history
 *
 * Data comes from on-chain Solana reads (vault PDA + mint supply) and the
 * Detour API (builder/creator reward ledger).
 */

import { useEffect, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

interface VaultStats {
  totalStaked: number;
  totalBurned: number;
  currentSupply: number;
  initialSupply: number;
  burnRate24h: number;
  rewardPoolBalance: number;
}

interface UserStake {
  amount: number;
  lockTier: string;
  lockExpiry: string | null;
  multiplier: number;
  pendingRewards: number;
}

interface BuilderReward {
  totalEarned: number;
  claimable: number;
  mergedPRs: number;
  githubUsername: string | null;
}

// ── Vault Page ───────────────────────────────────────────────────────────────

export default function VaultPage() {
  const [stats, setStats] = useState<VaultStats | null>(null);
  const [stake, setStake] = useState<UserStake | null>(null);
  const [builder, setBuilder] = useState<BuilderReward | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: wire to on-chain reads + Detour API
    setLoading(false);
    setStats({
      totalStaked: 0,
      totalBurned: 0,
      currentSupply: 1_000_000_000,
      initialSupply: 1_000_000_000,
      burnRate24h: 0,
      rewardPoolBalance: 0,
    });
    setStake({
      amount: 0,
      lockTier: "None",
      lockExpiry: null,
      multiplier: 1.0,
      pendingRewards: 0,
    });
    setBuilder({
      totalEarned: 0,
      claimable: 0,
      mergedPRs: 0,
      githubUsername: null,
    });
  }, []);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
      </div>
    );
  }

  const burnPercent = stats
    ? ((stats.totalBurned / stats.initialSupply) * 100).toFixed(2)
    : "0.00";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">$DTOUR Vault</h1>
        <p className="mt-1 text-sm text-white/50">
          Stake, earn, and track the burn.
        </p>
      </div>

      {/* Protocol Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Total Staked"
          value={formatNumber(stats?.totalStaked ?? 0)}
          unit="$DTOUR"
        />
        <StatCard
          label="Total Burned"
          value={formatNumber(stats?.totalBurned ?? 0)}
          unit="$DTOUR"
          accent="text-orange-400"
        />
        <StatCard
          label="Burn Rate (24h)"
          value={formatNumber(stats?.burnRate24h ?? 0)}
          unit="$DTOUR/day"
        />
        <StatCard
          label="Supply Burned"
          value={`${burnPercent}%`}
          unit="of initial"
          accent="text-red-400"
        />
      </div>

      {/* Your Stake */}
      <Section title="Your Stake">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard
            label="Staked"
            value={formatNumber(stake?.amount ?? 0)}
            unit="$DTOUR"
          />
          <StatCard
            label="Lock Tier"
            value={stake?.lockTier ?? "None"}
            unit={`${stake?.multiplier ?? 1}x boost`}
          />
          <StatCard
            label="Pending Rewards"
            value={formatNumber(stake?.pendingRewards ?? 0)}
            unit="$DTOUR"
            accent="text-green-400"
          />
          <StatCard
            label="Lock Expires"
            value={stake?.lockExpiry ?? "—"}
            unit=""
          />
        </div>

        <div className="mt-4 flex gap-3">
          <ActionButton label="Stake $DTOUR" variant="primary" />
          <ActionButton label="Claim Rewards" variant="secondary" />
          <ActionButton label="Unstake" variant="ghost" />
        </div>

        {/* Lock Tier Selector */}
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/40">
            Lock Tier
          </p>
          <div className="grid grid-cols-5 gap-2">
            {[
              { name: "Flex", days: 0, mult: "1.0x" },
              { name: "Bronze", days: 30, mult: "1.5x" },
              { name: "Silver", days: 90, mult: "2.5x" },
              { name: "Gold", days: 180, mult: "4.0x" },
              { name: "Diamond", days: 365, mult: "7.0x" },
            ].map((tier) => (
              <button
                key={tier.name}
                type="button"
                className="rounded border border-white/10 px-3 py-2 text-center text-xs transition-colors hover:border-purple-500/50 hover:bg-purple-500/10"
              >
                <div className="font-medium text-white/80">{tier.name}</div>
                <div className="text-white/40">
                  {tier.days > 0 ? `${tier.days}d` : "None"}
                </div>
                <div className="text-purple-300">{tier.mult}</div>
              </button>
            ))}
          </div>
        </div>
      </Section>

      {/* Builder Rewards */}
      <Section title="Builder Rewards">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard
            label="GitHub"
            value={builder?.githubUsername ?? "Not linked"}
            unit=""
          />
          <StatCard
            label="Merged PRs"
            value={String(builder?.mergedPRs ?? 0)}
            unit="contributions"
          />
          <StatCard
            label="Total Earned"
            value={formatNumber(builder?.totalEarned ?? 0)}
            unit="$DTOUR"
          />
          <StatCard
            label="Claimable"
            value={formatNumber(builder?.claimable ?? 0)}
            unit="$DTOUR"
            accent="text-green-400"
          />
        </div>

        <div className="mt-4 flex gap-3">
          {builder?.githubUsername ? (
            <ActionButton label="Claim Builder Rewards" variant="primary" />
          ) : (
            <ActionButton label="Link GitHub Account" variant="primary" />
          )}
        </div>
      </Section>

      {/* Fee Split Breakdown */}
      <Section title="Protocol Fee Split">
        <div className="grid grid-cols-5 gap-2">
          {[
            { label: "Vault Stakers", pct: "40%", emoji: "🏦" },
            { label: "Buyback & Burn", pct: "25%", emoji: "🔥" },
            { label: "Builder Rewards", pct: "15%", emoji: "🛠️" },
            { label: "Creator Rewards", pct: "10%", emoji: "🎨" },
            { label: "Treasury", pct: "10%", emoji: "🏛️" },
          ].map((split) => (
            <div
              key={split.label}
              className="rounded border border-white/10 p-3 text-center"
            >
              <div className="text-lg">{split.emoji}</div>
              <div className="mt-1 text-sm font-bold text-white">
                {split.pct}
              </div>
              <div className="text-xs text-white/40">{split.label}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ── Components ───────────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-5">
      <h2 className="mb-4 text-lg font-semibold text-white">{title}</h2>
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: string;
}) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.02] p-3">
      <div className="text-xs text-white/40">{label}</div>
      <div className={`mt-1 text-lg font-bold ${accent ?? "text-white"}`}>
        {value}
      </div>
      {unit && <div className="text-xs text-white/30">{unit}</div>}
    </div>
  );
}

function ActionButton({
  label,
  variant,
}: {
  label: string;
  variant: "primary" | "secondary" | "ghost";
}) {
  const styles = {
    primary:
      "bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-500 hover:to-blue-500",
    secondary:
      "border border-white/20 text-white hover:bg-white/10",
    ghost:
      "text-white/50 hover:text-white hover:bg-white/5",
  };

  return (
    <button
      type="button"
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${styles[variant]}`}
    >
      {label}
    </button>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
