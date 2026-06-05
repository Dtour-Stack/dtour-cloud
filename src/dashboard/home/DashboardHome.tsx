import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { Link } from "react-router-dom";
import { getDtourSessionToken } from "@/lib/session";
import { useFlags } from "@/lib/useFlags";
import { surfaceLabelForRoute } from "@/lib/surfaceFlags";
import {
  DTOUR_TEST_SESSION_TOKEN,
  readDtourPlaywrightUser,
} from "@/lib/playwright-dtour-auth";
import {
  Badge,
  buttonClasses,
  Button,
  cn,
  EmptyState,
  Icon,
  Panel,
  SectionHeading,
  Skeleton,
  StatCard,
} from "@/ui";

const LAUNCHER: { to: string; label: string; desc: string; icon: React.ReactNode }[] = [
  { to: "/coding", label: "Coding", desc: "Sandboxed coding agents", icon: <Icon.Zap size={16} /> },
  { to: "/design", label: "Design", desc: "Workflows & canvas", icon: <Icon.Palette size={16} /> },
  { to: "/gallery", label: "Gallery", desc: "Uploads & generated images", icon: <Icon.Image size={16} /> },
  { to: "/developers", label: "Developers", desc: "Docs & API status", icon: <Icon.Plug size={16} /> },
  { to: "/account-hub", label: "Account", desc: "Profile, security, settings", icon: <Icon.User size={16} /> },
  { to: "/analytics", label: "Analytics", desc: "Usage & spend", icon: <Icon.Activity size={16} /> },
  { to: "/instances", label: "Instances", desc: "Running agents", icon: <Icon.LayoutGrid size={16} /> },
  { to: "/mcps", label: "MCPs", desc: "Tool execution pending", icon: <Icon.Zap size={16} /> },
  { to: "/apps", label: "My Apps", desc: "Publishing planned", icon: <Icon.LayoutGrid size={16} /> },
  { to: "/earnings", label: "Earnings", desc: "Payouts planned", icon: <Icon.Coins size={16} /> },
  { to: "/api-explorer", label: "API explorer", desc: "Metering first", icon: <Icon.Plug size={16} /> },
  { to: "/api-keys", label: "API keys", desc: "Programmatic access", icon: <Icon.Shield size={16} /> },
];

type Me = {
  pubkey: string;
  balance: number;
  lastLoginAt: number | null;
  username: string | null;
  email: string | null;
  swerveTags?: string[];
  avatarUrl?: string | null;
  plan?: "lifetime" | null;
  creatorRewardsEligible?: boolean;
} | null;

type Credits =
  | {
      balanceUsd: number;
      balanceMicroUsd: number;
      holder: boolean;
      starterClaimed: boolean;
      starterUsd: number;
    }
  | null
  | undefined;

const TEST_CREDITS: Exclude<Credits, null | undefined> = {
  balanceUsd: 0.25,
  balanceMicroUsd: 250_000,
  holder: true,
  starterClaimed: true,
  starterUsd: 0.25,
};

const TIERS = [
  { name: "VIP", min: 10_000_000 },
  { name: "Operator", min: 5_000_000 },
  { name: "Scout", min: 1_000_000 },
  { name: "Holder", min: 1 },
] as const;

function tierFor(balance: number): string {
  return TIERS.find((t) => balance >= t.min)?.name ?? "None";
}

function truncate(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function DashboardHome() {
  const testUser = readDtourPlaywrightUser();
  const token = testUser ? DTOUR_TEST_SESSION_TOKEN : getDtourSessionToken();
  const flags = useFlags();
  const meQuery = useQuery(
    anyApi.users.me,
    token && !testUser ? { token } : "skip",
  ) as Me | undefined;
  const me = testUser ?? meQuery;
  const creditsQuery = useQuery(
    anyApi.coding.myCredits,
    token && !testUser ? { token } : "skip",
  ) as Credits;
  const credits = testUser ? TEST_CREDITS : creditsQuery;

  const loading = me === undefined;
  const creditsLoading = credits === undefined;
  const name = me?.username ? `@${me.username}` : me ? truncate(me.pubkey) : "";
  const balance = me?.balance ?? 0;
  const lifetime = me?.plan === "lifetime";
  const creditBalance = credits?.balanceUsd ?? 0;
  const starterUsd = credits?.starterUsd ?? 0.25;
  const starterReady = credits?.starterClaimed === true;
  const showStarterCta =
    starterReady && creditBalance <= Math.max(starterUsd, 0.25) + 0.000001;
  const launcher = LAUNCHER;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Greeting */}
      <header className="fade-up flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {!loading &&
            (me?.avatarUrl ? (
              <img
                src={me.avatarUrl}
                alt=""
                className="h-11 w-11 shrink-0 rounded-full border border-white/10 object-cover"
              />
            ) : (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-sm font-semibold text-white/40">
                {me?.username?.[0]?.toUpperCase() ?? <Icon.Wallet size={16} />}
              </div>
            ))}
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">
              {loading ? (
                <Skeleton className="h-7 w-56" />
              ) : (
                <>
                  Welcome back
                  {name && <span className="text-white/50">, {name}</span>}
                </>
              )}
            </h1>
            <p className="mt-1 flex items-center gap-2 text-[13px] text-white/45">
              {loading ? (
                <Skeleton className="h-4 w-44" />
              ) : (
                <>
                  <Icon.Wallet size={14} />
                  <span className="font-mono">{me && truncate(me.pubkey)}</span>
                </>
              )}
            </p>
          </div>
        </div>
        {!loading && me?.swerveTags?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {me.swerveTags.map((t) => (
              <Badge key={t} tone="accent">
                {t}
              </Badge>
            ))}
            {me.creatorRewardsEligible && <Badge tone="neutral">Creator split</Badge>}
          </div>
        ) : null}
      </header>

      {/* Overview */}
      <div
        className="fade-up mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        style={{ animationDelay: "60ms" }}
      >
        <StatCard
          label="$DTOUR Held"
          loading={loading}
          value={balance.toLocaleString()}
          sub="Verified on-chain at sign-in"
          icon={<Icon.Coins size={16} />}
        />
        <StatCard
          label="Access Tier"
          loading={loading}
          value={tierFor(balance)}
          sub="Based on $DTOUR balance"
          icon={<Icon.Zap size={16} />}
        />
        <StatCard
          label="Agents"
          loading={loading}
          value="0"
          sub="None deployed yet"
          icon={<Icon.Bot size={16} />}
        />
        <StatCard
          label="Credits"
          loading={creditsLoading}
          value={credits ? formatUsd(creditBalance) : "—"}
          sub={
            credits
              ? [
                  starterReady
                    ? `${formatUsd(starterUsd)} starter credit claimed`
                    : `${formatUsd(starterUsd)} starter credit pending`,
                  lifetime ? "lifetime plan active" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Credit wallet unavailable"
          }
          icon={<Icon.Activity size={16} />}
        />
      </div>

      {showStarterCta && (
        <Panel
          className="fade-up mt-4 flex flex-wrap items-center justify-between gap-4 border-emerald-400/20 bg-emerald-400/[0.04] p-4"
          style={{ animationDelay: "90ms" }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
              <Icon.Zap size={15} />
              Starter credit is ready
            </div>
            <p className="mt-1 text-[12px] text-emerald-100/65">
              Your {formatUsd(starterUsd)} beta credit is live. Try a first agent turn, then top up when you need paid coding time.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link to="/agents" className={buttonClasses("primary", "sm")}>
              Try Agents <Icon.ArrowUpRight size={14} />
            </Link>
            <Link to="/profile/billing" className={buttonClasses("secondary", "sm")}>
              Billing
            </Link>
          </div>
        </Panel>
      )}

      {/* Two-column body */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel
          className="fade-up p-6 lg:col-span-2"
          style={{ animationDelay: "120ms" }}
        >
          <SectionHeading
            title="Your agents"
            description="Deploy autonomous agents to the cloud, Discord, or your own app."
            action={
              <Button size="sm" variant="secondary" disabled>
                <Icon.Plus size={14} /> New agent
              </Button>
            }
          />
          <EmptyState
            icon={<Icon.Bot size={20} />}
            title="No agents yet"
            description="Agent deployment is coming online. For now, explore $DTOUR and your access."
            action={
              <Link to="/token" className={buttonClasses("secondary", "sm")}>
                View $DTOUR <Icon.ArrowUpRight size={14} />
              </Link>
            }
          />
        </Panel>

        <Panel
          className="fade-up p-6"
          style={{ animationDelay: "180ms" }}
        >
          <SectionHeading title="Activity" description="Recent account events." />
          <EmptyState
            icon={<Icon.Activity size={20} />}
            title="Nothing yet"
            description="Sign-ins, deploys, and credit changes will show up here."
          />
        </Panel>
      </div>

      {/* Launcher grid — everything that isn't in the slim side nav. */}
      <div className="fade-up mt-8" style={{ animationDelay: "210ms" }}>
        <SectionHeading
          title="Explore"
          description="Live, open beta, and upcoming Detour Cloud surfaces."
        />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {launcher.map((l) => {
            const surfaceLabel = surfaceLabelForRoute(l.to, flags);
            return (
              <Link
                key={l.to}
                to={l.to}
                className={cn(
                  "group flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-white/20 hover:bg-white/[0.04]",
                  surfaceLabel === "Coming soon" && "border-white/[0.07] bg-white/[0.01]",
                )}
              >
                <span className="rounded-lg bg-white/5 p-2 text-white/70 group-hover:text-white">
                  {l.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-white">{l.label}</span>
                    {surfaceLabel && (
                      <Badge
                        tone={surfaceLabel === "Coming soon" ? "warning" : "accent"}
                        className="shrink-0 px-1.5 py-0 text-[9px]"
                      >
                        {surfaceLabel}
                      </Badge>
                    )}
                  </div>
                  <div className="truncate text-xs text-white/45">{l.desc}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Attribution */}
      <div
        className="fade-up mt-10 flex items-center justify-center gap-2 opacity-50"
        style={{ animationDelay: "240ms" }}
      >
        <span className="text-[11px] uppercase tracking-widest text-white/40">
          Powered by
        </span>
        <img src="/brand/dtour/elizaos-face.png" alt="ElizaOS" className="h-4 w-4 rounded-[3px]" />
        <img src="/brand/dtour/elizaos-text.svg" alt="ElizaOS" className="h-3" />
        <span className="text-white/30">+</span>
        <img src="/brand/dtour/elizacloud-text.svg" alt="ElizaCloud" className="h-3" />
      </div>
    </div>
  );
}
