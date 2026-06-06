import { cliInstallCommandForProvider } from "./codingCliInstall";
import type { CodingProviderId } from "./codingProviders";
import { providerById } from "./codingProviders";

/** Commands run in order when a browser Sandbox session starts (one agent CLI). */
export function sandboxBootstrapCommands(
	envScript: string,
	providerId: CodingProviderId,
): string[] {
	const install = cliInstallCommandForProvider(providerId);
	const cmds = [
		`export HOME="\${HOME:-/home/user}"`,
		'mkdir -p "$HOME" "$HOME/workspace" "$HOME/.detour" "$HOME/.detour/bin"',
		`cat > ~/.detour/env << 'DETOUR_ENV_EOF'\n${envScript}\nDETOUR_ENV_EOF`,
		`grep -q 'detour/env' ~/.bashrc 2>/dev/null || echo '[ -f ~/.detour/env ] && . ~/.detour/env' >> ~/.bashrc`,
		". ~/.detour/env 2>/dev/null",
	];
	if (install) cmds.push(install);
	return cmds;
}

type BashExec = {
	exec: (
		cmd: string,
	) => Promise<{ stdout?: string; stderr?: string; exitCode?: number }>;
};

/** Run bootstrap via just-bash exec — BashShell.handleInput only executes on \\r, not \\n. */
export async function runSandboxBootstrap(
	bash: BashExec,
	envScript: string,
	providerId: CodingProviderId,
	onOutput: (chunk: string) => void,
): Promise<void> {
	const p = providerById(providerId);
	onOutput(`\r\n  \x1b[36m${p.label}\x1b[0m — preparing sandbox…\r\n`);

	const run = async (cmd: string) => {
		const result = await bash.exec(cmd);
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

	for (const cmd of sandboxBootstrapCommands(envScript, providerId)) {
		const code = await run(cmd);
		if (code !== 0 && cmd.includes("npm install")) {
			onOutput(
				`\r\n  \x1b[33mwarning:\x1b[0m install failed — retry: npm i -g ${p.npmPackage ?? "…"}\r\n`,
			);
		}
	}
}
