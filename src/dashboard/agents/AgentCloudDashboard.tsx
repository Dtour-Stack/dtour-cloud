import { useAction, useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { type ComponentProps, type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { designPath } from "@/dashboard/design/designProject";
import {
  canLaunchRemote,
  type RemoteRuntimeAccess,
  type RemoteRuntimeDomainMode,
  type RemoteRuntimeFallbackStatus,
  type RemoteRuntimeMeshMode,
  type RemoteRuntimeMode,
  type RemoteRuntimeProvider,
  type RemoteRuntimeProviderStrategy,
  type RemoteRuntimeStatus,
  remoteFallbackLabel,
  remoteMeshLabel,
  remoteProviderLabel,
  remoteRuntimeUrl,
  remoteStatusLabel,
} from "@/lib/remoteRuntime";
import { getDtourSessionToken } from "@/lib/session";
import { Badge, Button, cn, Icon, IconButton } from "@/ui";

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

type DesignProjectSummary = {
  name: string;
  updatedAt: number;
  hasStudio: boolean;
  hasSketch: boolean;
  hasWorkflow: boolean;
};

type AgentWorkflowLink = {
  id: string;
  project: string;
  createdAt: number;
};

type ExternalAuthMode = "none" | "bearer" | "api_key" | "custom_header" | "x402";
type ExternalMeshMode =
  | "public_internet"
  | "detour_private"
  | "tailscale"
  | "headscale";
type ExternalConnectionStatus = "configured" | "needs_secret" | "error";

type ExternalConnection = {
  id: string;
  label: string;
  provider: string;
  baseUrl: string;
  apiBaseUrl: string | null;
  a2aUrl: string | null;
  mcpUrl: string | null;
  authMode: ExternalAuthMode;
  authHeaderName: string | null;
  authSecretRef: string | null;
  meshMode: ExternalMeshMode;
  tailnet: string | null;
  headscaleUrl: string | null;
  meshHostname: string | null;
  notes: string | null;
  status: ExternalConnectionStatus;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
};

type ExternalDraft = {
  connectionId: string | null;
  label: string;
  provider: string;
  baseUrl: string;
  apiBaseUrl: string;
  a2aUrl: string;
  mcpUrl: string;
  authMode: ExternalAuthMode;
  authHeaderName: string;
  authSecretRef: string;
  meshMode: ExternalMeshMode;
  tailnet: string;
  headscaleUrl: string;
  meshHostname: string;
  notes: string;
};

type WorkflowDoc = {
  data: string;
  updatedAt: number;
  project: string;
} | null;

type JsonValue = string | number | boolean | null | JsonValue[] | JsonRecord;
type JsonRecord = { [key: string]: JsonValue };

type WorkflowMeta = {
  nodes: number;
  subgraphs: number;
};

type OpenWebUiResult =
  | { ready: true; url: string }
  | { ready: false; message: string; retryAfterMs: number };

type BadgeTone = NonNullable<ComponentProps<typeof Badge>["tone"]>;

const field =
  "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[12px] text-white outline-none transition focus:border-purple-400/50";

const EMPTY_EXTERNAL_DRAFT: ExternalDraft = {
  connectionId: null,
  label: "",
  provider: "External VPS",
  baseUrl: "",
  apiBaseUrl: "",
  a2aUrl: "",
  mcpUrl: "",
  authMode: "none",
  authHeaderName: "",
  authSecretRef: "",
  meshMode: "public_internet",
  tailnet: "",
  headscaleUrl: "",
  meshHostname: "",
  notes: "",
};

function isRecord(value: JsonValue): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function workflowMeta(data: string): WorkflowMeta | null {
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(data) as JsonValue;
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const nodes = parsed.nodes;
  if (!Array.isArray(nodes)) return null;
  let count = 0;
  let subgraphs = 0;
  const visit = (node: JsonValue) => {
    if (!isRecord(node)) return;
    count += 1;
    if (!isRecord(node.subgraph)) return;
    const innerNodes = node.subgraph.nodes;
    if (!Array.isArray(innerNodes)) return;
    subgraphs += 1;
    for (const child of innerNodes) visit(child);
  };
  for (const node of nodes) visit(node);
  return { nodes: count, subgraphs };
}

function formatTime(ms: number | null): string {
  if (!ms) return "never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(ms);
}

function externalMeshLabel(mode: ExternalMeshMode): string {
  switch (mode) {
    case "detour_private":
      return "Detour private relay";
    case "tailscale":
      return "Tailscale";
    case "headscale":
      return "Headscale";
    case "public_internet":
      return "Public internet";
  }
}

function externalAuthLabel(mode: ExternalAuthMode): string {
  switch (mode) {
    case "api_key":
      return "API key";
    case "bearer":
      return "Bearer token";
    case "custom_header":
      return "Custom header";
    case "x402":
      return "x402";
    case "none":
      return "None";
  }
}

function externalStatusTone(status: ExternalConnectionStatus): BadgeTone {
  if (status === "configured") return "success";
  if (status === "error") return "danger";
  return "warning";
}

function externalDraftFromConnection(connection: ExternalConnection): ExternalDraft {
  return {
    connectionId: connection.id,
    label: connection.label,
    provider: connection.provider,
    baseUrl: connection.baseUrl,
    apiBaseUrl: connection.apiBaseUrl ?? "",
    a2aUrl: connection.a2aUrl ?? "",
    mcpUrl: connection.mcpUrl ?? "",
    authMode: connection.authMode,
    authHeaderName: connection.authHeaderName ?? "",
    authSecretRef: connection.authSecretRef ?? "",
    meshMode: connection.meshMode,
    tailnet: connection.tailnet ?? "",
    headscaleUrl: connection.headscaleUrl ?? "",
    meshHostname: connection.meshHostname ?? "",
    notes: connection.notes ?? "",
  };
}

function migrationPrompt({
  agent,
  deployment,
  connections,
  draft,
}: {
  agent: Agent;
  deployment: RemoteDeployment;
  connections: ExternalConnection[];
  draft: ExternalDraft;
}) {
  const configuredConnections = connections.map((connection) => ({
    label: connection.label,
    provider: connection.provider,
    baseUrl: connection.baseUrl,
    apiBaseUrl: connection.apiBaseUrl,
    a2aUrl: connection.a2aUrl,
    mcpUrl: connection.mcpUrl,
    authMode: connection.authMode,
    meshMode: connection.meshMode,
    meshHostname: connection.meshHostname,
    notes: connection.notes,
  }));
  const pendingDraft =
    draft.baseUrl || draft.apiBaseUrl || draft.a2aUrl || draft.mcpUrl
      ? {
          label: draft.label,
          provider: draft.provider,
          baseUrl: draft.baseUrl,
          apiBaseUrl: draft.apiBaseUrl,
          a2aUrl: draft.a2aUrl,
          mcpUrl: draft.mcpUrl,
          authMode: draft.authMode,
          meshMode: draft.meshMode,
          meshHostname: draft.meshHostname,
          notes: draft.notes,
        }
      : null;
  return [
    "Act as the Detour Cloud migration helper.",
    "Help migrate or federate this external agent setup into Detour Cloud without losing API, A2A, MCP, workflow, or mesh access.",
    "",
    `Target Detour agent: ${agent.name} (${agent.id})`,
    `Current Detour runtime: ${deployment.mode} / ${deployment.status}`,
    `Detour web UI: ${deployment.webUiUrl}`,
    `Detour API base: ${deployment.apiBaseUrl}`,
    "",
    "Existing external connections:",
    JSON.stringify(configuredConnections, null, 2),
    "",
    "Pending connector draft:",
    JSON.stringify(pendingDraft, null, 2),
    "",
    "Return a migration checklist with: source inventory, DNS/API cutover, auth/secret mapping, A2A card validation, MCP tool mapping, mesh policy, workflow bindings, test calls, rollback plan, and what can be automated next.",
  ].join("\n");
}

export function AgentCloudDashboard({
  agentId,
  agentName,
  onClose,
  className,
}: {
  agentId: string;
  agentName: string;
  onClose: () => void;
  className?: string;
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const connectIntent = searchParams.get("connect");
  const token = getDtourSessionToken();
  const rows = useQuery(
    anyApi.remoteAgentDeployments.list,
    token ? { token } : "skip",
  ) as InstanceRow[] | undefined;
  const projects = useQuery(
    anyApi.design.listProjects,
    token ? { token } : "skip",
  ) as DesignProjectSummary[] | null | undefined;
  const links = useQuery(
    anyApi.agentWorkflowLinks.list,
    token ? { token, agentId } : "skip",
  ) as AgentWorkflowLink[] | undefined;
  const externalConnections = useQuery(
    anyApi.agentExternalConnections.list,
    token ? { token, agentId } : "skip",
  ) as ExternalConnection[] | undefined;
  const configureRemote = useMutation(anyApi.remoteAgentDeployments.configure);
  const deployRemote = useAction(anyApi.remoteAgentDeployments.deploy);
  const syncRemote = useAction(anyApi.remoteAgentDeployments.sync);
  const openRemote = useAction(anyApi.remoteAgentDeployments.openWebUi);
  const suspendRemote = useAction(anyApi.remoteAgentDeployments.suspend);
  const linkWorkflow = useMutation(anyApi.agentWorkflowLinks.link);
  const unlinkWorkflow = useMutation(anyApi.agentWorkflowLinks.unlink);
  const upsertExternal = useMutation(anyApi.agentExternalConnections.upsert);
  const removeExternal = useMutation(anyApi.agentExternalConnections.remove);
  const createChat = useMutation(anyApi.agents.createChat);
  const chat = useAction(anyApi.agents.chat);
  const [draft, setDraft] = useState<Partial<Draft>>({});
  const [externalDraft, setExternalDraft] = useState<ExternalDraft>(EMPTY_EXTERNAL_DRAFT);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState("");

  const row = rows?.find((item) => item.agent.id === agentId);
  const workflowProjects = useMemo(() => {
    if (!projects) return [];
    return projects.filter((project) => project.hasWorkflow);
  }, [projects]);
  const linkedProjectNames = useMemo(() => {
    const names = new Set<string>();
    if (links) {
      for (const link of links) names.add(link.project);
    }
    return names;
  }, [links]);
  const availableProjects = useMemo(
    () =>
      workflowProjects.filter((project) => !linkedProjectNames.has(project.name)),
    [linkedProjectNames, workflowProjects],
  );
  const primaryWorkflowProject = links && links.length > 0 ? links[0].project : selectedProject;
  const workflowDoc = useQuery(
    anyApi.design.getDoc,
    token && primaryWorkflowProject
      ? { token, kind: "workflow", project: primaryWorkflowProject }
      : "skip",
  ) as WorkflowDoc | undefined;
  const meta = useMemo(
    () => (workflowDoc ? workflowMeta(workflowDoc.data) : null),
    [workflowDoc],
  );

  useEffect(() => {
    if (availableProjects.length === 0) {
      if (selectedProject) setSelectedProject("");
      return;
    }
    if (availableProjects.some((project) => project.name === selectedProject)) return;
    setSelectedProject(availableProjects[0].name);
  }, [availableProjects, selectedProject]);

  useEffect(() => {
    if (connectIntent === "huggingface") {
      setExternalDraft((current) => ({
        ...current,
        provider: current.provider === "External VPS" ? "Hugging Face" : current.provider,
        label: current.label || "huggingface-endpoint",
      }));
      return;
    }
    if (connectIntent === "endpoint") {
      setExternalDraft((current) => ({
        ...current,
        provider:
          current.provider === EMPTY_EXTERNAL_DRAFT.provider
            ? "External endpoint"
            : current.provider,
        label: current.label || "external-agent",
      }));
      return;
    }
    if (connectIntent === "migration") {
      setExternalDraft((current) => ({
        ...current,
        provider:
          current.provider === EMPTY_EXTERNAL_DRAFT.provider
            ? "Existing cloud/app agent"
            : current.provider,
        label: current.label || "migration-source",
      }));
    }
  }, [connectIntent]);

  if (!token) {
    return (
      <RailShell agentName={agentName} onClose={onClose} className={className}>
        <PanelMessage title="Session required" body="Sign in again to manage this agent cloud." />
      </RailShell>
    );
  }

  if (rows === undefined) {
    return (
      <RailShell agentName={agentName} onClose={onClose} className={className}>
        <PanelMessage title="Loading cloud state" body="Fetching runtime policy and endpoints." />
      </RailShell>
    );
  }

  if (!row) {
    return (
      <RailShell agentName={agentName} onClose={onClose} className={className}>
        <PanelMessage
          title="Cloud state unavailable"
          body="The runtime list did not return this agent. Reopen the agent from your agent list."
        />
      </RailShell>
    );
  }

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
  const apiBaseUrl = deployment.apiBaseUrl;
  const fieldIdBase = agent.id.replace(/[^a-z0-9_-]/gi, "-");
  const fieldIds = {
    runtime: `agent-cloud-runtime-${fieldIdBase}`,
    domain: `agent-cloud-domain-${fieldIdBase}`,
    customDomain: `agent-cloud-custom-domain-${fieldIdBase}`,
    webVisibility: `agent-cloud-web-${fieldIdBase}`,
    apiVisibility: `agent-cloud-api-${fieldIdBase}`,
    meshMode: `agent-cloud-mesh-${fieldIdBase}`,
    tailnet: `agent-cloud-tailnet-${fieldIdBase}`,
    headscaleUrl: `agent-cloud-headscale-${fieldIdBase}`,
    meshHostname: `agent-cloud-hostname-${fieldIdBase}`,
    workflowProject: `agent-cloud-workflow-${fieldIdBase}`,
    externalLabel: `agent-cloud-external-label-${fieldIdBase}`,
    externalProvider: `agent-cloud-external-provider-${fieldIdBase}`,
    externalBaseUrl: `agent-cloud-external-base-${fieldIdBase}`,
    externalApiBaseUrl: `agent-cloud-external-api-${fieldIdBase}`,
    externalA2aUrl: `agent-cloud-external-a2a-${fieldIdBase}`,
    externalMcpUrl: `agent-cloud-external-mcp-${fieldIdBase}`,
    externalAuthMode: `agent-cloud-external-auth-${fieldIdBase}`,
    externalAuthHeader: `agent-cloud-external-auth-header-${fieldIdBase}`,
    externalSecretRef: `agent-cloud-external-secret-${fieldIdBase}`,
    externalMeshMode: `agent-cloud-external-mesh-${fieldIdBase}`,
    externalTailnet: `agent-cloud-external-tailnet-${fieldIdBase}`,
    externalHeadscale: `agent-cloud-external-headscale-${fieldIdBase}`,
    externalMeshHostname: `agent-cloud-external-hostname-${fieldIdBase}`,
    externalNotes: `agent-cloud-external-notes-${fieldIdBase}`,
  };
  const canDeploy =
    active.mode === "remote_24_7" &&
    (deployment.status === "not_configured" || canLaunchRemote(deployment.status));

  function patch(next: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  function patchExternal(next: Partial<ExternalDraft>) {
    setExternalDraft((current) => ({ ...current, ...next }));
  }

  function configureArgs(sessionToken: string) {
    return {
      token: sessionToken,
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

  async function run(label: string, task: (sessionToken: string) => Promise<string>) {
    setBusy(label);
    setNotice(null);
    setError(null);
    try {
      const message = await task(token);
      setDraft({});
      setNotice(message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  }

  async function copyValue(label: string, value: string) {
    setBusy(`copy-${label}`);
    setNotice(null);
    setError(null);
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  }

  function externalArgs(sessionToken: string) {
    return {
      token: sessionToken,
      agentId: agent.id,
      ...(externalDraft.connectionId
        ? { connectionId: externalDraft.connectionId }
        : {}),
      label: externalDraft.label,
      provider: externalDraft.provider,
      baseUrl: externalDraft.baseUrl,
      ...(externalDraft.apiBaseUrl ? { apiBaseUrl: externalDraft.apiBaseUrl } : {}),
      ...(externalDraft.a2aUrl ? { a2aUrl: externalDraft.a2aUrl } : {}),
      ...(externalDraft.mcpUrl ? { mcpUrl: externalDraft.mcpUrl } : {}),
      authMode: externalDraft.authMode,
      ...(externalDraft.authHeaderName
        ? { authHeaderName: externalDraft.authHeaderName }
        : {}),
      ...(externalDraft.authSecretRef
        ? { authSecretRef: externalDraft.authSecretRef }
        : {}),
      meshMode: externalDraft.meshMode,
      ...(externalDraft.tailnet ? { tailnet: externalDraft.tailnet } : {}),
      ...(externalDraft.headscaleUrl
        ? { headscaleUrl: externalDraft.headscaleUrl }
        : {}),
      ...(externalDraft.meshHostname
        ? { meshHostname: externalDraft.meshHostname }
        : {}),
      ...(externalDraft.notes ? { notes: externalDraft.notes } : {}),
    };
  }

  return (
    <RailShell agentName={agent.name} onClose={onClose} className={className}>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <section className="border-b border-white/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-medium uppercase tracking-widest text-white/35">
                Runtime
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <StatusBadge status={deployment.status} mode={deployment.mode} />
                <Badge tone="neutral">
                  {remoteProviderLabel(deployment.activeProvider)}
                </Badge>
              </div>
            </div>
            <Link to="/instances" className="text-[12px] text-purple-300 hover:underline">
              All instances
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Readout label="Provider" value={remoteProviderLabel(deployment.activeProvider)} />
            <Readout label="Fallback" value={remoteFallbackLabel(deployment.fallbackStatus)} />
            <Readout label="Synced" value={formatTime(deployment.lastSyncedAt)} />
            <Readout label="Heartbeat" value={formatTime(deployment.lastHeartbeatAt)} />
          </div>
          {deployment.lastError ? (
            <div className="mt-3 rounded-lg border border-red-300/20 bg-red-400/5 px-3 py-2 text-[12px] leading-relaxed text-red-100/85">
              {deployment.lastError}
            </div>
          ) : null}
        </section>

        <section className="border-b border-white/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <SectionTitle title="Access" subtitle="Web, bridge, A2A, and MCP entry points." />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy !== null || !deployment.upstreamAgentId}
              onClick={() =>
                void run("open", async (sessionToken) => {
                  const result = (await openRemote({
                    token: sessionToken,
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
              Open UI
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            <EndpointReadout
              label="Web UI"
              value={projectedWebUrl}
              meta={`${active.webVisibility} web`}
              onCopy={() => void copyValue("Web UI", projectedWebUrl)}
            />
            <EndpointReadout
              label="API base"
              value={apiBaseUrl}
              meta={`${active.apiVisibility} API`}
              onCopy={() => void copyValue("API base", apiBaseUrl)}
            />
            <EndpointReadout
              label="Bridge"
              value={`${apiBaseUrl}/bridge`}
              onCopy={() => void copyValue("Bridge URL", `${apiBaseUrl}/bridge`)}
            />
            <EndpointReadout
              label="A2A"
              value={active.a2aEnabled ? `${apiBaseUrl}/a2a` : "disabled"}
              meta={active.a2aEnabled ? "enabled" : "off"}
              disabled={!active.a2aEnabled}
              onCopy={() => void copyValue("A2A URL", `${apiBaseUrl}/a2a`)}
            />
            <EndpointReadout
              label="MCP"
              value={active.mcpEnabled ? `${apiBaseUrl}/mcp` : "disabled"}
              meta={active.mcpEnabled ? "enabled" : "off"}
              disabled={!active.mcpEnabled}
              onCopy={() => void copyValue("MCP URL", `${apiBaseUrl}/mcp`)}
            />
          </div>
        </section>

        <section className="border-b border-white/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <SectionTitle
              title="External A2A mesh"
              subtitle="Bring VPS or third-party agents into this agent's API/workflow surface."
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                void run("migration-helper", async (sessionToken) => {
                  const { chatId } = (await createChat({
                    token: sessionToken,
                    agentId: agent.id,
                  })) as { chatId: string };
                  await chat({
                    token: sessionToken,
                    agentId: agent.id,
                    chatId,
                    message: migrationPrompt({
                      agent,
                      deployment,
                      connections: externalConnections ?? [],
                      draft: externalDraft,
                    }),
                  });
                  navigate(`/agents/${agent.id}?chat=${chatId}`);
                  return "Migration helper started.";
                })
              }
            >
              Migration helper
            </Button>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Field label="Connection label" htmlFor={fieldIds.externalLabel}>
              <input
                id={fieldIds.externalLabel}
                type="text"
                value={externalDraft.label}
                onChange={(event) => patchExternal({ label: event.target.value })}
                placeholder="prod-vps-agent"
                autoComplete="off"
                className={field}
              />
            </Field>
            <Field label="Provider" htmlFor={fieldIds.externalProvider}>
              <input
                id={fieldIds.externalProvider}
                type="text"
                value={externalDraft.provider}
                onChange={(event) => patchExternal({ provider: event.target.value })}
                placeholder="Railway, Fly, Hetzner, Render..."
                autoComplete="off"
                className={field}
              />
            </Field>
            <Field label="Base URL" htmlFor={fieldIds.externalBaseUrl}>
              <input
                id={fieldIds.externalBaseUrl}
                type="url"
                inputMode="url"
                value={externalDraft.baseUrl}
                onChange={(event) => patchExternal({ baseUrl: event.target.value })}
                placeholder="https://agent.example.com"
                spellCheck={false}
                autoComplete="url"
                className={field}
              />
            </Field>
            <Field label="API base URL" htmlFor={fieldIds.externalApiBaseUrl}>
              <input
                id={fieldIds.externalApiBaseUrl}
                type="url"
                inputMode="url"
                value={externalDraft.apiBaseUrl}
                onChange={(event) => patchExternal({ apiBaseUrl: event.target.value })}
                placeholder="https://agent.example.com/api"
                spellCheck={false}
                autoComplete="url"
                className={field}
              />
            </Field>
            <Field label="A2A URL" htmlFor={fieldIds.externalA2aUrl}>
              <input
                id={fieldIds.externalA2aUrl}
                type="url"
                inputMode="url"
                value={externalDraft.a2aUrl}
                onChange={(event) => patchExternal({ a2aUrl: event.target.value })}
                placeholder="https://agent.example.com/.well-known/agent-card.json"
                spellCheck={false}
                autoComplete="url"
                className={field}
              />
            </Field>
            <Field label="MCP URL" htmlFor={fieldIds.externalMcpUrl}>
              <input
                id={fieldIds.externalMcpUrl}
                type="url"
                inputMode="url"
                value={externalDraft.mcpUrl}
                onChange={(event) => patchExternal({ mcpUrl: event.target.value })}
                placeholder="https://agent.example.com/mcp"
                spellCheck={false}
                autoComplete="url"
                className={field}
              />
            </Field>
            <Field label="Auth mode" htmlFor={fieldIds.externalAuthMode}>
              <select
                id={fieldIds.externalAuthMode}
                value={externalDraft.authMode}
                onChange={(event) =>
                  patchExternal({ authMode: event.target.value as ExternalAuthMode })
                }
                className={field}
              >
                <option value="none">None</option>
                <option value="bearer">Bearer token</option>
                <option value="api_key">API key</option>
                <option value="custom_header">Custom header</option>
                <option value="x402">x402</option>
              </select>
            </Field>
            {externalDraft.authMode === "custom_header" ? (
              <Field label="Auth header" htmlFor={fieldIds.externalAuthHeader}>
                <input
                  id={fieldIds.externalAuthHeader}
                  type="text"
                  value={externalDraft.authHeaderName}
                  onChange={(event) =>
                    patchExternal({ authHeaderName: event.target.value })
                  }
                  placeholder="X-API-Key"
                  spellCheck={false}
                  autoComplete="off"
                  className={field}
                />
              </Field>
            ) : null}
            {externalDraft.authMode !== "none" ? (
              <Field label="Secret ref" htmlFor={fieldIds.externalSecretRef}>
                <input
                  id={fieldIds.externalSecretRef}
                  type="text"
                  value={externalDraft.authSecretRef}
                  onChange={(event) =>
                    patchExternal({ authSecretRef: event.target.value })
                  }
                  placeholder="vault://prod-vps-agent-token"
                  spellCheck={false}
                  autoComplete="off"
                  className={field}
                />
              </Field>
            ) : null}
            <Field label="Mesh route" htmlFor={fieldIds.externalMeshMode}>
              <select
                id={fieldIds.externalMeshMode}
                value={externalDraft.meshMode}
                onChange={(event) =>
                  patchExternal({ meshMode: event.target.value as ExternalMeshMode })
                }
                className={field}
              >
                <option value="public_internet">Public internet</option>
                <option value="detour_private">Detour private relay</option>
                <option value="tailscale">Tailscale</option>
                <option value="headscale">Headscale</option>
              </select>
            </Field>
            {externalDraft.meshMode === "tailscale" ? (
              <Field label="Tailnet" htmlFor={fieldIds.externalTailnet}>
                <input
                  id={fieldIds.externalTailnet}
                  type="text"
                  value={externalDraft.tailnet}
                  onChange={(event) => patchExternal({ tailnet: event.target.value })}
                  placeholder="team.tailnet"
                  spellCheck={false}
                  autoComplete="off"
                  className={field}
                />
              </Field>
            ) : null}
            {externalDraft.meshMode === "headscale" ? (
              <Field label="Headscale URL" htmlFor={fieldIds.externalHeadscale}>
                <input
                  id={fieldIds.externalHeadscale}
                  type="url"
                  inputMode="url"
                  value={externalDraft.headscaleUrl}
                  onChange={(event) =>
                    patchExternal({ headscaleUrl: event.target.value })
                  }
                  placeholder="https://headscale.example.com"
                  spellCheck={false}
                  autoComplete="url"
                  className={field}
                />
              </Field>
            ) : null}
            <Field label="Mesh hostname" htmlFor={fieldIds.externalMeshHostname}>
              <input
                id={fieldIds.externalMeshHostname}
                type="text"
                value={externalDraft.meshHostname}
                onChange={(event) =>
                  patchExternal({ meshHostname: event.target.value })
                }
                placeholder="external-agent-prod"
                spellCheck={false}
                autoComplete="off"
                className={field}
              />
            </Field>
          </div>
          <Field label="Migration notes" htmlFor={fieldIds.externalNotes}>
            <textarea
              id={fieldIds.externalNotes}
              value={externalDraft.notes}
              onChange={(event) => patchExternal({ notes: event.target.value })}
              placeholder="Runtime, env vars, exposed tools, webhooks, cron jobs, volumes, known cutover constraints."
              rows={3}
              className={`${field} mt-1.5 resize-none`}
            />
          </Field>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                void run("save-external", async (sessionToken) => {
                  await upsertExternal(externalArgs(sessionToken));
                  setExternalDraft(EMPTY_EXTERNAL_DRAFT);
                  return "External agent connection saved.";
                })
              }
            >
              {externalDraft.connectionId ? "Update connector" : "Save connector"}
            </Button>
            {externalDraft.connectionId ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy !== null}
                onClick={() => setExternalDraft(EMPTY_EXTERNAL_DRAFT)}
              >
                New connector
              </Button>
            ) : null}
          </div>

          <div className="mt-3 space-y-2">
            {externalConnections === undefined ? (
              <p className="text-[12px] text-white/40">Loading external connectors…</p>
            ) : externalConnections.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-3 text-[12px] leading-relaxed text-white/45">
                No external agents connected yet. Add a VPS, hosted provider, or app agent URL to route it into Detour workflows.
              </div>
            ) : (
              externalConnections.map((connection) => (
                <div
                  key={connection.id}
                  className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[12px] font-medium text-white/80">
                          {connection.label}
                        </span>
                        <Badge tone={externalStatusTone(connection.status)}>
                          {connection.status === "needs_secret"
                            ? "needs secret"
                            : connection.status}
                        </Badge>
                      </div>
                      <div className="mt-1 text-[10px] text-white/35">
                        {connection.provider} · {externalMeshLabel(connection.meshMode)} · {externalAuthLabel(connection.authMode)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <IconButton
                        label={`Edit ${connection.label}`}
                        disabled={busy !== null}
                        onClick={() => setExternalDraft(externalDraftFromConnection(connection))}
                      >
                        <Icon.Settings size={14} />
                      </IconButton>
                      <IconButton
                        label={`Remove ${connection.label}`}
                        disabled={busy !== null}
                        onClick={() =>
                          void run("remove-external", async (sessionToken) => {
                            await removeExternal({
                              token: sessionToken,
                              connectionId: connection.id,
                            });
                            if (externalDraft.connectionId === connection.id) {
                              setExternalDraft(EMPTY_EXTERNAL_DRAFT);
                            }
                            return "External connector removed.";
                          })
                        }
                      >
                        <Icon.X size={14} />
                      </IconButton>
                    </div>
                  </div>
                  <div className="mt-2 grid gap-2">
                    <EndpointReadout
                      label="Base"
                      value={connection.baseUrl}
                      onCopy={() => void copyValue("External base URL", connection.baseUrl)}
                    />
                    {connection.apiBaseUrl ? (
                      <EndpointReadout
                        label="API"
                        value={connection.apiBaseUrl}
                        onCopy={() =>
                          void copyValue("External API URL", connection.apiBaseUrl ?? "")
                        }
                      />
                    ) : null}
                    {connection.a2aUrl ? (
                      <EndpointReadout
                        label="A2A"
                        value={connection.a2aUrl}
                        onCopy={() =>
                          void copyValue("External A2A URL", connection.a2aUrl ?? "")
                        }
                      />
                    ) : null}
                    {connection.mcpUrl ? (
                      <EndpointReadout
                        label="MCP"
                        value={connection.mcpUrl}
                        onCopy={() =>
                          void copyValue("External MCP URL", connection.mcpUrl ?? "")
                        }
                      />
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="border-b border-white/10 p-4">
          <SectionTitle title="Runtime policy" subtitle="Deploy mode, domain, network, and endpoint privacy." />
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Field label="Runtime" htmlFor={fieldIds.runtime}>
              <select
                id={fieldIds.runtime}
                value={active.mode}
                onChange={(event) =>
                  patch({ mode: event.target.value as RemoteRuntimeMode })
                }
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
                onChange={(event) =>
                  patch({ domainMode: event.target.value as RemoteRuntimeDomainMode })
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
                  onChange={(event) => patch({ customDomain: event.target.value })}
                  placeholder="agent.example.com"
                  spellCheck={false}
                  autoComplete="off"
                  className={field}
                />
              </Field>
            ) : null}
            <Field label="Web UI" htmlFor={fieldIds.webVisibility}>
              <select
                id={fieldIds.webVisibility}
                value={active.webVisibility}
                onChange={(event) =>
                  patch({ webVisibility: event.target.value as RemoteRuntimeAccess })
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
                onChange={(event) =>
                  patch({ apiVisibility: event.target.value as RemoteRuntimeAccess })
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
                onChange={(event) =>
                  patch({ meshMode: event.target.value as RemoteRuntimeMeshMode })
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
                  onChange={(event) => patch({ tailnet: event.target.value })}
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
                  onChange={(event) => patch({ headscaleUrl: event.target.value })}
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
                onChange={(event) => patch({ meshHostname: event.target.value })}
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
          <Readout
            label="Network"
            value={remoteMeshLabel(active.meshMode)}
            meta={active.meshHostname}
            className="mt-3"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                void run("save", async (sessionToken) => {
                  await configureRemote(configureArgs(sessionToken));
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
                void run("deploy", async (sessionToken) => {
                  await configureRemote(configureArgs(sessionToken));
                  await deployRemote({ token: sessionToken, agentId: agent.id });
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
                void run("sync", async (sessionToken) => {
                  await syncRemote({ token: sessionToken, agentId: agent.id });
                  return "Remote status synced.";
                })
              }
            >
              Sync
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy !== null || !deployment.upstreamAgentId}
              onClick={() =>
                void run("suspend", async (sessionToken) => {
                  await suspendRemote({ token: sessionToken, agentId: agent.id });
                  return "Suspend requested.";
                })
              }
            >
              Suspend
            </Button>
          </div>
        </section>

        <section className="p-4">
          <SectionTitle
            title="Workflows and subgraphs"
            subtitle="Attach saved workflow projects to this agent runtime."
          />
          <div className="mt-3 grid gap-2">
            <Field label="Workflow project" htmlFor={fieldIds.workflowProject}>
              <select
                id={fieldIds.workflowProject}
                value={selectedProject}
                onChange={(event) => setSelectedProject(event.target.value)}
                className={field}
                disabled={availableProjects.length === 0}
              >
                {availableProjects.length === 0 ? (
                  <option value="">No unattached workflow projects</option>
                ) : (
                  availableProjects.map((project) => (
                    <option key={project.name} value={project.name}>
                      {project.name}
                    </option>
                  ))
                )}
              </select>
            </Field>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy !== null || !selectedProject}
              onClick={() =>
                void run("attach-workflow", async (sessionToken) => {
                  await linkWorkflow({ token: sessionToken, agentId, project: selectedProject });
                  return "Workflow attached.";
                })
              }
            >
              Attach workflow
            </Button>
          </div>
          {meta ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Readout label="Workflow nodes" value={meta.nodes.toLocaleString()} />
              <Readout label="Subgraphs" value={meta.subgraphs.toLocaleString()} />
            </div>
          ) : null}
          <div className="mt-3 space-y-2">
            {links === undefined ? (
              <p className="text-[12px] text-white/40">Loading workflow links…</p>
            ) : links.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-3 text-[12px] text-white/45">
                No workflows attached yet. Create a workflow graph, add subgraphs, then bind it here.
              </div>
            ) : (
              links.map((link) => (
                <div
                  key={link.id}
                  className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-medium text-white/80">
                      {link.project}
                    </div>
                    <div className="text-[10px] text-white/35">
                      attached {formatTime(link.createdAt)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Link
                      to={designPath("workflows", link.project)}
                      className="rounded-md p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
                      aria-label={`Open ${link.project} workflow`}
                    >
                      <Icon.ArrowUpRight size={14} />
                    </Link>
                    <IconButton
                      label={`Detach ${link.project}`}
                      disabled={busy !== null}
                      onClick={() =>
                        void run("unlink-workflow", async (sessionToken) => {
                          await unlinkWorkflow({ token: sessionToken, linkId: link.id });
                          return "Workflow detached.";
                        })
                      }
                    >
                      <Icon.X size={14} />
                    </IconButton>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {(notice || error) && (
        <div className="border-t border-white/10 px-4 py-3">
          {notice ? <p className="text-[12px] text-white/50">{notice}</p> : null}
          {error ? <p className="text-[12px] text-red-200/90">{error}</p> : null}
        </div>
      )}
    </RailShell>
  );
}

function RailShell({
  agentName,
  onClose,
  className,
  children,
}: {
  agentName: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <aside
      className={cn(
        "flex h-full min-h-0 flex-col border-l border-white/10 bg-[#0d0d0d] text-white",
        className,
      )}
    >
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Icon.LayoutGrid size={15} />
            Agent cloud
          </div>
          <div className="truncate text-[11px] text-white/40">{agentName}</div>
        </div>
        <IconButton label="Close cloud panel" onClick={onClose}>
          <Icon.X size={16} />
        </IconButton>
      </header>
      {children}
    </aside>
  );
}

function PanelMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="p-4">
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="text-sm font-semibold text-white">{title}</div>
        <p className="mt-1 text-[12px] leading-relaxed text-white/45">{body}</p>
      </div>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-white/45">{subtitle}</p>
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
        onChange={(event) => onChange(event.target.checked)}
        className="accent-purple-500"
      />
    </label>
  );
}

function Readout({
  label,
  value,
  meta,
  className,
}: {
  label: string;
  value: string;
  meta?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-widest text-white/40">
          {label}
        </span>
        {meta ? <span className="truncate text-[10px] text-white/35">{meta}</span> : null}
      </div>
      <div className="mt-1 truncate font-mono text-[11px] text-white/65">{value}</div>
    </div>
  );
}

function EndpointReadout({
  label,
  value,
  meta,
  disabled,
  onCopy,
}: {
  label: string;
  value: string;
  meta?: string;
  disabled?: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-widest text-white/40">
              {label}
            </span>
            {meta ? <span className="text-[10px] text-white/35">{meta}</span> : null}
          </div>
          <div className="mt-1 break-all font-mono text-[11px] leading-relaxed text-white/65">
            {value}
          </div>
        </div>
        <IconButton label={`Copy ${label}`} disabled={disabled} onClick={onCopy}>
          <Icon.Copy size={14} />
        </IconButton>
      </div>
    </div>
  );
}
