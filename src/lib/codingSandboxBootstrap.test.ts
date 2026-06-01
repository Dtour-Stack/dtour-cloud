import { describe, expect, it } from "vitest";
import { sandboxBootstrapCommands } from "./codingSandboxBootstrap";

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
});
