import { CODING_CLI_PACKAGES } from "./codingCliInstall";

/** Commands run in order when a browser Sandbox session starts. */
export function sandboxBootstrapCommands(envScript: string): string[] {
  return [
    'export HOME="${HOME:-/home/user}"',
    'mkdir -p "$HOME" "$HOME/workspace" "$HOME/.detour" "$HOME/.detour/bin"',
    `cat > ~/.detour/env << 'DETOUR_ENV_EOF'\n${envScript}\nDETOUR_ENV_EOF`,
    `grep -q 'detour/env' ~/.bashrc 2>/dev/null || echo '[ -f ~/.detour/env ] && . ~/.detour/env' >> ~/.bashrc`,
    ". ~/.detour/env 2>/dev/null",
    `npm install -g --ignore-scripts ${CODING_CLI_PACKAGES.join(" ")} 2>/dev/null`,
  ];
}

type BashExec = {
  exec: (cmd: string) => Promise<{ stdout?: string; stderr?: string; exitCode?: number }>;
};

/** Run bootstrap via just-bash exec — BashShell.handleInput only executes on \\r, not \\n. */
export async function runSandboxBootstrap(
  bash: BashExec,
  cwd: string,
  envScript: string,
  onOutput: (chunk: string) => void,
): Promise<void> {
  const run = async (cmd: string) => {
    const result = await bash.exec(`cd ${JSON.stringify(cwd)} && ${cmd}`);
    if (result.stdout) {
      onOutput(result.stdout.replace(/\n/g, "\r\n"));
      if (!result.stdout.endsWith("\n")) onOutput("\r\n");
    }
    if (result.stderr) {
      onOutput(`\x1b[31m${result.stderr.replace(/\n/g, "\r\n")}\x1b[0m`);
      if (!result.stderr.endsWith("\n")) onOutput("\r\n");
    }
    return result.exitCode ?? 0;
  };

  for (const cmd of sandboxBootstrapCommands(envScript)) {
    const code = await run(cmd);
    if (code !== 0 && cmd.includes("npm install")) {
      onOutput(
        "\r\n  \x1b[33mwarning:\x1b[0m some CLIs failed to install — retry: npm i -g opencode-ai @openai/codex @anthropic-ai/claude-code @earendil-works/pi-coding-agent\r\n",
      );
    }
  }
}
