/** Coding-agent providers shown in the Coding dashboard sidebar. */

export type CodingProviderId = "opencode" | "codex" | "claude" | "pi" | "openrouter";

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
    hint: "Open-source terminal agent (opencode-ai). Uses your OpenRouter key; Codex/Claude keys work inside OpenCode too.",
    docsUrl: "https://open-code.ai/docs",
  },
  {
    id: "codex",
    label: "Codex",
    shortLabel: "Codex",
    envVar: "OPENAI_API_KEY",
    storageKey: "openai",
    launchCmd: "codex",
    hint: "OpenAI Codex CLI — uses your ChatGPT/API key.",
    docsUrl: "https://developers.openai.com/codex",
  },
  {
    id: "claude",
    label: "Claude Code",
    shortLabel: "Claude",
    envVar: "ANTHROPIC_API_KEY",
    storageKey: "anthropic",
    launchCmd: "claude",
    hint: "Anthropic Claude Code agent in the terminal.",
    docsUrl: "https://docs.anthropic.com/en/docs/claude-code",
  },
  {
    id: "pi",
    label: "Pi",
    shortLabel: "Pi",
    envVar: "ANTHROPIC_API_KEY",
    storageKey: "anthropic",
    launchCmd: "pi",
    hint: "Minimal agent CLI — uses Anthropic/OpenRouter keys you saved.",
    docsUrl: "https://pi.dev/docs/latest/quickstart",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    shortLabel: "OR",
    envVar: "OPENROUTER_API_KEY",
    storageKey: "openrouter",
    launchCmd: "openrouter --help",
    hint: "One key routes 400+ models. Use inside Pi or curl scripts.",
    docsUrl: "https://openrouter.ai/docs",
  },
];

export const CODING_PROVIDER_IDS = CODING_PROVIDERS.map((p) => p.id);

export function providerById(id: CodingProviderId): CodingProviderMeta {
  const p = CODING_PROVIDERS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown provider ${id}`);
  return p;
}
