export type RemoteRuntimeStatus =
  | "not_configured"
  | "configured"
  | "creating"
  | "queued"
  | "provisioning"
  | "running"
  | "suspended"
  | "error"
  | "unknown";

export type RemoteRuntimeAccess = "private" | "public";
export type RemoteRuntimeDomainMode = "detour" | "custom";
export type RemoteRuntimeMode = "on_demand" | "remote_24_7";
export type RemoteRuntimeProvider = "elizacloud" | "detour";
export type RemoteRuntimeProviderStrategy = "elizacloud_primary_detour_fallback";
export type RemoteRuntimeFallbackStatus = "standby" | "active" | "unavailable";
export type RemoteRuntimeMeshMode = "detour_private" | "tailscale" | "headscale";

const STATUS_LABELS: Record<RemoteRuntimeStatus, string> = {
  not_configured: "on-demand",
  configured: "ready",
  creating: "creating",
  queued: "queued",
  provisioning: "provisioning",
  running: "running",
  suspended: "suspended",
  error: "error",
  unknown: "unknown",
};

const PROVIDER_LABELS: Record<RemoteRuntimeProvider, string> = {
  elizacloud: "ElizaCloud",
  detour: "Detour fallback",
};

const FALLBACK_LABELS: Record<RemoteRuntimeFallbackStatus, string> = {
  standby: "fallback standby",
  active: "fallback active",
  unavailable: "fallback unavailable",
};

const MESH_LABELS: Record<RemoteRuntimeMeshMode, string> = {
  detour_private: "Detour private relay",
  tailscale: "Tailscale",
  headscale: "Headscale",
};

export function remoteStatusLabel(status: RemoteRuntimeStatus): string {
  return STATUS_LABELS[status] ?? STATUS_LABELS.unknown;
}

export function remoteProviderLabel(provider: RemoteRuntimeProvider): string {
  return PROVIDER_LABELS[provider];
}

export function remoteFallbackLabel(status: RemoteRuntimeFallbackStatus): string {
  return FALLBACK_LABELS[status];
}

export function remoteMeshLabel(mode: RemoteRuntimeMeshMode): string {
  return MESH_LABELS[mode];
}

export function defaultDetourSubdomain(agentId: string): string {
  const compact = agentId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(-10);
  return `agent-${compact || "runtime"}.detour.ninja`;
}

export function remoteRuntimeUrl(
  agentId: string,
  domainMode: RemoteRuntimeDomainMode,
  customDomain?: string | null,
): string {
  if (domainMode === "custom" && customDomain?.trim()) {
    return `https://${customDomain.trim().toLowerCase()}`;
  }
  return `https://${defaultDetourSubdomain(agentId)}`;
}

export function remoteApiBaseUrl(agentId: string): string {
  return `https://api.detour.ninja/remote-agents/${encodeURIComponent(agentId)}`;
}

export function canLaunchRemote(status: RemoteRuntimeStatus): boolean {
  return status === "configured" || status === "suspended" || status === "error";
}
