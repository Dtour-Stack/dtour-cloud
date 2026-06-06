import { useAction, useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import type { ComponentProps, ReactNode } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/dashboard/AppShell";
import {
  canLaunchRemote,
  remoteApiBaseUrl,
  remoteFallbackLabel,
  remoteMeshLabel,
  remoteProviderLabel,
  remoteRuntimeUrl,
  remoteStatusLabel,
  type RemoteRuntimeAccess,
  type RemoteRuntimeDomainMode,
  type RemoteRuntimeFallbackStatus,
  type RemoteRuntimeMeshMode,
  type RemoteRuntimeMode,
  type RemoteRuntimeProvider,
  type RemoteRuntimeProviderStrategy,
  type RemoteRuntimeStatus,
} from "@/lib/remoteRuntime";
import { getDtourSessionToken } from "@/lib/session";
import { Badge, Button, Icon, cn } from "@/ui";

type Agent = {
  id: string;
  name: string;
  model: string;
  type: string;
  plugins: string[];
};

type RemoteDeployment = {
  agentId: string;
  mode: RemoteRuntimeMode;
  providerStrategy: RemoteRuntimeProviderStrategy;
  activeProvider: RemoteRuntimeProvider;
  fallbackStatus: RemoteRuntimeFallbackStatus;
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
  meshMode: RemoteRuntimeMeshMode;
  tailnet: string | null;
  headscaleUrl: string | null;
  meshHostname: string;
  webUiUrl: string;
  apiBaseUrl: string;
  lastHeartbeatAt: number | null;
  lastSyncedAt: number | null;
  lastError: string | null;
};

type InstanceRow = {
  agent: Agent;
  deployment: RemoteDeployment;
};

type Draft = Pick<
  RemoteDeployment,
  | "mode"
  | "domainMode"
  | "webVisibility"
  | "apiVisibility"
  | "a2aEnabled"
  | "mcpEnabled"
  | "meshMode"
> & {
  customDomain: string;
  tailnet: string;
  headscaleUrl: string;
  meshHostname: string;
};

type OpenWebUiResult =
  | { ready: true; url: string }
  | { ready: false; message: string; retryAfterMs: number };
type BadgeTone = NonNullable<ComponentProps<typeof Badge>["tone"]>;

const field =
  "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[12px] text-white outline-none transition focus:border-purple-400/50";

export default function InstancesPage() {
  const token = getDtourSessionToken();
  const rows = useQuery(
    anyApi.remoteAgentDeployments.list,
    token ? { token } : "skip",
  ) as InstanceRow[] | undefined;

  return (
    <AppShell title="Instances">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Instances</h1>
          <p className="mt-1 text-sm text-white/50">
            Your running agents. Lightweight agents run on-demand while you're online; cloud
            containers run via the ElizaCloud runtime.
          </p>
        </div>

        {rows === undefined ? (
          <p className="text-sm text-white/40">Loading…</p>
        ) : rows.length === 0 ? (
          <Empty />
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <InstanceCard key={row.agent.id} row={row} token={token} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function InstanceCard({ row, token }: { row: InstanceRow; token: string | null }) {
  const configureRemote = useMutation(anyApi.remoteAgentDeployments.configure);
  const deployRemote = useAction(anyApi.remoteAgentDeployments.deploy);
  const syncRemote = useAction(anyApi.remoteAgentDeployments.sync);
  const openRemote = useAction(anyApi.remoteAgentDeployments.openWebUi);
  const suspendRemote = useAction(anyApi.remoteAgentDeployments.suspend);
  const [draft, setDraft] = useState<Partial<Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { agent, deployment } = row;
  const active = {
    mode: draft.mode ?? deployment.mode,
    domainMode: draft.domainMode ?? deployment.domainMode,
    customDomain: draft.customDomain ?? deployment.customDomain ?? "",
    webVisibility: draft.webVisibility ?? deployment.webVisibility,
    apiVisibility: draft.apiVisibility ?? deployment.apiVisibility,
    a2aEnabled: draft.a2aEnabled ?? deployment.a2aEnabled,
    mcpEnabled: draft.mcpEnabled ?? deployment.mcpEnabled,
    meshMode: draft.meshMode ?? deployment.meshMode,
    tailnet: draft.tailnet ?? deployment.tailnet ?? "",
    headscaleUrl: draft.headscaleUrl ?? deployment.headscaleUrl ?? "",
    meshHostname: draft.meshHostname ?? deployment.meshHostname,
  };
  const projectedWebUrl = remoteRuntimeUrl(
    agent.id,
    active.domainMode,
    active.customDomain,
  );
  const apiBaseUrl = remoteApiBaseUrl(agent.id);
  const fieldIdBase = agent.id.replace(/[^a-z0-9_-]/gi, "-");
  const fieldIds = {
    runtime: `remote-runtime-${fieldIdBase}`,
    domain: `remote-domain-${fieldIdBase}`,
    customDomain: `remote-custom-domain-${fieldIdBase}`,
    webVisibility: `remote-web-visibility-${fieldIdBase}`,
    apiVisibility: `remote-api-visibility-${fieldIdBase}`,
    meshMode: `remote-mesh-mode-${fieldIdBase}`,
    tailnet: `remote-tailnet-${fieldIdBase}`,
    headscaleUrl: `remote-headscale-url-${fieldIdBase}`,
    meshHostname: `remote-mesh-hostname-${fieldIdBase}`,
  };
  const canDeploy =
    active.mode === "remote_24_7" &&
    (deployment.status === "not_configured" || canLaunchRemote(deployment.status));

  function patch(next: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  function configureArgs() {
    return {
      token,
      agentId: agent.id,
      mode: active.mode,
      domainMode: active.domainMode,
      ...(active.domainMode === "custom"
        ? { customDomain: active.customDomain }
        : {}),
      webVisibility: active.webVisibility,
      apiVisibility: active.apiVisibility,
      a2aEnabled: active.a2aEnabled,
      mcpEnabled: active.mcpEnabled,
      meshMode: active.meshMode,
      ...(active.meshMode === "tailscale" ? { tailnet: active.tailnet } : {}),
      ...(active.meshMode === "headscale"
        ? { headscaleUrl: active.headscaleUrl }
        : {}),
      meshHostname: active.meshHostname,
    };
  }

  async function run(label: string, task: () => Promise<string | null>) {
    if (!token) return;
    setBusy(label);
    setNotice(null);
    try {
      const message = await task();
      setDraft({});
      setNotice(message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-white/5 p-2 text-white/70">
            <Icon.Bot size={16} />
          </span>
          <div>
            <div className="text-sm font-medium text-white">{agent.name}</div>
            <div className="text-xs text-white/40">
              {agent.type} · {agent.model}
              {agent.plugins.length > 0 ? ` · ${agent.plugins.length} plugin(s)` : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center">
          <StatusBadge status={deployment.status} mode={deployment.mode} />
          <Link
            to={`/agents/${agent.id}`}
            className="text-xs text-purple-300 hover:underline"
          >
            Open
          </Link>
        </div>
      </div>

      <details className="mt-4 border-t border-white/10 pt-3">
        <summary className="cursor-pointer text-xs font-medium text-white/55 transition hover:text-white">
          Remote controls
        </summary>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Runtime" htmlFor={fieldIds.runtime}>
            <select
              id={fieldIds.runtime}
              value={active.mode}
              onChange={(e) => patch({ mode: e.target.value as RemoteRuntimeMode })}
              className={field}
            >
              <option value="on_demand">On-demand</option>
              <option value="remote_24_7">24/7 remote</option>
            </select>
          </Field>
          <Field label="Domain" htmlFor={fieldIds.domain}>
            <select
              id={fieldIds.domain}
              value={active.domainMode}
              onChange={(e) =>
                patch({ domainMode: e.target.value as RemoteRuntimeDomainMode })
              }
              className={field}
            >
              <option value="detour">detour.ninja</option>
              <option value="custom">Custom domain</option>
            </select>
          </Field>
          {active.domainMode === "custom" ? (
            <Field label="Custom domain" htmlFor={fieldIds.customDomain}>
              <input
                id={fieldIds.customDomain}
                type="text"
                value={active.customDomain}
                onChange={(e) => patch({ customDomain: e.target.value })}
                placeholder="agent.example.com"
                spellCheck={false}
                className={field}
              />
            </Field>
          ) : (
            <Readout label="Detour domain" value={projectedWebUrl} />
          )}
          <Field label="Web UI" htmlFor={fieldIds.webVisibility}>
            <select
              id={fieldIds.webVisibility}
              value={active.webVisibility}
              onChange={(e) =>
                patch({ webVisibility: e.target.value as RemoteRuntimeAccess })
              }
              className={field}
            >
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          </Field>
          <Field label="Agent API" htmlFor={fieldIds.apiVisibility}>
            <select
              id={fieldIds.apiVisibility}
              value={active.apiVisibility}
              onChange={(e) =>
                patch({ apiVisibility: e.target.value as RemoteRuntimeAccess })
              }
              className={field}
            >
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          </Field>
          <Field label="Private network" htmlFor={fieldIds.meshMode}>
            <select
              id={fieldIds.meshMode}
              value={active.meshMode}
              onChange={(e) =>
                patch({ meshMode: e.target.value as RemoteRuntimeMeshMode })
              }
              className={field}
            >
              <option value="detour_private">Detour private relay</option>
              <option value="tailscale">Tailscale</option>
              <option value="headscale">Headscale</option>
            </select>
          </Field>
          {active.meshMode === "tailscale" ? (
            <Field label="Tailnet" htmlFor={fieldIds.tailnet}>
              <input
                id={fieldIds.tailnet}
                type="text"
                value={active.tailnet}
                onChange={(e) => patch({ tailnet: e.target.value })}
                placeholder="team.tailnet"
                spellCheck={false}
                autoComplete="off"
                className={field}
              />
            </Field>
          ) : null}
          {active.meshMode === "headscale" ? (
            <Field label="Headscale URL" htmlFor={fieldIds.headscaleUrl}>
              <input
                id={fieldIds.headscaleUrl}
                type="url"
                inputMode="url"
                value={active.headscaleUrl}
                onChange={(e) => patch({ headscaleUrl: e.target.value })}
                placeholder="https://mesh.detour.ninja"
                spellCheck={false}
                autoComplete="url"
                className={field}
              />
            </Field>
          ) : null}
          <Field label="Mesh hostname" htmlFor={fieldIds.meshHostname}>
            <input
              id={fieldIds.meshHostname}
              type="text"
              value={active.meshHostname}
              onChange={(e) => patch({ meshHostname: e.target.value })}
              placeholder="detour-agent"
              spellCheck={false}
              autoComplete="off"
              className={field}
            />
          </Field>
          <Toggle
            label="A2A endpoint"
            checked={active.a2aEnabled}
            onChange={(checked) => patch({ a2aEnabled: checked })}
          />
          <Toggle
            label="MCP endpoint"
            checked={active.mcpEnabled}
            onChange={(checked) => patch({ mcpEnabled: checked })}
          />
        </div>

        <div className="mt-4 grid gap-2 border-t border-white/10 pt-4 text-xs sm:grid-cols-2">
          <Readout
            label="Web URL"
            value={deployment.webUiUrl ?? projectedWebUrl}
            meta={`${active.webVisibility} policy`}
          />
          <Readout
            label="Provider"
            value={remoteProviderLabel(deployment.activeProvider)}
            meta={remoteFallbackLabel(deployment.fallbackStatus)}
          />
          <Readout
            label="Network"
            value={remoteMeshLabel(active.meshMode)}
            meta={active.meshHostname}
          />
          <Readout
            label="API base"
            value={apiBaseUrl}
            meta={`${active.apiVisibility} policy`}
          />
          <Readout label="Bridge" value={`${apiBaseUrl}/bridge`} />
          <Readout
            label="A2A"
            value={active.a2aEnabled ? `${apiBaseUrl}/a2a` : "disabled"}
          />
          <Readout
            label="MCP"
            value={active.mcpEnabled ? `${apiBaseUrl}/mcp` : "disabled"}
          />
        </div>

        {deployment.lastError ? (
          <p className="mt-3 rounded-lg border border-red-400/15 bg-red-400/5 px-3 py-2 text-xs text-red-200/90">
            {deployment.lastError}
          </p>
        ) : null}
        {notice ? <p className="mt-3 text-xs text-white/50">{notice}</p> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy !== null}
            onClick={() =>
              run("save", async () => {
                await configureRemote(configureArgs());
                return "Remote policy saved.";
              })
            }
          >
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy !== null || !canDeploy}
            onClick={() =>
              run("deploy", async () => {
                await configureRemote(configureArgs());
                await deployRemote({ token, agentId: agent.id });
                return "Remote deployment started.";
              })
            }
          >
            Deploy 24/7
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy !== null || !deployment.upstreamAgentId}
            onClick={() =>
              run("sync", async () => {
                await syncRemote({ token, agentId: agent.id });
                return "Remote status synced.";
              })
            }
          >
            Sync
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy !== null || !deployment.upstreamAgentId}
            onClick={() =>
              run("open", async () => {
                const result = (await openRemote({
                  token,
                  agentId: agent.id,
                })) as OpenWebUiResult;
                if (result.ready) {
                  window.open(result.url, "_blank", "noopener,noreferrer");
                  return "Web UI opened.";
                }
                return result.message;
              })
            }
          >
            Open Web UI
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy !== null || !deployment.upstreamAgentId}
            onClick={() =>
              run("suspend", async () => {
                await suspendRemote({ token, agentId: agent.id });
                return "Suspend requested.";
              })
            }
          >
            Suspend
          </Button>
        </div>
      </details>
    </div>
  );
}

function StatusBadge({
  status,
  mode,
}: {
  status: RemoteRuntimeStatus;
  mode: RemoteRuntimeMode;
}) {
  const tone: BadgeTone =
    status === "running"
      ? "success"
      : status === "error"
        ? "danger"
        : status === "queued" || status === "provisioning" || status === "creating"
          ? "warning"
          : "neutral";
  return (
    <Badge tone={tone}>
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "running"
            ? "bg-emerald-400"
            : status === "error"
              ? "bg-red-300"
              : status === "queued" ||
                  status === "provisioning" ||
                  status === "creating"
                ? "bg-amber-300"
                : "bg-white/35",
        )}
      />
      {mode === "remote_24_7" ? "24/7" : "on-demand"} · {remoteStatusLabel(status)}
    </Badge>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-[10px] font-medium uppercase tracking-widest text-white/40"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
      <span className="text-xs text-white/70">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-purple-500"
      />
    </label>
  );
}

function Readout({
  label,
  value,
  meta,
}: {
  label: string;
  value: string;
  meta?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-widest text-white/40">
          {label}
        </span>
        {meta ? <span className="text-[10px] text-white/35">{meta}</span> : null}
      </div>
      <div className="mt-1 truncate font-mono text-[11px] text-white/65">{value}</div>
    </div>
  );
}

function Empty() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center">
      <div className="text-sm text-white">No instances yet</div>
      <Link
        to="/agents"
        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:shadow-lg hover:shadow-white/10"
      >
        <Icon.Bot size={14} /> Create an agent
      </Link>
    </div>
  );
}
