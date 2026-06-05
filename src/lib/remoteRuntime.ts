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

export function remoteStatusLabel(status: RemoteRuntimeStatus): string {
  return STATUS_LABELS[status] ?? STATUS_LABELS.unknown;
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

export function canLaunchRemote(status: RemoteRuntimeStatus): boolean {
  return status === "configured" || status === "suspended" || status === "error";
}
