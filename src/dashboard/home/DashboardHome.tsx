import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  DTOUR_TEST_SESSION_TOKEN,
  readDtourPlaywrightUser,
} from "@/lib/playwright-dtour-auth";
import {
  type RemoteRuntimeAccess,
  type RemoteRuntimeDomainMode,
  type RemoteRuntimeFallbackStatus,
  type RemoteRuntimeMeshMode,
  type RemoteRuntimeMode,
  type RemoteRuntimeProvider,
  type RemoteRuntimeProviderStrategy,
  type RemoteRuntimeStatus,
  remoteStatusLabel,
} from "@/lib/remoteRuntime";
import { getDtourSessionToken } from "@/lib/session";
import { surfaceLabelForRoute } from "@/lib/surfaceFlags";
import { useFlags } from "@/lib/useFlags";
import {
  Badge,
  buttonClasses,
  cn,
  EmptyState,
  Icon,
  Panel,
  SectionHeading,
  Skeleton,
  StatCard,
} from "@/ui";

const LAUNCHER: { to: string; label: string; desc: string; icon: ReactNode }[] = [
  { to: "/coding", label: "Coding", desc: "Sandboxed coding agents", icon: <Icon.Zap size={16} /> },
  { to: "/design", label: "Design", desc: "Workflows & canvas", icon: <Icon.Palette size={16} /> },
  { to: "/gallery", label: "Gallery", desc: "Uploads & generated images", icon: <Icon.Image size={16} /> },
  { to: "/developers", label: "Developers", desc: "Docs & API status", icon: <Icon.Plug size={16} /> },
  { to: "/account-hub", label: "Account", desc: "Profile, security, settings", icon: <Icon.User size={16} /> },
  { to: "/analytics", label: "Analytics", desc: "Usage & spend", icon: <Icon.Activity size={16} /> },
  { to: "/instances", label: "Instances", desc: "Running agents", icon: <Icon.LayoutGrid size={16} /> },
  { to: "/mcps", label: "MCPs", desc: "Saved tool servers", icon: <Icon.Zap size={16} /> },
  { to: "/apps", label: "App Builder", desc: "Prompt apps + bind resources", icon: <Icon.LayoutGrid size={16} /> },
  { to: "/documents", label: "Documents", desc: "Agent knowledge", icon: <Icon.BookOpen size={16} /> },
  { to: "/earnings", label: "Earnings", desc: "Affiliate payouts", icon: <Icon.Coins size={16} /> },
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

type AgentSummary = {
  id: string;
  name: string;
  model: string;
  type: string;
  plugins?: string[];
};

type DeploymentSummary = {
  agentId: string;
  mode: RemoteRuntimeMode;
  providerStrategy: RemoteRuntimeProviderStrategy;
  activeProvider: RemoteRuntimeProvider;
  fallbackStatus: RemoteRuntimeFallbackStatus;
  status: RemoteRuntimeStatus;
  domainMode: RemoteRuntimeDomainMode;
  customDomain: string | null;
  webVisibility: RemoteRuntimeAccess;
  apiVisibility: RemoteRuntimeAccess;
  a2aEnabled: boolean;
  mcpEnabled: boolean;
  meshMode: RemoteRuntimeMeshMode;
  tailnet: string | null;
  headscaleUrl: string | null;
  meshHostname: string;
  webUiUrl: string;
  apiBaseUrl: string;
  lastError: string | null;
};

type InstanceSummary = {
  agent: AgentSummary;
  deployment: DeploymentSummary;
};

type AppBuildSummary = {
  id: string;
  name: string;
  status: "draft" | "needs_config" | "ready";
  databaseProvider: string;
  knowledgeMode: string;
  mcpIds: string[];
};

const TEST_CREDITS: Exclude<Credits, null | undefined> = {
  balanceUsd: 0.25,
  balanceMicroUsd: 250_000,
  holder: true,
  starterClaimed: true,
  starterUsd: 0.25,
};

const TIERS = [
  { name: "Operator", min: 10_000_000 },
  { name: "Scout", min: 1_000_000 },
  { name: "Holder", min: 1 },
] as const;

function tierFor(balance: number): string {
  return TIERS.find((t) => balance >= t.min)?.name ?? "Free";
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
  const instanceRowsQuery = useQuery(
    anyApi.remoteAgentDeployments.list,
    token && !testUser ? { token } : "skip",
  ) as InstanceSummary[] | undefined;
  const appBuildsQuery = useQuery(
    anyApi.apps.list,
    token && !testUser ? { token } : "skip",
  ) as AppBuildSummary[] | undefined;
  const connectedMcpsQuery = useQuery(
    anyApi.mcps.connected,
    token && !testUser ? { token } : "skip",
  ) as string[] | undefined;
  const instanceRows = testUser ? [] : instanceRowsQuery;
  const appBuilds = testUser ? [] : appBuildsQuery;
  const connectedMcps = testUser ? [] : connectedMcpsQuery;
  const loadedRows = instanceRows ?? [];
  const loadedBuilds = appBuilds ?? [];
  const loadedMcps = connectedMcps ?? [];
  const agentCount = loadedRows.length;
  const appCount = loadedBuilds.length;
  const readyAppCount = loadedBuilds.filter((build) => build.status === "ready").length;
  const webCrawlCount = loadedBuilds.filter((build) => build.knowledgeMode === "web_crawl").length;

  const loading = me === undefined;
  const creditsLoading = credits === undefined;
  const agentsLoading = instanceRows === undefined;
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
          label="$DTOUR Balance"
          loading={loading}
          value={balance.toLocaleString()}
          sub={balance > 0 ? "Holder perks active" : "Connect wallet to verify $DTOUR"}
          icon={<Icon.Coins size={16} />}
        />
        <StatCard
          label="Access Tier"
          loading={loading}
          value={tierFor(balance)}
          sub={balance > 0 ? "Based on $DTOUR balance" : "Free tier — all surfaces available"}
          icon={<Icon.Zap size={16} />}
        />
        <StatCard
          label="Agents"
          loading={agentsLoading}
          value={agentCount.toLocaleString()}
          sub={agentCount ? "Ready for cloud buildout" : "None deployed yet"}
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

      <Panel
        className="fade-up mt-6 overflow-hidden p-0"
        style={{ animationDelay: "110ms" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Build your cloud</h2>
            <p className="mt-0.5 text-xs text-white/45">
              App blueprints, agents, infra, knowledge, MCPs, APIs, and databases.
            </p>
          </div>
          <Link to="/apps" className={buttonClasses("primary", "sm")}>
            Open App Builder <Icon.ArrowUpRight size={14} />
          </Link>
        </div>
        <div className="grid gap-px bg-white/10 md:grid-cols-2 xl:grid-cols-4">
          <CloudLink
            to="/apps"
            icon={<Icon.LayoutGrid size={15} />}
            title="App Builder"
            value={`${appCount} blueprint${appCount === 1 ? "" : "s"}`}
            detail={`${readyAppCount} ready · v0-style app workspace`}
          />
          <CloudLink
            to="/cloud-builder"
            icon={<Icon.Bot size={15} />}
            title="Agents + infra"
            value={`${agentCount} runtime${agentCount === 1 ? "" : "s"}`}
            detail="24/7 agents, A2A, API, mesh, domains"
          />
          <CloudLink
            to="/documents"
            icon={<Icon.BookOpen size={15} />}
            title="Knowledge"
            value={webCrawlCount ? `${webCrawlCount} web-crawl app${webCrawlCount === 1 ? "" : "s"}` : "RAG stores"}
            detail="Documents, web pages, instructions"
          />
          <CloudLink
            to="/mcps"
            icon={<Icon.Plug size={15} />}
            title="MCP + API"
            value={`${loadedMcps.length} MCP${loadedMcps.length === 1 ? "" : "s"}`}
            detail="Tool servers, API keys, endpoint access"
          />
        </div>
      </Panel>

      {/* Two-column body */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel
          className="fade-up p-6 lg:col-span-2"
          style={{ animationDelay: "120ms" }}
        >
          <SectionHeading
            title="Your agents"
            description="Create agents, then open Agent Cloud for deploy status, API access, endpoint privacy, and workflow bindings."
            action={
              <Link to="/agents" className={buttonClasses("secondary", "sm")}>
                <Icon.Plus size={14} /> New agent
              </Link>
            }
          />
          {agentsLoading ? (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : loadedRows.length === 0 ? (
            <EmptyState
              icon={<Icon.Bot size={20} />}
              title="No agents yet"
              description="Create an agent, then open Agent Cloud to deploy 24/7, expose API/MCP/A2A, and bind workflow subgraphs."
              action={
                <Link to="/agents" className={buttonClasses("secondary", "sm")}>
                  Create agent <Icon.ArrowUpRight size={14} />
                </Link>
              }
            />
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {loadedRows.slice(0, 4).map(({ agent, deployment }) => (
                <Link
                  key={agent.id}
                  to={`/agents/${agent.id}`}
                  className="group flex min-w-0 items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 transition hover:border-white/20 hover:bg-white/[0.04]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="rounded-lg bg-white/5 p-2 text-white/55 group-hover:text-white/80">
                      <Icon.Bot size={15} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-white/85">
                        {agent.name}
                      </span>
                      <span className="block truncate text-[11px] text-white/40">
                        {agent.type} · {agent.model}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge tone={deployment.status === "running" ? "success" : deployment.status === "error" ? "danger" : "neutral"} className="hidden sm:inline-flex">
                      {remoteStatusLabel(deployment.status)}
                    </Badge>
                    <Icon.ArrowUpRight size={14} />
                  </span>
                </Link>
              ))}
            </div>
          )}
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

function CloudLink({
  detail,
  icon,
  title,
  to,
  value,
}: {
  detail: string;
  icon: ReactNode;
  title: string;
  to: string;
  value: string;
}) {
  return (
    <Link
      to={to}
      className="group bg-[#0a0a0a] p-5 transition hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
    >
      <span className="flex items-center gap-2 text-xs uppercase tracking-widest text-white/40">
        <span className="rounded-md bg-white/5 p-1.5 text-white/55 group-hover:text-white/80">
          {icon}
        </span>
        {title}
      </span>
      <span className="mt-3 block text-lg font-semibold text-white">{value}</span>
      <span className="mt-1 block text-xs text-white/45">{detail}</span>
    </Link>
  );
}
