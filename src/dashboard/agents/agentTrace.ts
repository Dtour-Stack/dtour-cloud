/** Client-side mirror of convex/agentTrace.ts */

export type AgentTraceStepKind =
  | "route"
  | "context"
  | "inference"
  | "reasoning"
  | "memory"
  | "search"
  | "tool"
  | "resource";

export type AgentTraceStep = {
  id: string;
  kind: AgentTraceStepKind;
  title: string;
  detail?: string;
  href?: string;
  at: number;
};

export type AgentTurnTrace = {
  version: 1;
  status: "running" | "complete" | "error";
  modelRequested: string;
  modelUsed?: string;
  source?: "freetour" | "openrouter" | "elizacloud";
  routeVariant?: string;
  fallbackUsed?: boolean;
  durationMs?: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    costUsd?: number;
    free?: boolean;
  };
  reasoning?: string;
  context?: {
    agentModel?: string;
    systemPromptPreview?: string;
    historyTurns?: number;
    plugins?: string[];
    imageAttached?: boolean;
  };
  steps: AgentTraceStep[];
  error?: string;
};

export function parseTrace(raw: string | null | undefined): AgentTurnTrace | null {
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as AgentTurnTrace;
    if (t?.version !== 1 || !Array.isArray(t.steps)) return null;
    return t;
  } catch {
    return null;
  }
}

export function stepsByKind(steps: AgentTraceStep[], kinds: AgentTraceStepKind[]) {
  return steps.filter((s) => kinds.includes(s.kind));
}
