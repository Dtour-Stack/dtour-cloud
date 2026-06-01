import { describe, expect, it } from "vitest";
import { CODING_PROVIDERS, providerById } from "./codingProviders";

describe("codingProviders", () => {
  it("lists five agent tabs including OpenCode", () => {
    expect(CODING_PROVIDERS.map((p) => p.id)).toEqual([
      "opencode",
      "codex",
      "claude",
      "pi",
      "openrouter",
    ]);
  });

  it("maps codex to openai storage", () => {
    expect(providerById("codex").storageKey).toBe("openai");
    expect(providerById("claude").launchCmd).toBe("claude");
    expect(providerById("opencode").launchCmd).toBe("opencode");
  });
});
