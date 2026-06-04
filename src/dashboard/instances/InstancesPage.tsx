import { useAction, useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/dashboard/AppShell";
import {
  canLaunchRemote,
  defaultDetourSubdomain,
  remoteRuntimeUrl,
  remoteStatusLabel,
  type RemoteRuntimeAccess,
  type RemoteRuntimeDomainMode,
  type RemoteRuntimeMode,
  type RemoteRuntimeStatus,
} from "@/lib/remoteRuntime";
import {
  DTOUR_TEST_SESSION_TOKEN,
  readDtourPlaywrightUser,
} from "@/lib/playwright-dtour-auth";
import { getDtourSessionToken } from "@/lib/session";
import {
  Badge,
  Button,
  buttonClasses,
  cn,
  EmptyState,
  Icon,
  Panel,
  Skeleton,
} from "@/ui";

type RemoteDeployment = {
  id: string | null;
  agentId: string;
  mode: RemoteRuntimeMode;
  status: RemoteRuntimeStatus;
  upstreamAgentId: string | null;
  upstreamJobId: string | null;
  domainMode: RemoteRuntimeDomainMode;
  detourSubdomain: string;
  customDomain: string | null;
  webVisibility: RemoteRuntimeAccess;
  apiVisibility: RemoteRuntimeAccess;
  a2aEnabled: boolean;
  mcpEnabled: boolean;
  webUiUrl: string;
  apiBaseUrl: string;
  lastHeartbeatAt: number | null;
  lastSyncedAt: number | null;
  lastError: string | null;
  createdAt: number | null;
  updatedAt: number | null;
};

type RuntimeAgent = {
  id: string;
  name: string;
  description: string | null;
  model: string;
  type: string;
  plugins: string[];
  createdAt: number;
};

type RuntimeRow = {
  agent: RuntimeAgent;
  deployment: RemoteDeployment;
};

type RuntimeDraft = {
  mode: RemoteRuntimeMode;
  domainMode: RemoteRuntimeDomainMode;
  customDomain: string;
  webVisibility: RemoteRuntimeAccess;
  apiVisibility: RemoteRuntimeAccess;
  a2aEnabled: boolean;
  mcpEnabled: boolean;
};

type OpenWebUiResult =
  | { ready: true; url: string }
  | {
      ready: false;
      retryAfterMs: number;
      jobId: string | null;
      message: string;
    };

const TEST_ROWS: RuntimeRow[] = [
  {
    agent: {
      id: "playwright-runtime-agent",
      name: "research-agent",
      description: "Research and operator review.",
      model: "gpt-4o",
      type: "lightweight",
      plugins: ["plugin-web"],
      createdAt: Date.now() - 86_400_000,
    },
    deployment: {
      id: "deployment-research",
      agentId: "playwright-runtime-agent",
      mode: "remote_24_7",
      status: "running",
      upstreamAgentId: "cloud-research-agent",
      upstreamJobId: "job_remote_ready",
      domainMode: "detour",
      detourSubdomain: "agent-research.detour.ninja",
      customDomain: null,
      webVisibility: "private",
      apiVisibility: "private",
      a2aEnabled: true,
      mcpEnabled: true,
      webUiUrl: "https://agent-research.detour.ninja",
      apiBaseUrl: "https://api.detour.ninja/v1/agents/cloud-research-agent",
      lastHeartbeatAt: Date.now() - 12_000,
      lastSyncedAt: Date.now() - 10_000,
      lastError: null,
      createdAt: Date.now() - 86_400_000,
      updatedAt: Date.now() - 10_000,
    },
  },
  {
    agent: {
      id: "playwright-support-agent",
      name: "support-agent",
      description: "Customer support draft.",
      model: "claude-sonnet-4-6",
      type: "lightweight",
      plugins: [],
      createdAt: Date.now() - 172_800_000,
    },
    deployment: {
      id: "deployment-support",
      agentId: "playwright-support-agent",
      mode: "on_demand",
      status: "not_configured",
      upstreamAgentId: null,
      upstreamJobId: null,
      domainMode: "custom",
      detourSubdomain: defaultDetourSubdomain("playwright-support-agent"),
      customDomain: "support.detour.ninja",
      webVisibility: "private",
      apiVisibility: "private",
      a2aEnabled: false,
      mcpEnabled: false,
      webUiUrl: remoteRuntimeUrl(
        "playwright-support-agent",
        "custom",
        "support.detour.ninja",
      ),
      apiBaseUrl: "https://api.detour.ninja/v1/agents/playwright-support-agent",
      lastHeartbeatAt: null,
      lastSyncedAt: null,
      lastError: null,
      createdAt: Date.now() - 172_800_000,
      updatedAt: Date.now() - 172_800_000,
    },
  },
];

function draftFrom(deployment: RemoteDeployment): RuntimeDraft {
  return {
    mode: deployment.mode,
    domainMode: deployment.domainMode,
    customDomain: deployment.customDomain ?? "",
    webVisibility: deployment.webVisibility,
    apiVisibility: deployment.apiVisibility,
    a2aEnabled: deployment.a2aEnabled,
    mcpEnabled: deployment.mcpEnabled,
  };
}

function formatRelativeTime(ts: number | null): string {
  if (!ts) return "never";
  const seconds = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function statusTone(status: RemoteRuntimeStatus): "neutral" | "success" | "warning" | "danger" | "accent" {
  if (status === "running") return "success";
  if (status === "error") return "danger";
  if (status === "queued" || status === "provisioning" || status === "creating") {
    return "accent";
  }
  if (status === "suspended") return "warning";
  return "neutral";
}

function deploymentEndpoint(
  deployment: RemoteDeployment,
  suffix: "a2a" | "mcp",
): string {
  return `${deployment.apiBaseUrl.replace(/\/$/, "")}/${suffix}`;
}

function SummaryCard({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub: string;
  icon: ReactNode;
  tone?: "neutral" | "success" | "warning" | "accent";
}) {
  return (
    <Panel
      className={cn(
        "min-h-28 p-4",
        tone === "success" && "border-emerald-400/20 bg-emerald-400/[0.04]",
        tone === "warning" && "border-amber-400/20 bg-amber-400/[0.04]",
        tone === "accent" && "border-purple-400/25 bg-purple-400/[0.05]",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-wider text-white/40">
          {label}
        </span>
        <span className="rounded-lg bg-white/5 p-2 text-white/60">{icon}</span>
      </div>
      <div className="mt-4 text-xl font-semibold tracking-tight text-white">{value}</div>
      <div className="mt-1 text-xs text-white/45">{sub}</div>
    </Panel>
  );
}

function AgentList({
  rows,
  selectedId,
  search,
  setSearch,
  setSelectedId,
}: {
  rows: RuntimeRow[];
  selectedId: string | null;
  search: string;
  setSearch: (value: string) => void;
  setSelectedId: (value: string) => void;
}) {
  const filtered = rows.filter((row) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return (
      row.agent.name.toLowerCase().includes(needle) ||
      row.agent.model.toLowerCase().includes(needle)
    );
  });

  return (
    <Panel className="overflow-hidden">
      <div className="border-b border-white/10 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">Agents</h2>
          <Link to="/agents" className={buttonClasses("secondary", "sm", "px-3")}>
            <Icon.Plus size={14} /> New
          </Link>
        </div>
        <label className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/50 focus-within:border-purple-400/40">
          <Icon.Search size={14} />
          <input
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Search agents"
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
          />
        </label>
      </div>

      <div className="divide-y divide-white/10">
        {filtered.map((row) => (
          <button
            key={row.agent.id}
            type="button"
            onClick={() => setSelectedId(row.agent.id)}
            className={cn(
              "flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60",
              selectedId === row.agent.id && "bg-purple-400/[0.08]",
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/60",
                selectedId === row.agent.id && "border-purple-400/30 text-purple-100",
              )}
            >
              <Icon.Bot size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white">
                {row.agent.name}
              </span>
              <span className="mt-0.5 block truncate text-xs text-white/40">
                {row.agent.model}
                {row.agent.plugins.length > 0 ? ` · ${row.agent.plugins.length} plugin(s)` : ""}
              </span>
            </span>
            <Badge tone={statusTone(row.deployment.status)} className="shrink-0 px-2 py-0">
              {remoteStatusLabel(row.deployment.status)}
            </Badge>
          </button>
        ))}
      </div>

      <div className="border-t border-white/10 px-4 py-3 text-xs text-white/40">
        {filtered.length} agent{filtered.length === 1 ? "" : "s"}
      </div>
    </Panel>
  );
}

function SegmentedOption({
  selected,
  title,
  description,
  icon,
  onClick,
}: {
  selected: boolean;
  title: string;
  description: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-24 items-start gap-3 rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60",
        selected
          ? "border-purple-400/50 bg-purple-400/[0.10] text-white"
          : "border-white/10 bg-white/[0.02] text-white/70 hover:bg-white/[0.04]",
      )}
    >
      <span className="rounded-md bg-white/5 p-2 text-white/70">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-white/45">
          {description}
        </span>
      </span>
    </button>
  );
}

function AccessToggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: RemoteRuntimeAccess;
  onChange: (value: RemoteRuntimeAccess) => void;
}) {
  return (
    <div className="grid gap-3 border-t border-white/10 py-4 md:grid-cols-[minmax(0,1fr)_240px]">
      <div>
        <div className="text-sm font-medium text-white">{label}</div>
        <div className="mt-1 text-xs leading-relaxed text-white/45">{description}</div>
      </div>
      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-white/10 bg-black/20 p-1">
        {(["private", "public"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60",
              value === option ? "bg-white text-black" : "text-white/55 hover:text-white",
            )}
          >
            {option === "private" ? <Icon.Shield size={13} /> : <Icon.Globe size={13} />}
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function SwitchRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="grid gap-3 border-t border-white/10 py-4 md:grid-cols-[minmax(0,1fr)_96px]">
      <div>
        <div className="text-sm font-medium text-white">{label}</div>
        <div className="mt-1 text-xs leading-relaxed text-white/45">{description}</div>
      </div>
      <button
        type="button"
        aria-pressed={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-8 w-14 justify-self-start rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 md:justify-self-end",
          checked
            ? "border-purple-400/40 bg-purple-500"
            : "border-white/15 bg-white/[0.05]",
        )}
      >
        <span
          className={cn(
            "absolute top-1 h-6 w-6 rounded-full bg-white transition",
            checked ? "left-7" : "left-1",
          )}
        />
      </button>
    </div>
  );
}

function EndpointRow({
  label,
  value,
  enabled,
  onCopy,
}: {
  label: string;
  value: string;
  enabled: boolean;
  onCopy: (value: string) => void;
}) {
  return (
    <div className={cn("rounded-lg border border-white/10 p-3", !enabled && "opacity-45")}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wider text-white/40">
          {label}
        </span>
        <button
          type="button"
          aria-label={`Copy ${label}`}
          disabled={!enabled}
          onClick={() => onCopy(value)}
          className="rounded-md p-1.5 text-white/45 transition hover:bg-white/10 hover:text-white disabled:pointer-events-none"
        >
          <Icon.Copy size={14} />
        </button>
      </div>
      <div className="mt-2 break-all font-mono text-[12px] leading-relaxed text-white/70">
        {value}
      </div>
    </div>
  );
}

function Timeline({ deployment }: { deployment: RemoteDeployment }) {
  const rows = [
    { label: "Configuration saved", done: deployment.mode === "remote_24_7" },
    { label: "Cloud agent created", done: Boolean(deployment.upstreamAgentId) },
    {
      label:
        deployment.status === "running"
          ? "Runtime initialized"
          : deployment.status === "error"
            ? "Provisioning error"
            : "Provisioning queued",
      done:
        deployment.status === "queued" ||
        deployment.status === "provisioning" ||
        deployment.status === "running" ||
        deployment.status === "error",
    },
    { label: "Agent ready", done: deployment.status === "running" },
  ];

  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={row.label} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full border text-[10px]",
                row.done
                  ? "border-emerald-400/30 bg-emerald-400/15 text-emerald-200"
                  : "border-white/10 bg-white/[0.04] text-white/30",
              )}
            >
              {row.done ? <Icon.Check size={11} /> : index + 1}
            </span>
            {index < rows.length - 1 && (
              <span className="mt-1 h-6 w-px bg-white/10" />
            )}
          </div>
          <div className="min-w-0 pt-0.5">
            <div className="text-sm text-white/80">{row.label}</div>
            {index === 2 && deployment.upstreamJobId && (
              <div className="mt-0.5 truncate font-mono text-[11px] text-white/35">
                {deployment.upstreamJobId}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function RuntimeConfigPanel({
  selected,
  draft,
  setDraft,
  busy,
  onSave,
  onDeploy,
  onSync,
  onOpen,
  onSuspend,
}: {
  selected: RuntimeRow;
  draft: RuntimeDraft;
  setDraft: (draft: RuntimeDraft) => void;
  busy: string | null;
  onSave: () => void;
  onDeploy: () => void;
  onSync: () => void;
  onOpen: () => void;
  onSuspend: () => void;
}) {
  const deployment = selected.deployment;
  const launchable =
    draft.mode === "remote_24_7" && canLaunchRemote(deployment.status);

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 p-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/65">
            <Icon.Bot size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-white">{selected.agent.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/45">
              <span>{selected.agent.model}</span>
              <span>·</span>
              <span>{selected.agent.type}</span>
              <Badge tone={statusTone(deployment.status)} className="px-2 py-0">
                {remoteStatusLabel(deployment.status)}
              </Badge>
            </div>
          </div>
        </div>
        <Link
          to={`/agents/${selected.agent.id}`}
          className={buttonClasses("secondary", "sm")}
        >
          Edit agent <Icon.ArrowUpRight size={14} />
        </Link>
      </div>

      <div className="p-5">
        <div>
          <div className="text-sm font-semibold text-white">Runtime mode</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <SegmentedOption
              selected={draft.mode === "on_demand"}
              title="On-demand"
              description="Run inside Detour chat while the owner is active."
              icon={<Icon.Play size={16} />}
              onClick={() => setDraft({ ...draft, mode: "on_demand" })}
            />
            <SegmentedOption
              selected={draft.mode === "remote_24_7"}
              title="24/7 remote"
              description="Provision a continuously available ElizaCloud runtime."
              icon={<Icon.Activity size={16} />}
              onClick={() => setDraft({ ...draft, mode: "remote_24_7" })}
            />
          </div>
        </div>

        <div className="mt-6 border-t border-white/10 pt-5">
          <div className="text-sm font-semibold text-white">Domain</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <SegmentedOption
              selected={draft.domainMode === "detour"}
              title="detour.ninja"
              description={deployment.detourSubdomain}
              icon={<Icon.Globe size={16} />}
              onClick={() => setDraft({ ...draft, domainMode: "detour" })}
            />
            <SegmentedOption
              selected={draft.domainMode === "custom"}
              title="Custom domain"
              description="Save the domain for DNS attach and operator review."
              icon={<Icon.Settings size={16} />}
              onClick={() => setDraft({ ...draft, domainMode: "custom" })}
            />
          </div>
          {draft.domainMode === "custom" && (
            <label className="mt-3 block">
              <span className="text-xs font-medium uppercase tracking-wider text-white/40">
                Hostname
              </span>
              <input
                value={draft.customDomain}
                onChange={(event) =>
                  setDraft({ ...draft, customDomain: event.currentTarget.value })
                }
                placeholder="agent.example.com"
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-purple-400/45"
              />
            </label>
          )}
        </div>

        <div className="mt-2">
          <AccessToggle
            label="Web UI access"
            description="Private requires owner pairing; public exposes the web entry."
            value={draft.webVisibility}
            onChange={(webVisibility) => setDraft({ ...draft, webVisibility })}
          />
          <AccessToggle
            label="Agent API access"
            description="Private requires authenticated requests; public exposes endpoint metadata."
            value={draft.apiVisibility}
            onChange={(apiVisibility) => setDraft({ ...draft, apiVisibility })}
          />
          <SwitchRow
            label="Agent-to-Agent endpoint"
            description="Expose A2A policy for this runtime."
            checked={draft.a2aEnabled}
            onChange={(a2aEnabled) => setDraft({ ...draft, a2aEnabled })}
          />
          <SwitchRow
            label="MCP endpoint"
            description="Expose MCP policy for this runtime."
            checked={draft.mcpEnabled}
            onChange={(mcpEnabled) => setDraft({ ...draft, mcpEnabled })}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/10 pt-5">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy !== null}
            onClick={onSave}
          >
            <Icon.Check size={14} /> Save config
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy !== null || !launchable}
            onClick={onDeploy}
          >
            <Icon.Zap size={14} /> Deploy remote runtime
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy !== null || !deployment.upstreamAgentId}
            onClick={onOpen}
          >
            <Icon.ArrowUpRight size={14} /> Open Web UI
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy !== null || !deployment.upstreamAgentId}
            onClick={onSync}
          >
            Sync
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy !== null || !deployment.upstreamAgentId}
            onClick={onSuspend}
          >
            Suspend
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function RuntimeRail({
  deployment,
  onCopy,
}: {
  deployment: RemoteDeployment;
  onCopy: (value: string) => void;
}) {
  return (
    <Panel className="space-y-5 p-5">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">Provisioning timeline</h2>
          <Badge tone={statusTone(deployment.status)}>{remoteStatusLabel(deployment.status)}</Badge>
        </div>
        <div className="mt-4">
          <Timeline deployment={deployment} />
        </div>
      </div>

      <div className="border-t border-white/10 pt-5">
        <h2 className="text-sm font-semibold text-white">Runtime endpoints</h2>
        <div className="mt-3 space-y-3">
          <EndpointRow
            label="Web UI"
            value={deployment.webUiUrl}
            enabled={deployment.mode === "remote_24_7"}
            onCopy={onCopy}
          />
          <EndpointRow
            label="Agent API"
            value={deployment.apiBaseUrl}
            enabled={Boolean(deployment.upstreamAgentId)}
            onCopy={onCopy}
          />
          <EndpointRow
            label="A2A"
            value={deploymentEndpoint(deployment, "a2a")}
            enabled={deployment.a2aEnabled && Boolean(deployment.upstreamAgentId)}
            onCopy={onCopy}
          />
          <EndpointRow
            label="MCP"
            value={deploymentEndpoint(deployment, "mcp")}
            enabled={deployment.mcpEnabled && Boolean(deployment.upstreamAgentId)}
            onCopy={onCopy}
          />
        </div>
      </div>

      <div className="grid gap-3 border-t border-white/10 pt-5 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-white/40">Web visibility</span>
          <span className="capitalize text-white/80">{deployment.webVisibility}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-white/40">API visibility</span>
          <span className="capitalize text-white/80">{deployment.apiVisibility}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-white/40">Heartbeat</span>
          <span className="text-white/80">{formatRelativeTime(deployment.lastHeartbeatAt)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-white/40">Last sync</span>
          <span className="text-white/80">{formatRelativeTime(deployment.lastSyncedAt)}</span>
        </div>
      </div>

      {deployment.lastError && (
        <div className="rounded-lg border border-red-400/20 bg-red-400/[0.05] p-3 text-xs leading-relaxed text-red-200">
          {deployment.lastError}
        </div>
      )}
    </Panel>
  );
}

function RuntimeSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)_360px]">
      <Panel className="p-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-4 h-12 w-full" />
        <Skeleton className="mt-3 h-16 w-full" />
        <Skeleton className="mt-2 h-16 w-full" />
      </Panel>
      <Panel className="p-5">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="mt-6 h-28 w-full" />
        <Skeleton className="mt-4 h-28 w-full" />
        <Skeleton className="mt-4 h-36 w-full" />
      </Panel>
      <Panel className="p-5">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-5 h-44 w-full" />
        <Skeleton className="mt-4 h-48 w-full" />
      </Panel>
    </div>
  );
}

export default function InstancesPage() {
  const testUser = readDtourPlaywrightUser();
  const token = testUser ? DTOUR_TEST_SESSION_TOKEN : getDtourSessionToken();
  const rowsQuery = useQuery(
    anyApi.remoteAgentDeployments.list,
    token && !testUser ? { token } : "skip",
  ) as RuntimeRow[] | undefined;
  const rows = testUser ? TEST_ROWS : rowsQuery;
  const configureRemote = useMutation(anyApi.remoteAgentDeployments.configure);
  const deployRemote = useAction(anyApi.remoteAgentDeployments.deploy);
  const syncRemote = useAction(anyApi.remoteAgentDeployments.sync);
  const openRemote = useAction(anyApi.remoteAgentDeployments.openWebUi);
  const suspendRemote = useAction(anyApi.remoteAgentDeployments.suspend);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RuntimeDraft>({
    mode: "on_demand",
    domainMode: "detour",
    customDomain: "",
    webVisibility: "private",
    apiVisibility: "private",
    a2aEnabled: false,
    mcpEnabled: false,
  });

  useEffect(() => {
    if (!rows?.length) return;
    if (!selectedId || !rows.some((row) => row.agent.id === selectedId)) {
      setSelectedId(rows[0].agent.id);
    }
  }, [rows, selectedId]);

  const selected = useMemo(
    () => rows?.find((row) => row.agent.id === selectedId) ?? rows?.[0] ?? null,
    [rows, selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    setDraft(draftFrom(selected.deployment));
  }, [
    selected?.agent.id,
    selected?.deployment.updatedAt,
    selected?.deployment.status,
  ]);

  const summary = useMemo(() => {
    const current = rows ?? [];
    const remote = current.filter((row) => row.deployment.mode === "remote_24_7");
    return {
      total: current.length,
      remote: remote.length,
      running: current.filter((row) => row.deployment.status === "running").length,
      publicEndpoints: current.filter(
        (row) =>
          row.deployment.webVisibility === "public" ||
          row.deployment.apiVisibility === "public",
      ).length,
      customDomains: current.filter((row) => row.deployment.domainMode === "custom")
        .length,
    };
  }, [rows]);

  async function run(label: string, task: () => Promise<void>) {
    setBusy(label);
    setNotice(null);
    setError(null);
    try {
      await task();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(message);
    } finally {
      setBusy(null);
    }
  }

  async function saveSelectedConfig() {
    if (!token || !selected) return;
    const customDomain = draft.customDomain.trim();
    await configureRemote({
      token,
      agentId: selected.agent.id,
      mode: draft.mode,
      domainMode: draft.domainMode,
      customDomain: customDomain || undefined,
      webVisibility: draft.webVisibility,
      apiVisibility: draft.apiVisibility,
      a2aEnabled: draft.a2aEnabled,
      mcpEnabled: draft.mcpEnabled,
    });
  }

  function handleSave() {
    void run("Saving", async () => {
      if (testUser) {
        setNotice("Preview config saved.");
        return;
      }
      await saveSelectedConfig();
      setNotice("Runtime config saved.");
    });
  }

  function handleDeploy() {
    void run("Deploying", async () => {
      if (!token || !selected) return;
      if (testUser) {
        setNotice("Remote runtime is running in preview mode.");
        return;
      }
      await saveSelectedConfig();
      await deployRemote({ token, agentId: selected.agent.id });
      setNotice("Provisioning requested. Sync for current status.");
    });
  }

  function handleSync() {
    void run("Syncing", async () => {
      if (!token || !selected) return;
      if (testUser) {
        setNotice("Runtime status synced.");
        return;
      }
      await syncRemote({ token, agentId: selected.agent.id });
      setNotice("Runtime status synced.");
    });
  }

  function handleOpen() {
    void run("Opening", async () => {
      if (!token || !selected) return;
      if (testUser) {
        setNotice("Web UI pairing link ready.");
        return;
      }
      const result = (await openRemote({
        token,
        agentId: selected.agent.id,
      })) as OpenWebUiResult;
      if (result.ready) {
        window.open(result.url, "_blank", "noopener,noreferrer");
        setNotice("Web UI pairing link opened.");
        return;
      }
      setNotice(result.message);
    });
  }

  function handleSuspend() {
    void run("Suspending", async () => {
      if (!token || !selected) return;
      if (testUser) {
        setNotice("Suspend requested.");
        return;
      }
      await suspendRemote({ token, agentId: selected.agent.id });
      setNotice("Suspend requested.");
    });
  }

  async function copyEndpoint(value: string) {
    await navigator.clipboard.writeText(value);
    setNotice("Endpoint copied.");
  }

  return (
    <AppShell title="Remote Runtime">
      <div className="mx-auto max-w-[1480px] space-y-6 px-6 py-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge tone="accent">Open beta</Badge>
              <Badge tone="neutral">ElizaCloud-backed</Badge>
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
              Remote Runtime
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/50">
              Provision 24/7 agent runtimes, review domains, and control web/API exposure.
            </p>
          </div>
          <Link to="/developers" className={buttonClasses("secondary", "sm")}>
            Docs <Icon.BookOpen size={14} />
          </Link>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Remote runtimes"
            value={`${summary.remote}/${summary.total}`}
            sub="Agents configured for 24/7"
            icon={<Icon.Activity size={16} />}
            tone={summary.remote > 0 ? "accent" : "neutral"}
          />
          <SummaryCard
            label="Running"
            value={String(summary.running)}
            sub="Live upstream runtime status"
            icon={<Icon.Zap size={16} />}
            tone={summary.running > 0 ? "success" : "neutral"}
          />
          <SummaryCard
            label="Public access"
            value={String(summary.publicEndpoints)}
            sub="Web UI or API exposure"
            icon={<Icon.Globe size={16} />}
            tone={summary.publicEndpoints > 0 ? "warning" : "neutral"}
          />
          <SummaryCard
            label="Custom domains"
            value={String(summary.customDomains)}
            sub="Saved for DNS attach"
            icon={<Icon.Settings size={16} />}
            tone={summary.customDomains > 0 ? "accent" : "neutral"}
          />
        </div>

        {notice && (
          <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.05] px-4 py-3 text-sm text-emerald-100">
            {notice}
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-400/20 bg-red-400/[0.05] px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}
        {busy && (
          <div className="rounded-lg border border-purple-400/20 bg-purple-400/[0.05] px-4 py-3 text-sm text-purple-100">
            {busy}...
          </div>
        )}

        {rows === undefined ? (
          <RuntimeSkeleton />
        ) : rows.length === 0 ? (
          <Panel>
            <EmptyState
              icon={<Icon.Bot size={20} />}
              title="No agents yet"
              description="Create an agent before provisioning a remote runtime."
              action={
                <Link to="/agents" className={buttonClasses("primary", "sm")}>
                  Create agent <Icon.Plus size={14} />
                </Link>
              }
            />
          </Panel>
        ) : selected ? (
          <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)_360px]">
            <AgentList
              rows={rows}
              selectedId={selected.agent.id}
              search={search}
              setSearch={setSearch}
              setSelectedId={setSelectedId}
            />
            <RuntimeConfigPanel
              selected={selected}
              draft={draft}
              setDraft={setDraft}
              busy={busy}
              onSave={handleSave}
              onDeploy={handleDeploy}
              onSync={handleSync}
              onOpen={handleOpen}
              onSuspend={handleSuspend}
            />
            <RuntimeRail deployment={selected.deployment} onCopy={copyEndpoint} />
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
