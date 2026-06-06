import { describe, expect, test } from "vitest";
import {
  canLaunchRemote,
  defaultDetourSubdomain,
  remoteApiBaseUrl,
  remoteFallbackLabel,
  remoteProviderLabel,
  remoteRuntimeUrl,
  remoteStatusLabel,
} from "./remoteRuntime";

describe("remoteRuntime", () => {
  test("derives stable detour.ninja runtime domains", () => {
    expect(defaultDetourSubdomain("jh7xz_ABC-1234567890")).toBe(
      "agent-1234567890.detour.ninja",
    );
    expect(remoteRuntimeUrl("agent-one", "detour")).toBe(
      "https://agent-agentone.detour.ninja",
    );
  });

  test("normalizes custom domains", () => {
    expect(remoteRuntimeUrl("agent-one", "custom", "Desk.Agent.Example")).toBe(
      "https://desk.agent.example",
    );
  });

  test("labels and gates launchable statuses", () => {
    expect(remoteStatusLabel("not_configured")).toBe("on-demand");
    expect(canLaunchRemote("configured")).toBe(true);
    expect(canLaunchRemote("queued")).toBe(false);
  });

  test("uses Detour-owned gateway endpoints and provider labels", () => {
    expect(remoteApiBaseUrl("agent/one")).toBe(
      "https://api.detour.ninja/remote-agents/agent%2Fone",
    );
    expect(remoteProviderLabel("elizacloud")).toBe("ElizaCloud");
    expect(remoteFallbackLabel("standby")).toBe("fallback standby");
  });
});
