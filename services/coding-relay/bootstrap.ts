/**
 * Post-create setup for E2B sandboxes: env vars + one selected coding-agent CLI.
 * See e2b-template/README.md to bake CLIs into a custom template (faster cold start).
 */
import type { Sandbox } from "e2b";

const HOME_SETUP =
  'export HOME="${HOME:-/home/user}" && mkdir -p "$HOME" "$HOME/workspace" "$HOME/.detour" "$HOME/.detour/bin"';

/** UI provider id → global npm package (must match src/lib/codingProviders.ts). */
const NPM_BY_AGENT: Record<string, string> = {
  opencode: "opencode-ai",
  codex: "@openai/codex",
  claude: "@anthropic-ai/claude-code",
  pi: "@earendil-works/pi-coding-agent",
};

const AGENT_LABEL: Record<string, string> = {
  opencode: "OpenCode",
  codex: "Codex",
  claude: "Claude Code",
  pi: "Pi",
};

const LAUNCH_CMD: Record<string, string> = {
  opencode: "opencode",
  codex: "codex",
  claude: "claude",
  pi: "pi",
};

export type SandboxEnv = Record<string, string>;

export function buildEnvScript(env: SandboxEnv): string {
  const lines = Object.entries(env)
    .filter(([, v]) => v)
    .map(([k, v]) => `export ${k}=${shellQuote(v)}`);
  return [
    "# Detour Cloud — coding agent environment",
    ...lines,
    'export PATH="$HOME/.local/bin:$PATH:/usr/local/bin"',
    "",
  ].join("\n");
}

function shellQuote(v: string): string {
  return `'${v.replace(/'/g, `'\\''`)}'`;
}

/** Write ~/.detour/env and install the chosen agent CLI (best-effort). */
export async function bootstrapCodingSandbox(
  sandbox: Sandbox,
  env: SandboxEnv,
  agentId: string,
  onProgress: (msg: string) => void,
): Promise<void> {
  const id = agentId in NPM_BY_AGENT ? agentId : "opencode";
  const label = AGENT_LABEL[id] ?? "OpenCode";
  const pkg = NPM_BY_AGENT[id] ?? NPM_BY_AGENT.opencode;

  const script = buildEnvScript(env);
  await sandbox.commands.run(HOME_SETUP, { timeoutMs: 15_000 });
  await sandbox.commands.run(
    `cat > ~/.detour/env << 'DETOUR_ENV_EOF'\n${script}\nDETOUR_ENV_EOF`,
    { timeoutMs: 30_000 },
  );
  await sandbox.commands.run(
    `grep -q 'detour/env' ~/.bashrc 2>/dev/null || echo '[ -f ~/.detour/env ] && . ~/.detour/env' >> ~/.bashrc`,
    { timeoutMs: 10_000 },
  );

  const installCmd = `npm install -g --ignore-scripts ${pkg}`;
  onProgress(`\r\n  installing \x1b[36m${label}\x1b[0m…\r\n`);
  const install = await sandbox.commands.run(installCmd, { timeoutMs: 180_000 });
  if (install.exitCode !== 0) {
    onProgress(`\r\n  \x1b[33mwarning:\x1b[0m install failed — retry: ${installCmd}\r\n`);
  }

  const launch = LAUNCH_CMD[id] ?? "opencode";
  onProgress(
    `\r\n  \x1b[32mready\x1b[0m — run \x1b[36m${launch}\x1b[0m · work in ~/workspace\r\n` +
      "  Draft lab (sidebar) tests persona · Save workspace = small flat fee\r\n\r\n",
  );
}
