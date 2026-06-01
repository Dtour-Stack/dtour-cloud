import { describe, expect, it } from "vitest";
import { CODING_PROVIDERS, providerById } from "./codingProviders";

describe("codingProviders", () => {
  it("lists four agent tabs", () => {
    expect(CODING_PROVIDERS.map((p) => p.id)).toEqual([
      "opencode",
      "codex",
      "claude",
      "pi",
    ]);
  });

  it("maps codex to openai storage", () => {
    expect(providerById("codex").storageKey).toBe("openai");
    expect(providerById("claude").launchCmd).toBe("claude");
    expect(providerById("opencode").launchCmd).toBe("opencode");
  });

  it("assigns one npm package per agent", () => {
    expect(providerById("opencode").npmPackage).toBe("opencode-ai");
    expect(providerById("codex").npmPackage).toBe("@openai/codex");
    expect(providerById("pi").npmPackage).toBe("@earendil-works/pi-coding-agent");
  });
});
