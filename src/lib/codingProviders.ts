/** Coding-agent providers shown in the Coding dashboard sidebar. */

export type CodingProviderId = "opencode" | "codex" | "claude" | "pi";

export type CodingProviderMeta = {
  id: CodingProviderId;
  label: string;
  shortLabel: string;
  /** Env var injected into E2B / browser sandbox. */
  envVar: string;
  /** Convex `codingProviderSecrets.provider` row key. */
  storageKey: "openrouter" | "openai" | "anthropic";
  /** CLI launched inside an E2B sandbox after bootstrap. */
  launchCmd: string;
  /** Global npm package installed when this agent is selected (null = key-only, no CLI). */
  npmPackage: string | null;
  hint: string;
  docsUrl: string;
};

export const CODING_PROVIDERS: CodingProviderMeta[] = [
  {
    id: "opencode",
    label: "OpenCode",
    shortLabel: "OC",
    envVar: "OPENROUTER_API_KEY",
    storageKey: "openrouter",
    launchCmd: "opencode",
    npmPackage: "opencode-ai",
    hint: "Open-source terminal agent (opencode-ai). Save your OpenRouter key on this page before opening Terminal.",
    docsUrl: "https://open-code.ai/docs",
  },
  {
    id: "codex",
    label: "Codex",
    shortLabel: "Codex",
    envVar: "OPENAI_API_KEY",
    storageKey: "openai",
    launchCmd: "codex",
    npmPackage: "@openai/codex",
    hint: "OpenAI Codex CLI — save your OpenAI API key here, then open Terminal.",
    docsUrl: "https://developers.openai.com/codex",
  },
  {
    id: "claude",
    label: "Claude Code",
    shortLabel: "Claude",
    envVar: "ANTHROPIC_API_KEY",
    storageKey: "anthropic",
    launchCmd: "claude",
    npmPackage: "@anthropic-ai/claude-code",
    hint: "Anthropic Claude Code — save your Anthropic API key here, then open Terminal.",
    docsUrl: "https://docs.anthropic.com/en/docs/claude-code",
  },
  {
    id: "pi",
    label: "Pi",
    shortLabel: "Pi",
    envVar: "ANTHROPIC_API_KEY",
    storageKey: "anthropic",
    launchCmd: "pi",
    npmPackage: "@earendil-works/pi-coding-agent",
    hint: "Minimal agent CLI — save your Anthropic key, then open Terminal.",
    docsUrl: "https://pi.dev/docs/latest/quickstart",
  },
];

export const CODING_PROVIDER_IDS = CODING_PROVIDERS.map((p) => p.id);

export function providerById(id: CodingProviderId): CodingProviderMeta {
  const p = CODING_PROVIDERS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown provider ${id}`);
  return p;
}

export function isCodingProviderId(id: string): id is CodingProviderId {
  return CODING_PROVIDER_IDS.includes(id as CodingProviderId);
}

/** Env vars to inject for the selected agent only. */
export function envForProvider(
  all: Record<string, string>,
  id: CodingProviderId,
): Record<string, string> {
  const { envVar } = providerById(id);
  const v = all[envVar];
  return v ? { [envVar]: v } : {};
}

export function npmInstallCommand(pkg: string): string {
  return `npm install -g --ignore-scripts ${pkg} 2>/dev/null`;
}
