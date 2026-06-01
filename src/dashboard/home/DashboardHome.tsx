import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { Link } from "react-router-dom";
import { getDtourSessionToken } from "@/lib/session";
import { useFlags } from "@/lib/useFlags";
import { isRouteEnabled } from "@/lib/surfaceFlags";
import {
  Badge,
  buttonClasses,
  Button,
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
  { to: "/developers", label: "Developers", desc: "API, keys & docs", icon: <Icon.Plug size={16} /> },
  { to: "/account-hub", label: "Account", desc: "Profile, security, settings", icon: <Icon.User size={16} /> },
  { to: "/analytics", label: "Analytics", desc: "Usage & spend", icon: <Icon.Activity size={16} /> },
  { to: "/instances", label: "Instances", desc: "Running agents", icon: <Icon.LayoutGrid size={16} /> },
  { to: "/mcps", label: "MCPs", desc: "Hosted tool servers", icon: <Icon.Zap size={16} /> },
  { to: "/apps", label: "My Apps", desc: "Publish & monetize", icon: <Icon.LayoutGrid size={16} /> },
  { to: "/earnings", label: "Earnings", desc: "Affiliate $ELIZA", icon: <Icon.Coins size={16} /> },
  { to: "/api-explorer", label: "API explorer", desc: "Try cloud routes", icon: <Icon.Plug size={16} /> },
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
} | null;

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

export function DashboardHome() {
  const token = getDtourSessionToken();
  const flags = useFlags();
  const me = useQuery(
    anyApi.users.me,
    token ? { token } : "skip",
  ) as Me | undefined;

  const loading = me === undefined;
  const name = me?.username ? `@${me.username}` : me ? truncate(me.pubkey) : "";
  const balance = me?.balance ?? 0;
  const lifetime = me?.plan === "lifetime";
  const launcher = LAUNCHER.filter((l) => isRouteEnabled(l.to, flags));

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
          loading={loading}
          value={lifetime ? "Unlimited" : "—"}
          sub={lifetime ? "Lifetime access" : "Connect billing to track"}
          icon={<Icon.Activity size={16} />}
        />
      </div>

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
        <SectionHeading title="Explore" description="Jump to any part of Detour Cloud." />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {launcher.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="group flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-white/20 hover:bg-white/[0.04]"
            >
              <span className="rounded-lg bg-white/5 p-2 text-white/70 group-hover:text-white">
                {l.icon}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-white">{l.label}</div>
                <div className="truncate text-xs text-white/45">{l.desc}</div>
              </div>
            </Link>
          ))}
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
