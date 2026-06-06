import { describe, expect, it } from "vitest";
import {
	runSandboxBootstrap,
	sandboxBootstrapCommands,
} from "./codingSandboxBootstrap";

describe("sandboxBootstrapCommands", () => {
	it("runs home setup before npm install for opencode", () => {
		const cmds = sandboxBootstrapCommands("export FOO=bar", "opencode");
		expect(cmds[0]).toContain("export HOME");
		expect(cmds[1]).toContain("mkdir -p");
		expect(cmds.at(-1)).toContain("npm install -g");
		expect(cmds.some((c) => c.includes("opencode-ai"))).toBe(true);
	});

	it("installs codex package only for codex", () => {
		const cmds = sandboxBootstrapCommands("", "codex");
		expect(cmds.some((c) => c.includes("@openai/codex"))).toBe(true);
		expect(cmds.some((c) => c.includes("opencode-ai"))).toBe(false);
	});

	it("creates home before any workspace cd", async () => {
		const commands: string[] = [];
		await runSandboxBootstrap(
			{
				exec: async (cmd) => {
					commands.push(cmd);
					return { exitCode: 0 };
				},
			},
			"",
			"opencode",
			() => {},
		);

		expect(commands[0]).toContain(`export HOME="\${HOME:-/home/user}"`);
		expect(commands[1]).toContain('mkdir -p "$HOME" "$HOME/workspace"');
		expect(commands[1]).toContain('"$HOME/.detour" "$HOME/.detour/bin"');
		expect(commands.every((cmd) => !cmd.startsWith("cd "))).toBe(true);
	});
});
