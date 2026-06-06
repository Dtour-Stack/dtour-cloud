import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { DESIGN_SURFACE, projectFromSearchParam } from "@/dashboard/design/designProject";
import {
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
import { Badge, Button, buttonClasses, cn, Icon } from "@/ui";

type AgentOption = { id: string; name: string; model: string; type: string; plugins?: string[] };
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
type ExternalConnectionSummary = {
  id: string;
  agentId: string;
  label: string;
  provider: string;
  baseUrl: string;
  apiBaseUrl: string | null;
  a2aUrl: string | null;
  mcpUrl: string | null;
  authMode: string;
  meshMode: string;
  meshHostname: string | null;
  status: string;
};
type NodeStatus = "ready" | "needs_config" | "planned" | "live";
type NodeType =
  | "agent"
  | "container"
  | "volume"
  | "firewall"
  | "api"
  | "domain"
  | "mcp"
  | "a2a"
  | "network"
  | "mobile"
  | "plugin"
  | "secret"
  | "observability"
  | "desktop";

type CloudNode = {
  id: string;
  type: NodeType;
  title: string;
  subtitle: string;
  x: number;
  y: number;
  status: NodeStatus;
  values: Record<string, string>;
};

type CloudEdge = { id: string; from: string; to: string };
type CloudGraph = { nodes: CloudNode[]; edges: CloudEdge[] };

type Issue = { nodeId: string; severity: "error" | "warning"; message: string };

const NODE_W = 168;
const NODE_H = 74;

const NODE_META: Record<
  NodeType,
  { label: string; icon: keyof typeof Icon; tone: "success" | "warning" | "accent" | "neutral" }
> = {
  agent: { label: "Agent", icon: "Bot", tone: "accent" },
  container: { label: "Container", icon: "LayoutGrid", tone: "success" },
  volume: { label: "Volume", icon: "BookOpen", tone: "neutral" },
  firewall: { label: "Firewall", icon: "Shield", tone: "warning" },
  api: { label: "API", icon: "Plug", tone: "accent" },
  domain: { label: "Domain", icon: "Globe", tone: "neutral" },
  mcp: { label: "MCP", icon: "Zap", tone: "accent" },
  a2a: { label: "A2A", icon: "Activity", tone: "accent" },
  network: { label: "Network", icon: "Globe", tone: "success" },
  mobile: { label: "Mobile", icon: "Square", tone: "warning" },
  plugin: { label: "Plugin", icon: "Sparkles", tone: "neutral" },
  secret: { label: "Secrets", icon: "Shield", tone: "warning" },
  observability: { label: "Observability", icon: "Activity", tone: "success" },
  desktop: { label: "Desktop", icon: "Frame", tone: "warning" },
};

const DEFAULT_GRAPH: CloudGraph = {
  nodes: [
    {
      id: "agent",
      type: "agent",
      title: "Agent runtime",
      subtitle: "ElizaCloud primary",
      x: 36,
      y: 150,
      status: "needs_config",
      values: { agentId: "", provider: "elizacloud_primary" },
    },
    {
      id: "container",
      type: "container",
      title: "24/7 container",
      subtitle: "managed runtime",
      x: 252,
      y: 150,
      status: "planned",
      values: { image: "elizacloud/runtime", size: "shared-cpu-1x", fallback: "detour-standby" },
    },
    {
      id: "volume",
      type: "volume",
      title: "Memory volume",
      subtitle: "agent state",
      x: 252,
      y: 270,
      status: "ready",
      values: { sizeGb: "10", persistence: "standard" },
    },
    {
      id: "secret",
      type: "secret",
      title: "Secrets vault",
      subtitle: "plugin credentials",
      x: 252,
      y: 30,
      status: "planned",
      values: { provider: "detour", bindings: "" },
    },
    {
      id: "network",
      type: "network",
      title: "Mesh network",
      subtitle: "Tailscale / Headscale",
      x: 468,
      y: 30,
      status: "ready",
      values: {
        mode: "tailscale",
        tailnet: "",
        headscaleUrl: "",
        hostname: "detour-agent",
        access: "private-mesh",
      },
    },
    {
      id: "firewall",
      type: "firewall",
      title: "Firewall",
      subtitle: "private by default",
      x: 468,
      y: 150,
      status: "ready",
      values: { inbound: "api-only", egress: "provider-allowlist" },
    },
    {
      id: "api",
      type: "api",
      title: "API gateway",
      subtitle: "Bridge · A2A · MCP",
      x: 684,
      y: 150,
      status: "ready",
      values: { apiVisibility: "private", webVisibility: "private", rateLimit: "standard" },
    },
    {
      id: "domain",
      type: "domain",
      title: "detour.ninja domain",
      subtitle: "default route",
      x: 900,
      y: 150,
      status: "ready",
      values: { mode: "detour", customDomain: "" },
    },
    {
      id: "mcp",
      type: "mcp",
      title: "MCP tools",
      subtitle: "tool catalog",
      x: 684,
      y: 270,
      status: "planned",
      values: { enabled: "true", auth: "owner" },
    },
    {
      id: "a2a",
      type: "a2a",
      title: "A2A card",
      subtitle: "agent discovery",
      x: 900,
      y: 270,
      status: "planned",
      values: { enabled: "true", discovery: "private" },
    },
    {
      id: "observability",
      type: "observability",
      title: "Health monitor",
      subtitle: "logs · traces · alerts",
      x: 684,
      y: 30,
      status: "ready",
      values: { logs: "true", traces: "true", alerts: "false", alertWebhook: "" },
    },
    {
      id: "mobile",
      type: "mobile",
      title: "Mobile build",
      subtitle: "QR + deep link",
      x: 36,
      y: 30,
      status: "planned",
      values: { platforms: "ios+android", pairing: "qr-deeplink", access: "owner-approved" },
    },
    {
      id: "desktop",
      type: "desktop",
      title: "Desktop bridge",
      subtitle: "QR pairing",
      x: 36,
      y: 270,
      status: "ready",
      values: { pairing: "coding-setup", access: "owner-approved" },
    },
  ],
  edges: [
    { id: "e1", from: "agent", to: "container" },
    { id: "e2", from: "container", to: "api" },
    { id: "e3", from: "network", to: "firewall" },
    { id: "e4", from: "firewall", to: "api" },
    { id: "e5", from: "api", to: "domain" },
    { id: "e6", from: "container", to: "volume" },
    { id: "e7", from: "api", to: "mcp" },
    { id: "e8", from: "api", to: "a2a" },
    { id: "e9", from: "desktop", to: "agent" },
    { id: "e10", from: "mobile", to: "network" },
    { id: "e11", from: "secret", to: "agent" },
    { id: "e12", from: "container", to: "observability" },
  ],
};

const PALETTE: Array<{ type: NodeType; title: string; subtitle: string; values: Record<string, string> }> = [
  { type: "plugin", title: "Plugin", subtitle: "capability", values: { plugin: "plugin-mcp", requiresSecret: "false" } },
  { type: "volume", title: "Volume", subtitle: "persistent state", values: { sizeGb: "5", persistence: "standard" } },
  { type: "firewall", title: "Firewall", subtitle: "network policy", values: { inbound: "", egress: "provider-allowlist" } },
  { type: "network", title: "Mesh network", subtitle: "private overlay", values: { mode: "headscale", tailnet: "", headscaleUrl: "", hostname: "detour-agent", access: "private-mesh" } },
  { type: "domain", title: "Custom domain", subtitle: "DNS route", values: { mode: "custom", customDomain: "" } },
  { type: "mobile", title: "Mobile build", subtitle: "QR + deep link", values: { platforms: "ios+android", pairing: "qr-deeplink", access: "owner-approved" } },
  { type: "secret", title: "Secrets vault", subtitle: "plugin credentials", values: { provider: "detour", bindings: "" } },
  { type: "observability", title: "Health monitor", subtitle: "logs · traces · alerts", values: { logs: "true", traces: "true", alerts: "false", alertWebhook: "" } },
];

function cloneGraph(graph: CloudGraph): CloudGraph {
  return {
    nodes: graph.nodes.map((node) => ({ ...node, values: { ...node.values } })),
    edges: graph.edges.map((edge) => ({ ...edge })),
  };
}

function parseGraph(data?: string): CloudGraph {
  if (!data) return cloneGraph(DEFAULT_GRAPH);
  try {
    const parsed = JSON.parse(data) as CloudGraph;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      return cloneGraph(DEFAULT_GRAPH);
    }
    if (parsed.nodes.length === 0) return cloneGraph(DEFAULT_GRAPH);
    return {
      nodes: parsed.nodes.filter(isCloudNode),
      edges: parsed.edges.filter(isCloudEdge),
    };
  } catch {
    return cloneGraph(DEFAULT_GRAPH);
  }
}

function isCloudNode(value: unknown): value is CloudNode {
  const record = value as Partial<CloudNode> | null;
  return Boolean(
    record &&
      typeof record.id === "string" &&
      typeof record.type === "string" &&
      typeof record.title === "string" &&
      typeof record.x === "number" &&
      typeof record.y === "number" &&
      record.values &&
      typeof record.values === "object",
  );
}

function isCloudEdge(value: unknown): value is CloudEdge {
  const record = value as Partial<CloudEdge> | null;
  return Boolean(
    record &&
      typeof record.id === "string" &&
      typeof record.from === "string" &&
      typeof record.to === "string",
  );
}

function statusLabel(status: NodeStatus): string {
  switch (status) {
    case "live":
      return "live";
    case "ready":
      return "ready";
    case "needs_config":
      return "needs config";
    case "planned":
      return "planned";
  }
}

function validateGraph(
  graph: CloudGraph,
  agents: AgentOption[],
  externalConnections: ExternalConnectionSummary[],
): Issue[] {
  const issues: Issue[] = [];
  const hasAgent = agents.length > 0;
  const apiNode = graph.nodes.find((node) => node.type === "api");
  const firewallNode = graph.nodes.find((node) => node.type === "firewall");
  const mcpNode = graph.nodes.find((node) => node.type === "mcp");
  const publicApi = apiNode?.values.apiVisibility === "public" || apiNode?.values.visibility === "public";
  const privateFirewall = firewallNode?.values.inbound === "private";
  const mcpEnabled = mcpNode?.values.enabled !== "false";

  for (const node of graph.nodes) {
    if (node.type === "agent" && !node.values.agentId) {
      if (hasAgent) {
        issues.push({
          nodeId: node.id,
          severity: "warning",
          message: "Attach one of your agents so this topology can produce a concrete runtime policy.",
        });
      } else {
        issues.push({
          nodeId: node.id,
          severity: "error",
          message: "Create an agent or attach an existing agent before provisioning.",
        });
      }
    }
    if (node.type === "firewall" && !node.values.inbound) {
      issues.push({
        nodeId: node.id,
        severity: "error",
        message: "Choose an inbound policy before this topology can deploy.",
      });
    }
    if (node.type === "firewall" && publicApi && privateFirewall) {
      issues.push({
        nodeId: node.id,
        severity: "error",
        message: "The API gateway is public, but the firewall only allows private traffic.",
      });
    }
    if (node.type === "api" && publicApi && mcpEnabled) {
      issues.push({
        nodeId: node.id,
        severity: "warning",
        message: "Public API access with MCP enabled should use scoped keys before launch.",
      });
    }
    if ((node.type === "mcp" || node.type === "a2a") && node.values.externalConnectionId) {
      const connection = externalConnections.find(
        (item) => item.id === node.values.externalConnectionId,
      );
      if (!connection) {
        issues.push({
          nodeId: node.id,
          severity: "error",
          message: "Choose a saved external connector or clear this endpoint binding.",
        });
      } else if (node.type === "mcp" && !connection.mcpUrl) {
        issues.push({
          nodeId: node.id,
          severity: "warning",
          message: "This external connector does not expose an MCP URL yet.",
        });
      } else if (node.type === "a2a" && !connection.a2aUrl) {
        issues.push({
          nodeId: node.id,
          severity: "warning",
          message: "This external connector does not expose an A2A URL yet.",
        });
      }
    }
    if (node.type === "domain" && node.values.mode === "custom" && !node.values.customDomain) {
      issues.push({
        nodeId: node.id,
        severity: "warning",
        message: "Enter a custom domain or switch this node back to detour.ninja.",
      });
    }
    if (node.type === "network" && node.values.mode === "tailscale" && !node.values.tailnet) {
      issues.push({
        nodeId: node.id,
        severity: "warning",
        message: "Add a tailnet name before issuing Tailscale auth keys.",
      });
    }
    if (node.type === "network" && node.values.mode === "headscale" && !node.values.headscaleUrl) {
      issues.push({
        nodeId: node.id,
        severity: "warning",
        message: "Add the Headscale control-plane URL before provisioning Detour-owned mesh access.",
      });
    }
    if (node.type === "plugin" && node.values.requiresSecret === "true" && !node.values.secretName) {
      issues.push({
        nodeId: node.id,
        severity: "warning",
        message: "This plugin needs a secret binding before it can run unattended.",
      });
    }
    if (node.type === "secret" && node.values.provider === "external" && !node.values.bindings) {
      issues.push({
        nodeId: node.id,
        severity: "warning",
        message: "List the required secret bindings before using an external vault.",
      });
    }
    if (node.type === "observability" && node.values.alerts === "true" && !node.values.alertWebhook) {
      issues.push({
        nodeId: node.id,
        severity: "warning",
        message: "Add an alert webhook or disable alerts for this health monitor.",
      });
    }
  }
  return issues;
}

function nodeIssues(issues: Issue[], nodeId: string): Issue[] {
  return issues.filter((issue) => issue.nodeId === nodeId);
}

function center(node: CloudNode) {
  return { x: node.x + NODE_W / 2, y: node.y + NODE_H / 2 };
}

function iconFor(type: NodeType) {
  const name = NODE_META[type].icon;
  return Icon[name] ?? Icon.LayoutGrid;
}

export function CloudBuilderPanel({
  token,
  agents,
  deployments = [],
  externalConnections = [],
}: {
  token: string | null;
  agents: AgentOption[];
  deployments?: DeploymentSummary[];
  externalConnections?: ExternalConnectionSummary[];
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const project = projectFromSearchParam(searchParams.get("project"));
  const saved = useQuery(
    anyApi.design.getDoc,
    token ? { token, kind: DESIGN_SURFACE.infra, project } : "skip",
  ) as { data: string; updatedAt: number } | null | undefined;
  const projectRows = useQuery(
    anyApi.design.listProjects,
    token ? { token } : "skip",
  ) as { name: string; hasInfra: boolean }[] | null | undefined;
  const saveDoc = useMutation(anyApi.design.saveDoc);
  const hydrated = useRef(false);
  const [graph, setGraph] = useState<CloudGraph>(() => cloneGraph(DEFAULT_GRAPH));
  const [selectedId, setSelectedId] = useState("agent");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    void project;
    hydrated.current = false;
    setGraph(cloneGraph(DEFAULT_GRAPH));
    setSelectedId("agent");
    setSaveState("idle");
    setSaveError(null);
  }, [project]);

  useEffect(() => {
    if (saved === undefined || hydrated.current) return;
    hydrated.current = true;
    setGraph(parseGraph(saved?.data));
  }, [saved]);

  const issues = useMemo(
    () => validateGraph(graph, agents, externalConnections),
    [agents, externalConnections, graph],
  );
  const selected = graph.nodes.find((node) => node.id === selectedId) ?? graph.nodes[0];
  const selectedIssues = selected ? nodeIssues(issues, selected.id) : [];
  const deploymentByAgent = useMemo(
    () => new Map(deployments.map((deployment) => [deployment.agentId, deployment])),
    [deployments],
  );
  const selectedAgentId = selected?.type === "agent" ? selected.values.agentId : graph.nodes.find((node) => node.type === "agent")?.values.agentId;
  const selectedDeployment = selectedAgentId ? deploymentByAgent.get(selectedAgentId) ?? null : null;
  const selectedExternalConnections = selectedAgentId
    ? externalConnections.filter((connection) => connection.agentId === selectedAgentId)
    : externalConnections;
  const blocking = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const savedLoading = Boolean(token && saved === undefined);

  function updateNode(id: string, next: Partial<CloudNode>) {
    setGraph((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === id ? { ...node, ...next, values: { ...node.values, ...(next.values ?? {}) } } : node,
      ),
    }));
  }

  function addNode(type: NodeType) {
    const source = PALETTE.find((item) => item.type === type);
    if (!source) return;
    const id = `${type}-${Date.now().toString(36)}`;
    const x = 84 + ((graph.nodes.length * 42) % 520);
    const y = 54 + ((graph.nodes.length * 68) % 250);
    setGraph((current) => ({
      nodes: [
        ...current.nodes,
        {
          id,
          type,
          title: source.title,
          subtitle: source.subtitle,
          x,
          y,
          status: type === "firewall" || type === "domain" ? "needs_config" : "planned",
          values: { ...source.values },
        },
      ],
      edges: current.edges,
    }));
    setSelectedId(id);
  }

  function reset() {
    setGraph(cloneGraph(DEFAULT_GRAPH));
    setSelectedId("agent");
    setSaveState("idle");
    setSaveError(null);
  }

  async function save() {
    if (!token) return;
    setSaveState("saving");
    setSaveError(null);
    try {
      await saveDoc({
        token,
        kind: DESIGN_SURFACE.infra,
        project,
        data: JSON.stringify(graph),
      });
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1500);
    } catch (error) {
      setSaveState("idle");
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="mt-5 rounded-2xl border border-white/10 bg-black/20">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-white">Cloud Builder</h3>
            <Badge tone={blocking ? "danger" : warnings ? "warning" : "success"}>
              {blocking
                ? `${blocking} blocker${blocking === 1 ? "" : "s"}`
                : warnings
                  ? `${warnings} warning${warnings === 1 ? "" : "s"}`
                  : "ready"}
            </Badge>
            <Badge tone={externalConnections.length > 0 ? "accent" : "neutral"}>
              {externalConnections.length} external
            </Badge>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-white/45">
            Shape the cloud around your agents: 24/7 runtime, Tailscale or Headscale mesh,
            public/private web UI, API, A2A, MCP, plugins, mobile, desktop, domains, and health.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex min-h-8 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 text-[12px] text-white/65">
            <span className="text-white/35">Project</span>
            <select
              value={project}
              onChange={(event) =>
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  const value = event.target.value.trim();
                  if (value) next.set("project", value);
                  else next.delete("project");
                  return next;
                })
              }
              className="max-w-36 bg-transparent text-white focus:outline-none"
            >
              <option value={project}>{project}</option>
              {projectRows
                ?.filter((row) => row.name !== project)
                .map((row) => (
                  <option key={row.name} value={row.name}>
                    {row.name}
                  </option>
                ))}
            </select>
          </label>
          <Button type="button" size="sm" variant="secondary" onClick={reset}>
            Reset
          </Button>
          <Button type="button" size="sm" onClick={() => void save()} disabled={!token || saveState === "saving"}>
            {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : "Save topology"}
          </Button>
        </div>
      </div>

      <div className="grid gap-px bg-white/10 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 bg-black/30 p-3">
          {savedLoading ? (
            <div className="mb-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[12px] text-white/45">
              Loading saved topology...
            </div>
          ) : null}
          <div className="mb-3 flex flex-wrap gap-2">
            {PALETTE.map((item) => {
              const MetaIcon = iconFor(item.type);
              return (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => addNode(item.type)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 text-[12px] text-white/65 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                >
                  <MetaIcon size={13} />
                  Add {NODE_META[item.type].label}
                </button>
              );
            })}
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#050505]">
            <div className="relative h-[390px] min-w-[1110px]">
              <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
                {graph.edges.map((edge) => {
                  const from = graph.nodes.find((node) => node.id === edge.from);
                  const to = graph.nodes.find((node) => node.id === edge.to);
                  if (!from || !to) return null;
                  const a = center(from);
                  const b = center(to);
                  return (
                    <path
                      key={edge.id}
                      d={`M ${a.x} ${a.y} C ${a.x + 70} ${a.y}, ${b.x - 70} ${b.y}, ${b.x} ${b.y}`}
                      stroke="rgba(255,255,255,0.16)"
                      strokeWidth="1.5"
                      fill="none"
                    />
                  );
                })}
              </svg>

              {graph.nodes.map((node) => {
                const MetaIcon = iconFor(node.type);
                const ownIssues = nodeIssues(issues, node.id);
                const hasError = ownIssues.some((issue) => issue.severity === "error");
                const hasWarning = ownIssues.some((issue) => issue.severity === "warning");
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => setSelectedId(node.id)}
                    className={cn(
                      "group absolute flex h-[74px] w-[168px] flex-col items-start rounded-xl border bg-black/70 p-3 text-left backdrop-blur transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                      selectedId === node.id
                        ? "border-purple-300/60 shadow-[0_0_0_1px_rgba(168,85,247,0.2)]"
                        : hasError
                          ? "border-red-300/35"
                          : hasWarning
                            ? "border-amber-300/35"
                            : "border-white/10 hover:border-white/20",
                    )}
                    style={{ transform: `translate(${node.x}px, ${node.y}px)` }}
                    aria-label={`${node.title}: ${statusLabel(node.status)}`}
                  >
                    <span className="flex w-full items-start justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="rounded-md bg-white/5 p-1.5 text-white/60">
                          <MetaIcon size={14} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[12px] font-semibold text-white/85">
                            {node.title}
                          </span>
                          <span className="block truncate text-[11px] text-white/38">{node.subtitle}</span>
                        </span>
                      </span>
                      {ownIssues.length > 0 ? (
                        <span
                          className={cn(
                            "relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px]",
                            hasError
                              ? "border-red-300/30 bg-red-400/10 text-red-200"
                              : "border-amber-300/30 bg-amber-400/10 text-amber-100",
                          )}
                        >
                          !
                          <span className="pointer-events-none absolute right-0 top-6 z-10 hidden w-56 rounded-lg border border-white/10 bg-black/95 p-2 text-left text-[11px] leading-relaxed text-white/70 shadow-2xl group-hover:block">
                            {ownIssues[0]?.message}
                          </span>
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-auto flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/30">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          node.status === "live"
                            ? "bg-emerald-300"
                            : node.status === "ready"
                              ? "bg-white/50"
                              : node.status === "needs_config"
                                ? "bg-red-300"
                                : "bg-amber-300",
                        )}
                      />
                      {statusLabel(node.status)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="bg-black/40 p-4">
          {selected ? (
            <NodeInspector
              node={selected}
              agents={agents}
              externalConnections={selectedExternalConnections}
              issues={selectedIssues}
              onChange={(values) => updateNode(selected.id, { values })}
              onStatusChange={(status) => updateNode(selected.id, { status })}
              selectedDeployment={selectedDeployment}
            />
          ) : null}
        </aside>
      </div>

      {saveError ? (
        <div className="border-t border-red-400/20 bg-red-400/[0.04] px-4 py-3 text-[12px] text-red-100/80">
          Could not save topology: {saveError}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 p-4">
        <div className="flex flex-wrap gap-2">
          <Link
            to="/instances"
            className={buttonClasses("secondary", "sm")}
          >
            Remote controls <Icon.ArrowUpRight size={13} />
          </Link>
          <Link
            to="/coding/setup"
            className={buttonClasses("secondary", "sm")}
          >
            Desktop QR pairing <Icon.ArrowUpRight size={13} />
          </Link>
        </div>
        <p className="max-w-md text-[11px] leading-relaxed text-white/35">
          Provisioning executes only for wired paths. Planned nodes stay visible with
          validation until the matching provider credentials or runtime bridge is configured.
        </p>
      </div>
    </div>
  );
}

function NodeInspector({
  node,
  agents,
  externalConnections,
  issues,
  onChange,
  onStatusChange,
  selectedDeployment,
}: {
  node: CloudNode;
  agents: AgentOption[];
  externalConnections: ExternalConnectionSummary[];
  issues: Issue[];
  onChange: (values: Record<string, string>) => void;
  onStatusChange: (status: NodeStatus) => void;
  selectedDeployment: DeploymentSummary | null;
}) {
  const values = node.values;
  const selectedExternalConnection =
    externalConnections.find((connection) => connection.id === values.externalConnectionId) ??
    null;
  const fieldPrefix = `cloud-builder-${node.id.replace(/[^a-z0-9_-]/gi, "-")}`;
  const fieldIds = {
    status: `${fieldPrefix}-status`,
    agent: `${fieldPrefix}-agent`,
    runtimeImage: `${fieldPrefix}-runtime-image`,
    size: `${fieldPrefix}-size`,
    sizeGb: `${fieldPrefix}-size-gb`,
    inbound: `${fieldPrefix}-inbound`,
    egress: `${fieldPrefix}-egress`,
    apiVisibility: `${fieldPrefix}-api-visibility`,
    webVisibility: `${fieldPrefix}-web-visibility`,
    rateLimit: `${fieldPrefix}-rate-limit`,
    domainMode: `${fieldPrefix}-domain-mode`,
    customDomain: `${fieldPrefix}-custom-domain`,
    endpointEnabled: `${fieldPrefix}-endpoint-enabled`,
    endpointAccess: `${fieldPrefix}-endpoint-access`,
    externalConnection: `${fieldPrefix}-external-connection`,
    networkMode: `${fieldPrefix}-network-mode`,
    tailnet: `${fieldPrefix}-tailnet`,
    headscaleUrl: `${fieldPrefix}-headscale-url`,
    hostname: `${fieldPrefix}-hostname`,
    mobilePlatforms: `${fieldPrefix}-mobile-platforms`,
    mobileAccess: `${fieldPrefix}-mobile-access`,
    plugin: `${fieldPrefix}-plugin`,
    requiresSecret: `${fieldPrefix}-requires-secret`,
    secretName: `${fieldPrefix}-secret-name`,
    vaultProvider: `${fieldPrefix}-vault-provider`,
    bindings: `${fieldPrefix}-bindings`,
    logs: `${fieldPrefix}-logs`,
    traces: `${fieldPrefix}-traces`,
    alerts: `${fieldPrefix}-alerts`,
    alertWebhook: `${fieldPrefix}-alert-webhook`,
  };
  return (
    <div className="space-y-4">
      <div>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/35">
          Configure
        </span>
        <h4 className="mt-1 text-sm font-semibold text-white">{node.title}</h4>
        <p className="mt-1 text-[12px] leading-relaxed text-white/45">{node.subtitle}</p>
      </div>

      {issues.length > 0 ? (
        <div className="space-y-2">
          {issues.map((issue) => (
            <div
              key={issue.message}
              className={cn(
                "rounded-lg border px-3 py-2 text-[12px] leading-relaxed",
                issue.severity === "error"
                  ? "border-red-300/20 bg-red-400/5 text-red-100/85"
                  : "border-amber-300/20 bg-amber-400/5 text-amber-100/85",
              )}
            >
              {issue.message}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-300/15 bg-emerald-400/5 px-3 py-2 text-[12px] text-emerald-100/80">
          This node is valid for the current plan.
        </div>
      )}

      <Field label="Status" htmlFor={fieldIds.status}>
        <select
          id={fieldIds.status}
          value={node.status}
          onChange={(event) => onStatusChange(event.target.value as NodeStatus)}
          className={fieldClass}
        >
          <option value="planned">Planned</option>
          <option value="needs_config">Needs config</option>
          <option value="ready">Ready</option>
          <option value="live">Live</option>
        </select>
      </Field>

      {node.type === "agent" ? (
        <>
        <Field label="Attached agent" htmlFor={fieldIds.agent}>
          <select
            id={fieldIds.agent}
            value={values.agentId ?? ""}
            onChange={(event) => onChange({ agentId: event.target.value })}
            className={fieldClass}
          >
            <option value="">Choose agent</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </Field>
        {selectedDeployment ? (
          <div className="grid gap-2">
            <Readout label="Runtime" value={remoteStatusLabel(selectedDeployment.status)} meta={selectedDeployment.mode === "remote_24_7" ? "24/7" : "on-demand"} />
            <Readout label="Provider" value={remoteProviderLabel(selectedDeployment.activeProvider)} meta={remoteFallbackLabel(selectedDeployment.fallbackStatus)} />
            <Readout label="Network" value={remoteMeshLabel(selectedDeployment.meshMode)} meta={selectedDeployment.meshHostname} />
            <Readout label="Web UI" value={selectedDeployment.webUiUrl ?? remoteRuntimeUrl(selectedDeployment.agentId, selectedDeployment.domainMode, selectedDeployment.customDomain)} meta={`${selectedDeployment.webVisibility} web`} />
            <Readout label="API base" value={selectedDeployment.apiBaseUrl} meta={`${selectedDeployment.apiVisibility} API`} />
            {selectedDeployment.lastError ? (
              <div className="rounded-lg border border-red-300/20 bg-red-400/5 px-3 py-2 text-[12px] leading-relaxed text-red-100/85">
                {selectedDeployment.lastError}
              </div>
            ) : null}
          </div>
        ) : null}
        </>
      ) : null}

      {node.type === "container" ? (
        <>
          <Field label="Runtime image" htmlFor={fieldIds.runtimeImage}>
            <input
              id={fieldIds.runtimeImage}
              type="text"
              autoComplete="off"
              value={values.image ?? ""}
              onChange={(event) => onChange({ image: event.target.value })}
              className={fieldClass}
              spellCheck={false}
            />
          </Field>
          <Field label="Size" htmlFor={fieldIds.size}>
            <select
              id={fieldIds.size}
              value={values.size ?? "shared-cpu-1x"}
              onChange={(event) => onChange({ size: event.target.value })}
              className={fieldClass}
            >
              <option value="shared-cpu-1x">Shared CPU 1x</option>
              <option value="shared-cpu-2x">Shared CPU 2x</option>
              <option value="dedicated-cpu">Dedicated CPU</option>
            </select>
          </Field>
        </>
      ) : null}

      {node.type === "volume" ? (
        <Field label="Size GB" htmlFor={fieldIds.sizeGb}>
          <input
            id={fieldIds.sizeGb}
            type="text"
            value={values.sizeGb ?? ""}
            onChange={(event) => onChange({ sizeGb: event.target.value.replace(/\D/g, "") })}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            className={fieldClass}
          />
        </Field>
      ) : null}

      {node.type === "firewall" ? (
        <>
          <Field label="Inbound" htmlFor={fieldIds.inbound}>
            <select
              id={fieldIds.inbound}
              value={values.inbound ?? ""}
              onChange={(event) => onChange({ inbound: event.target.value })}
              className={fieldClass}
            >
              <option value="">Choose policy</option>
              <option value="api-only">API only</option>
              <option value="web-and-api">Web + API</option>
              <option value="private">Private only</option>
            </select>
          </Field>
          <Field label="Egress" htmlFor={fieldIds.egress}>
            <select
              id={fieldIds.egress}
              value={values.egress ?? "provider-allowlist"}
              onChange={(event) => onChange({ egress: event.target.value })}
              className={fieldClass}
            >
              <option value="provider-allowlist">Provider allowlist</option>
              <option value="internet">Internet</option>
              <option value="none">None</option>
            </select>
          </Field>
        </>
      ) : null}

      {node.type === "api" ? (
        <>
          <Field label="Web UI" htmlFor={fieldIds.webVisibility}>
            <select
              id={fieldIds.webVisibility}
              value={values.webVisibility ?? values.visibility ?? "private"}
              onChange={(event) => onChange({ webVisibility: event.target.value })}
              className={fieldClass}
            >
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          </Field>
          <Field label="Agent API" htmlFor={fieldIds.apiVisibility}>
            <select
              id={fieldIds.apiVisibility}
              value={values.apiVisibility ?? values.visibility ?? "private"}
              onChange={(event) => onChange({ apiVisibility: event.target.value })}
              className={fieldClass}
            >
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          </Field>
          <Field label="Rate limit" htmlFor={fieldIds.rateLimit}>
            <select
              id={fieldIds.rateLimit}
              value={values.rateLimit ?? "standard"}
              onChange={(event) => onChange({ rateLimit: event.target.value })}
              className={fieldClass}
            >
              <option value="standard">Standard</option>
              <option value="strict">Strict</option>
              <option value="metered">Metered</option>
            </select>
          </Field>
        </>
      ) : null}

      {node.type === "domain" ? (
        <>
          <Field label="Mode" htmlFor={fieldIds.domainMode}>
            <select
              id={fieldIds.domainMode}
              value={values.mode ?? "detour"}
              onChange={(event) => onChange({ mode: event.target.value })}
              className={fieldClass}
            >
              <option value="detour">detour.ninja</option>
              <option value="custom">Custom</option>
            </select>
          </Field>
          <Field label="Custom domain" htmlFor={fieldIds.customDomain}>
            <input
              id={fieldIds.customDomain}
              type="text"
              autoComplete="url"
              value={values.customDomain ?? ""}
              onChange={(event) => onChange({ customDomain: event.target.value })}
              placeholder="agent.example.com"
              className={fieldClass}
              spellCheck={false}
            />
          </Field>
        </>
      ) : null}

      {node.type === "mcp" || node.type === "a2a" ? (
        <>
          <Field label="Enabled" htmlFor={fieldIds.endpointEnabled}>
            <select
              id={fieldIds.endpointEnabled}
              value={values.enabled ?? "true"}
              onChange={(event) => onChange({ enabled: event.target.value })}
              className={fieldClass}
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </Field>
          <Field label={node.type === "mcp" ? "Auth" : "Discovery"} htmlFor={fieldIds.endpointAccess}>
            <select
              id={fieldIds.endpointAccess}
              value={values.auth ?? values.discovery ?? "owner"}
              onChange={(event) =>
                onChange(node.type === "mcp" ? { auth: event.target.value } : { discovery: event.target.value })
              }
              className={fieldClass}
            >
              <option value="owner">Owner</option>
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          </Field>
          <Field label="External connector" htmlFor={fieldIds.externalConnection}>
            <select
              id={fieldIds.externalConnection}
              value={values.externalConnectionId ?? ""}
              onChange={(event) => onChange({ externalConnectionId: event.target.value })}
              className={fieldClass}
            >
              <option value="">Detour-hosted endpoint</option>
              {externalConnections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.label} · {connection.provider}
                </option>
              ))}
            </select>
          </Field>
          {selectedExternalConnection ? (
            <div className="grid gap-2">
              <Readout
                label="Connector status"
                value={selectedExternalConnection.status}
                meta={selectedExternalConnection.provider}
              />
              <Readout
                label={node.type === "mcp" ? "External MCP" : "External A2A"}
                value={
                  node.type === "mcp"
                    ? selectedExternalConnection.mcpUrl ?? "MCP URL missing"
                    : selectedExternalConnection.a2aUrl ?? "A2A URL missing"
                }
                meta={selectedExternalConnection.authMode}
              />
              <Readout
                label="Mesh"
                value={selectedExternalConnection.meshMode}
                meta={selectedExternalConnection.meshHostname ?? undefined}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {node.type === "network" ? (
        <>
          <Field label="Mesh mode" htmlFor={fieldIds.networkMode}>
            <select
              id={fieldIds.networkMode}
              value={values.mode ?? "tailscale"}
              onChange={(event) => onChange({ mode: event.target.value })}
              className={fieldClass}
            >
              <option value="tailscale">Tailscale</option>
              <option value="headscale">Headscale</option>
              <option value="detour_private">Detour private relay</option>
            </select>
          </Field>
          <Field label="Tailnet" htmlFor={fieldIds.tailnet}>
            <input
              id={fieldIds.tailnet}
              type="text"
              autoComplete="off"
              value={values.tailnet ?? ""}
              onChange={(event) => onChange({ tailnet: event.target.value })}
              placeholder="team.tailnet"
              className={fieldClass}
              spellCheck={false}
            />
          </Field>
          <Field label="Headscale URL" htmlFor={fieldIds.headscaleUrl}>
            <input
              id={fieldIds.headscaleUrl}
              type="url"
              inputMode="url"
              autoComplete="url"
              value={values.headscaleUrl ?? ""}
              onChange={(event) => onChange({ headscaleUrl: event.target.value })}
              placeholder="https://mesh.detour.ninja"
              className={fieldClass}
              spellCheck={false}
            />
          </Field>
          <Field label="Hostname" htmlFor={fieldIds.hostname}>
            <input
              id={fieldIds.hostname}
              type="text"
              autoComplete="off"
              value={values.hostname ?? ""}
              onChange={(event) => onChange({ hostname: event.target.value })}
              placeholder="detour-agent"
              className={fieldClass}
              spellCheck={false}
            />
          </Field>
        </>
      ) : null}

      {node.type === "mobile" ? (
        <>
          <Field label="Platforms" htmlFor={fieldIds.mobilePlatforms}>
            <select
              id={fieldIds.mobilePlatforms}
              value={values.platforms ?? "ios+android"}
              onChange={(event) => onChange({ platforms: event.target.value })}
              className={fieldClass}
            >
              <option value="ios+android">iOS + Android</option>
              <option value="ios">iOS</option>
              <option value="android">Android</option>
            </select>
          </Field>
          <Field label="Access" htmlFor={fieldIds.mobileAccess}>
            <select
              id={fieldIds.mobileAccess}
              value={values.access ?? "owner-approved"}
              onChange={(event) => onChange({ access: event.target.value })}
              className={fieldClass}
            >
              <option value="owner-approved">Owner-approved QR</option>
              <option value="private-mesh">Private mesh only</option>
              <option value="public-web">Public web UI</option>
            </select>
          </Field>
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-[12px] leading-relaxed text-white/50">
            Mobile clients use the same approval pattern as desktop: QR or deep-link
            pairing first, then private web/API access according to this topology.
          </div>
        </>
      ) : null}

      {node.type === "plugin" ? (
        <>
          <Field label="Plugin" htmlFor={fieldIds.plugin}>
            <input
              id={fieldIds.plugin}
              type="text"
              autoComplete="off"
              value={values.plugin ?? ""}
              onChange={(event) => onChange({ plugin: event.target.value })}
              className={fieldClass}
              spellCheck={false}
            />
          </Field>
          <Field label="Requires secret" htmlFor={fieldIds.requiresSecret}>
            <select
              id={fieldIds.requiresSecret}
              value={values.requiresSecret ?? "false"}
              onChange={(event) => onChange({ requiresSecret: event.target.value })}
              className={fieldClass}
            >
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </Field>
          <Field label="Secret binding" htmlFor={fieldIds.secretName}>
            <input
              id={fieldIds.secretName}
              type="text"
              autoComplete="off"
              value={values.secretName ?? ""}
              onChange={(event) => onChange({ secretName: event.target.value })}
              placeholder="optional secret name"
              className={fieldClass}
              spellCheck={false}
            />
          </Field>
        </>
      ) : null}

      {node.type === "secret" ? (
        <>
          <Field label="Vault" htmlFor={fieldIds.vaultProvider}>
            <select
              id={fieldIds.vaultProvider}
              value={values.provider ?? "detour"}
              onChange={(event) => onChange({ provider: event.target.value })}
              className={fieldClass}
            >
              <option value="detour">Detour managed</option>
              <option value="external">External vault</option>
            </select>
          </Field>
          <Field label="Bindings" htmlFor={fieldIds.bindings}>
            <input
              id={fieldIds.bindings}
              type="text"
              autoComplete="off"
              value={values.bindings ?? ""}
              onChange={(event) => onChange({ bindings: event.target.value })}
              placeholder="OPENAI_API_KEY, GITHUB_TOKEN"
              className={fieldClass}
              spellCheck={false}
            />
          </Field>
        </>
      ) : null}

      {node.type === "observability" ? (
        <>
          <ToggleField
            id={fieldIds.logs}
            label="Logs"
            checked={values.logs !== "false"}
            onChange={(checked) => onChange({ logs: String(checked) })}
          />
          <ToggleField
            id={fieldIds.traces}
            label="Traces"
            checked={values.traces !== "false"}
            onChange={(checked) => onChange({ traces: String(checked) })}
          />
          <ToggleField
            id={fieldIds.alerts}
            label="Alerts"
            checked={values.alerts === "true"}
            onChange={(checked) => onChange({ alerts: String(checked) })}
          />
          <Field label="Alert webhook" htmlFor={fieldIds.alertWebhook}>
            <input
              id={fieldIds.alertWebhook}
              type="url"
              inputMode="url"
              autoComplete="url"
              value={values.alertWebhook ?? ""}
              onChange={(event) => onChange({ alertWebhook: event.target.value })}
              placeholder="https://hooks.example.com/detour"
              className={fieldClass}
              spellCheck={false}
            />
          </Field>
        </>
      ) : null}

      {node.type === "desktop" ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-[12px] leading-relaxed text-white/50">
          Desktop pairing is approved through the coding setup QR flow, then the paired
          machine can act as a self-host backend.
        </div>
      ) : null}
    </div>
  );
}

const fieldClass =
  "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[12px] text-white outline-none transition focus:border-purple-400/50 focus-visible:ring-2 focus-visible:ring-purple-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black";

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
    <div className="block space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-[10px] font-semibold uppercase tracking-widest text-white/35"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function ToggleField({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
    >
      <span className="text-[12px] text-white/70">{label}</span>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-purple-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
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
