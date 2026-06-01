/** Per-assistant-message trace — reasoning, routing, resources (A2UI / co-work panel). */

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
  /** Backend A/B bucket — not shown in the user-facing UI. */
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

export function serializeTrace(trace: AgentTurnTrace): string {
  return JSON.stringify(trace);
}

export function parseTrace(raw: string | undefined | null): AgentTurnTrace | null {
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as AgentTurnTrace;
    if (t?.version !== 1 || !Array.isArray(t.steps)) return null;
    return t;
  } catch {
    return null;
  }
}

/** Pull extended thinking from OpenRouter / model output. */
export function extractReasoning(
  content: string,
  message?: { reasoning?: string; reasoning_content?: string },
): string | undefined {
  const fromField = message?.reasoning?.trim() || message?.reasoning_content?.trim();
  if (fromField) return fromField;

  const openTag = `<${"think"}>`;
  const closeTag = `<${"/think"}>`;
  const open = content.indexOf(openTag);
  const close = content.indexOf(closeTag);
  if (open !== -1 && close > open) {
    return content.slice(open + openTag.length, close).trim();
  }
  return undefined;
}

export function stripReasoningTags(content: string): string {
  const openTag = `<${"think"}>`;
  const closeTag = `<${"/think"}>`;
  const open = content.indexOf(openTag);
  const close = content.indexOf(closeTag);
  if (open !== -1 && close > open) {
    return (content.slice(0, open) + content.slice(close + closeTag.length)).trim();
  }
  return content.trim();
}

export function previewText(text: string, max = 280): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
