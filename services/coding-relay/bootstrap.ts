/**
 * Post-create setup for E2B sandboxes: env vars + global coding-agent CLIs.
 * See e2b-template/README.md to bake these into a custom template (faster cold start).
 */
import type { Sandbox } from "e2b";

const GLOBAL_CLI_INSTALL =
  "npm install -g --ignore-scripts opencode-ai @openai/codex @anthropic-ai/claude-code @earendil-works/pi-coding-agent 2>/dev/null";

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

/** Write ~/.detour/env and install CLIs (best-effort). */
export async function bootstrapCodingSandbox(
  sandbox: Sandbox,
  env: SandboxEnv,
  onProgress: (msg: string) => void,
): Promise<void> {
  const script = buildEnvScript(env);
  await sandbox.commands.run(
    `mkdir -p ~/.detour && cat > ~/.detour/env << 'DETOUR_ENV_EOF'\n${script}\nDETOUR_ENV_EOF`,
    { timeoutMs: 30_000 },
  );
  await sandbox.commands.run(
    `grep -q 'detour/env' ~/.bashrc 2>/dev/null || echo '[ -f ~/.detour/env ] && . ~/.detour/env' >> ~/.bashrc`,
    { timeoutMs: 10_000 },
  );

  onProgress("\r\n  installing coding agents (OpenCode, Codex, Claude, Pi)…\r\n");
  const install = await sandbox.commands.run(GLOBAL_CLI_INSTALL, { timeoutMs: 180_000 });
  if (install.exitCode !== 0) {
    onProgress(
      "\r\n  \x1b[33mwarning:\x1b[0m some CLIs failed to install — retry with: npm i -g opencode-ai @openai/codex @anthropic-ai/claude-code @earendil-works/pi-coding-agent\r\n",
    );
  }

  const draftHelp = `#!/usr/bin/env bash
# Detour Draft lab — persona/prompt tests run in the Coding sidebar (Draft lab panel).
# This sandbox is for plugins, workflows, and CLIs.
echo "Use the Draft lab panel in Detour Coding to test your lightweight agent persona."
echo "Here: opencode · codex · claude · pi — mkdir -p ~/workspace for saveable work."
`;
  await sandbox.commands.run(
    `mkdir -p ~/.detour/bin && cat > ~/.detour/bin/detour-draft << 'DETOUR_DRAFT_EOF'\n${draftHelp}\nDETOUR_DRAFT_EOF
chmod +x ~/.detour/bin/detour-draft
grep -q 'detour/bin' ~/.bashrc 2>/dev/null || echo 'export PATH="$HOME/.detour/bin:$PATH"' >> ~/.bashrc`,
    { timeoutMs: 15_000 },
  );

  onProgress(
    "\r\n  \x1b[32mready\x1b[0m — run: \x1b[36mopencode\x1b[0m · \x1b[36mcodex\x1b[0m · \x1b[36mclaude\x1b[0m · \x1b[36mpi\x1b[0m · \x1b[36mdetour-draft\x1b[0m\r\n" +
      "  Draft lab (sidebar) = test agent persona · Save workspace = $0.05 (holder discount applies)\r\n\r\n",
  );
}
