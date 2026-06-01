import { describe, expect, it } from "vitest";
import { sandboxBootstrapCommands } from "./codingSandboxBootstrap";

describe("sandboxBootstrapCommands", () => {
  it("runs home setup before npm install", () => {
    const cmds = sandboxBootstrapCommands("export FOO=bar");
    expect(cmds[0]).toContain("export HOME");
    expect(cmds[1]).toContain("mkdir -p");
    expect(cmds.at(-1)).toContain("npm install -g");
    expect(cmds.some((c) => c.includes("opencode-ai"))).toBe(true);
  });
});
